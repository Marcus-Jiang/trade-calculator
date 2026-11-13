use std::sync::atomic::Ordering;
use std::time::Duration;

use tauri::webview::PageLoadEvent;
use tauri::{
    AppHandle, Manager, PhysicalPosition, PhysicalSize, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder, WindowEvent,
};

use crate::model::{PhysicalBounds, WindowBounds};
use crate::state::AppState;

pub fn create(app: &AppHandle) -> tauri::Result<()> {
    let settings = app.state::<AppState>().settings.lock().unwrap().clone();
    let start_hidden = app.state::<AppState>().start_hidden;
    let locale = crate::i18n::current_locale(&settings);
    let bounds = initial_bounds(app, settings.bounds.as_ref());

    let mut builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title(crate::i18n::t(locale, "app.name", &[]))
        .inner_size(bounds.width, bounds.height)
        .min_inner_size(420.0, 600.0)
        .resizable(true)
        .maximizable(false)
        .decorations(false)
        .visible(false);
    if let Some((x, y)) = bounds.position {
        builder = builder.position(x, y);
    }

    let load_handle = app.clone();
    builder = builder.on_page_load(move |window, payload| {
        if matches!(payload.event(), PageLoadEvent::Finished) {
            if !start_hidden {
                let _ = window.show();
                let _ = window.set_focus();
            }
            // 页面加载完成说明渲染进程已就绪；顺手恢复崩溃时留下的录制标记
            recover_shortcut(&load_handle);
            crate::tray::refresh(&load_handle);
        }
    });

    let window = builder.build()?;
    if let Some((x, y, width, height)) = bounds.physical {
        // 物理坐标不依赖当前 DPI 的换算；先定位再设尺寸，避免 WM_DPICHANGED 覆盖
        let _ = window.set_position(PhysicalPosition::new(x, y));
        let _ = window.set_size(PhysicalSize::new(width, height));
    }
    window.set_always_on_top(settings.always_on_top)?;
    apply_theme(app, &settings.theme);

    // 页面加载失败时兜底显示，避免窗口永远不可见；开机自启的隐藏启动除外
    let fallback_handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_secs(2)).await;
        if start_hidden {
            return;
        }
        if let Some(window) = fallback_handle.get_webview_window("main") {
            if !window.is_visible().unwrap_or(true) {
                let _ = window.show();
            }
        }
    });

    let event_handle = app.clone();
    let close_window = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::CloseRequested { api, .. } => {
            if event_handle
                .state::<AppState>()
                .is_quitting
                .load(Ordering::SeqCst)
            {
                return;
            }
            api.prevent_close();
            let _ = close_window.hide();
            maybe_show_tray_hint(&event_handle);
            crate::tray::refresh(&event_handle);
        }
        // 最小化会触发 Resized(0,0)，此时绝不能把退化几何写进设置
        WindowEvent::Moved(_) | WindowEvent::Resized(_)
            if !close_window.is_minimized().unwrap_or(false) =>
        {
            schedule_bounds_save(&event_handle);
        }
        _ => {}
    });

    Ok(())
}

pub fn show(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_minimized().unwrap_or(false) {
            let _ = window.unminimize();
        }
        let _ = window.show();
        let _ = window.set_focus();
        register_shortcut_if_needed(app);
        crate::tray::refresh(app);
    }
}

pub fn toggle(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    let focused = window.is_focused().unwrap_or(false);
    if visible && !minimized && focused {
        let _ = window.hide();
        crate::tray::refresh(app);
    } else {
        show(app);
    }
}

/// 托盘点击/菜单：只要窗口可见就收起，不要求窗口处于焦点。
pub fn toggle_from_tray(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let visible = window.is_visible().unwrap_or(false);
    let minimized = window.is_minimized().unwrap_or(false);
    if visible && !minimized {
        let _ = window.hide();
        crate::tray::refresh(app);
    } else {
        show(app);
    }
}

pub fn hide_to_tray(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
    }
    maybe_show_tray_hint(app);
    crate::tray::refresh(app);
}

pub fn quit(app: &AppHandle) {
    app.state::<AppState>()
        .is_quitting
        .store(true, Ordering::SeqCst);
    save_state_now(app);
    app.exit(0);
}

