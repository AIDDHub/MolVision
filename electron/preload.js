const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("desktop", {
  isDesktop: true,
  savePng: (bytes, name) => ipcRenderer.invoke("save-png", { bytes, name }),
  saveFile: (bytes, name, filters) => ipcRenderer.invoke("save-file", { bytes, name, filters }),
  copyPng: (bytes) => ipcRenderer.invoke("copy-png", { bytes }),
  getPath: (file) => webUtils.getPathForFile(file),
  readFile: (filePath) => ipcRenderer.invoke("read-file", filePath),
});
