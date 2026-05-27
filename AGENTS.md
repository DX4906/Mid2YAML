# AGENTS.md

## 项目说明

Mid2YAML 是一个静态前端加本地 Node.js helper 的工具，用于生成并本地试运行 Midscene.js YAML 工作流。

- 直接在浏览器中打开 `index.html` 使用页面，无需前端构建。
- 在 `helper/` 目录下执行 `npm start` 启动本地 helper。
- helper 默认监听 `http://127.0.0.1:4317`。
- 页面默认通过 `GET /midscene/version` 自动检测 helper 和 Midscene 状态。
- 运行产物会写入 `midscene_run/`，该目录已被 git 忽略。
- 本地运行历史会保存在 `.mid2yaml-history.json`，该文件已被 git 忽略。

## 当前实现要点

- 表单中的“脚本名称”会写入 YAML 的 `agent.testId`，并用于导出文件名和历史记录标题。
- YAML 支持多个任务；每个任务来自任务列表中的任务名称、执行步骤和可选断言。
- 执行步骤会优先推断为 `aiInput`、`aiKeyboardPress`、`aiScroll`、`aiTap`、`aiHover` 等具体 action；无法推断时，Web 回退为 `ai`，PC Desktop 回退为 `aiAct`。
- 每条执行步骤后自动追加 `sleep: 100`。
- Web bridge mode 不为 `false` 时，不生成 `viewportWidth` 和 `viewportHeight`。
- YAML 预览支持手动编辑；编辑后必须保存，复制、导出和运行才会使用保存后的 YAML。
- 运行中可以停止当前任务；前端调用 `POST /midscene/stop`，helper 按 `runId` 停止 Midscene 子进程。
- helper 的历史记录按 YAML 内容 hash 聚合；删除历史记录只修改 `.mid2yaml-history.json`，不删除报告目录或其他文件。

## 安全规则

禁止批量删除文件或目录。

不要使用：

- `del /s`
- `rd /s`
- `rmdir /s`
- `Remove-Item -Recurse`
- `rm -rf`

需要删除文件时，只能一次删除一个明确路径的文件。

正确示例：

```powershell
Remove-Item "C:\path\to\file.txt"
```

如果需要批量删除文件，应停止操作，并请求用户手动删除。

## 开发注意事项

- 优先进行小范围、目标明确的修改。
- 不要把 API Key 或其他敏感值写入浏览器持久化存储或项目文件。
- 不要提交生成的运行产物、本地历史文件或本地 helper 产生的临时数据。
- 修改前端 DOM 时，同步核对 `index.html` 中的 id 和 `app.js` 的 `els` 映射。
- 修改 helper API 时，同步更新 README 中的“本地 helper API”。
- 修改 YAML 生成逻辑时，同步更新 README 的“YAML 生成”和示例。
- 可使用 `node --check app.js` 和 `node --check helper/server.js` 快速检查 JavaScript 语法。