/// 退出/系统注销时把仍在防抖窗口内的窗口几何一并写入设置。
pub fn save_state_now(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if !window.is_minimized().unwrap_or(false) {
            if let Some(bounds) = current_bounds(&window) {
                app.state::<AppState>().settings.lock().unwrap().bounds = Some(bounds);
            }
        }
    }
    crate::settings::save_now(app);
}

pub fn set_always_on_top(app: &AppHandle, value: bool) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_always_on_top(value);
    }
}

pub fn set_title(app: &AppHandle, title: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(title);
    }
}

/// 让 WebView2 的原生控件跟随手动主题；auto 时交还给系统。
pub fn apply_theme(app: &AppHandle, theme: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let value = match theme {
            "white" => Some(tauri::Theme::Light),
            "dark" => Some(tauri::Theme::Dark),
            _ => None,
        };
        let _ = window.set_theme(value);
    }
}

fn maybe_show_tray_hint(app: &AppHandle) {
    let state = app.state::<AppState>();
    let shown = state.settings.lock().unwrap().tray_hint_shown;
    if shown {
        return;
    }
    // Electron 版用托盘气泡提示一次；Tauri 的 Windows 通知只对安装版可靠，
    // 这里只记录标记并更新托盘 tooltip，避免便携版出现 “PowerShell” 通知。
    let _ = crate::commands::patch_settings_impl(app, serde_json::json!({ "trayHintShown": true }));
}

fn register_shortcut_if_needed(app: &AppHandle) {
    let state = app.state::<AppState>();
    if state.shortcut_capture.load(Ordering::SeqCst)
        || state.shortcut_registered.load(Ordering::SeqCst)
    {
        return;
    }
    let accelerator = state.settings.lock().unwrap().shortcut.clone();
    let _ = crate::shortcut::register(app, &accelerator);
}

/// 页面重新加载/渲染进程崩溃后恢复录制期间被释放的全局热键。
fn recover_shortcut(app: &AppHandle) {
    app.state::<AppState>()
        .shortcut_capture
        .store(false, Ordering::SeqCst);
    register_shortcut_if_needed(app);
}

fn schedule_bounds_save(app: &AppHandle) {
    let state = app.state::<AppState>();
    let generation = state.bounds_gen.fetch_add(1, Ordering::SeqCst) + 1;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(400)).await;
        let state = handle.state::<AppState>();
        if state.bounds_gen.load(Ordering::SeqCst) != generation {
            return;
        }
        let Some(window) = handle.get_webview_window("main") else {
            return;
        };
        // 防抖期间用户可能已经最小化窗口
        if window.is_minimized().unwrap_or(false) {
            return;
        }
        let Some(bounds) = current_bounds(&window) else {
            return;
        };
        state.settings.lock().unwrap().bounds = Some(bounds);
        crate::settings::schedule_save(&handle);
    });
}

fn current_bounds(window: &WebviewWindow) -> Option<WindowBounds> {
    let scale = window.scale_factor().ok()?;
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    // 最小化窗口的客户区是 0x0；不要保存这种退化几何
    if size.width < 200 || size.height < 200 {
        return None;
    }
    let logical_position = position.to_logical::<f64>(scale);
    let logical_size = size.to_logical::<f64>(scale);
    if logical_size.width < 200.0 || logical_size.height < 200.0 {
        return None;
    }
    Some(WindowBounds {
        x: Some(logical_position.x.round() as i32),
        y: Some(logical_position.y.round() as i32),
        width: logical_size.width.round().max(1.0) as i32,
        height: logical_size.height.round().max(1.0) as i32,
        physical: Some(PhysicalBounds {
            x: position.x,
            y: position.y,
            width: size.width as i32,
            height: size.height as i32,
        }),
    })
}

#[derive(Clone, Copy, Debug)]
struct WorkArea {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    scale: f64,
}

#[derive(Clone, Copy, Debug)]
struct Rect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

struct InitialBounds {
    width: f64,
    height: f64,
    position: Option<(f64, f64)>,
    physical: Option<(i32, i32, u32, u32)>,
}

fn intersection_area(rect: Rect, area: &WorkArea) -> f64 {
    let left = rect.x.max(area.x);
    let right = (rect.x + rect.width).min(area.x + area.width);
    let top = rect.y.max(area.y);
    let bottom = (rect.y + rect.height).min(area.y + area.height);
    if right <= left || bottom <= top {
        0.0
    } else {
        (right - left) * (bottom - top)
    }
}

