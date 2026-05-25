# Mid2YAML

Mid2YAML 是一个面向 Midscene.js 的轻量 YAML 工作流生成与本地试运行工具。它通过浏览器页面收集测试任务配置，把 Web 或桌面端的自然语言执行步骤转换为 Midscene YAML，并可通过本地 helper 服务检测 Midscene CLI、注入模型环境变量、执行当前 YAML、查看执行日志和报告路径。

## 文件结构

```text
Mid2YAML/
├─ index.html                  # 主页面：脚本配置、YAML 预览、本地试运行入口
├─ app.js                      # 前端状态管理、YAML 生成、复制/导出/运行逻辑
├─ styles.css                  # 页面样式
├─ examples/
│  ├─ web-bing-search.yaml     # Web 场景示例
│  └─ desktop-open-browser.yaml# 桌面端场景示例
├─ helper/
│  ├─ package.json             # helper 服务依赖与启动脚本
│  └─ server.js                # 本地 HTTP helper，负责调用 Midscene CLI
└─ midscene_run/               # Midscene 运行后生成的日志、报告和输出目录
```

`midscene_run/` 是运行产物目录，不是手写配置目录。运行 YAML 后，Midscene 的报告、日志和 summary 会生成在这里。

## 功能设计

### 脚本配置

页面提供两个目标平台：

- `Web`：生成 `web:` 配置和 `ai` 执行步骤。
- `PC Desktop`：生成 `computer:` 配置和 `aiAct` 执行步骤。

Web 配置包含：

- 目标 URL。
- 视口宽度和高度。
- 桥接模式：`关闭`、`新建标签`、`当前标签`。
- 是否在运行时显示浏览器窗口。

当桥接模式不是 `关闭` 时，视口宽度和高度输入会置灰，生成的 YAML 也不会包含 `viewportWidth` 和 `viewportHeight`，避免 Midscene 在 bridge mode 下输出无效配置提示。

### YAML 生成

每一行“执行步骤”会生成一条 Midscene flow：

- Web 平台使用 `ai`。
- 桌面端使用 `aiAct`。

工具会在每条执行步骤后自动追加：

```yaml
- sleep: 500
```

如果填写了断言，会在最后追加：

```yaml
- aiAssert: ...
```

### YAML 二次编辑

YAML 预览区支持直接编辑。编辑后需要点击“保存编辑”，保存后的 YAML 会用于复制、导出和本地运行。

未保存编辑时：

- 页面会显示红色醒目的“YAML 有未保存编辑”。
- 复制、导出和运行按钮会暂时不可用。

如果修改左侧表单配置，YAML 会根据表单重新生成。

### 本地试运行

本地试运行依赖 `helper/server.js`。页面通过 `http://127.0.0.1:4317` 调用 helper：

- `GET /health`：检测 helper 是否在线。
- `GET /midscene/version`：检测 Midscene CLI 是否可用。
- `POST /midscene/run`：运行当前 YAML。

运行 YAML 前需要同时满足：

- 本地助手已连接。
- Midscene 版本检测成功。
- 模型环境变量填写完整。
- YAML 表单校验通过。
- YAML 编辑内容已保存。

## 安装与使用

### 1. 准备 Node.js

需要 Node.js `>= 18.19.0`。

可在终端中检查：

```powershell
node -v
npm -v
```

### 2. 安装 helper 依赖

进入 helper 目录：

```powershell
cd E:\VibeCoding_Project\Codex_Project\Mid2YAML\helper
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
file:///E:/VibeCoding_Project/Codex_Project/Mid2YAML/index.html
```

也可以直接双击 `index.html`。

### 5. 配置并生成 YAML

在“脚本与预览”页：

1. 选择目标平台。
2. 填写任务名称。
3. 填写 Web 或桌面端配置。
4. 在“执行步骤”中每行填写一个动作。
5. 按需填写断言。
6. 检查右侧 YAML 预览。
7. 可复制或导出 `.yaml` 文件。

### 6. 本地运行 YAML

在“本地试运行”页：

1. 点击“检测助手”。
2. 点击“检测 Midscene”。
3. 填写模型环境变量。
4. 点击“运行 YAML”。
5. 查看退出码、报告路径和执行日志。

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

这些值只用于本次从页面发起的运行请求。`MIDSCENE_MODEL_API_KEY` 不会保存到浏览器本地存储。

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

tasks:
  - name: 搜索天气
    flow:
      - ai: "搜索 \"今日天气\""
      - sleep: 500
      - aiAssert: 结果显示天气信息
```

当 `bridgeMode` 为 `newTabWithUrl` 或 `currentTab` 时，生成结果不会包含 `viewportWidth` 和 `viewportHeight`。

### 桌面端示例

```yaml
computer:
  displayId: ""

tasks:
  - name: 打开浏览器并搜索
    flow:
      - aiAct: 按下 Windows 键
      - sleep: 500
      - aiAct: 输入 "Chrome" 并按回车
      - sleep: 500
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

检测 Midscene CLI 是否可用。

返回示例：

```json
{
  "ok": true,
  "installed": true,
  "version": "..."
}
```

### `POST /midscene/run`

运行当前 YAML。

请求体示例：

```json
{
  "yaml": "web:\n  url: https://www.bing.com\n...",
  "options": {
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

helper 会把临时 YAML 写入系统临时目录，并以项目根目录作为 Midscene 工作目录运行，因此 `midscene_run/` 会生成在项目根目录下。

## 常见问题

### 为什么日志里有 warning，但执行成功？

Midscene CLI 可能会把一些提示写到 stderr，例如 bridge mode 下忽略 viewport 配置、模型返回 reasoning content 等。只要退出码是 `0` 且报告正常生成，通常不代表执行失败。

### 为什么 bridge mode 下没有 viewport 配置？

Midscene 在 bridge mode 下不支持部分 Puppeteer 启动参数。为了减少无效配置和日志噪音，Mid2YAML 在 `bridgeMode != false` 时不会生成 `viewportWidth` 和 `viewportHeight`。

### API Key 会被保存吗？

不会。页面会保存普通表单状态，但会在持久化前移除 `MIDSCENE_MODEL_API_KEY`。

### 为什么运行按钮是灰色？

运行按钮需要满足所有前置条件：helper 在线、Midscene 检测成功、模型环境变量完整、表单校验通过、YAML 编辑已保存。

## 开发说明

本项目是静态前端加本地 helper 的结构：

- 前端无需构建，直接打开 `index.html`。
- helper 使用 Node.js `http` 模块提供本地 API。
- 前端和 helper 通过 CORS 允许的 `127.0.0.1` HTTP 请求通信。
