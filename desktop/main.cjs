/* Desktop host: fixed local page, isolated renderer, persistent local profile. */
"use strict";

const {
  app,
  BrowserWindow,
  Menu,
  protocol,
  session,
  ipcMain
} = require("electron");
const fs = require("node:fs");
const path = require("node:path");
const APP_URL = "three-things://app/index.html";
const APP_FILE = path.join(__dirname, "app", "index.html");
let mainWindow = null;
let backupStore = null;

// Keep the profile stable across frontend versions and separate from browsers.
app.setName("ThreeThings");
app.setAppUserModelId("local.three-things.desktop");
const profileArgument = process.argv.find(argument => argument.startsWith("--three-things-test-profile="));
const testProfile = process.env.THREE_THINGS_TEST_MODE === "1" && profileArgument
  ? profileArgument.slice("--three-things-test-profile=".length)
  : null;
if (testProfile && !path.isAbsolute(testProfile)) {
  throw new Error("测试资料目录必须使用绝对路径。");
}
const userData = testProfile || path.join(app.getPath("appData"), "ThreeThings");
fs.mkdirSync(userData, {
  recursive: true
});
app.setPath("userData", userData);
app.setPath("sessionData", userData);

// Standard storage and a secure origin are the only granted scheme privileges.
protocol.registerSchemesAsPrivileged([{
  scheme: "three-things",
  privileges: {
    standard: true,
    secure: true
  }
}]);
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 480,
    minHeight: 600,
    title: "三件事",
    icon: path.join(__dirname, "assets", "icon.ico"),
    show: !testProfile,
    backgroundColor: "#f8f9f6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      webviewTag: false,
      spellcheck: false
    }
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({
    action: "deny"
  }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== APP_URL) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event, url) => {
    if (url !== APP_URL) event.preventDefault();
  });
  mainWindow.webContents.on("will-attach-webview", event => {
    event.preventDefault();
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  // Blob-backed <a download> exports and file inputs use Chromium's normal flow.
  // The preload exposes only validated local data load/save, never filesystem access.
  return mainWindow.loadURL(APP_URL);
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
  app.on("window-all-closed", () => app.quit());
  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    backupStore = require('./local-backup.cjs').createBackupStore({
      directory: path.join(userData, 'auto-backups'),
      Core: require('./app/core.cjs')
    });
    function trusted(event) {
      return mainWindow && event.sender === mainWindow.webContents && event.senderFrame === mainWindow.webContents.mainFrame && event.senderFrame.url === APP_URL;
    }
    ipcMain.on('three-things:data-load', event => {
      event.returnValue = trusted(event) ? backupStore.load() : { ok: false, error: '无效的数据读取来源' };
    });
    ipcMain.on('three-things:data-save', (event, json) => {
      event.returnValue = trusted(event) ? backupStore.save(json) : { ok: false, persistent: false, error: '无效的数据保存来源' };
    });
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    protocol.handle("three-things", async request => {
      if (request.method !== "GET" || request.url !== APP_URL) {
        return new Response("Not found", {
          status: 404
        });
      }
      try {
        // Never resolve a filesystem path from the request or its URL.
        const html = await fs.promises.readFile(APP_FILE);
        return new Response(html, {
          headers: {
            "content-type": "text/html; charset=utf-8",
            "cache-control": "no-store"
          }
        });
      } catch (_) {
        return new Response("缺少程序页面，请先构建桌面版文件。", {
          status: 503,
          headers: {
            "content-type": "text/plain; charset=utf-8"
          }
        });
      }
    });
    return createWindow();
  }).catch(error => {
    console.error("无法启动三件事桌面外壳：", error);
    app.quit();
  });
}
