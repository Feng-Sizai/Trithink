# 三件事 · 桌面版源码 0.4.0

本版提供 Windows x64 程序源码与安装配置，复用原版页面与数据规则，使用绿色“三”图标。项目、速写及作息记录保存在电脑本地。账号与项目共享仅预留适配接口，默认关闭，没有新增界面或联网服务。

今日计划支持自动与手选两种模式。自动模式沿用优先级排序；手选模式独立选择最多三项任务，支持拖拽和上下键调整顺序，切换模式及备份恢复后保留各自安排。

当前 0.4.0 的安装器构建受运行环境限制，尚未成功生成 exe 安装程序；可用文件与限制见 `验证记录.md`。成功生成安装程序后的操作参阅 `安装与使用说明.md`。`三件事-试用版.html` 仍可单独打开。修改程序请从此源码目录开始；浏览器版的运行、检查和构建不需要安装 npm 依赖。

本版增加日历、历史作息补记、近三天与近七天统计及日历事件到项目的单向同步。侧栏将全部任务、速写本、今日作息收进“其他功能”浮窗，日历位于其上方。

## 目录

```text
src/
  shell.html          固定页面骨架
  styles.css          全部视觉样式与响应式规则
  core.js             数据规则、校验、排序、完成时间与速写记录
  storage.js          本地保存、恢复和备份接口
  integrations.js     本地保存与未来账号、项目共享的组合接口
  editor.js           富文本编辑器
  app/
    state.js          私有状态、模块引用与显示辅助函数
    records.js        查找记录、保存与侧栏状态
    task-views.js     任务、项目、完成记录与作息页面
    daily-plan.js     今日模式、手选操作与拖拽及键盘排序
    notebook.js       草稿、速写编辑与历史页面
    calendar.js       日历、历史作息与事件同步界面
    navigation.js     其他功能浮窗、悬停及键盘与触屏操作
    dialogs.js        页面路由、弹窗及编辑与备份操作
  app.js              事件入口、跨日处理与首次渲染
scripts/              检查、构建、校验和桌面准备命令
tests/                原有规则测试与新增构建、桌面外壳契约测试
desktop/              Electron 桌面窗口、安装器配置和图标
build.config.cjs      构建顺序、源文件和输出位置
build.cjs             保留的单文件构建入口
.editorconfig         UTF-8、LF 和两空格缩进约定
```

`src/app/` 与 `src/app.js` 在构建时按配置顺序放入同一个私有闭包，保留原来的变量作用域和执行顺序。它们是应用源码的职责分区，不是可以分别在 HTML 中独立加载的脚本。

## 常用命令

在本目录打开终端。浏览器版开发需要 Node.js 18 或更高版本。

| 命令 | 用途 |
| --- | --- |
| `npm run check` | 检查语法、运行全部测试、构建并核对安全策略哈希 |
| `npm test` | 运行全部自动化测试 |
| `npm run build` | 生成 `dist/三件事-试用版.html` |
| `npm run verify` | 校验当前构建文件与安全策略哈希 |
| `npm run desktop:prepare` | 构建并复制相同页面到桌面外壳目录 |
| `npm run desktop:setup` | 按锁文件安装桌面工具与 Electron 运行文件，需要联网 |
| `npm run desktop:dev` | 构建并打开桌面开发版 |
| `npm run desktop:package` | 生成 Windows x64 安装程序，需要先完成 setup |

原命令 `node build.cjs` 仍然有效。生成的 HTML 可以离线双击打开；不要手工修改构建产物。

## 后续修改

- 改外观：`src/styles.css`；改固定导航：`src/shell.html`。
- 改页面：`src/app/task-views.js` 或 `src/app/notebook.js`。
- 改业务规则：`src/core.js`；改持久保存：`src/storage.js`。
- 改编辑器：`src/editor.js`；改点击操作：`src/app.js`。
- 改构建或桌面入口：`build.config.cjs`、`scripts/`、`desktop/`。

数据字段、存储键、排序、继承和完成记录规则见 `开发说明.md`。预留接口见 `接口扩展说明.md`；桌面环境与命令见 `桌面打包说明.md`；实际验证范围见 `验证记录.md`。源码包不包含依赖、构建缓存或个人数据。
