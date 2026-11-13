use std::str::FromStr;
use std::sync::atomic::Ordering;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

use crate::state::AppState;

#[derive(Clone, Copy, Debug)]
pub enum ShortcutError {
    Format,
    Taken,
}

impl ShortcutError {
    pub fn key(self) -> &'static str {
        match self {
            ShortcutError::Format => "error.shortcutFormat",
            ShortcutError::Taken => "error.shortcutTaken",
        }
    }
}

/// 把 Electron accelerator（如 `Control+Shift+J`）转成 global-hotkey 的 `Shortcut`。
/// 设置文件继续保存 Electron 格式，老用户无需迁移。
pub fn parse_accelerator(accelerator: &str) -> Option<Shortcut> {
    let mut modifiers = String::new();
    let mut key: Option<String> = None;

    for part in accelerator.split('+') {
        let part = part.trim();
        if part.is_empty() {
            return None;
        }
        let lower = part.to_ascii_lowercase();
        let modifier = match lower.as_str() {
            "control" | "ctrl" => Some("control"),
            "alt" | "option" => Some("alt"),
            "shift" => Some("shift"),
            "super" | "meta" | "win" | "command" | "cmd" => Some("super"),
            _ => None,
        };
        if let Some(modifier) = modifier {
            if !modifiers.is_empty() {
                modifiers.push('+');
            }
            modifiers.push_str(modifier);
            continue;
        }
        if key.is_some() {
            return None;
        }
        key = Some(map_key(part)?);
    }

    let key = key?;
    if modifiers.is_empty() {
        Shortcut::from_str(&key).ok()
    } else {
        Shortcut::from_str(&format!("{modifiers}+{key}")).ok()
    }
}

fn map_key(name: &str) -> Option<String> {
    let upper = name.to_ascii_uppercase();
    if upper.chars().count() == 1 {
        let character = upper.chars().next()?;
        if character.is_ascii_uppercase() {
            return Some(format!("Key{character}"));
        }
        if character.is_ascii_digit() {
            return Some(format!("Digit{character}"));
        }
    }
    if let Some(number) = upper.strip_prefix('F') {
        if let Ok(value) = number.parse::<u8>() {
            if (1..=24).contains(&value) {
                return Some(format!("F{value}"));
            }
        }
    }
    let code = match name {
        "`" | "Backquote" | "~" => "Backquote",
        "-" | "Minus" | "_" => "Minus",
        "=" | "Equal" | "Plus" => "Equal",
        "[" | "BracketLeft" | "{" => "BracketLeft",
        "]" | "BracketRight" | "}" => "BracketRight",
        "\\" | "Backslash" | "|" => "Backslash",
        ";" | "Semicolon" | ":" => "Semicolon",
        "'" | "Quote" | "\"" => "Quote",
        "," | "Comma" | "<" => "Comma",
        "." | "Period" | ">" => "Period",
        "/" | "Slash" | "?" => "Slash",
        "!" => "Digit1",
        "@" => "Digit2",
        "#" => "Digit3",
        "$" => "Digit4",
        "%" => "Digit5",
        "^" => "Digit6",
        "&" => "Digit7",
        "*" => "Digit8",
        "(" => "Digit9",
        ")" => "Digit0",
        "Space" => "Space",
        "Up" => "ArrowUp",
        "Down" => "ArrowDown",
        "Left" => "ArrowLeft",
        "Right" => "ArrowRight",
        "PageUp" | "PageDown" | "Home" | "End" | "Insert" | "Delete" | "Backspace" | "Enter"
        | "Tab" => name,
        _ => return None,
    };
    Some(code.to_string())
}

pub fn register(app: &AppHandle, accelerator: &str) -> Result<(), ShortcutError> {
    let result = (|| {
        let shortcut = parse_accelerator(accelerator).ok_or(ShortcutError::Format)?;
        let global = app.global_shortcut();
        let _ = global.unregister_all();
        global
            .on_shortcut(shortcut, |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    crate::window::toggle(app);
                }
            })
            .map_err(|_| ShortcutError::Taken)
    })();
    app.state::<AppState>()
        .shortcut_registered
        .store(result.is_ok(), Ordering::SeqCst);
    result
}

pub fn unregister_all(app: &AppHandle) {
    let _ = app.global_shortcut().unregister_all();
    app.state::<AppState>()
        .shortcut_registered
        .store(false, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_default_shortcut() {
        assert!(parse_accelerator("Alt+`").is_some());
    }

    #[test]
    fn parses_common_accelerators() {
        for accelerator in [
            "Control+Shift+J",
            "Alt+1",
            "Control+F5",
            "Alt+Up",
            "Alt+Space",
            "Control+Shift+Plus",
            "Control+Alt+Home",
            "Control+;",
            "Control+Shift+:",
            "Alt+-",
            "Control+[",
            "Control+=",
            "Control+Shift+=",
        ] {
            assert!(
                parse_accelerator(accelerator).is_some(),
                "failed to parse {accelerator}"
            );
        }
    }

    #[test]
    fn rejects_invalid_accelerators() {
        assert!(parse_accelerator("").is_none());
        assert!(parse_accelerator("Control").is_none());
        assert!(parse_accelerator("Control++").is_none());
        assert!(parse_accelerator("Foo+Bar").is_none());
        assert!(parse_accelerator("Control+J+K").is_none());
    }
}
