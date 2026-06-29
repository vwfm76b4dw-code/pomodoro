# 🍅 Pomodoro — Desktop Focus Timer

A frameless Electron Pomodoro timer with glassmorphism UI, i18n, system tray integration, and Web Audio chimes. Close to tray, runs in background.

## Quick Start

```bash
npm install
npm start
```

## Features

| Feature | Detail |
|---|---|
| **Timer** | Work / short break / long break cycles. Space toggles, R resets |
| **Tray** | Minimize to system tray. Right-click for start/pause/reset/quit |
| **i18n** | Switch between 中文 and English in Settings → 语言/Language |
| **Sound** | Ascending chime (work done), descending chime (break done). Toggle in Settings |
| **Notifications** | System notification when a session completes. Toggle in Settings |
| **Stats** | Today / week / total pomodoros tracked to `userData/pomodoro-data.json` |
| **Weekly chart** | Mon–Sun bar chart, today highlighted |
| **Long break** | Triggers after N pomodoros (configurable, default 4) |
| **Reset settings** | Settings panel → "Reset Defaults" button |

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Start / Pause |
| `R` | Reset |
| Window close (✕) | Hide to tray (not quit) |

## Architecture

```
main.js         ← Electron main process (window, tray, IPC, file I/O)
preload.js      ← contextBridge: exposes safe window.api
index.html      ← Shell: titlebar + 3 tabs (timer / stats / settings)
style.css       ← Glassmorphism design system
renderer.js     ← Timer engine, stats, i18n, audio
```

### IPC Channels

| Direction | Channel | Type |
|---|---|---|
| Renderer → Main | `timer:tick` | fire-and-forget |
| Renderer → Main | `timer:done` | fire-and-forget |
| Renderer → Main | `settings:get/set` | request/response |
| Renderer → Main | `stats:get/add` | request/response |
| Renderer → Main | `window:minimize/close` | fire-and-forget |
| Main → Renderer | `tray:control` | push (start/pause/reset) |
| Main → Renderer | `play-sound` | push (work/break) |

### Data Persistence

Stored at `app.getPath('userData')/pomodoro-data.json`:

```json
{
  "settings": {
    "workDuration": 25,
    "breakDuration": 5,
    "longBreakDuration": 15,
    "longBreakInterval": 4,
    "soundEnabled": true,
    "notificationEnabled": true,
    "lang": "zh-CN"
  },
  "pomodoros": [
    { "date": "2025-01-01", "count": 3, "totalMinutes": 75 }
  ]
}
```

### Timer State Machine

```
idle → running → paused → running → ... → finished → idle
```

## Customization

Edit `renderer.js` → `state.settings` defaults, or use the Settings panel UI.

Duration bounds enforced client-side (min 1, max 120 for work).

## License

MIT
