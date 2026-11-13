use std::sync::atomic::Ordering;

use tauri::menu::{CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager};

use crate::model::{RatesData, Settings};
use crate::state::AppState;

const MENU_TOGGLE: &str = "toggle";
const MENU_PIN: &str = "pin";
const MENU_AUTOSTART: &str = "autostart";
const MENU_REFRESH: &str = "refresh";
const MENU_SHORTCUT: &str = "shortcut";
const MENU_QUIT: &str = "quit";

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let icon = tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?;
    TrayIconBuilder::with_id("main")
        .icon(icon)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .tooltip(tooltip_text(app))
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                crate::window::toggle_from_tray(tray.app_handle());
            }
        })
        .on_menu_event(|app, event| handle_menu(app, event.id().as_ref()))
        .build(app)?;
    Ok(())
}

pub fn refresh(app: &AppHandle) {
    let Some(tray) = app.tray_by_id("main") else {
        return;
    };
    if let Ok(menu) = build_menu(app) {
        let _ = tray.set_menu(Some(menu));
    }
    let _ = tray.set_tooltip(Some(tooltip_text(app)));
}

pub fn update_tooltip(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("main") {
        let _ = tray.set_tooltip(Some(tooltip_text(app)));
    }
}

fn build_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().unwrap().clone();
    let locale = crate::i18n::current_locale(&settings);
    let visible = app
        .get_webview_window("main")
        .map(|window| {
            window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false)
        })
        .unwrap_or(false);

    let toggle_label = if visible {
        crate::i18n::t(locale, "window.hide", &[])
    } else {
        crate::i18n::t(locale, "window.show", &[])
    };
    let toggle = MenuItemBuilder::with_id(MENU_TOGGLE, toggle_label).build(app)?;
    let separator1 = PredefinedMenuItem::separator(app)?;
    let pin = CheckMenuItemBuilder::with_id(
        MENU_PIN,
        crate::i18n::t(locale, "settings.alwaysOnTop", &[]),
    )
    .checked(settings.always_on_top)
    .build(app)?;
    let autostart = CheckMenuItemBuilder::with_id(
        MENU_AUTOSTART,
        crate::i18n::t(locale, "settings.autoLaunch", &[]),
    )
    .checked(settings.auto_launch)
    .build(app)?;
    let refresh =
        MenuItemBuilder::with_id(MENU_REFRESH, crate::i18n::t(locale, "tray.refresh", &[]))
            .build(app)?;
    let separator2 = PredefinedMenuItem::separator(app)?;
    let registered = app
        .state::<AppState>()
        .shortcut_registered
        .load(Ordering::SeqCst);
    let shortcut_text = display_shortcut(&settings.shortcut);
    let shortcut_label = if registered {
        crate::i18n::t(locale, "tray.shortcut", &[("shortcut", &shortcut_text)])
    } else {
        crate::i18n::t(
            locale,
            "tray.shortcutUnavailable",
            &[("shortcut", &shortcut_text)],
        )
    };
    let shortcut = MenuItemBuilder::with_id(MENU_SHORTCUT, shortcut_label)
        .enabled(false)
        .build(app)?;
    let separator3 = PredefinedMenuItem::separator(app)?;
    let quit =
        MenuItemBuilder::with_id(MENU_QUIT, crate::i18n::t(locale, "tray.quit", &[])).build(app)?;

    MenuBuilder::new(app)
        .item(&toggle)
        .item(&separator1)
        .item(&pin)
        .item(&autostart)
        .item(&refresh)
        .item(&separator2)
        .item(&shortcut)
        .item(&separator3)
        .item(&quit)
        .build()
}

fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        MENU_TOGGLE => crate::window::toggle_from_tray(app),
        MENU_PIN => {
            let current = app
                .state::<AppState>()
                .settings
                .lock()
                .unwrap()
                .always_on_top;
            let _ = crate::commands::patch_settings_impl(
                app,
                serde_json::json!({ "alwaysOnTop": !current }),
            );
        }
        MENU_AUTOSTART => {
            let current = app.state::<AppState>().settings.lock().unwrap().auto_launch;
            let _ = crate::commands::patch_settings_impl(
                app,
                serde_json::json!({ "autoLaunch": !current }),
            );
        }
        MENU_REFRESH => {
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let _ = crate::rates::refresh(&handle).await;
            });
        }
        MENU_QUIT => crate::window::quit(app),
        _ => {}
    }
}

fn display_shortcut(accelerator: &str) -> String {
    if cfg!(target_os = "macos") {
        accelerator
            .replace("Control", "⌃")
            .replace("Alt", "⌥")
            .replace("Shift", "⇧")
            .replace("Super", "⌘")
            .replace("Plus", "+")
    } else {
        accelerator
            .replace("Control", "Ctrl")
            .replace("Super", "Win")
            .replace("Plus", "+")
    }
}

fn tooltip_text(app: &AppHandle) -> String {
    let state = app.state::<AppState>();
    let settings = state.settings.lock().unwrap().clone();
    let rates = state.rates.lock().unwrap().clone();
    let locale = crate::i18n::current_locale(&settings);
    let mut text = crate::i18n::t(locale, "app.name", &[]);
    if settings.currency != settings.base_currency {
        if let Some(value) = per_unit_rate(&settings, rates.as_ref()) {
            text.push_str(&format!(
                " · 1 {} = {:.4} {}",
                settings.currency, value, settings.base_currency
            ));
        }
    }
    text
}

fn per_unit_rate(settings: &Settings, rates: Option<&RatesData>) -> Option<f64> {
    if settings.currency == settings.base_currency {
        return Some(1.0);
    }
    if let Some(manual) = settings.manual_rates.get(&settings.currency).copied() {
        if manual > 0.0 {
            return Some(manual);
        }
    }
    let rates = rates?;
    let per_base = *rates.rates.get(&settings.base_currency)?;
    let per_code = *rates.rates.get(&settings.currency)?;
    if per_base > 0.0 && per_code > 0.0 {
        Some(per_base / per_code)
    } else {
        None
    }
}
