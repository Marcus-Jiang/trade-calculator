# 外贸计算器（TradeCalc）

面向外贸报价场景的桌面计算器（Windows / macOS）：三种币种同时换算、含税成本一键生成报价、汇率与税额自动计算，支持托盘常驻与全局热键唤起。使用 **Tauri 2（Rust + WebView2 / WKWebView）** 外壳。

## 功能

- **报价计算（含税 / 未税均可填）**
  - 卡片顶部先选**税率**：13% / 9% / 6% / 3% / 0% 预设与自定义，用于含税与未税成本互相换算。
  - 三行分别展示三种币种（默认 `USD / CNY / JPY`，下拉可选 10 种主流币种）。
  - 支持 10 种币种：人民币、美元、日元、欧元、英镑、港币、澳元、加元、新加坡元、瑞士法郎，均带国旗。
  - 每行有**未税单价**和**含税单价**两栏：填其中任意一栏，该行另一栏与其余两种币种都会按税率和汇率自动带出；正在输入的行成为「主输入币种」（高亮边框）。
  - 数量 × 含税成本单价 → 每行的含税成本总价。
  - 加价百分比：填 15 表示报价 = 含税成本 × 115%。
- **计算结果（一张表看全）**
  - 三种币种分别列出：**未税成本（总价 + 单价）、税额、报价（总价 + 单价）**；含税成本总价在报价计算卡片的「含税总价」列中。
  - 报价列显示含税报价总价，下面一行显示报价单价；点击报价即可复制。未税成本列同样在总价下方显示单价。
  - 税率在报价计算卡片顶部设置，结果表随税率与成本输入实时更新。
- **利润（折叠面板）**
  - 位于计算结果下方，点击「展开」查看，展开状态会自动保存。
  - **直接利润** = 报价 − 含税成本；**退税利润** = 未税成本总价 × 退税率，退税率可手动填写（默认 13%）。
  - 三种币种分别显示直接利润、退税利润与合计。
- **汇率**
  - 本位币默认人民币，可在设置中切换为其它币种；汇率与手动汇率都以本位币显示，切换时自动把手动汇率换算到新本位币。
  - 三种币种各自独立选择自动 / 手动汇率，互不影响；手动汇率留空时回退自动汇率。
  - 启动时自动获取，运行中按设定间隔刷新（默认每 3 小时，可关闭）。
  - 三个免费汇率源依次回退，无需 API Key：`open.er-api.com` → `jsDelivr currency-api` → `exchangerate-api.com`。
  - 断网时使用本地缓存，并在界面上标记为缓存数据。
  - 面板可展开 / 收起（状态自动保存）；收起后只保留标题与刷新按钮。
  - 修改汇率立即应用到成本与报价。
- **窗口交互**
  - 无边框窗口；Windows 关闭按钮收进系统托盘，macOS 收进菜单栏 / Dock；托盘单击显示/隐藏。
  - 全局快捷键默认 `Alt+反引号`；Windows 需包含 Ctrl / Alt / Shift，macOS 可用 ⌘ / ⌥ / ⌃ / ⇧，可在设置中录入修改。
  - 标题栏图钉一键置顶；窗口位置、尺寸和所有输入自动保存。
  - 打包版支持开机自启：登录后静默启动到托盘 / 菜单栏，不弹出窗口（开发模式不写入系统启动项）。
- **界面语言**
  - 默认跟随系统语言：日语系统直接显示日语，其余系统显示简体中文。
  - 可在设置中手动切换「跟随系统 / 中文 / 日本語」，切换后立即生效（含托盘/菜单栏菜单与窗口标题）。
- **界面主题**
  - 提供「跟随系统 / 白色 / 深色」三套主题；白色主题为纯白背景与白色卡片，用细边框和阴影分层。
  - 切换立即生效并保存，原生滚动条、下拉框等控件同步切换。
- **其它**：小数位可选 2 / 3 / 4 位；设置自动保存在本机。

## 开发

环境要求：

- Node.js ≥ 20
- Rust stable（Windows：`x86_64-pc-windows-gnu` 或 `x86_64-pc-windows-msvc`；macOS：Apple Silicon / Intel 对应 target）
- Windows：Windows 10/11 + WebView2 Runtime（Win10 1803+ / Win11 通常自带）
- Windows：MSVC Build Tools（推荐）。没有管理员权限时可使用用户级 LLVM + cargo-xwin，`scripts/build-msvc.ps1` 会自动检测
- Windows：GNU 回退目标需要 MinGW-w64 的 `dlltool` / `as` / `windres`
- macOS：macOS 11+，安装 Xcode Command Line Tools（`xcode-select --install`）；WebKit 由系统提供，无需 WebView2

