# Mid2YAML

Mid2YAML 是一个面向 Midscene.js 的轻量 YAML 工作流生成与本地试运行工具。它通过静态浏览器页面收集 Web 或 PC Desktop 自动化配置，把自然语言步骤转换为 Midscene YAML，并通过本地 Node.js helper 检测 Midscene CLI、注入模型环境变量、运行当前 YAML、停止运行、保存历史记录并展示日志和报告路径。

## 文件结构

```text
Mid2YAML/
├─ index.html                   # 主页面：脚本配置、YAML 预览、本地试运行、历史记录
├─ app.js                       # 前端状态、YAML 生成/编辑、运行/停止、历史记录交互
├─ styles.css                   # 页面样式
├─ examples/
│  ├─ web-bing-search.yaml      # Web 场景示例
│  └─ desktop-open-browser.yaml # 桌面端场景示例
├─ helper/
│  ├─ package.json              # helper 服务依赖与启动脚本
│  └─ server.js                 # 本地 HTTP helper，负责调用 Midscene CLI
└─ midscene_run/                # Midscene 运行后生成的日志、报告和输出目录
```

`midscene_run/` 是运行产物目录，不是手写配置目录。运行 YAML 后，Midscene 的报告、日志和 summary 通常会生成在这里。

`.mid2yaml-history.json` 会在首次写入历史运行记录时由 helper 自动创建，属于本地运行数据，已加入 `.gitignore`。

## 功能设计

### 脚本配置

页面提供两个目标平台：

- `Web`：生成 `web:` 配置。
- `PC Desktop`：生成 `computer:` 配置。

Web 配置包含：

- 目标 URL。
- 视口宽度和高度。
- 桥接模式：`关闭`、`新建标签`、`当前标签`。
- 是否在运行时显示浏览器窗口。

PC Desktop 配置包含：

- 显示器 ID；留空时使用主显示器。

当桥接模式不是 `关闭` 时，视口宽度和高度输入会置灰，生成的 YAML 也不会包含 `viewportWidth` 和 `viewportHeight`，避免 Midscene 在 bridge mode 下输出无效配置提示。

### 脚本名称与任务列表

- “脚本名称”会写入 `agent.testId`，并用于导出文件名和历史记录标题。
- 每个任务会生成一个 `tasks` 项。
- 任务名称会写入对应任务的 `name`。
- 每个任务的“执行步骤”按行解析。
- 每个任务可以填写一个可选断言，生成到该任务 flow 的最后。

### YAML 生成

执行步骤会优先尝试转换为更具体的 Midscene action：

- 输入/填写类步骤：`aiInput` + `value`。
- 键盘类步骤：`aiKeyboardPress` + `keyName`。
- 滚动类步骤：`aiScroll` + `direction`。
- 点击/单击类步骤：`aiTap`。
- 悬停/移动到类步骤：`aiHover`。
- 其他步骤回退为平台默认 action：Web 使用 `ai`，PC Desktop 使用 `aiAct`。

每一行执行步骤后会自动追加：

```yaml
- sleep: 100
```

如果任务填写了断言，会在该任务 flow 最后追加：

```yaml
- aiAssert: ...
```

### YAML 二次编辑

YAML 预览区支持直接编辑。编辑后需要点击“保存编辑”，保存后的 YAML 会用于复制、导出和本地运行。

未保存编辑时：

- 页面会显示“YAML 有未保存编辑”。
- 复制、导出和运行按钮会暂时不可用。

保存编辑时，页面会做轻量 YAML 格式检查，包括空内容、tab 缩进、奇数空格缩进、未闭合引号以及明显不完整的 mapping/list 语句。它不是完整 YAML parser，只用于提前拦截常见手误。

如果修改左侧表单配置，YAML 会根据表单重新生成，并清除之前的手动编辑状态。

### 本地试运行

本地试运行依赖 `helper/server.js`。页面默认通过 `http://127.0.0.1:4317` 调用 helper。

页面会每 5 秒自动检测一次 Midscene 状态。当前实现使用 `GET /midscene/version` 同时判断 helper 是否在线和 Midscene CLI 是否可用；`GET /health` 仍作为 helper 健康检查 API 保留。

运行 YAML 前需要同时满足：

- 本地 helper 已连接。
- Midscene 版本检测成功。
- 模型环境变量填写完整。
- 表单校验通过。
- YAML 编辑内容已保存。

运行中，“运行 YAML”按钮会变成“停止运行”。点击后前端调用 `/midscene/stop`，helper 会按 `runId` 停止当前 Midscene 子进程；Windows 下使用 `taskkill /T /F` 停止进程树，其他平台先发 `SIGTERM`，必要时再发 `SIGKILL`。

### 历史运行记录

历史记录由 helper 写入项目根目录的 `.mid2yaml-history.json`。

