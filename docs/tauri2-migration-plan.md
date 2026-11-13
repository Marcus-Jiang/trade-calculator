# Tauri 2 外壳重写规划（TradeCalc）

> 2026-11-12 更新：Electron 外壳已从项目中移除，本项目仅保留 Tauri 2 外壳。下文关于“保留 Electron 回退 / 双版本并行”的内容为历史迁移记录。

> 目标：保留现有 React 界面与业务逻辑，用 Tauri 2（Rust + WebView2）替换 Electron 外壳，
> 把便携版从约 98 MB 降到个位数 MB，同时补齐日语安装向导等分发能力。
>
> 状态：已完成（2026-11-04 实施，2026-11-12 复审修复）　编写日期：2026-11-04

---

## 1. 结论先行

| 项目 | 结论 |
|---|---|
| 可行性 | **高**。界面是标准 React + Vite，约 90% 渲染层代码可原样复用；需要重写的是 Electron 主进程约 1.5 千行 TS。 |
| 体积 | 便携版 **98 MB → 预计 5–10 MB**（不含系统 WebView2）；NSIS 安装包预计 5–12 MB（含约 1.8 MB WebView2 引导器）。 |
| 工期 | **8–12 人日**（1 名熟悉 Rust/Tauri 的开发者）；若无 Rust 经验，额外预留 3–5 天学习/踩坑。 |
| Windows | Win10 1803+ / Win11 可靠支持；**Win7 不承诺**。Tauri 文档写「Windows 7 and later」，但依赖的 WebView2 在 Win7 已停止支持。 |
| 建议 | 分阶段迁移，**保留 Electron 版本作为回退**；先做 PoC 验证托盘/热键/无边框窗口/设置路径，再决定全面切换。 |
| 主要风险 | WebView2 缺失或被企业策略禁用、全局快捷键格式差异、托盘 API 差异、旧安装包升级、Win7 用户预期。 |

**是否值得**：如果目标是「方便发给日本客户的小体积免安装包」，值得。如果只是嫌 98 MB 大但仍以国内 Win10/11 用户为主、且近期功能还会频繁变动，可以先维持 Electron，等界面稳定后再迁。

---

## 2. 现状盘点（Electron 功能 → Tauri 对应方案）

