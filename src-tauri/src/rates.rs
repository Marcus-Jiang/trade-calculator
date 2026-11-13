use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::i18n::{self, Locale};
use crate::model::{RatesData, RefreshResult};
use crate::state::AppState;

const SOURCE_TIMEOUT: Duration = Duration::from_secs(7);
const OVERALL_TIMEOUT: Duration = Duration::from_secs(10);
const STALE_MS: u64 = 24 * 60 * 60 * 1000;

#[derive(Clone, Copy)]
enum SourceKind {
    OpenEr,
    Currency,
    Exchange,
}

struct Source {
    name: &'static str,
    url: &'static str,
    kind: SourceKind,
}

const SOURCES: [Source; 3] = [
    Source {
        name: "open.er-api.com",
        url: "https://open.er-api.com/v6/latest/CNY",
        kind: SourceKind::OpenEr,
    },
    Source {
        name: "currency-api",
        url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/cny.json",
        kind: SourceKind::Currency,
    },
    Source {
        name: "exchangerate-api.com",
        url: "https://api.exchangerate-api.com/v4/latest/CNY",
        kind: SourceKind::Exchange,
    },
];

pub fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn is_currency_code(text: &str) -> bool {
    text.len() == 3 && text.chars().all(|c| c.is_ascii_alphabetic())
}

fn normalize_rates(raw: &Map<String, Value>) -> HashMap<String, f64> {
    let mut result = HashMap::new();
    result.insert("CNY".to_string(), 1.0);
    for (key, value) in raw {
        if !is_currency_code(key) {
            continue;
        }
        let parsed = match value {
            Value::Number(number) => number.as_f64(),
            Value::String(text) => text.trim().parse::<f64>().ok(),
            _ => None,
        };
        if let Some(rate) = parsed {
            if rate.is_finite() && rate > 0.0 {
                result.insert(key.to_ascii_uppercase(), rate);
            }
        }
    }
    result
}

fn parse_source(kind: SourceKind, json: &Value) -> Option<(HashMap<String, f64>, Option<u64>)> {
    match kind {
        SourceKind::OpenEr => {
            if json.get("result").and_then(Value::as_str) != Some("success") {
                return None;
            }
            let rates = json.get("rates")?.as_object()?;
            let updated = json.get("time_last_update_unix").and_then(Value::as_u64);
            Some((normalize_rates(rates), updated.map(|value| value * 1000)))
        }
        SourceKind::Currency => {
            let rates = json.get("cny")?.as_object()?;
            let updated = json
                .get("date")
                .and_then(Value::as_str)
                .and_then(parse_date_ms);
            Some((normalize_rates(rates), updated))
        }
        SourceKind::Exchange => {
            let rates = json.get("rates")?.as_object()?;
            let updated = json.get("time_last_updated").and_then(Value::as_u64);
            Some((normalize_rates(rates), updated.map(|value| value * 1000)))
        }
    }
}

/// 解析 `YYYY-MM-DD` 为 UTC 零点毫秒；避免为一个小功能引入日期库。
fn parse_date_ms(text: &str) -> Option<u64> {
    let mut parts = text.split('-');
    let year: i32 = parts.next()?.parse().ok()?;
    let month: u32 = parts.next()?.parse().ok()?;
    let day: u32 = parts.next()?.parse().ok()?;
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    Some((days_from_civil(year, month, day) as u64) * 86_400_000)
}

fn days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let year = if month <= 2 { year - 1 } else { year };
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = (year - era * 400) as i64;
    let month_part = (month as i64 + 9) % 12;
    let day_of_year = (153 * month_part + 2) / 5 + day as i64 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    era as i64 * 146_097 + day_of_era - 719_468
}

fn read_cache_object() -> Option<Map<String, Value>> {
    let text = std::fs::read_to_string(cache_file()).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.as_object().cloned()
}