/// 选与窗口矩形相交面积最大的工作区；没有交集时回退到第一个（主屏）。
fn choose_area(rect: Rect, areas: &[WorkArea]) -> Option<usize> {
    if areas.is_empty() {
        return None;
    }
    let mut best = 0;
    let mut best_area = intersection_area(rect, &areas[0]);
    for (index, area) in areas.iter().enumerate().skip(1) {
        let candidate = intersection_area(rect, area);
        if candidate > best_area {
            best_area = candidate;
            best = index;
        }
    }
    Some(best)
}

/// 把窗口夹到工作区内，并至少保留 120×80（逻辑像素）可见，避免完全找不回窗口。
/// `unit_scale` 在物理坐标下等于显示器缩放；在逻辑坐标下为 1。
fn clamp_rect(rect: Rect, area: &WorkArea, unit_scale: f64) -> Rect {
    let min_width = 420.0 * unit_scale;
    let min_height = 600.0 * unit_scale;
    let max_width = (area.width - 40.0 * unit_scale).max(min_width);
    let max_height = (area.height - 40.0 * unit_scale).max(min_height);
    let width = rect.width.max(min_width).min(max_width);
    let height = rect.height.max(min_height).min(max_height);
    let visible_x = 120.0 * unit_scale;
    let visible_y = 80.0 * unit_scale;
    let x = rect
        .x
        .max(area.x - width + visible_x)
        .min(area.x + area.width - visible_x);
    let y = rect
        .y
        .max(area.y - height + visible_y)
        .min(area.y + area.height - visible_y);
    Rect {
        x,
        y,
        width,
        height,
    }
}

fn physical_work_areas(app: &AppHandle) -> Vec<WorkArea> {
    let mut areas = Vec::new();
    if let Ok(monitors) = app.available_monitors() {
        for monitor in monitors {
            let work = monitor.work_area();
            areas.push(WorkArea {
                x: work.position.x as f64,
                y: work.position.y as f64,
                width: work.size.width as f64,
                height: work.size.height as f64,
                scale: monitor.scale_factor(),
            });
        }
    }
    // 保证索引 0 是主屏，作为找不到交集时的回退
    if let Ok(Some(primary)) = app.primary_monitor() {
        let work = primary.work_area();
        let primary_area = WorkArea {
            x: work.position.x as f64,
            y: work.position.y as f64,
            width: work.size.width as f64,
            height: work.size.height as f64,
            scale: primary.scale_factor(),
        };
        match areas.iter().position(|area| {
            area.x == primary_area.x
                && area.y == primary_area.y
                && area.width == primary_area.width
                && area.height == primary_area.height
        }) {
            Some(index) if index != 0 => areas.swap(0, index),
            Some(_) => {}
            None => areas.insert(0, primary_area),
        }
    }
    if areas.is_empty() {
        areas.push(WorkArea {
            x: 0.0,
            y: 0.0,
            width: 1920.0,
            height: 1040.0,
            scale: 1.0,
        });
    }
    areas
}

fn logical_work_areas(physical: &[WorkArea]) -> Vec<WorkArea> {
    physical
        .iter()
        .map(|area| WorkArea {
            x: area.x / area.scale,
            y: area.y / area.scale,
            width: area.width / area.scale,
            height: area.height / area.scale,
            scale: area.scale,
        })
        .collect()
}

