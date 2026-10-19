# Windows 桌面外壳 · 0.5.0

Electron 44.8.0、electron-builder 26.15.3，依赖精确锁定在package.json和package-lock.json。

从源码根目录运行npm run desktop:setup、npm run desktop:dev或npm run desktop:package。普通用户直接安装发布页的exe。

main.cjs只提供固定的three-things://app/index.html页面，保持沙箱、上下文隔离及CSP，禁用渲染器Node、外部导航和新窗口。preload仅暴露固定来源校验的完整数据load/save接口，不接受路径或任意IPC；local-backup负责校验、原子写入和有限历史。

默认资料目录为%APPDATA%/ThreeThings，升级保持应用身份、地址与数据路径。备份目录可通过目录连接迁移至自选工作文件夹。installer.nsh只配置安装目录公开程序文件的沙箱读取权限；卸载保留个人资料。

自动验收同时设置THREE_THINGS_TEST_MODE=1及--three-things-test-profile=绝对路径，使用独立资料并隐藏窗口。不得使用个人资料做破坏性测试。实际验收与模拟测试分别记录，详见根目录文档。