pub fn read_cache(locale: Locale) -> Option<RatesData> {
    let object = read_cache_object()?;
    let rates = normalize_rates(object.get("rates")?.as_object()?);
    let updated_at = object.get("updatedAt")?.as_u64()?;
    let provider = object
        .get("provider")
        .and_then(Value::as_str)
        .filter(|text| !text.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| i18n::t(locale, "rates.cacheProvider", &[]));
    Some(RatesData {
        base: "CNY".into(),
        rates,
        provider,
        updated_at,
        stale: now_ms().saturating_sub(updated_at) > STALE_MS,
    })
}

fn cache_file() -> PathBuf {
    crate::settings::rates_cache_file()
}

fn write_cache(data: &RatesData) {
    if let Err(error) = write_cache_inner(data) {
        eprintln!("写入汇率缓存失败: {error}");
    }
}

fn write_cache_inner(data: &RatesData) -> io::Result<()> {
    let dir = crate::settings::user_data_dir();
    std::fs::create_dir_all(&dir)?;
    let file = cache_file();
    let tmp = dir.join("rates-cache.json.tmp");
    let bytes = serde_json::to_vec_pretty(data).map_err(io::Error::other)?;
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &file)?;
    Ok(())
}

async fn fetch_json(
    client: &reqwest::Client,
    url: &str,
    timeout: Duration,
    locale: Locale,
) -> Result<Value, String> {
    let request = client
        .get(url)
        .header("Accept", "application/json")
        .header("Cache-Control", "no-cache")
        .send();
    let response = tokio::time::timeout(timeout, request)
        .await
        .map_err(|_| i18n::t(locale, "rates.errorTimeout", &[]))?
        .map_err(|error| {
            i18n::t(
                locale,
                "rates.errorNetwork",
                &[("message", &error.to_string())],
            )
        })?;
    if !response.status().is_success() {
        let status = response.status().to_string();
        return Err(i18n::t(locale, "rates.errorHttp", &[("status", &status)]));
    }
    let text = tokio::time::timeout(Duration::from_secs(5), response.text())
        .await
        .map_err(|_| i18n::t(locale, "rates.errorReadTimeout", &[]))?
        .map_err(|error| {
            i18n::t(
                locale,
                "rates.errorNetwork",
                &[("message", &error.to_string())],
            )
        })?;
    serde_json::from_str(&text)
        .map_err(|error| format!("{}: {error}", i18n::t(locale, "rates.errorFormat", &[])))
}

async fn fetch_rates(app: &AppHandle) -> (Option<RatesData>, Option<String>) {
    let state = app.state::<AppState>();
    let client = state.http.clone();
    let locale = {
        let settings = state.settings.lock().unwrap();
        i18n::current_locale(&settings)
    };
    let mut errors: Vec<String> = Vec::new();
    let deadline = Instant::now() + OVERALL_TIMEOUT;

    for source in SOURCES {
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            errors.push(i18n::t(locale, "rates.errorTotalTimeout", &[]));
            break;
        }
        let timeout = SOURCE_TIMEOUT.min(remaining);
        match fetch_json(&client, source.url, timeout, locale).await {
            Ok(json) => match parse_source(source.kind, &json) {
                Some((rates, updated_at)) => {
                    if !rates.contains_key("USD") || !rates.contains_key("EUR") {
                        errors.push(format!(
                            "{}: {}",
                            source.name,
                            i18n::t(locale, "rates.errorIncomplete", &[])
                        ));
                        continue;
                    }
                    let data = RatesData {
                        base: "CNY".into(),
                        rates,
                        provider: source.name.into(),
                        updated_at: updated_at.unwrap_or_else(now_ms),
                        stale: false,
                    };
                    write_cache(&data);
                    return (Some(data), None);
                }
                None => errors.push(format!(
                    "{}: {}",
                    source.name,
                    i18n::t(locale, "rates.errorFormat", &[])
                )),
            },
            Err(error) => errors.push(format!("{}: {}", source.name, error)),
        }
    }

    let cached = read_cache(locale);
    let error = if errors.is_empty() {
        i18n::t(locale, "rates.fetchError", &[])
    } else {
        errors.join("；")
    };
    (
        cached.map(|mut data| {
            data.stale = true;
            data
        }),
        Some(error),
    )
}

