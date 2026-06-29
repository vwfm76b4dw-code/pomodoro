const { contextBridge, ipcRenderer } = require('electron')

// Exposes a safe API to the renderer process via contextBridge.
// No direct access to Node/Electron APIs in the renderer.
contextBridge.exposeInMainWorld('api', {
  // ── Settings ───────────────────────────────────────────────
  // Persisted to userData/pomodoro-data.json via main process.
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:set', s),

  // ── Stats ─────────────────────────────────────────────────
  getStats: () => ipcRenderer.invoke('stats:get'),
  addPomodoro: (entry) => ipcRenderer.invoke('stats:add', entry),

  // ── Timer (renderer → main) ───────────────────────────────
  // sendTick updates the tray tooltip with current time + mode.
  sendTick: (time, mode, status) => ipcRenderer.send('timer:tick', time, mode, status),
  // sendDone triggers a system notification when a session finishes.
  sendDone: (mode) => ipcRenderer.send('timer:done', mode),

  // ── Tray (main → renderer) ────────────────────────────────
  // Forwarded when user clicks tray context menu items.
  onTrayControl: (cb) => ipcRenderer.on('tray:control', (_, action) => cb(action)),

  // ── Notifications (main → renderer) ───────────────────────
  // Played via Web Audio API in renderer, only when soundEnabled.
  onPlaySound: (cb) => ipcRenderer.on('play-sound', (_, mode) => cb(mode)),

  // ── Window ────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
})
