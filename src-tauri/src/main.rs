#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod i18n;
mod model;
mod rates;
mod settings;
mod shortcut;
mod state;
mod tray;
mod window;

use tauri::Manager;

fn main() {
    let settings = settings::load_settings();
    let locale = i18n::current_locale(&settings);
    let cached_rates = rates::read_cache(locale);
    let start_hidden = std::env::args().skip(1).any(|arg| arg == "--hidden");
    let app_state = state::AppState::new(settings, cached_rates, start_hidden);

    tauri::Builder::default()
        // 单实例插件必须最先注册
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            window::show(app);
        }))
        .plugin(
            // 固定 Run 值名，升级时复用/清理旧启动项；--hidden 让登录启动时留在托盘
            tauri_plugin_autostart::Builder::new()
                .app_name("com.tradecalc.desktop")
                .args(["--hidden"])
                .build(),
        )
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_os::init())
        .manage(app_state)
        .invoke_handler(tauri::generate_handler![
            commands::settings_get,
            commands::settings_patch,
            commands::rates_get,
            commands::rates_refresh,
            commands::window_minimize,
            commands::window_hide,
            commands::window_quit,
            commands::clipboard_copy,
            commands::shortcut_capture
        ])
        .setup(|app| {
            let handle = app.handle().clone();
            window::create(&handle)?;
            tray::create(&handle)?;

            let settings = handle
                .state::<state::AppState>()
                .settings
                .lock()
                .unwrap()
                .clone();
            if let Err(error) = shortcut::register(&handle, &settings.shortcut) {
                eprintln!("全局快捷键注册失败: {}", error.key());
            }
            // 注册结果会影响托盘菜单中的“不可用”标记
            tray::refresh(&handle);
            commands::apply_auto_launch(&handle, settings.auto_launch);
            rates::schedule_auto_refresh(&handle);

            let refresh_handle = handle.clone();
            tauri::async_runtime::spawn(async move {
                let _ = rates::refresh(&refresh_handle).await;
            });
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| match event {
            #[cfg(target_os = "macos")]
            tauri::RunEvent::Reopen {
                has_visible_windows,
                ..
            } => {
                if !has_visible_windows {
                    window::show(app);
                }
            }
            tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit => {
                window::save_state_now(app);
            }
            _ => {}
        });
}
