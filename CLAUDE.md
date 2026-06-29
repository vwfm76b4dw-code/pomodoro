# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Commands

```bash
npm start                # Launch Electron app
npx electron .           # Same as npm start, without npm wrapper
```

No build step required — Electron loads the HTML/JS/CSS directly.

## Architecture

**Electron app** — three-process split: main, preload, renderer.

| File | Role |
|---|---|
| `main.js` | Main process: creates frameless `BrowserWindow` (420×620), system tray with dynamic menu, IPC handlers, JSON file persistence |
| `preload.js` | Security bridge via `contextBridge.exposeInMainWorld`. Exposes `window.api` with typed IPC channels |
| `index.html` | Single-page shell: custom titlebar (drag region), 3-tab nav, 3 panels (timer / stats / settings) |
| `style.css` | Glassmorphism theme: `backdrop-filter: blur(12px)`, warm gradient base, CSS animations |
| `renderer.js` | Timer engine (state machine), stats computation, settings form, keyboard shortcuts, Web Audio API chimes |

**IPC flow:**
- `renderer → main` (fire-and-forget): `timer:tick`, `timer:done`, `window:minimize`, `window:close`
- `renderer → main` (request/response via `invoke/handle`): `settings:get`, `settings:set`, `stats:get`, `stats:add`
- `main → renderer` (push): `tray:control` (tray menu clicks forwarded to renderer)

**Timer state machine:** `idle → running → paused → running → ... → finished → idle`

**Data persistence:** `app.getPath('userData')/pomodoro-data.json`
```json
{
  "settings": { "workDuration": 25, "breakDuration": 5, "longBreakDuration": 15, "longBreakInterval": 4, "soundEnabled": true, "notificationEnabled": true },
  "pomodoros": [{ "date": "2025-01-01", "count": 3, "totalMinutes": 75 }]
}
```

## Key details

- **Frameless window** — no OS chrome; custom titlebar with minimize/close via `-webkit-app-region: drag`. Close hides to tray, manual quit only.
- **Tray** — dynamically generated 16×16 red circle icon. Menu labels update with timer state (running time, work vs break).
- **Sound** — Web Audio API (no external files): ascending C5→E5→G5 chime for work done, descending for break done.
- **Stats** — daily/weekly/total counts computed client-side from persisted date-indexed array. 7-day bar chart (Mon–Sun) with today highlighted.
- **Long break** — triggers every N pomodoros (configurable, default 4).
- **Pomodoro dots** — N empty circles per cycle, fill sequentially; CSS animation on completion.
- **Keyboard:** `Space` = toggle timer, `R` = reset. Ignored when focus is in an input.

## Design system

Glassmorphism with warm gradient base. CSS custom properties in `:root`:
- `--glass-bg: rgba(255,255,255,0.12)` & `--glass-blur: blur(12px)` — applied to cards, panels, tab bar
- `--accent: #e07a5f` (warm tomato) — primary buttons, progress ring, highlights
- `--break-accent: #6d9e8a` (muted sage) — break mode ring + indicator
- Animations: `ringPulse` (2s breathing glow on progress ring while running), `numberPop` (spring scale on time change), `panelSlideIn`, `cardSlideIn`, `dotPop`

`capture.html` — standalone page showing 5 app states (idle / running / stats / settings / break) for Figma import via `generate_figma_design`.
