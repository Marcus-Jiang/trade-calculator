use std::collections::HashMap;

use serde::{Deserialize, Serialize};

/// 与 Electron 版 settings.json 完全兼容的数据结构（camelCase）。
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalBounds {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBounds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub x: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub y: Option<i32>,
    pub width: i32,
    pub height: i32,
    /// 物理像素几何，供混合 DPI 多显示器精确恢复；Electron 不读取但会保留
    #[serde(skip_serializing_if = "Option::is_none")]
    pub physical: Option<PhysicalBounds>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub language: String,
    pub theme: String,
    pub currencies: Vec<String>,
    pub currency: String,
    pub cost_price: String,
    pub cost_includes_tax: bool,
    pub quantity: String,
    pub tax_rate: f64,
    pub rebate_rate: f64,
    pub profit_open: bool,
    pub markup_rate: f64,
    pub manual_rates: HashMap<String, f64>,
    pub base_currency: String,
    pub rates_open: bool,
    pub decimals: u32,
    pub auto_refresh_hours: u32,
    pub always_on_top: bool,
    pub auto_launch: bool,
    pub shortcut: String,
    pub tray_hint_shown: bool,
    pub bounds: Option<WindowBounds>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            language: "auto".into(),
            theme: "auto".into(),
            currencies: vec!["USD".into(), "CNY".into(), "JPY".into()],
            currency: "USD".into(),
            cost_price: String::new(),
            cost_includes_tax: true,
            quantity: "1".into(),
            tax_rate: 13.0,
            rebate_rate: 13.0,
            profit_open: false,
            markup_rate: 20.0,
            manual_rates: HashMap::new(),
            base_currency: "CNY".into(),
            rates_open: true,
            decimals: 2,
            auto_refresh_hours: 3,
            always_on_top: false,
            auto_launch: false,
            shortcut: "Alt+`".into(),
            tray_hint_shown: false,
            bounds: None,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RatesData {
    pub base: String,
    pub rates: HashMap<String, f64>,
    pub provider: String,
    pub updated_at: u64,
    pub stale: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppMeta {
    pub version: String,
    pub is_packaged: bool,
    pub system_locale: String,
    pub shortcut_registered: bool,
    pub platform: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPayload {
    pub settings: Settings,
    pub meta: AppMeta,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
    pub settings: Settings,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshResult {
    pub ok: bool,
    pub data: Option<RatesData>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}