- 历史记录按 YAML 内容 hash 聚合：同一份 YAML 再次运行时更新最后运行时间、运行次数和最近结果。
- 历史记录标题使用 `scriptName`；旧记录中的 `taskName` 会兼容迁移。
- 列表显示平台、最后运行时间、运行次数、最近退出码和报告路径。
- 选中记录后可以回看 YAML，并支持复制、导出 `.yaml`、再次运行和删除记录。
- 删除历史记录只更新 `.mid2yaml-history.json`，不会删除报告目录或其他运行产物。
- 再次运行历史 YAML 时，页面使用“本地试运行”页当前填写的模型环境变量；`MIDSCENE_MODEL_API_KEY` 不会写入历史记录。

## 安装与使用

### 1. 准备 Node.js

需要 Node.js `>= 18.19.0`。

```powershell
node -v
npm -v
```

### 2. 安装 helper 依赖

进入 helper 目录：

```powershell
cd ~\Mid2YAML\helper
npm install
```

`helper/package.json` 中包含 `@midscene/cli` 依赖。安装后可通过 helper 调用 Midscene CLI。

### 3. 启动本地 helper

在 `helper` 目录下执行：

```powershell
npm start
```

默认监听地址：

```text
http://127.0.0.1:4317
```

如需更换端口，可设置环境变量：

```powershell
$env:MID2YAML_HELPER_PORT=4318
npm start
```

注意：如果修改 helper 端口，需要同步修改 `app.js` 中的 `HELPER_BASE_URL`。

### 4. 打开页面

用浏览器打开项目根目录下的 `index.html`：

```text
file:///~/Mid2YAML/index.html
```

也可以直接双击 `index.html`。

### 5. 配置并生成 YAML

在“脚本与预览”页：

1. 选择目标平台。
2. 填写脚本名称。
3. 填写 Web 或 PC Desktop 配置。
4. 在任务列表中填写一个或多个任务名称。
5. 在每个任务的“执行步骤”中每行填写一个动作。
6. 按需为每个任务填写断言。
7. 检查右侧 YAML 预览。
8. 可复制或导出 `.yaml` 文件。

### 6. 本地运行 YAML

在“本地试运行”页：

1. 确保 helper 已启动，页面会自动检测 helper 和 Midscene 状态。
2. 填写模型环境变量。
3. 点击“运行 YAML”。
4. 运行中可点击“停止运行”。
5. 查看退出码、报告路径和执行日志。

### 7. 查看历史运行记录

在“历史运行记录”页：

- 点击“刷新”读取 helper 写入的历史记录。
- 选中记录后可以复制、导出、再次运行或删除记录。
- “再次运行”需要 helper 在线、Midscene 检测成功，并且模型环境变量填写完整。

## 环境依赖

### Node.js

helper 服务使用 Node.js 内置模块实现 HTTP API 和子进程调用。要求：

```text
Node.js >= 18.19.0
```

### Midscene CLI

项目通过 `@midscene/cli` 执行 YAML。推荐在 `helper` 目录执行：

```powershell
npm install
```

如果系统中已有全局 `midscene` 命令，helper 也会通过命令行调用它。

### 模型环境变量

运行 YAML 前，页面要求填写以下变量：

```text
MIDSCENE_MODEL_BASE_URL
MIDSCENE_MODEL_API_KEY
MIDSCENE_MODEL_NAME
MIDSCENE_MODEL_FAMILY
```

这些值只用于本次从页面发起的运行请求。`MIDSCENE_MODEL_API_KEY` 不会保存到浏览器本地存储，也不会写入历史记录。

可选项：

```text
--dotenv-override
```

勾选后，运行时允许页面注入的环境变量覆盖已有同名环境变量。

## YAML 示例

### Web 示例

```yaml
web:
  url: https://www.bing.com
  viewportWidth: 1440
  viewportHeight: 800
  bridgeMode: false

agent:
  testId: 搜索天气脚本

tasks:
  - name: 搜索天气
    flow:
      - aiInput: 搜索框
        value: 今日天气
      - sleep: 100
      - aiKeyboardPress: ""
        keyName: Enter
      - sleep: 100

  - name: 检查结果
    flow:
      - aiAssert: 结果显示天气信息
```

当 `bridgeMode` 为 `newTabWithUrl` 或 `currentTab` 时，生成结果不会包含 `viewportWidth` 和 `viewportHeight`。

### 桌面端示例

```yaml
computer:
  displayId: ""

agent:
  testId: 桌面搜索脚本

tasks:
  - name: 打开浏览器并搜索
    flow:
      - aiKeyboardPress: ""
        keyName: Meta
      - sleep: 100
      - aiAct: 输入 "Chrome" 并按回车
      - sleep: 100
      - aiKeyboardPress: ""
        keyName: Control+L
      - sleep: 100
      - aiAct: 输入 "https://www.bing.com" 并按回车
      - sleep: 100
      - aiAssert: 结果显示天气信息
```

## 本地 helper API

### `GET /health`

