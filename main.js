const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// ── Data Path ─────────────────────────────────────────────
const dataPath = path.join(app.getPath('userData'), 'pomodoro-data.json')

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    }
  } catch (_) { /* ignore corrupt data, use defaults */ }
  return {
    settings: {
      workDuration: 25,
      breakDuration: 5,
      longBreakDuration: 15,
      longBreakInterval: 4,
      soundEnabled: true,
      notificationEnabled: true,
    },
    pomodoros: [],
  }
}

function saveData(data) {
  fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')
}

// ── Tray Icon Generator ───────────────────────────────────
function createTrayImage() {
  // Use a data URL to create a simple red tomato icon
  // canvas size 32x32, filled circle
  const size = 32
  const canvas = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = size / 2 - 0.5, cy = size / 2 - 0.5
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= 13) canvas.push(255, 255, 255, 255) // white circle
      else canvas.push(0, 0, 0, 0) // transparent
    }
  }
  const img = nativeImage.createFromBuffer(Buffer.from(new Uint8Array(canvas)), { width: size, height: size })
  // Tint it red via a 16x16 template image overlay
  const tinyCanvas = []
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const cx = 7.5, cy = 7.5
      const dx = x - cx, dy = y - cy
      const dist = Math.sqrt(dx * dx + dy * dy)
      if (dist <= 6.5) {
        tinyCanvas.push(233) // R
        tinyCanvas.push(69)  // G
        tinyCanvas.push(96)  // B
        tinyCanvas.push(255) // A
      } else {
        tinyCanvas.push(0, 0, 0, 0)
      }
    }
  }
  return nativeImage.createFromBuffer(Buffer.from(new Uint8Array(tinyCanvas)), { width: 16, height: 16 })
}

// ── Main Window ───────────────────────────────────────────
let win = null
let tray = null
let trayImage = null

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    frame: false,
    transparent: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  win.loadFile('index.html')
  win.setBackgroundColor('#00000000')

  // Minimize to tray instead of closing
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
}

// ── Tray ──────────────────────────────────────────────────
function createTray() {
  trayImage = createTrayImage()
  tray = new Tray(trayImage)
  tray.setToolTip('番茄钟')

  updateTrayMenu('00:00', 'idle')

  tray.on('double-click', () => {
    if (win) win.show()
  })
}

function updateTrayMenu(timeStr, mode, status) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isBreak = mode !== 'work'

  const label = isBreak ? `🍵 休息中 ${timeStr}` : isRunning ? `🍅 专注中 ${timeStr}` : `⏸ ${timeStr}`
  const title = (!isRunning && !isPaused) ? '番茄钟' : label

  tray.setToolTip(title)
  try {
    tray.setTitle(title.length > 127 ? title.slice(0, 124) + '...' : title)
  } catch (_) { /* Windows may not support setTitle */ }

  const contextMenu = Menu.buildFromTemplate([
    { label: title, enabled: false },
    { type: 'separator' },
    {
      label: isRunning ? '⏸ 暂停' : '▶ 开始',
      click: () => { if (win) win.webContents.send('tray:control', isRunning ? 'pause' : 'start') },
    },
    {
      label: '⏹ 重置',
      click: () => { if (win) win.webContents.send('tray:control', 'reset') },
    },
    { type: 'separator' },
    {
      label: '显示窗口',
      click: () => { if (win) win.show() },
    },
    {
      label: '退出',
      click: () => { app.isQuitting = true; app.quit() },
    },
  ])
  tray.setContextMenu(contextMenu)
}

// ── IPC Handlers ──────────────────────────────────────────
function setupIPC() {
  // Settings
  ipcMain.handle('settings:get', () => loadData().settings)
  ipcMain.handle('settings:set', (_, settings) => {
    const data = loadData()
    data.settings = { ...data.settings, ...settings }
    saveData(data)
    return true
  })

  // Stats
  ipcMain.handle('stats:get', () => loadData().pomodoros)
  ipcMain.handle('stats:add', (_, entry) => {
    const data = loadData()
    const today = new Date().toISOString().slice(0, 10)
    const duration = Math.max(0, Math.floor(parseInt(entry?.duration, 10)) || 0)
    if (duration === 0) return false
    const existing = data.pomodoros.find(p => p.date === today)
    if (existing) {
      existing.count += 1
      existing.totalMinutes += duration
    } else {
      data.pomodoros.push({ date: today, count: 1, totalMinutes: duration })
    }
    saveData(data)
    return true
  })

  // Timer tick → update tray
  ipcMain.on('timer:tick', (_, timeStr, mode, status) => {
    updateTrayMenu(timeStr, mode, status)
  })

  // Timer done → notification
  ipcMain.on('timer:done', (_, mode) => {
    if (Notification.isSupported()) {
      const title = mode === 'work' ? '🍅 番茄完成！' : '☕ 休息结束！'
      const body = mode === 'work' ? '做得好！休息一下吧。' : '该继续工作了，加油！'
      const notif = new Notification({ title, body })
      notif.show()
      notif.on('click', () => { if (win) win.show() })
    }
  })

  // Window controls
  ipcMain.on('window:minimize', () => {
    if (win) win.hide()
  })
  ipcMain.on('window:close', () => {
    if (win) win.hide()
  })
}

// ── App Lifecycle ─────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  createTray()
  setupIPC()

  app.on('activate', () => {
    if (win) win.show()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep running in tray
  }
})

app.on('before-quit', () => {
  app.isQuitting = true
})
