use std::collections::HashMap;
use std::io;
use std::path::PathBuf;
use std::sync::atomic::Ordering;
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::model::{PhysicalBounds, Settings, WindowBounds};
use crate::state::AppState;

const FALLBACK_CURRENCIES: [&str; 3] = ["USD", "CNY", "JPY"];

const LEGACY_KEYS: [&str; 8] = [
    "rateMode",
    "converter",
    "unitPrice",
    "priceIncludesTax",
    "costCurrency",
    "pricingOpen",
    "pricingMode",
    "profitRate",
];

pub fn user_data_dir() -> PathBuf {
    // Windows: %APPDATA%\TradeCalc；macOS: ~/Library/Application Support/TradeCalc
    if let Some(base) = dirs::data_dir() {
        return base.join("TradeCalc");
    }
    if let Some(appdata) = std::env::var_os("APPDATA") {
        return PathBuf::from(appdata).join("TradeCalc");
    }
    if let Some(home) = std::env::var_os("USERPROFILE").or_else(|| std::env::var_os("HOME")) {
        return PathBuf::from(home).join(".config").join("TradeCalc");
    }
    PathBuf::from("TradeCalc")
}

pub fn settings_file() -> PathBuf {
    user_data_dir().join("settings.json")
}

pub fn rates_cache_file() -> PathBuf {
    user_data_dir().join("rates-cache.json")
}

fn read_json_object(path: &PathBuf) -> Option<Map<String, Value>> {
    let text = std::fs::read_to_string(path).ok()?;
    let value: Value = serde_json::from_str(&text).ok()?;
    value.as_object().cloned()
}

pub fn load_settings() -> Settings {
    match read_json_object(&settings_file()) {
        Some(raw) => merge_settings(&Settings::default(), &migrate_legacy_settings(raw)),
        None => Settings::default(),
    }
}

pub fn save_settings(settings: &Settings) -> io::Result<()> {
    let dir = user_data_dir();
    std::fs::create_dir_all(&dir)?;
    let file = dir.join("settings.json");
    let tmp = dir.join("settings.json.tmp");
    let data = serde_json::to_vec_pretty(settings).map_err(io::Error::other)?;
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, &file)?;
    Ok(())
}

/// 300ms 防抖写盘，避免逐字输入时频繁写文件。
pub fn schedule_save(app: &AppHandle) {
    let state = app.state::<AppState>();
    let generation = state.save_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(300)).await;
        let state = handle.state::<AppState>();
        if state.save_gen.load(Ordering::SeqCst) != generation {
            return;
        }
        let settings = state.settings.lock().unwrap().clone();
        if let Err(error) = save_settings(&settings) {
            eprintln!("保存设置失败: {error}");
            let _ = handle.emit("settings:save-error", ());
        }
    });
}

pub fn save_now(app: &AppHandle) {
    let settings = app.state::<AppState>().settings.lock().unwrap().clone();
    if let Err(error) = save_settings(&settings) {
        eprintln!("保存设置失败: {error}");
        let _ = app.emit("settings:save-error", ());
    }
}

