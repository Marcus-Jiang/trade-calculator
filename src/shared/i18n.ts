/** 主进程与渲染进程共享的界面文案。仅支持简体中文与日语。 */

export type Locale = 'zh' | 'ja'

/** auto 表示跟随操作系统语言 */
export type Language = 'auto' | Locale

export function isLanguage(value: unknown): value is Language {
  return value === 'auto' || value === 'zh' || value === 'ja'
}

/**
 * 把语言设置解析成实际界面语言：显式选择的语言优先，
 * auto 时日语系统显示日语，其余系统（含中文、英文）显示中文。
 */
export function resolveLocale(language: Language, systemLocale?: string | null): Locale {
  if (language !== 'auto') return language
  const primary = (systemLocale ?? '').toLowerCase().split(/[-_]/)[0]
  return primary === 'ja' ? 'ja' : 'zh'
}

const zh = {
  'app.name': '外贸计算器',
  'app.loading': '正在加载…',

  'window.pin': '窗口置顶',
  'window.unpin': '取消置顶',
  'window.pinAria': '窗口置顶',
  'window.unpinAria': '取消窗口置顶',
  'window.settings': '设置',
  'window.settingsAria': '打开设置',
  'window.minimize': '最小化',
  'window.hideToTray': '最小化到托盘',
  'window.show': '显示窗口',
  'window.hide': '隐藏窗口',

  'quote.title': '报价计算',
  'quote.hint': '含税、未税单价均可填',
  'quote.taxRate': '税率',
  'quote.taxCustom': '其它',
  'quote.taxCustomAria': '自定义税率',
  'quote.currency': '币种',
  'quote.netUnit': '未税单价',
  'quote.grossUnit': '含税单价',
  'quote.grossTotal': '含税总价',
  'quote.netUnitTitle': '不含税成本单价',
  'quote.grossUnitTitle': '含税成本单价',
  'quote.grossTotalTitle': '含税成本总价',
  'quote.primaryTitle': '主输入币种',
  'quote.currencyAria': '第 {index} 个币种',
  'quote.netCostAria': '{code} 未税成本单价',
  'quote.grossCostAria': '{code} 含税成本单价',
  'quote.quantity': '数量',
  'quote.markup': '加价',
  'quote.markupAria': '加价百分比',

  'result.title': '计算结果',
  'result.hint': '税率 {rate}% · 报价为含税价',
  'result.currencyAria': '币种',
  'result.netCost': '未税成本',
  'result.tax': '税额',
  'result.quote': '报价',
  'result.unit': '单价 {value}',
  'result.noData': '暂无数据',
  'result.copyTitle': '点击复制报价总价',
  'result.copied': '已复制报价 {code}',
  'result.footnote':
    '未税成本 = 含税成本 ÷ (1 + 税率)；报价 = 含税成本 × (1 + 加价百分比)，为含税价；点击报价可复制。单价保留更多小数，便于与总价核对。',

  'profit.title': '利润',
  'profit.expand': '展开',
  'profit.collapse': '收起',
  'profit.rebate': '退税率',
  'profit.direct': '直接利润',
  'profit.rebateProfit': '退税利润',
  'profit.total': '合计',
  'profit.footnote':
    '直接利润 = 报价 − 含税成本；退税利润 = 未税成本总价 × 退税率；合计为两者之和。',

  'rates.title': '汇率',
  'rates.expand': '展开',
  'rates.collapse': '收起',
  'rates.refresh': '刷新汇率',
  'rates.status': '{provider} · {time} 更新',
  'rates.statusCached': '{status} · 缓存',
  'rates.loading': '正在获取汇率…',
  'rates.errorHint': '汇率获取失败，可在下方手动填写',
  'rates.fetchFailed': '汇率获取失败',
  'rates.fetchError': '无法获取汇率',
  'rates.cacheProvider': '本地缓存',
  'rates.native': '本位币，汇率为 1',
  'rates.placeholder': '输入汇率',
  'rates.autoHint': '留空时使用自动汇率 {rate}',
  'rates.noAuto': '暂无自动汇率，请手动填写',
  'rates.manualAria': '{code} 手动汇率',
  'rates.sourceAria': '{code} 汇率来源',
  'rates.auto': '自动',
  'rates.manual': '手动',
  'rates.footnote': '手动汇率留空时使用自动汇率，修改后立即应用到报价与税额。',
  'rates.errorTimeout': '请求超时',
  'rates.errorReadTimeout': '读取超时',
  'rates.errorFormat': '返回数据格式异常',
  'rates.errorIncomplete': '返回的汇率不完整',
  'rates.errorTotalTimeout': '总超时',
  'rates.errorHttp': 'HTTP {status}',
  'rates.errorNetwork': '网络错误：{message}',

  'settings.title': '设置',
  'settings.close': '关闭设置',
  'settings.language': '语言',
  'settings.languageDesc': '默认为系统语言（日语系统自动显示日语）',
  'settings.languageAria': '界面语言',
  'settings.languageAuto': '跟随系统',
  'settings.theme': '主题',
  'settings.themeDesc': '跟随系统、白色或深色',
  'settings.themeAria': '主题',
  'settings.themeAuto': '跟随系统',
  'settings.themeWhite': '白色',
  'settings.themeDark': '深色',
  'settings.shortcut': '全局快捷键',
  'settings.shortcutDesc': '随时显示 / 隐藏窗口，需包含 Ctrl、Alt 或 Shift',
  'settings.shortcutDescMac': '随时显示 / 隐藏窗口，需包含 ⌘、⌥、⌃ 或 ⇧',
  'settings.recording': '请按组合键…',
  'settings.restoreDefault': '恢复默认',
  'settings.alwaysOnTop': '窗口置顶',
  'settings.alwaysOnTopDesc': '让计算器始终浮在其它窗口上方',
  'settings.autoLaunch': '开机自启',
  'settings.autoLaunchDesc': '登录 Windows 后自动在托盘运行',
  'settings.autoLaunchDev': '开发模式下不生效，打包后可用',
  'settings.autoRefresh': '自动刷新汇率',
  'settings.autoRefreshDesc': '启动时也会自动获取一次',
  'settings.autoRefreshAria': '自动刷新汇率间隔',
  'settings.off': '关闭',
  'settings.daily': '每天',
  'settings.everyHours': '每 {hours} 小时',
  'settings.decimals': '小数位数',
  'settings.decimalsDesc': '总价与换算结果的显示精度',
  'settings.decimalsAria': '小数位数',
  'settings.decimalsOption': '{decimals} 位',
  'settings.baseCurrency': '本位币',
  'settings.baseCurrencyDesc': '汇率与手动汇率的参照货币',
  'settings.baseCurrencyAria': '本位币',
  'settings.rateData': '汇率数据',
  'settings.rateCachedSuffix': '（缓存）',
  'settings.rateStatusFailed': '汇率获取失败，可在主界面「汇率」卡片中手动设置',
  'settings.rateStatusEmpty': '尚未获取汇率',
  'settings.refresh': '刷新',
  'settings.foot': 'v{version} · 设置与缓存保存在本机',
  'settings.quit': '退出应用',

  'tray.refresh': '刷新汇率',
  'tray.shortcut': '快捷键：{shortcut}',
  'tray.quit': '退出',
  'tray.hintContent': '已最小化到托盘，按 {shortcut} 可随时唤起。',
  'tray.shortcutUnavailable': '快捷键：{shortcut}（不可用）',

  'error.shortcutFormat': '快捷键格式无效，请重新录制',
  'error.shortcutTaken': '该快捷键不可用，可能已被其他程序占用',
  'error.settingsSave': '设置保存失败',
  'error.missingRate': '缺少 {from} 或 {to} 的汇率，暂不能切换主币种',
  'error.missingBaseRate': '缺少 {from} 或 {to} 的汇率，暂不能切换本位币',
  'error.loadFailed': '界面加载失败，请重试。',
  'action.retry': '重试'
} as const

