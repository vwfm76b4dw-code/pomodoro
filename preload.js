const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:set', s),

  // Stats
  getStats: () => ipcRenderer.invoke('stats:get'),
  addPomodoro: (entry) => ipcRenderer.invoke('stats:add', entry),

  // Timer (renderer → main)
  sendTick: (time, mode, status) => ipcRenderer.send('timer:tick', time, mode, status),
  sendDone: (mode) => ipcRenderer.send('timer:done', mode),

  // Tray (main → renderer)
  onTrayControl: (cb) => ipcRenderer.on('tray:control', (_, action) => cb(action)),

  // Notifications (main → renderer)
  onPlaySound: (cb) => ipcRenderer.on('play-sound', (_, mode) => cb(mode)),

  // Window
  minimize: () => ipcRenderer.send('window:minimize'),
  close: () => ipcRenderer.send('window:close'),
})
