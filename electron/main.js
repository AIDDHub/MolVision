const { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, session } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "webapp");
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".csv": "text/csv; charset=utf-8",
  ".sdf": "text/plain; charset=utf-8",
  ".pdb": "text/plain; charset=utf-8",
  ".cif": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' 'sha256-gRIPM36RL4twqN2JNz5WRJBX2lZ01oLjApjgXjakM+w='",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "font-src 'self' data:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
].join("; ");

let mainWindow = null;
let server = null;
let origin = null;

function stateFile() {
  return path.join(app.getPath("userData"), "window-state.json");
}

function readWindowState() {
  try {
    const data = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
    return {
      width: Number(data.width) >= 980 ? Number(data.width) : 1440,
      height: Number(data.height) >= 640 ? Number(data.height) : 900,
      x: Number.isFinite(Number(data.x)) ? Number(data.x) : undefined,
      y: Number.isFinite(Number(data.y)) ? Number(data.y) : undefined,
    };
  } catch {
    return { width: 1440, height: 900 };
  }
}

function saveWindowState(window) {
  try {
    const bounds = window.getBounds();
    fs.writeFileSync(stateFile(), JSON.stringify(bounds));
  } catch {
    /* window state is best-effort */
  }
}

function startServer() {
  return new Promise((resolve, reject) => {
    server = http.createServer(async (req, res) => {
      try {
        const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
        const relative = pathname === "/" ? "/index.html" : pathname;
        const filePath = path.normalize(path.join(ROOT, relative));
        if (!filePath.startsWith(ROOT + path.sep)) {
          res.writeHead(403).end("Forbidden");
          return;
        }
        const data = await fs.promises.readFile(filePath);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream",
          "Content-Security-Policy": CSP,
          "Cache-Control": "no-store",
          "X-Content-Type-Options": "nosniff",
        });
        res.end(data);
      } catch {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      }
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      origin = `http://127.0.0.1:${port}`;
      resolve(origin);
    });
  });
}

function lockDownNetwork(allowedOrigin) {
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    const url = details.url;
    const allowed =
      url.startsWith(`${allowedOrigin}/`) ||
      url.startsWith("devtools://") ||
      url.startsWith("data:") ||
      url.startsWith("blob:");
    callback({ cancel: !allowed });
  });
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, done) => done(false));
}

async function createWindow() {
  const url = await startServer();
  lockDownNetwork(url);

  const savedBounds = readWindowState();
  mainWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: "#070b14",
    title: "MolVision",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      spellcheck: false,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (!target.startsWith(url)) event.preventDefault();
  });

  mainWindow.on("close", () => saveWindowState(mainWindow));
  await mainWindow.loadURL(`${url}/`);
}

app.commandLine.appendSwitch("enable-unsafe-swiftshader");

ipcMain.handle("save-file", async (_event, payload) => {
  const bytes = payload?.bytes;
  const name = String(payload?.name || "molvision.bin").replace(/[\\/:*?"<>|]+/g, "_");
  const filters = Array.isArray(payload?.filters) ? payload.filters : [{ name: "All files", extensions: ["*"] }];
  if (!bytes || !bytes.length) return { ok: false, error: "empty file" };

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存文件",
    defaultPath: name,
    filters,
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };
  await fs.promises.writeFile(result.filePath, Buffer.from(bytes));
  return { ok: true, filePath: result.filePath };
});

ipcMain.handle("read-file", async (_event, filePath) => {
  try {
    const resolved = path.resolve(String(filePath || ""));
    if (!/\.(mvproj|json)$/i.test(resolved)) return { ok: false, error: "unsupported file" };
    const info = await fs.promises.stat(resolved);
    if (!info.isFile() || info.size > 200 * 1024 * 1024) return { ok: false, error: "file too large" };
    const bytes = await fs.promises.readFile(resolved);
    return { ok: true, bytes: new Uint8Array(bytes) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle("copy-png", async (_event, payload) => {
  const bytes = payload?.bytes;
  if (!bytes || !bytes.length) return { ok: false, error: "empty image" };
  try {
    const image = nativeImage.createFromBuffer(Buffer.from(bytes));
    if (typeof clipboard.writeImage === "function") {
      clipboard.writeImage(image);
    } else {
      clipboard.write({ image });
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
});

ipcMain.handle("save-png", async (_event, payload) => {
  const bytes = payload?.bytes;
  const name = String(payload?.name || "molvision.png").replace(/[\\/:*?"<>|]+/g, "_");
  if (!bytes || !bytes.length) return { ok: false, error: "empty image" };

  const result = await dialog.showSaveDialog(mainWindow, {
    title: "保存图片",
    defaultPath: name,
    filters: [{ name: "PNG 图片", extensions: ["png"] }],
  });
  if (result.canceled || !result.filePath) return { ok: false, canceled: true };

  await fs.promises.writeFile(result.filePath, Buffer.from(bytes));
  return { ok: true, filePath: result.filePath };
});

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
  app.whenReady().then(createWindow).catch((error) => {
    console.error(error);
    app.quit();
  });
}

app.on("window-all-closed", () => {
  server?.close();
  app.quit();
});