fn finite_number(value: Option<&Value>, fallback: f64) -> f64 {
    match value {
        Some(Value::Number(number)) => number
            .as_f64()
            .filter(|v| v.is_finite())
            .unwrap_or(fallback),
        Some(Value::String(text)) => text
            .trim()
            .parse::<f64>()
            .ok()
            .filter(|v| v.is_finite())
            .unwrap_or(fallback),
        _ => fallback,
    }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn sanitize_boolean(value: Option<&Value>, fallback: bool) -> bool {
    match value {
        Some(Value::Bool(value)) => *value,
        Some(Value::String(text)) if text == "true" => true,
        Some(Value::String(text)) if text == "false" => false,
        _ => fallback,
    }
}

fn sanitize_text(value: Option<&Value>, fallback: &str) -> String {
    match value {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => fallback.to_string(),
    }
}

fn is_currency_code(text: &str) -> bool {
    text.len() == 3 && text.chars().all(|c| c.is_ascii_alphabetic())
}

fn sanitize_code(value: Option<&Value>, fallback: &str) -> String {
    match value.and_then(|v| v.as_str()) {
        Some(text) if is_currency_code(text) => text.to_ascii_uppercase(),
        _ => fallback.to_string(),
    }
}

fn sanitize_language(value: Option<&Value>, fallback: &str) -> String {
    match value.and_then(|v| v.as_str()) {
        Some("auto") => "auto".into(),
        Some("zh") => "zh".into(),
        Some("ja") => "ja".into(),
        _ => fallback.to_string(),
    }
}

fn sanitize_theme(value: Option<&Value>, fallback: &str) -> String {
    match value.and_then(|v| v.as_str()) {
        Some("auto") => "auto".into(),
        Some("white") => "white".into(),
        Some("dark") => "dark".into(),
        _ => fallback.to_string(),
    }
}

/// 保证恰好三个不重复币种，并且主输入币种一定出现在展示的前三行。
fn sanitize_currencies(value: &Value, primary: &str) -> Vec<String> {
    let mut codes: Vec<String> = Vec::new();
    if let Some(items) = value.as_array() {
        for item in items {
            if let Some(text) = item.as_str() {
                if !is_currency_code(text) {
                    continue;
                }
                let code = text.to_ascii_uppercase();
                if !codes.iter().any(|existing| existing == &code) {
                    codes.push(code);
                }
            }
        }
    }
    if !codes.iter().any(|code| code == primary) {
        codes.insert(0, primary.to_string());
    }
    for fallback in FALLBACK_CURRENCIES {
        if codes.len() >= 3 {
            break;
        }
        if !codes.iter().any(|code| code == fallback) {
            codes.push(fallback.to_string());
        }
    }
    let mut result: Vec<String> = codes.into_iter().take(3).collect();
    if !result.iter().any(|code| code == primary) {
        if result.len() < 3 {
            result.push(primary.to_string());
        } else if let Some(slot) = result.get_mut(2) {
            *slot = primary.to_string();
        }
    }
    result
}

fn sanitize_physical_bounds(value: Option<&Value>) -> Option<PhysicalBounds> {
    let object = value?.as_object()?;
    let x = finite_number(object.get("x"), f64::NAN);
    let y = finite_number(object.get("y"), f64::NAN);
    let width = finite_number(object.get("width"), f64::NAN);
    let height = finite_number(object.get("height"), f64::NAN);
    if !x.is_finite()
        || !y.is_finite()
        || !width.is_finite()
        || !height.is_finite()
        || width < 200.0
        || height < 200.0
    {
        return None;
    }
    Some(PhysicalBounds {
        x: x.round() as i32,
        y: y.round() as i32,
        width: width.round() as i32,
        height: height.round() as i32,
    })
}

fn sanitize_bounds(value: Option<&Value>) -> Option<WindowBounds> {
    let object = value?.as_object()?;
    let width = finite_number(object.get("width"), f64::NAN).round();
    let height = finite_number(object.get("height"), f64::NAN).round();
    // 小于 200 的 bounds 只可能来自旧版最小化 bug，直接丢弃
    if !width.is_finite() || !height.is_finite() || width < 200.0 || height < 200.0 {
        return None;
    }
    let x = finite_number(object.get("x"), f64::NAN);
    let y = finite_number(object.get("y"), f64::NAN);
    Some(WindowBounds {
        x: if x.is_finite() {
            Some(x.round() as i32)
        } else {
            None
        },
        y: if y.is_finite() {
            Some(y.round() as i32)
        } else {
            None
        },
        width: width as i32,
        height: height as i32,
        physical: sanitize_physical_bounds(object.get("physical")),
    })
}

fn sanitize_manual_rates(value: Option<&Value>) -> HashMap<String, f64> {
    let mut result = HashMap::new();
    let Some(object) = value.and_then(|v| v.as_object()) else {
        return result;
    };
    for (key, raw) in object {
        if !is_currency_code(key) {
            continue;
        }
        let rate = finite_number(Some(raw), f64::NAN);
        if rate.is_finite() && rate > 0.0 {
            result.insert(key.to_ascii_uppercase(), rate);
        }
    }
    result
}

/// 把持久化数据或补丁合并到基础设置上，所有字段都在这里归一化。
pub fn merge_settings(base: &Settings, raw: &Map<String, Value>) -> Settings {
    let currency = sanitize_code(raw.get("currency"), &base.currency);
    let currencies_value = raw.get("currencies").cloned().unwrap_or_else(|| {
        Value::Array(
            base.currencies
                .iter()
                .map(|code| Value::String(code.clone()))
                .collect(),
        )
    });
    let shortcut = match raw.get("shortcut") {
        Some(Value::String(text)) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                base.shortcut.clone()
            } else {
                trimmed.to_string()
            }
        }
        _ => base.shortcut.clone(),
    };

    Settings {
        language: sanitize_language(raw.get("language"), &base.language),
        theme: sanitize_theme(raw.get("theme"), &base.theme),
        currencies: sanitize_currencies(&currencies_value, &currency),
        currency,
        cost_price: sanitize_text(raw.get("costPrice"), &base.cost_price),
        cost_includes_tax: sanitize_boolean(raw.get("costIncludesTax"), base.cost_includes_tax),
        quantity: sanitize_text(raw.get("quantity"), &base.quantity),
        tax_rate: clamp(finite_number(raw.get("taxRate"), base.tax_rate), 0.0, 100.0),
        rebate_rate: clamp(
            finite_number(raw.get("rebateRate"), base.rebate_rate),
            0.0,
            100.0,
        ),
        profit_open: sanitize_boolean(raw.get("profitOpen"), base.profit_open),
        markup_rate: clamp(
            finite_number(raw.get("markupRate"), base.markup_rate),
            0.0,
            1000.0,
        ),
        manual_rates: match raw.get("manualRates") {
            Some(value) => sanitize_manual_rates(Some(value)),
            None => base.manual_rates.clone(),
        },
        base_currency: sanitize_code(raw.get("baseCurrency"), &base.base_currency),
        rates_open: sanitize_boolean(raw.get("ratesOpen"), base.rates_open),
        decimals: clamp(
            finite_number(raw.get("decimals"), base.decimals as f64).round(),
            0.0,
            6.0,
        ) as u32,
        auto_refresh_hours: clamp(
            finite_number(raw.get("autoRefreshHours"), base.auto_refresh_hours as f64).round(),
            0.0,
            168.0,
        ) as u32,
        always_on_top: sanitize_boolean(raw.get("alwaysOnTop"), base.always_on_top),
        auto_launch: sanitize_boolean(raw.get("autoLaunch"), base.auto_launch),
        shortcut,
        tray_hint_shown: sanitize_boolean(raw.get("trayHintShown"), base.tray_hint_shown),
        bounds: match raw.get("bounds") {
            Some(value) => sanitize_bounds(Some(value)),
            None => base.bounds.clone(),
        },
    }
}

