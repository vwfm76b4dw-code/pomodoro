const { app, BrowserWindow, Tray, Menu, nativeImage, Notification, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

// ── Data Path ─────────────────────────────────────────────
// JSON file in Electron's userData directory (OS-specific).
const dataPath = path.join(app.getPath('userData'), 'pomodoro-data.json')

function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      return JSON.parse(fs.readFileSync(dataPath, 'utf-8'))
    }
  } catch (_) { /* corrupt JSON → fall through to defaults */ }
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

// ── Tray Icon ─────────────────────────────────────────────
// 16×16 red circle drawn pixel-by-pixel into nativeImage.
// No external icon file needed.
function createTrayImage() {
  const size = 16
  const canvas = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cx = 7.5, cy = 7.5
      const dx = x - cx, dy = y - cy
      if (Math.sqrt(dx * dx + dy * dy) <= 6.5) {
        canvas.push(217, 122, 96, 255) // R,G,B,A — accent color
      } else {
        canvas.push(0, 0, 0, 0)
      }
    }
  }
  return nativeImage.createFromBuffer(Buffer.from(new Uint8Array(canvas)), { width: size, height: size })
}

// ── Main Window ───────────────────────────────────────────
let win = null
let tray = null

function createWindow() {
  win = new BrowserWindow({
    width: 420,
    height: 620,
    resizable: false,
    frame: false,           // Custom titlebar; body must handle drag
    transparent: true,      // Allows body CSS gradient + rounded corners
    alwaysOnTop: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,   // Security: renderer has no Node access
      nodeIntegration: false,
    },
  })

  win.loadFile('index.html')
  win.setBackgroundColor('#00000000')

  // Close → hide to tray. App quits only via tray menu "退出".
  win.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault()
      win.hide()
    }
  })
}

// ── Tray ──────────────────────────────────────────────────
function createTray() {
  tray = new Tray(createTrayImage())
  tray.setToolTip('Pomodoro')
  updateTrayMenu('00:00', 'work', 'idle')

  tray.on('double-click', () => {
    if (win) win.show()
  })
}

// Updates tray tooltip + context menu to reflect timer state.
function updateTrayMenu(timeStr, mode, status) {
  const isRunning = status === 'running'
  const isPaused = status === 'paused'
  const isBreak = mode !== 'work'

  const label = isBreak ? `🍵 Break ${timeStr}` : isRunning ? `🍅 Focus ${timeStr}` : `⏸ ${timeStr}`
  const title = (!isRunning && !isPaused) ? 'Pomodoro' : label

  tray.setToolTip(title)
  try {
    tray.setTitle(title.length > 127 ? title.slice(0, 124) + '...' : title)
  } catch (_) { /* Windows may not support setTitle */ }

  const contextMenu = Menu.buildFromTemplate([
    { label: title, enabled: false },
    { type: 'separator' },
    {
      label: isRunning ? '⏸ Pause' : '▶ Start',
      click: () => { if (win) win.webContents.send('tray:control', isRunning ? 'pause' : 'start') },
    },
    {
      label: '⏹ Reset',
      click: () => { if (win) win.webContents.send('tray:control', 'reset') },
    },
    { type: 'separator' },
    {
      label: 'Show Window',
      click: () => { if (win) win.show() },
    },
    {
      label: 'Quit',
      click: () => { app.isQuitting = true; app.quit() },
    },
  ])
  tray.setContextMenu(contextMenu)
}

// ── IPC Handlers ──────────────────────────────────────────
function setupIPC() {
  // Settings: read/write JSON.
  ipcMain.handle('settings:get', () => loadData().settings)
  ipcMain.handle('settings:set', (_, settings) => {
    const data = loadData()
    data.settings = { ...data.settings, ...settings }
    saveData(data)
    return true
  })

  // Stats: append today's pomodoro or increment existing.
  // Validates duration to prevent NaN corruption.
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

  // Timer tick → update tray title/labels.
  ipcMain.on('timer:tick', (_, timeStr, mode, status) => {
    updateTrayMenu(timeStr, mode, status)
  })

  // Timer done → show OS notification.
  ipcMain.on('timer:done', (_, mode) => {
    if (Notification.isSupported()) {
      const title = mode === 'work' ? '🍅 Pomodoro Complete!' : '☕ Break Over!'
      const body = mode === 'work' ? 'Good work! Time for a break.' : 'Break is over, back to focus!'
      const notif = new Notification({ title, body })
      notif.show()
      notif.on('click', () => { if (win) win.show() })
    }
  })

  // Window controls: both hide to tray (no quit).
  ipcMain.on('window:minimize', () => { if (win) win.hide() })
  ipcMain.on('window:close', () => { if (win) win.hide() })
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
  // Non-macOS: keep running in tray. Only explicit quit closes.
})

app.on('before-quit', () => {
  app.isQuitting = true
})
