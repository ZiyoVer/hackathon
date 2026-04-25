const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("bankOverlay", {
  getConfig: () => ipcRenderer.invoke("overlay:get-config"),
  hide: () => ipcRenderer.send("overlay:hide"),
  resizeMode: (mode) => ipcRenderer.send("overlay:resize-mode", mode),
  openUrl: (url) => ipcRenderer.invoke("overlay:open-url", url),
  onAssist: (callback) => {
    ipcRenderer.on("overlay:assist", callback);
  },
  onClickThrough: (callback) => {
    ipcRenderer.on("overlay:click-through", (_event, enabled) => callback(Boolean(enabled)));
  },
  onMode: (callback) => {
    ipcRenderer.on("overlay:mode", (_event, mode) => callback(mode));
  }
});