pub async fn refresh(app: &AppHandle) -> RefreshResult {
    let state = app.state::<AppState>();
    let guard = match state.refresh_lock.try_lock() {
        Ok(guard) => guard,
        Err(_) => {
            // 已有请求在途：等它结束后返回它的真实结果（包括错误信息）
            let _guard = state.refresh_lock.lock().await;
            if let Some(result) = state.last_refresh.lock().unwrap().clone() {
                return result;
            }
            let data = state.rates.lock().unwrap().clone();
            return RefreshResult {
                ok: data.is_some(),
                data,
                error: None,
            };
        }
    };

    let started = Instant::now();
    let (data, error) = fetch_rates(app).await;

    if let Some(data) = data.clone() {
        *state.rates.lock().unwrap() = Some(data.clone());
        let _ = app.emit("rates:changed", data);
        crate::tray::update_tooltip(app);
    }
    let result = RefreshResult {
        ok: error.is_none(),
        data: data.clone(),
        error: error.clone(),
    };
    // 在释放刷新锁之前发布结果，等待者可以直接拿到同一次请求的返回值
    *state.last_refresh.lock().unwrap() = Some(result.clone());
    drop(guard);
    match &data {
        Some(data) => println!(
            "[rates] {} USD={:?} ({}ms)",
            data.provider,
            data.rates.get("USD"),
            started.elapsed().as_millis()
        ),
        None => eprintln!("[rates] failed: {}", error.as_deref().unwrap_or("unknown")),
    }

    result
}

pub fn schedule_auto_refresh(app: &AppHandle) {
    let state = app.state::<AppState>();
    let mut slot = state.refresh_task.lock().unwrap();
    if let Some(handle) = slot.take() {
        handle.abort();
    }
    let hours = state.settings.lock().unwrap().auto_refresh_hours;
    if hours == 0 {
        return;
    }
    let handle = app.clone();
    let task = tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(hours as u64 * 3600));
        interval.tick().await; // 第一次 tick 立即返回，跳过
        loop {
            interval.tick().await;
            let _ = refresh(&handle).await;
        }
    });
    *slot = Some(task);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn parses_open_er_api() {
        let value = json!({
            "result": "success",
            "rates": { "USD": 0.14, "EUR": "0.12", "JPY": 0 },
            "time_last_update_unix": 1700000000
        });
        let (rates, updated) = parse_source(SourceKind::OpenEr, &value).unwrap();
        assert_eq!(rates.get("USD"), Some(&0.14));
        assert_eq!(rates.get("EUR"), Some(&0.12));
        assert_eq!(rates.get("JPY"), None);
        assert_eq!(rates.get("CNY"), Some(&1.0));
        assert_eq!(updated, Some(1_700_000_000_000));
    }

    #[test]
    fn parses_currency_api_date() {
        let value = json!({ "date": "2025-01-02", "cny": { "usd": 0.14 } });
        let (rates, updated) = parse_source(SourceKind::Currency, &value).unwrap();
        assert_eq!(rates.get("USD"), Some(&0.14));
        assert_eq!(updated, Some(1_735_776_000_000));
    }

    #[test]
    fn parses_known_epoch_dates() {
        assert_eq!(parse_date_ms("1970-01-01"), Some(0));
        assert_eq!(parse_date_ms("2024-02-29"), Some(1_709_164_800_000));
        assert_eq!(parse_date_ms("2025-01-02"), Some(1_735_776_000_000));
        assert_eq!(parse_date_ms("2025-13-01"), None);
    }

    #[test]
    fn rejects_invalid_payload() {
        assert!(parse_source(SourceKind::OpenEr, &json!({ "result": "error" })).is_none());
        assert!(parse_source(SourceKind::Currency, &json!(null)).is_none());
        assert!(parse_source(SourceKind::Exchange, &json!({ "rates": [] })).is_none());
    }
}