fn initial_bounds(app: &AppHandle, saved: Option<&WindowBounds>) -> InitialBounds {
    let physical_areas = physical_work_areas(app);
    let logical_areas = logical_work_areas(&physical_areas);

    if let Some(saved) = saved {
        if let Some(physical) = saved.physical.as_ref().filter(|physical| {
            (-10_000..=100_000).contains(&physical.x) && (-10_000..=100_000).contains(&physical.y)
        }) {
            let rect = Rect {
                x: physical.x as f64,
                y: physical.y as f64,
                width: physical.width as f64,
                height: physical.height as f64,
            };
            let area = physical_areas[choose_area(rect, &physical_areas).unwrap_or(0)];
            let clamped = clamp_rect(rect, &area, area.scale);
            return InitialBounds {
                width: (clamped.width / area.scale).max(420.0),
                height: (clamped.height / area.scale).max(600.0),
                position: None,
                physical: Some((
                    clamped.x.round() as i32,
                    clamped.y.round() as i32,
                    clamped.width.round().max(1.0) as u32,
                    clamped.height.round().max(1.0) as u32,
                )),
            };
        }

        if let (Some(x), Some(y)) = (saved.x, saved.y) {
            // 旧版最小化 bug 可能留下 -32000 这类极端坐标；只保留尺寸
            if !(-10_000..=100_000).contains(&x) || !(-10_000..=100_000).contains(&y) {
                let area = logical_areas[0];
                return InitialBounds {
                    width: (saved.width as f64)
                        .max(420.0)
                        .min((area.width - 40.0).max(420.0)),
                    height: (saved.height as f64)
                        .max(600.0)
                        .min((area.height - 40.0).max(600.0)),
                    position: None,
                    physical: None,
                };
            }
            // 兼容 Electron/旧版逻辑坐标；用整个矩形而不是左上角点匹配显示器
            let rect = Rect {
                x: x as f64,
                y: y as f64,
                width: saved.width as f64,
                height: saved.height as f64,
            };
            let area = logical_areas[choose_area(rect, &logical_areas).unwrap_or(0)];
            let clamped = clamp_rect(rect, &area, 1.0);
            return InitialBounds {
                width: clamped.width.max(420.0),
                height: clamped.height.max(600.0),
                position: Some((clamped.x, clamped.y)),
                physical: None,
            };
        }

        let area = logical_areas[0];
        return InitialBounds {
            width: (saved.width as f64)
                .max(420.0)
                .min((area.width - 40.0).max(420.0)),
            height: (saved.height as f64)
                .max(600.0)
                .min((area.height - 40.0).max(600.0)),
            position: None,
            physical: None,
        };
    }

    let area = logical_areas[0];
    InitialBounds {
        width: 460.0f64.min((area.width - 40.0).max(420.0)).max(420.0),
        height: 810.0f64.min((area.height - 40.0).max(600.0)).max(600.0),
        position: None,
        physical: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn area(x: f64, y: f64, width: f64, height: f64, scale: f64) -> WorkArea {
        WorkArea {
            x,
            y,
            width,
            height,
            scale,
        }
    }

    #[test]
    fn chooses_monitor_by_largest_intersection() {
        let primary = area(0.0, 0.0, 1920.0, 1040.0, 1.0);
        let secondary = area(1920.0, 0.0, 2560.0, 1400.0, 1.5);
        let rect = Rect {
            x: 2200.0,
            y: 300.0,
            width: 460.0,
            height: 800.0,
        };
        assert_eq!(choose_area(rect, &[primary, secondary]), Some(1));
    }

    #[test]
    fn rectangle_matching_keeps_partially_offscreen_window_on_its_monitor() {
        let primary = area(0.0, 0.0, 1920.0, 1040.0, 1.0);
        let secondary = area(1920.0, 0.0, 2560.0, 1400.0, 1.0);
        let rect = Rect {
            x: 2200.0,
            y: -40.0,
            width: 460.0,
            height: 800.0,
        };
        assert_eq!(choose_area(rect, &[primary, secondary]), Some(1));
    }

    #[test]
    fn offscreen_rect_falls_back_to_primary() {
        let primary = area(0.0, 0.0, 1920.0, 1040.0, 1.0);
        let rect = Rect {
            x: -5000.0,
            y: -5000.0,
            width: 460.0,
            height: 800.0,
        };
        assert_eq!(choose_area(rect, &[primary]), Some(0));
    }

    #[test]
    fn clamp_keeps_visible_margin() {
        let primary = area(0.0, 0.0, 1920.0, 1040.0, 1.0);
        let rect = Rect {
            x: -5000.0,
            y: -5000.0,
            width: 460.0,
            height: 800.0,
        };
        let clamped = clamp_rect(rect, &primary, 1.0);
        assert_eq!(clamped.width, 460.0);
        assert_eq!(clamped.height, 800.0);
        assert_eq!(clamped.x, -340.0);
        assert_eq!(clamped.y, -720.0);
    }

    #[test]
    fn physical_clamp_uses_monitor_scale() {
        let secondary = area(1920.0, 0.0, 2560.0, 1400.0, 1.5);
        let rect = Rect {
            x: 2200.0,
            y: 300.0,
            width: 460.0,
            height: 800.0,
        };
        let clamped = clamp_rect(rect, &secondary, secondary.scale);
        assert_eq!(clamped.width, 630.0);
        assert_eq!(clamped.height, 900.0);
    }
}
