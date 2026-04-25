const path = require("node:path");
const { app, BrowserWindow, globalShortcut, ipcMain, screen, shell } = require("electron");

let overlayWindow = null;
let clickThrough = false;

function createOverlayWindow() {
  const display = screen.getPrimaryDisplay();
  const { width, height } = display.workAreaSize;
  const overlayWidth = 420;
  const overlayHeight = Math.min(760, height - 64);

  overlayWindow = new BrowserWindow({
    width: overlayWidth,
    height: overlayHeight,
    x: width - overlayWidth - 18,
    y: 32,
    minWidth: 340,
    minHeight: 460,
    frame: false,
    transparent: true,
    resizable: true,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: false,
    hasShadow: false,
    title: "Bank AI Overlay",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  overlayWindow.setAlwaysOnTop(true, "screen-saver");
  overlayWindow.loadFile(path.join(__dirname, "../../renderer/index.html"));

  overlayWindow.on("closed", () => {
    overlayWindow = null;
  });
}

app.whenReady().then(() => {
  createOverlayWindow();

  globalShortcut.register("CommandOrControl+Shift+Space", () => {
    if (!overlayWindow) return;
    if (overlayWindow.isVisible()) overlayWindow.hide();
    else {
      overlayWindow.show();
      overlayWindow.focus();
    }
  });

  globalShortcut.register("CommandOrControl+Shift+O", () => {
    clickThrough = !clickThrough;
    overlayWindow?.setIgnoreMouseEvents(clickThrough, { forward: true });
    overlayWindow?.webContents.send("overlay:click-through", clickThrough);
  });

  globalShortcut.register("CommandOrControl+Enter", () => {
    overlayWindow?.webContents.send("overlay:assist");
  });

  globalShortcut.register("CommandOrControl+1", () => {
    overlayWindow?.webContents.send("overlay:mode", "copilot");
  });

  globalShortcut.register("CommandOrControl+2", () => {
    overlayWindow?.webContents.send("overlay:mode", "agent");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createOverlayWindow();
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

ipcMain.handle("overlay:get-config", () => ({
  apiBaseUrl: process.env.API_BASE_URL || "http://localhost:8080"
}));

ipcMain.handle("overlay:open-url", async (_event, url) => {
  await shell.openExternal(url);
});

ipcMain.on("overlay:hide", () => overlayWindow?.hide());

ipcMain.on("overlay:resize-mode", (_event, mode) => {
  if (!overlayWindow) return;
  if (mode === "compact") overlayWindow.setSize(360, 280);
  if (mode === "expanded") overlayWindow.setSize(420, 720);
});
