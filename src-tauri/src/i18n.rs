use crate::model::Settings;

/// Rust 侧只需要托盘、窗口标题和错误提示的子集，其余界面文案仍由前端词典提供。
const ZH: &[(&str, &str)] = &[
    ("app.name", "外贸计算器"),
    ("window.show", "显示窗口"),
    ("window.hide", "隐藏窗口"),
    ("settings.alwaysOnTop", "窗口置顶"),
    ("settings.autoLaunch", "开机自启"),
    ("tray.refresh", "刷新汇率"),
    ("tray.shortcut", "快捷键：{shortcut}"),
    ("tray.shortcutUnavailable", "快捷键：{shortcut}（不可用）"),
    ("tray.quit", "退出"),
    (
        "tray.hintContent",
        "已最小化到托盘，按 {shortcut} 可随时唤起。",
    ),
    ("error.shortcutFormat", "快捷键格式无效，请重新录制"),
    (
        "error.shortcutTaken",
        "该快捷键不可用，可能已被其他程序占用",
    ),
    ("rates.fetchError", "无法获取汇率"),
    ("rates.cacheProvider", "本地缓存"),
    ("rates.errorTimeout", "请求超时"),
    ("rates.errorReadTimeout", "读取超时"),
    ("rates.errorFormat", "返回数据格式异常"),
    ("rates.errorIncomplete", "返回的汇率不完整"),
    ("rates.errorTotalTimeout", "总超时"),
    ("rates.errorHttp", "HTTP {status}"),
    ("rates.errorNetwork", "网络错误：{message}"),
];

const JA: &[(&str, &str)] = &[
    ("app.name", "貿易計算機"),
    ("window.show", "ウィンドウを表示"),
    ("window.hide", "ウィンドウを隠す"),
    ("settings.alwaysOnTop", "常に手前に表示"),
    ("settings.autoLaunch", "スタートアップに登録"),
    ("tray.refresh", "レートを更新"),
    ("tray.shortcut", "ショートカット：{shortcut}"),
    (
        "tray.shortcutUnavailable",
        "ショートカット：{shortcut}（使用不可）",
    ),
    ("tray.quit", "終了"),
    (
        "tray.hintContent",
        "トレイに格納しました。{shortcut} でいつでも呼び出せます。",
    ),
    (
        "error.shortcutFormat",
        "ショートカットの形式が無効です。もう一度設定してください",
    ),
    (
        "error.shortcutTaken",
        "このショートカットは使用できません。他のアプリが使用中の可能性があります",
    ),
    ("rates.fetchError", "レートを取得できませんでした"),
    ("rates.cacheProvider", "ローカルキャッシュ"),
    ("rates.errorTimeout", "リクエストがタイムアウトしました"),
    ("rates.errorReadTimeout", "読み取りがタイムアウトしました"),
    ("rates.errorFormat", "受信データの形式が不正です"),
    ("rates.errorIncomplete", "受信した為替レートが不完全です"),
    ("rates.errorTotalTimeout", "全体がタイムアウトしました"),
    ("rates.errorHttp", "HTTP {status}"),
    ("rates.errorNetwork", "ネットワークエラー：{message}"),
];

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Locale {
    Zh,
    Ja,
}

/// 与前端 resolveLocale 完全一致的规则：显式选择优先，auto 时 ja 系统显示日语。
pub fn resolve_locale(language: &str, system_locale: Option<&str>) -> Locale {
    match language {
        "zh" => Locale::Zh,
        "ja" => Locale::Ja,
        _ => {
            let primary = system_locale
                .unwrap_or("")
                .to_lowercase()
                .split(['-', '_'])
                .next()
                .unwrap_or("")
                .to_string();
            if primary == "ja" {
                Locale::Ja
            } else {
                Locale::Zh
            }
        }
    }
}

pub fn system_locale() -> Option<String> {
    tauri_plugin_os::locale()
}

pub fn current_locale(settings: &Settings) -> Locale {
    resolve_locale(&settings.language, system_locale().as_deref())
}

pub fn t(locale: Locale, key: &str, params: &[(&str, &str)]) -> String {
    let table = match locale {
        Locale::Zh => ZH,
        Locale::Ja => JA,
    };
    let template = table
        .iter()
        .find(|(k, _)| *k == key)
        .map(|(_, v)| *v)
        .unwrap_or(key);
    let mut text = template.to_string();
    for (name, value) in params {
        text = text.replace(&format!("{{{}}}", name), value);
    }
    text
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_auto_locale_by_system_language() {
        assert_eq!(resolve_locale("auto", Some("ja-JP")), Locale::Ja);
        assert_eq!(resolve_locale("auto", Some("ja")), Locale::Ja);
        assert_eq!(resolve_locale("auto", Some("zh-CN")), Locale::Zh);
        assert_eq!(resolve_locale("auto", Some("en-US")), Locale::Zh);
        assert_eq!(resolve_locale("auto", None), Locale::Zh);
    }

    #[test]
    fn explicit_language_wins() {
        assert_eq!(resolve_locale("zh", Some("ja-JP")), Locale::Zh);
        assert_eq!(resolve_locale("ja", Some("zh-CN")), Locale::Ja);
    }

    #[test]
    fn zh_and_ja_have_the_same_keys() {
        let mut zh: Vec<&str> = ZH.iter().map(|(key, _)| *key).collect();
        let mut ja: Vec<&str> = JA.iter().map(|(key, _)| *key).collect();
        zh.sort_unstable();
        ja.sort_unstable();
        assert_eq!(zh, ja);
    }

    #[test]
    fn replaces_placeholders() {
        assert_eq!(
            t(Locale::Zh, "tray.shortcut", &[("shortcut", "Alt+`")]),
            "快捷键：Alt+`"
        );
        assert_eq!(
            t(Locale::Ja, "tray.shortcut", &[("shortcut", "Alt+`")]),
            "ショートカット：Alt+`"
        );
    }
}
