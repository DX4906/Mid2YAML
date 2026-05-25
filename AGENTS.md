# AGENTS.md

## 项目说明

Mid2YAML 是一个静态前端加本地 Node.js helper 的工具，用于生成并本地试运行 Midscene.js YAML 工作流。

- 直接在浏览器中打开 `index.html` 使用页面。
- 在 `helper/` 目录下执行 `npm start` 启动本地 helper。
- helper 默认监听 `http://127.0.0.1:4317`。
- 运行产物会写入 `midscene_run/`，该目录已被 git 忽略。
- 本地运行历史会保存在 `.mid2yaml-history.json`，该文件已被 git 忽略。

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
- 不要提交生成的运行产物或本地历史文件。
- 可使用 `node --check app.js` 和 `node --check helper/server.js` 快速检查 JavaScript 语法。