export type MessageKey = keyof typeof zh
export type MessageParams = Record<string, string | number>

const ja: Record<MessageKey, string> = {
  'app.name': '貿易計算機',
  'app.loading': '読み込み中…',

  'window.pin': '常に手前に表示',
  'window.unpin': '常に手前を解除',
  'window.pinAria': 'ウィンドウを常に手前に表示',
  'window.unpinAria': 'ウィンドウを常に手前から解除',
  'window.settings': '設定',
  'window.settingsAria': '設定を開く',
  'window.minimize': '最小化',
  'window.hideToTray': 'トレイに格納',
  'window.show': 'ウィンドウを表示',
  'window.hide': 'ウィンドウを隠す',

  'quote.title': '見積計算',
  'quote.hint': '税込・税抜単価のどちらでも入力可',
  'quote.taxRate': '税率',
  'quote.taxCustom': 'その他',
  'quote.taxCustomAria': 'カスタム税率',
  'quote.currency': '通貨',
  'quote.netUnit': '税抜単価',
  'quote.grossUnit': '税込単価',
  'quote.grossTotal': '税込総額',
  'quote.netUnitTitle': '税抜コスト単価',
  'quote.grossUnitTitle': '税込コスト単価',
  'quote.grossTotalTitle': '税込コスト総額',
  'quote.primaryTitle': '入力通貨',
  'quote.currencyAria': '{index} 番目の通貨',
  'quote.netCostAria': '{code} の税抜コスト単価',
  'quote.grossCostAria': '{code} の税込コスト単価',
  'quote.quantity': '数量',
  'quote.markup': 'マークアップ',
  'quote.markupAria': 'マークアップ率',

  'result.title': '計算結果',
  'result.hint': '税率 {rate}% · 見積は税込価格',
  'result.currencyAria': '通貨',
  'result.netCost': '税抜コスト',
  'result.tax': '税額',
  'result.quote': '見積',
  'result.unit': '単価 {value}',
  'result.noData': 'データなし',
  'result.copyTitle': 'クリックで見積総額をコピー',
  'result.copied': '{code} の見積をコピーしました',
  'result.footnote':
    '税抜コスト = 税込コスト ÷ (1 + 税率)。見積 = 税込コスト × (1 + マークアップ率) で、税込価格です。見積をクリックするとコピーできます。単価は総額と照合しやすいよう、より多くの小数桁で表示しています。',

  'profit.title': '利益',
  'profit.expand': '開く',
  'profit.collapse': '閉じる',
  'profit.rebate': '還付税率',
  'profit.direct': '直接利益',
  'profit.rebateProfit': '還付利益',
  'profit.total': '合計',
  'profit.footnote':
    '直接利益 = 見積 − 税込コスト。還付利益 = 税抜コスト総額 × 還付税率。合計は両者の和です。',

  'rates.title': '為替レート',
  'rates.expand': '開く',
  'rates.collapse': '閉じる',
  'rates.refresh': 'レートを更新',
  'rates.status': '{provider} · {time} 更新',
  'rates.statusCached': '{status} · キャッシュ',
  'rates.loading': 'レートを取得中…',
  'rates.errorHint': 'レートを取得できませんでした。下で手動入力できます',
  'rates.fetchFailed': 'レートを取得できませんでした',
  'rates.fetchError': 'レートを取得できませんでした',
  'rates.cacheProvider': 'ローカルキャッシュ',
  'rates.native': '基準通貨のため、レートは 1 です',
  'rates.placeholder': 'レートを入力',
  'rates.autoHint': '空欄の場合は自動レート {rate} を使用',
  'rates.noAuto': '自動レートがありません。手動で入力してください',
  'rates.manualAria': '{code} の手動レート',
  'rates.sourceAria': '{code} のレート取得方法',
  'rates.auto': '自動',
  'rates.manual': '手動',
  'rates.footnote':
    '手動レートが空欄の場合は自動レートを使用します。変更はすぐに見積と税額へ反映されます。',
  'rates.errorTimeout': 'リクエストがタイムアウトしました',
  'rates.errorReadTimeout': '読み取りがタイムアウトしました',
  'rates.errorFormat': '受信データの形式が不正です',
  'rates.errorIncomplete': '受信した為替レートが不完全です',
  'rates.errorTotalTimeout': '全体がタイムアウトしました',
  'rates.errorHttp': 'HTTP {status}',
  'rates.errorNetwork': 'ネットワークエラー：{message}',

  'settings.title': '設定',
  'settings.close': '設定を閉じる',
  'settings.language': '言語',
  'settings.languageDesc': '初期値はシステムの言語です（日本語の OS では日本語で表示）',
  'settings.languageAria': '表示言語',
  'settings.languageAuto': 'システムに従う',
  'settings.theme': 'テーマ',
  'settings.themeDesc': 'システム・ホワイト・ダークから選択',
  'settings.themeAria': 'テーマ',
  'settings.themeAuto': 'システムに従う',
  'settings.themeWhite': 'ホワイト',
  'settings.themeDark': 'ダーク',
  'settings.shortcut': 'グローバルショートカット',
  'settings.shortcutDesc':
    'いつでもウィンドウを表示／非表示にします。Ctrl・Alt・Shift のいずれかを含めてください',
  'settings.shortcutDescMac':
    'いつでもウィンドウを表示／非表示にします。⌘・⌥・⌃・⇧ のいずれかを含めてください',
  'settings.recording': 'キーを押してください…',
  'settings.restoreDefault': '初期値に戻す',
  'settings.alwaysOnTop': '常に手前に表示',
  'settings.alwaysOnTopDesc': '計算機を常に他のウィンドウより手前に表示します',
  'settings.autoLaunch': 'スタートアップに登録',
  'settings.autoLaunchDesc': 'Windows へのログイン後にトレイで自動起動します',
  'settings.autoLaunchDev': '開発モードでは無効です。パッケージ版で利用できます',
  'settings.autoRefresh': '為替レートの自動更新',
  'settings.autoRefreshDesc': '起動時にも 1 回取得します',
  'settings.autoRefreshAria': '為替レートの自動更新間隔',
  'settings.off': 'オフ',
  'settings.daily': '毎日',
  'settings.everyHours': '{hours} 時間ごと',
  'settings.decimals': '小数点以下の桁数',
  'settings.decimalsDesc': '総額と換算結果の表示精度',
  'settings.decimalsAria': '小数点以下の桁数',
  'settings.decimalsOption': '{decimals} 桁',
  'settings.baseCurrency': '基準通貨',
  'settings.baseCurrencyDesc': '為替レートと手動レートの基準通貨',
  'settings.baseCurrencyAria': '基準通貨',
  'settings.rateData': '為替レートデータ',
  'settings.rateCachedSuffix': '（キャッシュ）',
  'settings.rateStatusFailed':
    'レートを取得できませんでした。メイン画面の「為替レート」カードで手動設定できます',
  'settings.rateStatusEmpty': 'まだレートを取得していません',
  'settings.refresh': '更新',
  'settings.foot': 'v{version} · 設定とキャッシュはこの PC に保存されます',
  'settings.quit': 'アプリを終了',

  'tray.refresh': 'レートを更新',
  'tray.shortcut': 'ショートカット：{shortcut}',
  'tray.quit': '終了',
  'tray.hintContent': 'トレイに格納しました。{shortcut} でいつでも呼び出せます。',
  'tray.shortcutUnavailable': 'ショートカット：{shortcut}（使用不可）',

  'error.shortcutFormat': 'ショートカットの形式が無効です。もう一度設定してください',
  'error.shortcutTaken':
    'このショートカットは使用できません。他のアプリが使用中の可能性があります',
  'error.settingsSave': '設定を保存できませんでした',
  'error.missingRate': '{from} または {to} のレートがないため、入力通貨を切り替えられません',
  'error.missingBaseRate': '{from} または {to} のレートがないため、基準通貨を切り替えられません',
  'error.loadFailed': '画面の読み込みに失敗しました。再試行してください',
  'action.retry': '再試行'
}

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { zh, ja }

/** 取文案并把 {name} 占位符替换为参数 */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = MESSAGES[locale]?.[key] ?? MESSAGES.zh[key]
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    params[name] === undefined ? match : String(params[name])
  )
}