| 功能 | 现有实现 | Tauri 2 方案 | 复用度 |
|---|---|---|---|
| 无边框窗口、拖拽标题栏、最小化、关闭到托盘 | `src/main/index.ts` + CSS `-webkit-app-region` | `WebviewWindowBuilder` + `decorations(false)` + `data-tauri-drag-region` | CSS 复用，需改拖拽属性 |
| 窗口置顶 | `setAlwaysOnTop` | `window.set_always_on_top(true)` | 直接替换 |
| 窗口位置/尺寸保存、多显示器钳制 | `settings.bounds` + `initialBounds()` | Rust 监听 `WindowEvent::Moved/Resized`，防抖 400 ms 写盘；用逻辑坐标适配 DPI | 逻辑需移植 |
| 系统托盘：菜单、提示、托盘气泡 | `Tray` + `Menu.buildFromTemplate` | `TrayIconBuilder` + `MenuBuilder` / `CheckMenuItemBuilder` | 需重写，图标复用 |
| 全局快捷键（Alt+\`，可录制） | `globalShortcut` + `accel.ts` | `tauri-plugin-global-shortcut` + Electron→Tauri 转换器 | 转换器需新写 |
| 开机自启 | `app.setLoginItemSettings` | `tauri-plugin-autostart` | 直接替换 |
| 单实例 | `requestSingleInstanceLock` | `tauri-plugin-single-instance`（必须第一个注册） | 直接替换 |
| 设置读写、合并、迁移、原子写入 | `settings.ts` + `settings-schema.ts` | Rust `settings` 模块（**推荐整体移植**） | 需重写 + 移植测试 |
| 汇率三源回退、超时、缓存、自动刷新 | `rates.ts` + `rates-sources.ts`（Node fetch） | Rust `reqwest` + 同样的 JSON 缓存与源顺序 | 需重写 + 移植测试 |
| 主↔渲染 IPC、广播 | preload + `ipcMain` | Tauri `invoke` 命令 + `emit`/`listen` 事件 | 需新写桥接层 |
| 复制报价 | Electron clipboard | `tauri-plugin-clipboard-manager`（Rust 侧调用） | 直接替换 |
| 语言（中/日）、系统语言、托盘文案 | `shared/i18n.ts` + `app.getLocale()` | 前端词典复用；Rust 侧保留托盘用的小词典；系统语言用 `tauri-plugin-os` | 大部分复用 |
| 计算、税额、利润、格式化 | `renderer/src/lib/*` | **原样保留** | 100% |
| 深色模式 | `nativeTheme` + `prefers-color-scheme` | WebView2 跟随系统 + CSS | 100% |
| 安装包、快捷方式、卸载 | electron-builder NSIS | Tauri NSIS（支持中日英多语言向导） | 需重配 |

当前代码规模参考：`src/main/index.ts` 约 510 行、`settings-schema.ts` 约 190 行、`settings.ts` 约 64 行、`rates.ts` + `rates-sources.ts` 约 158 行、`preload/index.ts` 约 31 行；渲染层约 3.7 千行。

---

## 3. 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│ WebView2 (Windows 10/11 自带)                                │
│  React 19 + TS（现有界面，几乎不改）                           │
│  └─ src/renderer/src/lib/api.ts  ← 唯一外壳适配层            │
└───────────────▲──────────────────────────────┬──────────────┘
                │ invoke(command)              │ listen(event)
┌───────────────┴──────────────────────────────▼──────────────┐
│ Rust 主进程（src-tauri）                                     │
│  commands.rs    IPC 命令                                     │
│  settings/      读写、合并、迁移、原子写入                    │
│  rates/         三源抓取、缓存、定时器、广播                   │
│  window.rs      窗口生命周期、bounds、置顶、关闭到托盘          │
│  tray.rs        托盘图标、菜单、提示                           │
│  shortcut.rs    Electron accelerator → Tauri Shortcut        │
│  i18n.rs        托盘/窗口标题/错误提示（中/日）                │
│  plugins: global-shortcut / autostart / single-instance /    │
│           clipboard-manager / os                             │
└─────────────────────────────────────────────────────────────┘
```

数据文件继续使用 **`%APPDATA%\TradeCalc\settings.json`** 和 `rates-cache.json`，
与 Electron 版本完全一致，保证升级/回退都不丢配置。

---

## 4. 关键技术决策

| 决策点 | 选择 | 理由 / 备选 |
|---|---|---|
| 设置归一化归属 | **Rust 为唯一权威**，移植 `settings-schema.ts`、迁移逻辑与测试 | 与现有行为一致；`settings_patch` 能同步返回快捷键注册失败等错误。备选：TS 归一化 + Rust 只存 JSON，改动更小但两套副作用逻辑容易分叉。 |
| IPC 风格 | 命令 + 事件，不用本地 HTTP | Tauri 2 官方模型，权限最小化。 |
| 汇率抓取 | Rust `reqwest` + `native-tls`（Windows Schannel） | 复用 Windows 证书库；支持 `HTTP_PROXY`/`HTTPS_PROXY`。现有 Electron 主进程用的 Node fetch 同样不走系统代理，迁移不产生回归。 |
| 快捷键存储格式 | **保留 Electron accelerator 字符串**（如 `Control+Shift+J`） | 已有用户设置无需迁移；Rust 中做映射，配单元测试。 |
| 剪贴板 | `tauri-plugin-clipboard-manager`，在 Rust 命令里调用 | 不需要给前端开剪贴板权限。 |
| 托盘气泡 | 可选：`tauri-plugin-notification`，**仅安装版可用** | 官方说明 Windows 仅支持已安装应用，开发态/便携版会显示 PowerShell 名称。便携版回退为托盘 tooltip。 |
| 设置路径 | 显式使用 `%APPDATA%\TradeCalc`（不用 Tauri 默认的 identifier 目录） | 无缝继承 Electron 用户配置。 |
| 便携版 | 直接分发 `target/release/外贸计算器.exe`（zip） | Tauri 默认把前端资源嵌入 exe；WebView2 运行时为系统依赖。 |
| 安装向导语言 | NSIS `languages: ["SimpChinese", "Japanese", "English"]` + `displayLanguageSelector` | 解决当前安装向导只有中文的问题；以构建时 Tauri 支持的 NSIS 语言名为准。 |
| WebView2 分发 | 安装版 `embedBootstrapper`（约 +1.8 MB）；便携版要求系统已有 WebView2 | Win10 1803+/Win11 基本自带；离线环境可另发 `offlineInstaller`，但会增加约 127 MB，失去瘦身意义。 |
| 版本号 | `package.json` 与 `tauri.conf.json` 双写，加脚本/CI 校验一致 | Tauri 不会自动读 package.json。 |

---

## 5. 目录结构（迁移完成后）

```
src-tauri/
  Cargo.toml
  build.rs
  tauri.conf.json
  capabilities/default.json
  icons/                     # 由 build/icon.png 生成
  src/
    main.rs                  # 仅调用 tradecalc_lib::run()
    lib.rs                   # Builder、插件注册、setup
    commands.rs              # 所有 #[tauri::command]
    state.rs                 # AppState（设置、汇率、定时器句柄、退出标志）
    settings/
      mod.rs                 # load/get/patch/save/防抖
      schema.rs              # 移植 settings-schema.ts
      migrate.rs             # 1.2.x → 1.3.x 迁移
    rates/
      mod.rs                 # 拉取、回退、缓存、定时刷新
      sources.rs             # 三个源解析（移植 rates-sources.ts）
      cache.rs               # rates-cache.json
    window.rs                # 创建窗口、bounds、关闭到托盘、单实例聚焦
    tray.rs                  # 托盘菜单/提示
    shortcut.rs              # accelerator 解析与注册
    i18n.rs                  # Rust 侧中/日文案（仅托盘相关）
    util.rs                  # 原子写、时间、防抖
src/renderer/src/lib/api.ts  # Tauri 桥接（实现 TradeCalcApi）
vite.config.ts               # Tauri 用的纯前端构建（渲染层）
```

Electron 相关文件（`src/main`、`src/preload`、`electron.vite.config.ts`）在迁移完成前保留，用于双版本并行和回退。

---

## 6. 接口契约

`src/shared/types.ts` 中的 `TradeCalcApi` 保持不变，只换实现：

| 命令/事件 | 入参 | 返回 | 说明 |
|---|---|---|---|
| `settings_get` | — | `{ settings, meta }` | `meta = { version, isPackaged, systemLocale }` |
| `settings_patch` | `{ patch }` | `{ ok, error?, settings }` | 合并、副作用、持久化、广播 |
| `rates_get` | — | `RatesData \| null` | 读缓存 |
| `rates_refresh` | — | `{ ok, data, error? }` | 去重并发请求 |
| `window_minimize` | — | — | |
| `window_hide` | — | — | 隐藏并按需提示托盘 |
| `window_quit` | — | — | 置退出标志后 `app.exit(0)` |
| `clipboard_copy` | `{ text }` | — | |
| `shortcut_capture` | `{ active }` | — | 录制时释放全局热键 |
| 事件 `settings:changed` | — | `Settings` | 设置变更广播 |
| 事件 `rates:changed` | — | `RatesData` | 汇率更新广播 |

前端桥接示例（注意 `listen` 是异步的，要处理「注册完成前就取消订阅」）：

```ts
// src/renderer/src/lib/api.ts
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import type {
  PatchResult, RatesData, RefreshResult, Settings, SettingsPayload, TradeCalcApi
} from '@shared/types'

function subscribe<T>(event: string, cb: (payload: T) => void): () => void {
  let disposed = false
  let unlisten: (() => void) | null = null
  void listen<T>(event, (e) => cb(e.payload)).then((fn) => {
    if (disposed) fn()
    else unlisten = fn
  })
  return () => {
    disposed = true
    unlisten?.()
    unlisten = null
  }
}

export const api: TradeCalcApi = {
  getSettings: () => invoke<SettingsPayload>('settings_get'),
  patchSettings: (patch) => invoke<PatchResult>('settings_patch', { patch }),
  getRates: () => invoke<RatesData | null>('rates_get'),
  refreshRates: () => invoke<RefreshResult>('rates_refresh'),
  minimize: () => invoke('window_minimize'),
  hideToTray: () => invoke('window_hide'),
  quit: () => invoke('window_quit'),
  copyText: (text) => invoke('clipboard_copy', { text }),
  setShortcutCapture: (active) => invoke('shortcut_capture', { active }),
  onSettingsChanged: (cb) => subscribe('settings:changed', cb),
  onRatesChanged: (cb) => subscribe('rates:changed', cb)
}
```

现有 14 处 `window.api.*` 调用改为 `api.*` 即可（App.tsx、SettingsModal.tsx、ResultCard.tsx）。

---

## 7. 模块实现要点

### 7.1 窗口

- 在 Rust `setup` 中用 `WebviewWindowBuilder` 创建，读取 `settings.bounds` 并钳制到当前显示器工作区。
- **DPI**：Electron 的 `bounds` 是逻辑像素（DIP），Tauri 读写时统一使用 `LogicalPosition/LogicalSize`，显示器工作区用 `scale_factor()` 换算；在 100%/125%/150% 和多显示器下验证。
- 配置：`decorations(false)`、`resizable(true)`、`maximizable(false)`、`min_inner_size(420, 600)`、`visible(false)`、`title("外贸计算器")`。
- 防白屏：创建时隐藏，监听页面加载完成（`PageLoadEvent::Finished`）后 `show()`；再加一个 2 秒兜底，避免加载失败时窗口永不出现。
- 关闭按钮：`WindowEvent::CloseRequested` → `api.prevent_close()` + `hide()`；托盘「退出」和 `window_quit` 设置 `is_quitting = true` 后 `app.exit(0)`。
- `Moved`/`Resized` → 400 ms 防抖保存 bounds。
- 单实例回调：`show()` + `unminimize()` + `set_focus()`。
- 置顶：`set_always_on_top`；语言切换时 `set_title()`。
- 关机/注销：Tauri 没有 Electron 的 `session-end` 事件，依赖移动/缩放防抖 + `RunEvent::ExitRequested` 时立即写盘；接受最多 400 ms 的位置丢失。

### 7.2 托盘

- 用 `TrayIconBuilder`，图标复用 `resources/tray.png`（32×32，嵌入二进制）：`tauri = { features = ["tray-icon", "image-png"] }`。
- 菜单项（与现状一致）：
  - 显示/隐藏窗口
  - 窗口置顶（`CheckMenuItem`）
  - 开机自启（`CheckMenuItem`）
  - 刷新汇率
  - 快捷键：{shortcut}（禁用）
  - 退出
- 菜单在以下时机重建：窗口显示/隐藏、置顶/自启变化、语言变化、快捷键变化。
- tooltip：`外贸计算器 · 1 USD = 7.1234 CNY`（按本位币），汇率刷新和设置变更时更新。
- 左键单击切换窗口；`show_menu_on_left_click(false)`，右键弹菜单。
- 托盘气泡：安装版可选接入 `tauri-plugin-notification`；便携版/开发态不显示（官方限制），保留 `trayHintShown` 字段但不强求。

### 7.3 全局快捷键

设置中继续存 Electron 格式（`Alt+\``、`Control+Shift+J` 等），Rust 做转换：

| Electron | Tauri `keyboard-types` |
|---|---|
| `Control` / `Alt` / `Shift` / `Super` | `Modifiers::CONTROL/ALT/SHIFT/SUPER` |
| `A`–`Z` | `Code::KeyA` … `Code::KeyZ` |
| `0`–`9` | `Code::Digit0` … `Code::Digit9` |
| `F1`–`F24` | `Code::F1` … `Code::F24` |
| `` ` ``（`Backquote`） | `Code::Backquote` |
| `Space` | `Code::Space` |
| `Plus` | `Code::Equal`（录制时已带 Shift） |
| `Up/Down/Left/Right` | `Code::ArrowUp/ArrowDown/ArrowLeft/ArrowRight` |
| `PageUp/PageDown/Home/End/Insert/Delete/Backspace/Enter/Tab` | 同名 `Code` |

流程：
1. 启动时注册 `settings.shortcut`，失败只记日志（与现状一致）。
2. 录制时 `shortcut_capture(true)` → `unregister_all()`；结束后重新注册。
3. `settings_patch` 中若快捷键变化：先注销、尝试注册新的；失败则恢复旧的并返回本地化错误（`error.shortcutFormat` / `error.shortcutTaken`）。
4. 为 `accel.ts` 现有测试用例补齐 Rust 单元测试（含 `Alt+Space`、`Control+F5`、`Alt+Up`、`Control+Shift+Plus`）。

### 7.4 设置

- Rust `Settings` 结构体 `#[serde(rename_all = "camelCase")]`，字段与 `shared/types.ts` 完全一致。
- 移植 `sanitizeCurrencies`、`sanitizeBounds`、`sanitizeManualRates`、`mergeSettings`、`migrateLegacySettings`。
- 原子写入：`settings.json.tmp` + `rename`；300 ms 防抖；退出前强制落盘。
- 损坏文件：读失败回退默认值，不崩溃。
- 新增字段（`language`、`baseCurrency`）默认值保持 `auto` / `CNY`，旧文件无需迁移。
- `settings_patch` 的副作用与现状一致：置顶、自启、自动刷新间隔、快捷键、托盘菜单/tooltip、广播。广播前合并短时间内的多次修改（80 ms 防抖）。

### 7.5 汇率

- 三个源顺序不变：`open.er-api.com` → `jsDelivr currency-api` → `exchangerate-api.com`。
- `reqwest::Client`：单源 7 s、总 10 s；`Accept: application/json`、`Cache-Control: no-cache`、自定义 User-Agent。
- 解析逻辑移植 `rates-sources.ts`（字段名、日期、大小写归一化），保留「必须包含 USD 和 EUR」的校验。
- 缓存：同一 `%APPDATA%\TradeCalc\rates-cache.json`；读取时超过 24 h 标记 `stale`；全部源失败时回退缓存并返回错误。
- 并发去重：`tokio::sync::Mutex` 或状态机，避免启动刷新与手动刷新重复请求。
- 自动刷新：按 `autoRefreshHours` 启动 `tokio` 定时任务；设置变更时取消旧任务、启动新任务（0 表示关闭）。
- 抓取成功/失败都更新托盘 tooltip；成功时 `emit("rates:changed", data)`。
- 代理：支持 `HTTP_PROXY`/`HTTPS_PROXY`；Windows 系统代理（注册表）不在首版范围，作为后续增强。

### 7.6 语言

- 系统语言：`tauri-plugin-os` 的 `locale()`；`resolve_locale("auto", locale)` 规则与 TS 一致（主语言标签 `ja` → 日语，其余 → 中文）。
- UI 文案：继续用 `shared/i18n.ts`。
- Rust 侧只保留托盘/窗口标题/快捷键错误等约 15 条文案，放 `i18n.rs`，用 `LANG`/`JA` 两个 map；加测试保证键一致。
- `settings.language` 变化时：更新窗口标题、重建托盘菜单/tooltip，并触发 `settings:changed` 让前端重渲染。
- 注意：NSIS 安装向导语言与界面语言相互独立，安装语言由 `displayLanguageSelector` 选择。

### 7.7 前端适配

- 新增 `src/renderer/src/lib/api.ts`，删除 `window.api` 依赖（`env.d.ts` 里的全局声明改为 api 模块类型）。
- 标题栏改为：

```tsx
<header className="titlebar" data-tauri-drag-region>
  <div className="brand" data-tauri-drag-region>
    <span className="brand-mark">¥</span>
    <span className="brand-name">{t('app.name')}</span>
  </div>
  ...
</header>
```

- 移除 CSS 中的 `-webkit-app-region: drag/no-drag`（Tauri 用 `data-tauri-drag-region`）；按钮保持普通按钮即可。
- CSP：现有 `index.html` 的 meta CSP 增加 `ipc: http://ipc.localhost` 到 `connect-src`（Electron 下无影响）；或迁移完成后改用 `tauri.conf.json` 的 `app.security.csp` 统一管理。
- 开发构建：新增纯前端 Vite 配置（`root: src/renderer`、`base: './'`、`outDir: out/renderer`、端口 5173），Tauri `devUrl` 指向它；Electron 的 `electron-vite` 脚本在双版本期保留。

---

## 8. 打包配置

`src-tauri/tauri.conf.json` 关键片段（字段名以实际 Tauri 2 版本为准）：

```json
{
  "$schema": "https://schema.tauri.app/config/2",
  "productName": "外贸计算器",
  "version": "1.6.0",
  "identifier": "com.tradecalc.desktop",
  "build": {
    "beforeDevCommand": "npm run dev:web",
    "devUrl": "http://localhost:5173",
    "beforeBuildCommand": "npm run build:web",
    "frontendDist": "../out/renderer"
  },
  "app": {
    "withGlobalTauri": false,
    "security": {
      "csp": "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src ipc: http://ipc.localhost"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["nsis"],
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/128x128@2x.png", "icons/icon.ico"],
    "windows": {
      "webviewInstallMode": { "type": "embedBootstrapper", "silent": true },
      "nsis": {
        "languages": ["SimpChinese", "Japanese", "English"],
        "displayLanguageSelector": true,
        "installMode": "currentUser",
        "installerIcon": "icons/icon.ico"
      }
    }
  }
}
```

`Cargo.toml` 依赖建议：

```toml
[dependencies]
tauri = { version = "2", features = ["tray-icon", "image-png"] }
tauri-plugin-global-shortcut = "2"
tauri-plugin-autostart = "2"
tauri-plugin-single-instance = "2"
tauri-plugin-clipboard-manager = "2"
tauri-plugin-os = "2"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
reqwest = { version = "0.12", default-features = false, features = ["json", "native-tls", "gzip"] }
tokio = { version = "1", features = ["time", "sync"] }
thiserror = "2"
```

`capabilities/default.json` 最小权限：

```json
{
  "identifier": "default",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging"
  ]
}
```

剪贴板在 Rust 侧调用时无需给前端开放权限。

打包产物：

- 安装版：`target/x86_64-pc-windows-msvc/release/bundle/nsis/外贸计算器_1.6.0_x64-setup.exe`
- 便携版：`target/x86_64-pc-windows-msvc/release/外贸计算器.exe`（直接 zip）
- 可选 MSI（需开启 VBSCRIPT；日本/中文语言用 WiX culture），首版不做。

体积预估：exe 约 5–10 MB；NSIS 安装包约 6–12 MB（含 WebView2 引导器约 1.8 MB）。

---

## 9. 分阶段计划

> 工期按 1 名开发者估算，含自测，不含大规模用户验收。

### M0 预研 PoC（1 天）

- 安装 Rust（stable-msvc）、VS C++ Build Tools、WebView2 Runtime。
- 建 `src-tauri` 最小工程：无边框窗口加载现有 `out/renderer`。
- 验证：托盘图标 + 左键切换、`Alt+\`` 全局热键、关闭到托盘、DPR 125% 下窗口位置。
- **Go/No-Go 评审**：体积、冷启动、托盘行为是否满足预期。

### M1 前端桥接与构建解耦（1–1.5 天）

- 引入 `api.ts`，把 14 处 `window.api` 改为 `api`。
- 新增纯前端 Vite 配置与 `dev:web` / `build:web` 脚本；Electron 仍可正常构建（`api` 在 Electron 下由 preload 实现或临时适配）。
- 标题栏改 `data-tauri-drag-region`，调整 CSP。
- 验收：同一份渲染代码在 Electron 与 Tauri 下都能启动。

### M2 设置、窗口、托盘（3–4 天）

- 移植 settings schema/migrate/atomic save + 单元测试。
- `settings_get` / `settings_patch` / 事件广播。
- 窗口 bounds、关闭到托盘、置顶、单实例。
- 托盘菜单/提示/动态重建。
- 验收：改设置后重启保留；多显示器/DPI 正常；托盘菜单与 Electron 版一致。

### M3 汇率、快捷键、语言、自启（3–4 天）

- 三源抓取、缓存、stale、自动刷新、去重、事件广播、tooltip。
- accelerator 转换器 + 录制流程 + 失败回滚 + 测试。
- autostart 插件（仅 release 生效）、语言解析、窗口标题/托盘文案。
- 验收：断网回退缓存；手动/自动汇率仍正确；中/日界面与托盘一致；快捷键冲突提示。

### M4 打包与迁移（1–2 天）

- Tauri 图标生成、NSIS 中日英向导、WebView2 引导模式、版本同步脚本。
- 便携版 zip、安装/卸载测试、旧 Electron 版升级说明。
- 验收：干净 Win10/Win11 安装、日文向导、快捷方式、卸载残留检查。

### M5 QA、优化、文档（2–3 天）

- 全量回归清单、性能/体积对比、修复缺陷。
- README/发布说明、回退与双版本策略。
- 决定是否下线 Electron 构建。

**合计：10–14 天（含缓冲）**；其中 M2/M3 是主要工作量。

---

## 10. 测试与验收

### 10.1 单元测试

- **Rust（新增）**：settings 合并/迁移/边界值、accelerator 映射、汇率源解析、缓存 stale、locale 解析、bounds 钳制、i18n 键完整性。
- **TS（保留）**：calc、format、i18n、币种名称、日期格式。
- 现有 `test/rates.test.ts` 依赖 Electron mock，迁移后替换为 Rust 测试；`test/settings.test.ts` 的用例移植到 Rust。
- CI：`cargo test`、`cargo clippy -- -D warnings`、`npm run typecheck`、`npm test`。

### 10.2 手动回归清单

1. Win10 x64 / Win11 x64 / 日语系统三套环境启动。
2. 默认语言：中文系统→中文，日语系统→日语；手动切回「跟随系统」。
3. 本位币切换（CNY→JPY→USD），手动汇率换算与报价结果不变。
4. 汇率：在线刷新、断网回退缓存、手动汇率、自动刷新间隔。
5. 窗口：置顶、最小化、关闭到托盘、托盘左键、右键菜单、多显示器/125%/150% DPI。
6. 快捷键：默认 Alt+\`、录制新组合、冲突组合失败提示、录制时释放热键。
7. 单实例：重复启动聚焦已有窗口。
8. 自启：安装版开启/关闭，重启系统验证；便携版不写入。
9. 设置迁移：把 Electron 1.4.0 的 `settings.json` 放入 `%APPDATA%\TradeCalc`，所有字段与窗口位置保留。
10. 安装：NSIS 中日英文案、语言选择器、当前用户安装、卸载、桌面/开始菜单快捷方式。
11. 便携版：无 WebView2 的机器提示/文档；有 WebView2 的干净机器直接运行。
12. 复制报价、深色模式、多语言下布局不溢出。

### 10.3 验收标准

- 功能与 Electron 1.4.0 **完全对齐**（除已知的托盘气泡限制）。
- 便携版 zip ≤ 12 MB；NSIS ≤ 15 MB。
- 冷启动到可交互 ≤ Electron 版（目标 ≤ 2 s）。
- 安装/卸载无残留（设置目录按设计保留）。
- 中文/日语界面与安装向导均正常。
- 旧版 `settings.json` 100% 兼容。

---

## 11. 风险与对策

| 风险 | 影响 | 概率 | 对策 |
|---|---|---|---|
| 目标机器缺少/禁用 WebView2 | 无法启动 | 中 | 安装版用 `embedBootstrapper`；便携版在文档中说明；启动时检测并提示；企业环境可另发离线安装器 |
| Win7 用户 | 无法使用 | 高（若有此类用户） | 明确不承诺 Win7；保留 Electron 22 遗留分支或提供网页版 |
| 快捷键格式差异 | 热键失效/无法录制 | 中 | 转换器 + 全量映射测试；PoC 阶段先验证 Alt+\` |
| 托盘菜单 API 差异 | 菜单行为不一致 | 中 | M0 PoC 覆盖；菜单项用 ID 管理，动态重建 |
| DPI/多显示器坐标 | 窗口位置错乱 | 中 | 统一逻辑坐标；三档 DPI + 双屏测试 |
| 系统代理/TLS | 汇率拉取失败 | 中 | `native-tls` 使用 Windows 证书库；支持环境变量代理；必要时后续读注册表代理 |
| 旧安装包升级 | 用户装两个版本/配置冲突 | 中 | 发布说明要求先卸载 Electron 版；配置目录复用；Tauri 安装器不同 uninstall 标识 |
| 托盘气泡不可用 | 提示缺失 | 低 | 便携版回退 tooltip；安装版再接 notification 插件 |
| Rust 学习/维护成本 | 开发变慢 | 中 | 模块边界清晰；核心业务仍在 TS；CI 固定工具链 |
| 代码签名缺失 | SmartScreen 提示 | 高 | 与 Electron 版相同；可后续购买签名 |

### 已知行为差异（需在发布说明中写明）

- Win7/8.1 不支持（WebView2 已停止支持）。
- 便携版托盘气泡不再弹出（Windows 通知仅安装版可用）。
- 关机瞬间的窗口位置最多丢失 400 ms 内的最后一次移动。
- 开发模式不写开机自启（与现行为一致）。

---

## 12. 分发与升级策略

1. **双版本并行**：Tauri 版以 `1.6.0` 发布，Electron 版保留一个版本周期作为回退。
2. Tauri 安装版沿用产品名「外贸计算器」和 `%APPDATA%\TradeCalc`；卸载 Electron 版后再安装 Tauri 版。
3. 便携版以 zip 分发 `外贸计算器.exe`，附一页说明：需要 Windows 10 1803+/11 与 WebView2（系统一般自带）。
4. 版本号规则：`package.json` 与 `tauri.conf.json` 同步；加 `npm run check:versions` 在打包前校验。
5. 可选：购买代码签名证书（Azure Trusted Signing 等），减少 SmartScreen 拦截。
6. 自动更新不在首版范围；如需，后续接 `tauri-plugin-updater`（需签名密钥与更新服务器）。

---

## 13. 非目标

- Windows 7 / 8 / 8.1、32 位 Windows。
- macOS、Linux。
- 自动更新、云同步、多窗口。
- 界面视觉重做（保持现有 React UI）。

---

## 14. 参考

- Tauri 2 前置要求（含 Windows 7+ 表述、WebView2、Rust/MSVC）：<https://v2.tauri.app/start/prerequisites/>
- Windows 安装包（NSIS/MSI、WebView2 安装模式、NSIS 语言配置）：<https://v2.tauri.app/distribute/windows-installer/>
- Tauri 2 配置参考（`bundle.windows.nsis.languages`、`displayLanguageSelector`、`webviewInstallMode`）：<https://v2.tauri.app/reference/config/>
- 全局快捷键插件：<https://v2.tauri.app/plugin/global-shortcut/>
- 开机自启插件：<https://v2.tauri.app/plugin/autostart/>
- 单实例插件：<https://v2.tauri.app/plugin/single-instance/>
- 剪贴板插件：<https://v2.tauri.app/plugin/clipboard/>
- 通知插件（Windows 仅安装版）：<https://v2.tauri.app/plugin/notification/>

> 注：Tauri 2 迭代较快，实施时以锁定的 `tauri`/插件版本对应文档为准；NSIS 语言名（`SimpChinese`、`Japanese`）需在构建时用实际版本验证。

---

## 15. 实施结果（2026-11-04）

本轮已按本规划完成 Tauri 2 外壳迁移；Electron 外壳已于 2026-11-12 移除。

### 已完成

- 前端桥接层 `src/renderer/src/lib/api.ts`：Tauri invoke/listen 与 Electron `window.api` 双实现，原有 14 处调用已收敛到统一 `api`。
- Rust 后端（`src-tauri/src`）：
  - `settings`：完整移植合并、旧字段迁移、原子写入、防抖保存；配置路径保持 `%APPDATA%\TradeCalc`，与 Electron 版互通。
  - `rates`：三源回退、超时、24h stale 缓存、自动刷新、并发去重、事件广播；`reqwest` + native-tls。
  - `window`：无边框、bounds 持久化、多显示器/DPI 钳制、关闭到托盘、单实例聚焦、置顶、语言标题。
  - `tray`：菜单、勾选项、动态 tooltip、左键显示/隐藏。
  - `shortcut`：Electron accelerator → global-hotkey，覆盖反引号与符号键；录制时释放热键。
  - `i18n`：中/日托盘与错误文案；系统语言来自 `tauri-plugin-os`。
  - `commands`：settings / rates / window / clipboard / shortcut 全部 IPC。
- 打包：MSVC 目标（WebView2Loader 静态链接）、NSIS 中文/日本語/English 语言选择器、WebView2 `embedBootstrapper`、图标、版本一致性脚本；`npm run package:windows` 一键完成 MSVC 构建并整理 `dist/`，GNU 回退为 `npm run package:windows:gnu`。

### 实测结果

- 复审修复后（Electron 已移除）：Rust 测试 28 项、前端测试 62 项、`cargo clippy --all-targets -- -D warnings`、`tsc --noEmit` 全部通过。
- 体积（MSVC 单文件版）：便携 exe 4.06 MiB；便携 zip 1.79 MiB；NSIS 安装包 3.25 MiB（Electron 版为 98 MB / 108 MB，仅作历史对照）。
- 回归验证：中/日界面、本位币切换与手动汇率迁移、汇率刷新与缓存、剪贴板、窗口拖拽、置顶、关闭到托盘、单实例、Alt+` 热键、开机自启开关、旧 Electron `settings.json` / `rates-cache.json` 迁移、静默安装与卸载均已实机通过。

### 已知限制

- 主产物为 MSVC 目标：`webview2-com` 静态链接 WebView2Loader，便携版为真正的单文件。构建机没有管理员权限/MSVC Build Tools，使用用户级 LLVM 23.1.5 + cargo-xwin + xwin 下载的 MSVC CRT/SDK 完成构建；直接调用 cargo 时必须加 `--features tauri/custom-protocol`，否则会被识别为 dev 构建并尝试连接 `localhost:5173`。
- GNU 回退构建（`npm run package:windows:gnu`）仍需要把 `WebView2Loader.dll` 与 exe 放在同一目录。
- 托盘气泡提示未接入：Windows 通知插件仅对安装版可靠，便携版可能显示 PowerShell 名称；当前保留托盘 tooltip 并记录 `trayHintShown`。
- Windows 7/8.1 与 32 位系统仍不支持。
- 未做代码签名与自动更新。
