'use strict';

const path = require('node:path');

// The app identity and data folder remain stable across later upgrades.
module.exports = {
  appId: 'local.three-things.desktop',
  productName: '三件事',
  asar: true,
  electronDist: path.join(__dirname, 'node_modules', 'electron', 'dist'),
  directories: {
    output: '../release',
    buildResources: 'assets',
  },
  files: [
    'main.cjs',
    'preload.cjs',
    'local-backup.cjs',
    'window-state.cjs',
    'app/core.cjs',
    'package.json',
    'app/index.html',
    'assets/icon.ico',
    'assets/icon.png',
  ],
  win: {
    icon: 'assets/icon.ico',
    target: [{ target: 'nsis', arch: ['x64'] }],
    artifactName: '三件事-${version}-Windows-x64-安装程序.${ext}',
    requestedExecutionLevel: 'asInvoker',
    signAndEditExecutable: true,
  },
  nsis: {
    // This is the GUID generated for 0.3.0 from the same appId. Never change it.
    guid: 'fcc0d7bb-23ed-5062-9710-cf790d150989',
    include: 'installer.nsh',
    oneClick: false,
    perMachine: false,
    allowElevation: false,
    allowToChangeInstallationDirectory: false,
    createDesktopShortcut: 'always',
    createStartMenuShortcut: true,
    shortcutName: '三件事',
    installerIcon: 'assets/icon.ico',
    uninstallerIcon: 'assets/icon.ico',
    installerLanguages: ['zh_CN', 'en_US'],
    language: '2052',
    runAfterFinish: false,
    deleteAppDataOnUninstall: false,
  },
};
