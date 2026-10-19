# Windows 桌面外壳

版本 0.4.0，Electron 44.8.0，electron-builder 26.15.3。依赖精确锁定在本目录的 package.json 和 package-lock.json。普通用户安装生成的 exe，不需要 Node.js 或开发工具。

在源码根目录执行 npm run desktop:setup、npm run desktop:dev 或 npm run desktop:package。首次准备会恢复锁定的依赖，并下载、校验 Electron 运行文件。详细环境与命令见上一级“桌面打包说明.md”。

main.cjs 通过固定地址 three-things://app/index.html 提供唯一的本地页面。窗口启用沙箱、上下文隔离和 Web 安全，关闭 Node 集成、webview、外部导航和新窗口；没有 preload、IPC、后台服务器或远程服务。原页面 CSP 保持生效。

数据保存在当前用户的 %APPDATA%\ThreeThings，与浏览器记录分开。升级须保留应用名、来源地址和数据目录。首次迁移请在浏览器版导出 JSON，再在桌面版导入。

electron-builder.cjs 管理安装向导，installer.nsh 仅为安装目录内的公开程序文件配置沙箱读取权限，不修改个人数据目录。卸载保留数据，安装后不自动启动。图标源文件和重新生成说明在 assets/。

原生自动验收可同时设置环境变量 THREE_THINGS_TEST_MODE=1 和启动参数 --three-things-test-profile=绝对路径，使用独立资料目录并隐藏窗口；日常启动不会使用该覆盖值。不要使用个人记录做自动测试。实际验收结论见上一级“验证记录.md”，模拟测试不能证明原生启动成功。
