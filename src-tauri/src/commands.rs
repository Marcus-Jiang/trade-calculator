use std::sync::atomic::Ordering;
use std::time::Duration;

use serde_json::{Map, Value};
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_clipboard_manager::ClipboardExt;

use crate::i18n;
use crate::model::{AppMeta, PatchResult, RatesData, RefreshResult, Settings, SettingsPayload};
use crate::settings;
use crate::shortcut;
use crate::state::AppState;

fn build_meta(app: &AppHandle) -> AppMeta {
    AppMeta {
        version: env!("CARGO_PKG_VERSION").into(),
        is_packaged: !cfg!(debug_assertions),
        system_locale: i18n::system_locale().unwrap_or_else(|| "zh-CN".into()),
        shortcut_registered: app
            .state::<AppState>()
            .shortcut_registered
            .load(Ordering::SeqCst),
        platform: std::env::consts::OS.into(),
    }
}

/// 1.6.0 的 Tauri 版曾用 productName 作为 Run 值名；升级后清理旧的重复启动项。
#[cfg(windows)]
fn remove_legacy_autostart_entry() {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_READ, KEY_SET_VALUE};

    let hkcu = winreg::RegKey::predef(HKEY_CURRENT_USER);
    let Ok(run) = hkcu.open_subkey_with_flags(
        r"Software\Microsoft\Windows\CurrentVersion\Run",
        KEY_READ | KEY_SET_VALUE,
    ) else {
        return;
    };
    let Ok(command) = run.get_value::<String, _>("外贸计算器") else {
        return;
    };
    let matches = std::env::current_exe()
        .ok()
        .and_then(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .map(|name| name.to_ascii_lowercase())
        })
        .map(|name| command.to_ascii_lowercase().contains(&name))
        .unwrap_or(false);
    if matches {
        let _ = run.delete_value("外贸计算器");
    }
}

#[cfg(not(windows))]
fn remove_legacy_autostart_entry() {}

pub fn apply_auto_launch(app: &AppHandle, enabled: bool) {
    // 开发模式不写启动项；TRADECALC_NO_AUTOSTART 供发布版冒烟测试使用
    if cfg!(debug_assertions) || std::env::var_os("TRADECALC_NO_AUTOSTART").is_some() {
        return;
    }
    remove_legacy_autostart_entry();
    let manager = app.autolaunch();
    let result = if enabled {
        manager.enable()
    } else {
        manager.disable()
    };
    if let Err(error) = result {
        eprintln!("设置开机自启失败: {error}");
    }
}

fn apply_effects(app: &AppHandle, next: &Settings, raw: &Map<String, Value>) {
    let has = |key: &str| raw.contains_key(key);
    if has("alwaysOnTop") {
        crate::window::set_always_on_top(app, next.always_on_top);
    }
    if has("autoLaunch") {
        apply_auto_launch(app, next.auto_launch);
    }
    if has("theme") {
        crate::window::apply_theme(app, &next.theme);
    }
    if has("autoRefreshHours") {
        crate::rates::schedule_auto_refresh(app);
    }
    if has("language") {
        let locale = i18n::current_locale(next);
        crate::window::set_title(app, &i18n::t(locale, "app.name", &[]));
    }
    if has("alwaysOnTop") || has("autoLaunch") || has("language") || has("shortcut") || has("theme")
    {
        crate::tray::refresh(app);
    } else if has("currency") || has("manualRates") || has("baseCurrency") {
        crate::tray::update_tooltip(app);
    }
}

fn schedule_broadcast(app: &AppHandle) {
    let state = app.state::<AppState>();
    let generation = state.broadcast_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(80)).await;
        let state = handle.state::<AppState>();
        if state.broadcast_gen.load(Ordering::SeqCst) != generation {
            return;
        }
        let current = state.settings.lock().unwrap().clone();
        let _ = handle.emit("settings:changed", current);
    });
}

/// 供命令、托盘菜单和托盘气泡共用；失败时返回原始设置，调用方可回滚 UI。
pub fn patch_settings_impl(app: &AppHandle, patch: Value) -> PatchResult {
    let state = app.state::<AppState>();
    let raw = patch.as_object().cloned().unwrap_or_default();
    // 在同一个锁内完成“合并 + 提交”，避免并发的窗口 bounds 保存被旧快照覆盖
    let next = {
        let mut guard = state.settings.lock().unwrap();
        let previous = guard.clone();
        let next = settings::merge_settings(&previous, &raw);
        if next.shortcut != previous.shortcut {
            if let Err(error) = shortcut::register(app, &next.shortcut) {
                let _ = shortcut::register(app, &previous.shortcut);
                let locale = i18n::current_locale(&previous);
                return PatchResult {
                    ok: false,
                    error: Some(i18n::t(locale, error.key(), &[])),
                    settings: previous,
                };
            }
        }
        *guard = next.clone();
        next
    };

    settings::schedule_save(app);
    apply_effects(app, &next, &raw);

    let should_broadcast = raw
        .keys()
        .any(|key| key != "bounds" && key != "trayHintShown");
    if should_broadcast {
        schedule_broadcast(app);
    }

    PatchResult {
        ok: true,
        error: None,
        settings: next,
    }
}

#[tauri::command]
pub fn settings_get(app: AppHandle) -> SettingsPayload {
    let settings = app.state::<AppState>().settings.lock().unwrap().clone();
    SettingsPayload {
        settings,
        meta: build_meta(&app),
    }
}

#[tauri::command]
pub fn settings_patch(app: AppHandle, patch: Value) -> PatchResult {
    patch_settings_impl(&app, patch)
}

#[tauri::command]
pub fn rates_get(app: AppHandle) -> Option<RatesData> {
    app.state::<AppState>().rates.lock().unwrap().clone()
}

#[tauri::command]
pub async fn rates_refresh(app: AppHandle) -> RefreshResult {
    crate::rates::refresh(&app).await
}

#[tauri::command]
pub fn window_minimize(app: AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.minimize();
    }
    // 托盘菜单的“显示/隐藏”标签依赖窗口是否最小化
    crate::tray::refresh(&app);
}

#[tauri::command]
pub fn window_hide(app: AppHandle) {
    crate::window::hide_to_tray(&app);
}

#[tauri::command]
pub fn window_quit(app: AppHandle) {
    crate::window::quit(&app);
}

#[tauri::command]
pub fn clipboard_copy(app: AppHandle, text: String) {
    if let Err(error) = app.clipboard().write_text(text) {
        eprintln!("复制到剪贴板失败: {error}");
    }
}

#[tauri::command]
pub fn shortcut_capture(app: AppHandle, active: bool) {
    app.state::<AppState>()
        .shortcut_capture
        .store(active, Ordering::SeqCst);
    if active {
        shortcut::unregister_all(&app);
    } else {
        let accelerator = app
            .state::<AppState>()
            .settings
            .lock()
            .unwrap()
            .shortcut
            .clone();
        let _ = shortcut::register(&app, &accelerator);
    }
    crate::tray::refresh(&app);
}