```bash
npm install
npm run dev         # Tauri 开发模式（Vite + Rust 热更新；等同 npm run tauri:dev）
npm run typecheck   # TypeScript 类型检查
npm test            # 前端单元测试
cargo test --manifest-path src-tauri/Cargo.toml   # Rust 单元测试
npm run build:web   # 只构建渲染层到 out/renderer
```

## 打包安装包

### Windows（MSVC，推荐）

```bash
npm run package:windows        # MSVC 构建 + 整理到 dist/（一条命令）
npm run package:windows:gnu    # 没有 MSVC 时的 GNU 回退构建
```

`scripts/build-msvc.ps1` 会优先调用已安装的 Visual Studio Build Tools；如果检测到用户级的 LLVM + cargo-xwin，也可以在没有管理员权限的机器上构建 MSVC 目标。

发布产物位于 `dist/`：

- `外贸计算器_1.6.0_x64-setup.exe`：NSIS 安装包（约 3.25 MB，当前用户安装、可选目录、中文/日本語/English 语言选择器）。
- `TradeCalc-1.6.0-Portable.zip`：免安装包（约 1.79 MB），解压后直接运行 `TradeCalc.exe`。

说明：

- MSVC 构建已把 WebView2Loader 静态链接进 exe，便携版是**真正的单文件**，不需要额外 DLL。
- 只有 GNU 回退构建才需要把 `WebView2Loader.dll` 与 exe 一起分发（`package:windows:gnu` 生成的 zip 会自动附带）。
- 安装包内置 WebView2 引导器（约 1.8 MB），目标机器缺少 WebView2 时会联网安装。
- 便携版要求系统已有 WebView2；Win10 1803+ / Win11 通常自带。
- Windows 版本仅支持 Windows 10/11 x64（Win7/8.1 与 32 位系统不支持）。
- 安装包未做代码签名，首次运行 SmartScreen 会提示「未知发布者」，选择「更多信息 → 仍要运行」即可。

### macOS

macOS 的 Tauri 应用必须在 macOS 上构建（本地 Mac，或 GitHub Actions 的 macOS runner）：

```bash
npm run package:macos             # 当前机器架构的 DMG
npm run package:macos:universal   # Apple Silicon + Intel 通用 DMG
```

通用包需要先安装两个 Rust target：

```bash
rustup target add aarch64-apple-darwin x86_64-apple-darwin
```

当前 macOS 配置使用**免费 ad-hoc 签名**（`bundle.macOS.signingIdentity = "-"`），没有 Apple Developer 签名和公证。这样 Apple Silicon 不会提示「已损坏」，但用户首次打开仍需手动放行：

- 系统设置 → 隐私与安全性 → 仍要打开；
- 或在终端执行：
  ```bash
  xattr -dr com.apple.quarantine /Applications/外贸计算器.app
  ```

准备正式分发给日本客户时，建议补上 Apple Developer ID 签名和 notarization；`.github/workflows/release.yml` 里已经预留了 `APPLE_*` secrets 的注释位置。

### GitHub Actions

`.github/workflows/release.yml` 会在以下时机构建：

- 推送 `v*` tag；
- 手动 `workflow_dispatch`。

矩阵并行构建：

- `windows-latest`：MSVC + NSIS；
- `macos-latest`：Apple Silicon 与 Intel 两个 DMG（也可以改成 universal）。

产物会作为 **draft GitHub Release** 上传：Windows 安装包、Windows 便携 zip、macOS DMG。未配置 Apple secrets 时 macOS 使用 ad-hoc 签名；配置后取消 workflow 中 `APPLE_*` 注释即可启用签名/公证。

## 从旧版本升级

- 新版改为**成本输入**：三行填写的是成本；旧版的「单价」是报价，不会被当作成本使用，请在新版成本栏填写实际采购成本。
- 成本栏拆分为**未税单价**与**含税单价**两栏，旧版本保存的成本会按含税价继续使用；也可以改填未税价，另一栏会自动换算。
- 如果你在 1.2.0 中使用过成本定价，已填写的成本、成本币种和加价比例会自动迁移。
- 币种选择、手动汇率、税率、数量、窗口位置等设置都会保留。
- 币种列表已精简为 10 种主流币种；列表外的旧币种会继续显示，改成列表内币种后即恢复。
- 本项目已移除 Electron 外壳。Windows 用户从旧 Electron 版升级时，请先退出并卸载旧版，再安装新版；设置、窗口位置与手动汇率会自动从 `%APPDATA%\TradeCalc` 读取。macOS 用户首次安装时使用全新的 `~/Library/Application Support/TradeCalc` 数据目录。
- 从旧 Tauri 版升级时，旧版如果仍在托盘/菜单栏运行，新版会直接聚焦旧窗口；请先从托盘/菜单栏菜单退出再启动新版（程序是单实例的）。

## 数据位置

Windows 的设置、窗口状态与汇率缓存保存在：

```
%APPDATA%\TradeCalc\settings.json
%APPDATA%\TradeCalc\rates-cache.json
```