/// 1.2.x → 1.3.x 迁移，与 Electron 版逻辑一致。
pub fn migrate_legacy_settings(raw: Map<String, Value>) -> Map<String, Value> {
    let mut saved = raw;

    let legacy_cost_text = match saved.get("costPrice") {
        Some(Value::String(text)) => text.clone(),
        Some(Value::Number(number)) => number.to_string(),
        _ => String::new(),
    };
    let legacy_cost_currency = saved
        .get("costCurrency")
        .and_then(|value| value.as_str())
        .filter(|text| is_currency_code(text))
        .map(str::to_ascii_uppercase);
    if !legacy_cost_text.trim().is_empty() {
        if let Some(currency) = legacy_cost_currency {
            saved.insert("currency".into(), Value::String(currency));
        }
    }

    if !finite_number(saved.get("markupRate"), f64::NAN).is_finite() {
        let legacy_profit_rate = finite_number(saved.get("profitRate"), f64::NAN);
        if legacy_profit_rate.is_finite() && (0.0..=1000.0).contains(&legacy_profit_rate) {
            saved.insert(
                "markupRate".into(),
                Value::Number(serde_json::Number::from_f64(legacy_profit_rate).unwrap()),
            );
        }
    }

    for key in LEGACY_KEYS {
        saved.remove(key);
    }
    saved
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn patch(value: Value) -> Map<String, Value> {
        value.as_object().unwrap().clone()
    }

    #[test]
    fn defaults_match_shared_fixture() {
        let expected: Settings =
            serde_json::from_str(include_str!("../../test/fixtures/default-settings.json"))
                .expect("default settings fixture");
        assert_eq!(Settings::default(), expected);
    }

    #[test]
    fn default_settings_follow_system_and_cny() {
        let settings = Settings::default();
        assert_eq!(settings.language, "auto");
        assert_eq!(settings.theme, "auto");
        assert_eq!(settings.base_currency, "CNY");
        assert!(settings.rates_open);
        assert_eq!(settings.currencies, vec!["USD", "CNY", "JPY"]);
    }

    #[test]
    fn merge_tolerates_wrong_types() {
        let merged = merge_settings(
            &Settings::default(),
            &patch(json!({
                "shortcut": 123,
                "quantity": 5,
                "costPrice": 12.5,
                "alwaysOnTop": "false",
                "autoLaunch": "false",
                "costIncludesTax": "false"
            })),
        );
        assert_eq!(merged.shortcut, "Alt+`");
        assert_eq!(merged.quantity, "5");
        assert_eq!(merged.cost_price, "12.5");
        assert!(!merged.always_on_top);
        assert!(!merged.auto_launch);
        assert!(!merged.cost_includes_tax);
    }

    #[test]
    fn merge_clamps_numbers() {
        let merged = merge_settings(
            &Settings::default(),
            &patch(json!({
                "taxRate": 150,
                "rebateRate": -5,
                "markupRate": 2000,
                "decimals": 99,
                "autoRefreshHours": -1
            })),
        );
        assert_eq!(merged.tax_rate, 100.0);
        assert_eq!(merged.rebate_rate, 0.0);
        assert_eq!(merged.markup_rate, 1000.0);
        assert_eq!(merged.decimals, 6);
        assert_eq!(merged.auto_refresh_hours, 0);
    }

    #[test]
    fn primary_currency_is_in_display_list() {
        let merged = merge_settings(
            &Settings::default(),
            &patch(json!({ "currencies": ["USD", "CNY", "JPY"], "currency": "GBP" })),
        );
        assert_eq!(merged.currency, "GBP");
        assert!(merged.currencies.contains(&"GBP".to_string()));
        assert_eq!(merged.currencies.len(), 3);
    }

    #[test]
    fn sanitizes_manual_rates_and_bounds() {
        let merged = merge_settings(
            &Settings::default(),
            &patch(json!({
                "manualRates": { "usd": "7.5", "EUR": 0, "TOOLONG": 2 },
                "bounds": { "width": "abc", "height": 100 }
            })),
        );
        assert_eq!(merged.manual_rates.get("USD"), Some(&7.5));
        assert_eq!(merged.manual_rates.len(), 1);
        assert!(merged.bounds.is_none());
    }

    #[test]
    fn sanitizes_physical_bounds() {
        let merged = merge_settings(
            &Settings::default(),
            &patch(json!({
                "bounds": {
                    "width": 500,
                    "height": 700,
                    "physical": { "x": 100, "y": 200, "width": 600, "height": 800 }
                }
            })),
        );
        let bounds = merged.bounds.expect("bounds");
        assert_eq!(
            bounds.physical,
            Some(PhysicalBounds {
                x: 100,
                y: 200,
                width: 600,
                height: 800
            })
        );

        let invalid = merge_settings(
            &Settings::default(),
            &patch(json!({
                "bounds": {
                    "width": 500,
                    "height": 700,
                    "physical": { "x": 100, "y": 200, "width": 1, "height": 800 }
                }
            })),
        );
        assert!(invalid.bounds.expect("bounds").physical.is_none());

        let tiny = merge_settings(
            &Settings::default(),
            &patch(json!({ "bounds": { "width": 1, "height": 1 } })),
        );
        assert!(tiny.bounds.is_none());
    }

    #[test]
    fn sanitizes_language_and_base_currency() {
        assert_eq!(
            merge_settings(&Settings::default(), &patch(json!({ "language": "ja" }))).language,
            "ja"
        );
        assert_eq!(
            merge_settings(&Settings::default(), &patch(json!({ "language": "en" }))).language,
            "auto"
        );
        assert_eq!(
            merge_settings(
                &Settings::default(),
                &patch(json!({ "baseCurrency": "jpy" }))
            )
            .base_currency,
            "JPY"
        );
        assert_eq!(
            merge_settings(
                &Settings::default(),
                &patch(json!({ "baseCurrency": "人民币" }))
            )
            .base_currency,
            "CNY"
        );
    }

    #[test]
    fn sanitizes_theme_and_rates_open() {
        assert_eq!(
            merge_settings(&Settings::default(), &patch(json!({ "theme": "white" }))).theme,
            "white"
        );
        assert_eq!(
            merge_settings(&Settings::default(), &patch(json!({ "theme": "dark" }))).theme,
            "dark"
        );
        assert_eq!(
            merge_settings(&Settings::default(), &patch(json!({ "theme": "invalid" }))).theme,
            "auto"
        );
        assert!(merge_settings(&Settings::default(), &patch(json!({}))).rates_open);
        assert!(
            !merge_settings(
                &Settings::default(),
                &patch(json!({ "ratesOpen": "false" }))
            )
            .rates_open
        );
    }

    #[test]
    fn migrates_legacy_cost_currency_and_profit_rate() {
        let migrated = migrate_legacy_settings(patch(json!({
            "currencies": ["USD", "CNY", "JPY"],
            "costPrice": "100",
            "costCurrency": "GBP",
            "profitRate": 30
        })));
        let merged = merge_settings(&Settings::default(), &migrated);
        assert_eq!(merged.currency, "GBP");
        assert!(merged.currencies.contains(&"GBP".to_string()));
        assert_eq!(merged.cost_price, "100");
        assert_eq!(merged.markup_rate, 30.0);
        assert!(!migrated.contains_key("profitRate"));
        assert!(!migrated.contains_key("costCurrency"));
    }

    #[test]
    fn keeps_existing_markup_rate_during_migration() {
        let migrated = migrate_legacy_settings(patch(json!({
            "profitRate": 30,
            "markupRate": 25
        })));
        let merged = merge_settings(&Settings::default(), &migrated);
        assert_eq!(merged.markup_rate, 25.0);
    }

    #[test]
    fn round_trips_camel_case_json() {
        let settings = Settings::default();
        let value = serde_json::to_value(&settings).unwrap();
        assert!(value.get("baseCurrency").is_some());
        assert!(value.get("costIncludesTax").is_some());
        assert!(value.get("autoRefreshHours").is_some());
        assert!(value.get("theme").is_some());
        assert!(value.get("ratesOpen").is_some());
    }
}