检测 helper 是否在线。

返回示例：

```json
{
  "ok": true,
  "name": "mid2yaml-helper"
}
```

### `GET /midscene/version`

检测 Midscene CLI 是否可用。页面也用它判断 helper 是否在线。

返回示例：

```json
{
  "ok": true,
  "installed": true,
  "version": "...",
  "source": "midscene"
}
```

### `POST /midscene/run`

运行当前 YAML。

请求体示例：

```json
{
  "yaml": "web:\n  url: https://www.bing.com\n...",
  "options": {
    "runId": "run-optional-client-id",
    "headed": false,
    "dotenvOverride": false,
    "modelEnv": {
      "MIDSCENE_MODEL_BASE_URL": "https://api.openai.com/v1",
      "MIDSCENE_MODEL_API_KEY": "sk-...",
      "MIDSCENE_MODEL_NAME": "gpt-4o",
      "MIDSCENE_MODEL_FAMILY": "gpt-4o"
    }
  }
}
```

返回中会包含 `runId`、`exitCode`、`stdout`、`stderr`、`reportPath`、`summaryPath`、`warnings` 和 `stopped` 等字段。helper 会把临时 YAML 写入系统临时目录，并以项目根目录作为 Midscene 工作目录运行，因此 `midscene_run/` 会生成在项目根目录下。

### `POST /midscene/stop`

停止正在运行的 Midscene 任务。

请求体示例：

```json
{
  "runId": "run-optional-client-id"
}
```

如果对应任务仍在运行，返回：

```json
{
  "ok": true,
  "runId": "run-optional-client-id",
  "stopped": true
}
```

### `GET /history/runs`

读取历史运行记录。

返回示例：

```json
{
  "ok": true,
  "records": []
}
```

### `POST /history/runs`

新增或更新历史运行记录。helper 会根据 YAML 内容计算 hash，同一 YAML 会更新既有记录。

```json
{
  "scriptName": "搜索天气脚本",
  "platform": "web",
  "yaml": "web:\n  url: https://www.bing.com\n...",
  "headed": false,
  "lastExitCode": 0,
  "lastReportPath": "midscene_run/report.html",
  "lastLog": "[stdout]\n..."
}
```

### `DELETE /history/runs/:id`

删除单条历史运行记录。该接口只更新 `.mid2yaml-history.json`，不会删除运行报告目录或其他文件。

## 常见问题

### 为什么日志里有 warning，但执行成功？

Midscene CLI 可能会把一些提示写到 stderr，例如 bridge mode 下忽略 viewport 配置、模型返回 reasoning content 等。只要退出码是 `0` 且报告正常生成，通常不代表执行失败。

如果日志中出现 `Mouse control may not be working`，通常表示桌面自动化的鼠标控制检测存在偏差，常见原因包括多显示器坐标、显示缩放比例、远程桌面环境或权限限制。可以优先确认目标窗口所在显示器、系统缩放和 Midscene 使用的显示器配置。

如果日志中出现 `Midscene is NOT running as Administrator`，说明当前终端或 Node.js 不是管理员权限。Windows 的 UIPI 机制会阻止非管理员进程控制管理员权限运行的应用；如果被测客户端是管理员权限启动，建议用管理员权限启动 helper 所在终端后再运行。

如果日志中出现 `empty content from AI model, using reasoning content`，表示模型返回的 `content` 为空，Midscene 已回退读取 reasoning content。只要执行结果成功，通常不需要额外处理；如果频繁失败，再检查模型名称、模型 family 和服务商返回格式。

### 为什么 bridge mode 下没有 viewport 配置？

Midscene 在 bridge mode 下不支持部分 Puppeteer 启动参数。为了减少无效配置和日志噪音，Mid2YAML 在 `bridgeMode != false` 时不会生成 `viewportWidth` 和 `viewportHeight`。

### API Key 会被保存吗？

不会。页面会保存普通表单状态，但会在持久化前移除 `MIDSCENE_MODEL_API_KEY`，也不会把它写入 `.mid2yaml-history.json`。

### 为什么运行按钮是灰色？

运行按钮需要满足所有前置条件：helper 在线、Midscene 检测成功、模型环境变量完整、表单校验通过、YAML 编辑已保存。

### 为什么历史记录里的“再次运行”按钮是灰色？

再次运行历史 YAML 使用当前“本地试运行”页的运行环境，因此也需要 helper 在线、Midscene 检测成功、模型环境变量完整，并且已选中一条历史记录。缺少条件时，历史页会在 YAML 回看区上方显示具体原因。

## 开发说明

本项目是静态前端加本地 helper 的结构：

- 前端无需构建，直接打开 `index.html`。
- helper 使用 Node.js `http` 模块提供本地 API。
- 前端和 helper 通过 CORS 允许的 `127.0.0.1` HTTP 请求通信。
- 快速语法检查可运行 `node --check app.js` 和 `node --check helper/server.js`。
