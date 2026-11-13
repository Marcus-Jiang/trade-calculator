use std::sync::atomic::AtomicBool;
use std::sync::atomic::AtomicU64;
use std::sync::Mutex;
use std::time::Duration;

use crate::model::{RatesData, RefreshResult, Settings};

pub struct AppState {
    pub settings: Mutex<Settings>,
    pub rates: Mutex<Option<RatesData>>,
    pub last_refresh: Mutex<Option<RefreshResult>>,
    pub http: reqwest::Client,
    pub is_quitting: AtomicBool,
    pub shortcut_capture: AtomicBool,
    pub shortcut_registered: AtomicBool,
    pub start_hidden: bool,
    pub save_gen: AtomicU64,
    pub broadcast_gen: AtomicU64,
    pub bounds_gen: AtomicU64,
    pub refresh_task: Mutex<Option<tauri::async_runtime::JoinHandle<()>>>,
    pub refresh_lock: tokio::sync::Mutex<()>,
}

impl AppState {
    pub fn new(settings: Settings, rates: Option<RatesData>, start_hidden: bool) -> Self {
        let http = reqwest::Client::builder()
            .timeout(Duration::from_secs(10))
            .user_agent(format!("TradeCalc/{}", env!("CARGO_PKG_VERSION")))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self {
            settings: Mutex::new(settings),
            rates: Mutex::new(rates),
            last_refresh: Mutex::new(None),
            http,
            is_quitting: AtomicBool::new(false),
            shortcut_capture: AtomicBool::new(false),
            shortcut_registered: AtomicBool::new(false),
            start_hidden,
            save_gen: AtomicU64::new(0),
            broadcast_gen: AtomicU64::new(0),
            bounds_gen: AtomicU64::new(0),
            refresh_task: Mutex::new(None),
            refresh_lock: tokio::sync::Mutex::new(()),
        }
    }
}
