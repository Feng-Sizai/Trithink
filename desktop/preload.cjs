'use strict';
const { contextBridge, ipcRenderer } = require('electron');
// Fixed operations only. No paths, general IPC or Node APIs cross this boundary.
contextBridge.exposeInMainWorld('ThreeThingsDesktop', Object.freeze({
  load: () => ipcRenderer.sendSync('three-things:data-load'),
  save: json => ipcRenderer.sendSync('three-things:data-save', json)
}));