macOS 保存在：

```
~/Library/Application Support/TradeCalc/settings.json
~/Library/Application Support/TradeCalc/rates-cache.json
```

删除 `settings.json` 即可恢复默认设置。

## 常见问题

- **Windows 提示「未知发布者」**：安装包未做代码签名，属于正常现象，选择「更多信息 → 仍要运行」。
- **macOS 提示「无法验证开发者」或「已损坏」**：DMG 未做 Apple 公证，但使用 ad-hoc 签名。先在「系统设置 → 隐私与安全性」点「仍要打开」；仍不行时执行 `xattr -dr com.apple.quarantine /Applications/外贸计算器.app`，或重新做 ad-hoc 签名：
  ```bash
  codesign --force --deep --sign - /Applications/外贸计算器.app
  ```
- **汇率一直是「—」**：检查网络；程序会依次尝试三个免费汇率源，失败时回退到本地缓存。也可在「汇率」卡片中切到「手动」直接填写。
- **成本和报价怎么算**：先在报价计算卡片顶部选择税率，再填成本——未税单价、含税单价填任意一栏即可，另一栏和其余币种会自动换算。报价 = 含税成本 × (1 + 加价百分比)，填 15 就是 ×115%，报价为含税价；税额与未税成本由税率拆分得到。
- **报价列为什么有两行**：上面是报价总价（含税），下面是报价单价；点击上面的数字即可复制总价。未税成本列也一样，总价下方显示未税成本单价。
- **利润怎么算**：直接利润 = 报价 − 含税成本；退税利润 = 未税成本总价 × 退税率，退税率在「利润」面板里手动填写。
- **改了一个币种的单价，其他币种跟着变**：这是预期行为。输入框所在的币种会成为主输入币种，其余币种按当前汇率换算；同一行的未税单价与含税单价按税率互相换算。
- **关掉窗口后找不到程序**：Windows 上窗口被收进系统托盘（任务栏右下角，可能需要在「^」里展开），单击托盘图标即可恢复；macOS 上窗口隐藏后可从菜单栏图标或 Dock 图标恢复。右键菜单/菜单栏菜单可退出。
- **Windows 便携版/WebView2**：便携版需要系统已安装 WebView2；若双击没有反应或提示缺少运行时，请先安装 Microsoft Edge WebView2 Runtime，或改用安装版。macOS 使用系统 WKWebView，不需要 WebView2。
- **系统版本**：Windows 7/8.1 与 32 位 Windows 不支持；Windows 支持 10/11 x64，macOS 支持 11+（Apple Silicon 与 Intel）。
- **双击没有新窗口**：程序是单实例的；如果已有实例在托盘/菜单栏，会直接显示已有窗口。先从托盘/菜单栏菜单退出，再启动新版即可。
- **快捷键无效**：设置页会显示快捷键是否注册成功；如果被其他软件占用，重新录制一个组合即可。Windows 组合需包含 Ctrl/Alt/Shift，macOS 可用 ⌘/⌥/⌃/⇧；应用在窗口显示时也会自动重试注册。

## 使用提示

- 关闭窗口 = 收进系统托盘（Windows）或隐藏到菜单栏（macOS），不会退出；退出请用托盘/菜单栏菜单或设置面板里的「退出应用」。
- 在报价区任意一行的未税单价或含税单价栏填写，即可切换主输入币种；主输入行有高亮边框。
- 在报价计算卡片顶部选择税率；调整「加价」百分比改变报价。
- 展开「利润」面板可查看直接利润与退税利润，并按需填写退税率。
- 「汇率」卡片里可以按币种单独切换自动 / 手动汇率。
- 汇率仅供报价参考，实际成交请以银行牌价为准。

## 目录结构

```
src/
  renderer/   React 界面（报价、计算结果、汇率、设置弹窗）
  shared/     前后端共享的类型定义与界面文案（中 / 日）
src-tauri/    Tauri 2 Rust 后端：窗口、托盘、快捷键、汇率、设置
  src/        settings / rates / tray / window / shortcut / i18n / commands
  icons/      应用与托盘图标
test/         前端单元测试
scripts/      构建、打包与版本检查脚本
.github/      GitHub Actions 发布 workflow
```

## 测试

- 前端：`npm test`（成本换算、税额拆分、加价、格式化、快捷键、语言文案、前后端文案键一致性）。
- Rust：`cargo test --manifest-path src-tauri/Cargo.toml`（设置合并与迁移、默认设置契约、快捷键解析、汇率源解析、日期、窗口几何）。
- 类型：`npm run typecheck`；Rust：`cargo clippy --all-targets -- -D warnings`。

## 技术栈

Tauri 2 · Rust · WebView2 / WKWebView · React 19 · TypeScript · Vite 8 · country-flag-icons

## 许可证

MIT
