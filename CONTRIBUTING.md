# 参与 Trithink 开发

Trithink（产品中文名“三件事”）当前基线为 0.4.0。请先读 [README](README.md)、[维护说明](AGENTS.md) 和 [开发说明](开发说明.md)。

## 克隆与检查

```sh
git clone https://github.com/Feng-Sizai/Trithink.git
cd Trithink
npm run check
```

仓库为私有，需要先接受协作者邀请，并使用自己的 GitHub 身份认证。浏览器版无需 `npm install`；桌面工具通过 `npm run desktop:setup` 按 `desktop/package-lock.json` 安装。统一开发环境建议 Node.js 24；前端保留 Node.js >=18 的原有声明，桌面工具要求 >=22.12.0。

## 分支与 Pull Request

每个功能或修复使用独立分支，不把未完成修改直接推送到 `main`：

```sh
git switch main
git pull --ff-only origin main
git switch -c feat/calendar-filter
# 修改源码，补充与变更风险相称的测试和文档
npm run check
git add src tests
git commit -m "feat(calendar): add event filters"
git push -u origin feat/calendar-filter
```

在 GitHub 新建以 `main` 为目标的 PR。分支前缀使用 `feat/`、`fix/`、`docs/`、`chore/`；提交主题说明实际修改，可使用 `feat`、`fix`、`docs`、`test`、`chore`。提交前用 `git diff --cached` 检查本次内容，避免混入无关文件。

PR 应说明问题、修改后的行为、验证方式及未完成的验收；界面变更附截图，数据变更说明旧备份兼容性和迁移。建议另一位协作者审查后再合并，并删除已合并分支。CI 应通过后再合并；这些是协作约定，仓库导入本身没有启用强制分支保护。

## 修改边界

- 保持现有业务、页面、存储键和桌面应用身份；产品行为改变需要明确需求。
- 维护 `src/` 与构建配置，不直接改 `dist/` 或 `desktop/app/`。新增应用分区后维护 `build.config.cjs` 的组装顺序。
- 普通文本采用 UTF-8、LF，沿用 `.editorconfig`。不要批量重排 HTML 模板或 CSS 规则。
- 依赖仅在 `desktop/` 安装。修改桌面依赖时同时提交 `desktop/package.json` 和锁文件，解释版本变化，并重新验收桌面环境。
- 测试用合成数据；真实任务、速写、备份、账号凭据、安装包与缓存不提交 Git。个人测试文件放在已忽略的 `local-data/` 或 `backups/`。
- 原始交接档案在 `docs/archive/v0.4.0/`，用于追溯，后续更新维护当前文档，不改写旧验证记录。

## 发版检查

1. 合并已审查的改动，确保 `npm run check` 与 CI 通过。
2. 同步根 `package.json`、`desktop/package.json`、`desktop/package-lock.json` 根包的版本（包括 `packages[""]`），更新 `更新记录.md`。
3. 在 Windows 验收启动、原位升级、备份导入导出、关闭重开与卸载；没有完成的项目明确注明。自动化模拟检查不能代替原生验收。
4. 用干净工作区构建，生成 SHA-256，并记录源码提交。确认版本标签尚不存在，再为已验收提交创建 `vX.Y.Z` 标签；不移动已发布标签。
5. 发布物放 GitHub Releases；源码留在 Git，依赖/缓存不入库。源码归档、离线 HTML、免安装目录和 NSIS 安装器分别标注，不互相替代。

本次导入不改变许可范围；项目沿用 `UNLICENSED`，未经权利人授权不得对外发布为开源项目。
