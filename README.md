# Trithink · 三件事

离线个人项目管理工具，当前源码版本 **0.4.0**。支持项目与任务拆分、自动/手选今日三件事、速写本、作息记录、日历及事件到项目的单向关联。

仓库供软件更新和合作开发使用。应用内账号、云同步和多人共享仅预留接口，当前没有远程服务；仓库协作不会自动同步各人的任务数据。

## 快速开始

需要 Git 和 Node.js。统一开发环境使用 **Node.js 24**（见 `.nvmrc`）。

```sh
git clone https://github.com/Feng-Sizai/Trithink.git
cd Trithink
npm run check
npm run build
```

仓库为私有，克隆需使用有访问权限的 GitHub 账号。浏览器版没有第三方 npm 依赖，**无需先执行 npm install**。构建后双击 `dist/三件事-试用版.html` 即可离线使用。源码声明的前端最低版本为 Node.js 18；可选桌面工具要求 Node.js >=22.12.0。

## 开发命令

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 语法、全部测试、构建、CSP 哈希检查 |
| `npm test` | 运行自动测试 |
| `npm run build` | 生成离线 HTML |
| `npm run verify` | 核对已构建 HTML 的安全策略哈希 |
| `npm run desktop:prepare` | 为桌面外壳生成相同前端，不安装 Electron |
| `npm run desktop:setup` | 按桌面锁文件安装工具并准备 Electron，需要网络 |
| `npm run desktop:dev` | 准备前端并启动桌面开发版 |
| `npm run desktop:package` | 生成 Windows x64 安装程序，需先 setup |

## 项目结构

| 位置 | 用途 |
| --- | --- |
| `src/core.js`、`src/calendar-core.js` | 数据规则、优先级、日期与关联逻辑 |
| `src/storage.js`、`src/integrations.js` | 本地保存、备份和未来扩展接口 |
| `src/editor.js` | 富文本编辑与清理 |
| `src/app/`、`src/app.js` | 页面分区、状态与事件入口 |
| `src/shell.html`、`src/*.css` | 固定页面骨架与视觉样式 |
| `build.config.cjs`、`scripts/` | 组装顺序、构建、检查和桌面命令 |
| `tests/` | 数据、构建、桌面边界与升级契约测试 |
| `desktop/` | Electron 外壳、Windows 安装配置、图标和依赖锁 |
| `.github/` | CI、问题模板、PR 模板 |
| `docs/archive/v0.4.0/` | 原始需求、设计与交接清单，作为历史档案 |

修改源码后重新构建；生成的 `dist/`、`desktop/app/`、`outputs/`、安装包、依赖和本机数据均不入库。前端应用分区在构建时共享私有闭包，增加分区需同步 `build.config.cjs`，不能拆成独立 script 随意加载。

## 协作方式

从 `main` 创建 `feat/...`、`fix/...` 或 `docs/...` 分支，通过 Pull Request 提交修改。提交前运行 `npm run check`；建议另一位协作者审查，并在 CI 通过后合并。操作步骤见 [CONTRIBUTING.md](CONTRIBUTING.md)。当前未启用强制分支保护。

CI 已配置在 `main` 推送、PR 及手动触发时，分别在 Linux / Windows、Node.js 22 / 24 上执行 `npm run check`。它不下载 Electron、不制作或发布安装器；具体执行结果以 GitHub Actions 为准。

## 验证与已知限制

本次仓库导入在 Linux、Node.js 24.19.0 上通过 **32 个文件语法检查、61 项测试，以及构建和 CSP 哈希校验**。源码导入没有修改应用行为、界面、存储键或桌面升级身份。详见 [仓库导入记录](docs/仓库导入记录.md)。

共享包历史记录显示：0.4.0 的 Windows 程序目录曾打包成功，独立 NSIS `.exe` 安装器未成功生成；原生启动与升级后的实机验收仍未完成。这些历史结论与本次导入检查分开记录；本次未运行 Electron，也没有生成或签名 Windows 安装器。

## 文档入口

- 使用：[使用说明](使用说明.md)、[安装与使用说明](安装与使用说明.md)
- 开发：[AGENTS.md](AGENTS.md)、[开发说明](开发说明.md)、[接口扩展说明](接口扩展说明.md)
- 桌面：[桌面打包说明](桌面打包说明.md)、[desktop/README.md](desktop/README.md)
- 版本：[更新记录](更新记录.md)、[历史验证记录](验证记录.md)
- 需求与设计：[项目上下文](docs/archive/v0.4.0/三件事-项目上下文-0.4.0.md)、[设计演进](docs/archive/v0.4.0/三件事-设计演进记录-0.4.0.md)

个人记录保存在本机，导出备份未加密，请自行保管，不要提交 Git。仓库沿用原 `UNLICENSED` 声明；本次没有新增开源授权。
