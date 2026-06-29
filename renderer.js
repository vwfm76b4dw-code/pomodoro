/* global api */

// ── State ─────────────────────────────────────────────────
const state = {
  settings: {
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    soundEnabled: true,
    notificationEnabled: true,
    lang: 'zh-CN',
  },
  mode: 'work',
  status: 'idle',
  remaining: 25 * 60,
  total: 25 * 60,
  completedToday: 0,
  timerId: null,
  sessionCount: 0,
  lastDisplayedMinute: -1,
}

const $ = (sel) => document.querySelector(sel)
const $$ = (sel) => document.querySelectorAll(sel)

// ── i18n ──────────────────────────────────────────────────
const i18n = {
  'zh-CN': {
    title: '番茄钟',
    timerTab: '计时',
    statsTab: '统计',
    settingsTab: '设置',
    modeWork: '专注时间',
    modeBreak: '短休息',
    modeLongBreak: '长休息',
    labelIdle: '准备就绪',
    labelPaused: '已暂停',
    labelFocus: '还剩 {min} 分钟',
    labelBreak: '休息中',
    btnStart: '开始',
    btnPause: '暂停',
    btnResume: '继续',
    btnReset: '重置',
    statsTitle: '今日统计',
    trendTitle: '本周趋势',
    statToday: '今日番茄',
    statWeek: '本周番茄',
    statTotal: '总番茄',
    statMinutes: '总分钟',
    dayNames: ['一', '二', '三', '四', '五', '六', '日'],
    settingTitle: '计时设置',
    notifyTitle: '通知设置',
    labelWork: '专注时长（分钟）',
    labelBreak: '短休息时长（分钟）',
    labelLongBreak: '长休息时长（分钟）',
    labelInterval: '番茄数后长休息',
    labelSound: '音效提示',
    labelNotify: '系统通知',
    labelLang: '语言',
    btnSave: '保存设置',
    saved: '已保存',
    btnResetSettings: '恢复默认',
    confirmReset: '确定恢复默认设置？',
  },
  en: {
    title: 'Pomodoro',
    timerTab: 'Timer',
    statsTab: 'Stats',
    settingsTab: 'Settings',
    modeWork: 'Focus Time',
    modeBreak: 'Short Break',
    modeLongBreak: 'Long Break',
    labelIdle: 'Ready',
    labelPaused: 'Paused',
    labelFocus: '{min} min remaining',
    labelBreak: 'Taking a break',
    btnStart: 'Start',
    btnPause: 'Pause',
    btnResume: 'Resume',
    btnReset: 'Reset',
    statsTitle: 'Today',
    trendTitle: 'Weekly Trend',
    statToday: 'Today',
    statWeek: 'This Week',
    statTotal: 'Total',
    statMinutes: 'Total Minutes',
    dayNames: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    settingTitle: 'Timer Settings',
    notifyTitle: 'Notifications',
    labelWork: 'Focus (min)',
    labelBreak: 'Short Break (min)',
    labelLongBreak: 'Long Break (min)',
    labelInterval: 'Pomodoros to Long Break',
    labelSound: 'Sound',
    labelNotify: 'System Notify',
    labelLang: 'Language',
    btnSave: 'Save',
    saved: 'Saved',
    btnResetSettings: 'Reset Defaults',
    confirmReset: 'Reset all settings to defaults?',
  },
}

function t(key) {
  const lang = state.settings.lang || 'zh-CN'
  return i18n[lang]?.[key] || i18n['zh-CN'][key] || key
}

function applyLanguage() {
  // Static elements with data-i18n
  $$('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n
    el.textContent = t(key)
  })
  // Settings inputs with data-i18n-label
  $$('[data-i18n-label]').forEach(el => {
    const key = el.dataset.i18nLabel
    el.textContent = t(key)
  })
  // Tabs
  $$('.tab').forEach(tab => {
    tab.textContent = t(tab.dataset.i18n)
  })
  // Title bar
  $('.titlebar-text').textContent = t('title')
  // Mode indicator, display label, buttons — updated in updateDisplay
  updateDisplay()
  updateDots()
  loadStats()
}

// ── Animations ────────────────────────────────────────────
function triggerNumberPop() {
  const el = $('#timer-display')
  el.classList.remove('pop')
  void el.offsetWidth
  el.classList.add('pop')
}

function setRingRunning(running) {
  const ring = $('#ring-progress')
  if (running) ring.classList.add('running')
  else ring.classList.remove('running')
}

// ── Audio ─────────────────────────────────────────────────
let audioCtx = null

function playNotificationSound(mode) {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)()
    const now = audioCtx.currentTime

    if (mode === 'work') {
      const freqs = [523.25, 659.25, 783.99]
      freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.3, now + i * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4)
        osc.connect(gain).connect(audioCtx.destination)
        osc.start(now + i * 0.12)
        osc.stop(now + i * 0.12 + 0.4)
      })
    } else {
      const freqs = [783.99, 659.25, 523.25]
      freqs.forEach((freq, i) => {
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.type = 'sine'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.3, now + i * 0.12)
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.4)
        osc.connect(gain).connect(audioCtx.destination)
        osc.start(now + i * 0.12)
        osc.stop(now + i * 0.12 + 0.4)
      })
    }
  } catch (_) { /* Web Audio not available */ }
}

// ── Timer ─────────────────────────────────────────────────
function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function updateDisplay() {
  const el = $('#timer-display')
  const label = $('#timer-label')
  const modeIndicator = $('#mode-indicator')
  const progress = $('#ring-progress')

  const newTime = formatTime(state.remaining)
  if (el.textContent !== newTime) {
    el.textContent = newTime
    triggerNumberPop()
  }

  if (state.status === 'idle') {
    label.textContent = t('labelIdle')
  } else if (state.status === 'paused') {
    label.textContent = t('labelPaused')
  } else if (state.mode === 'work') {
    label.textContent = `${t('labelFocus').replace('{min}', Math.ceil(state.remaining / 60))}`
  } else {
    label.textContent = t('labelBreak')
  }

  if (state.mode === 'work') modeIndicator.textContent = t('modeWork')
  else if (state.mode === 'break') modeIndicator.textContent = t('modeBreak')
  else modeIndicator.textContent = t('modeLongBreak')

  modeIndicator.style.color = state.mode === 'work' ? 'var(--accent)' : 'var(--break-accent)'

  const circumference = 628.32
  const offset = circumference * (1 - (state.total - state.remaining) / state.total)
  progress.style.strokeDashoffset = offset
  progress.style.stroke = state.mode === 'work' ? 'var(--accent)' : 'var(--break-accent)'

  const btn = $('#btn-start')
  if (state.status === 'running') { btn.textContent = t('btnPause'); btn.className = 'btn btn-secondary' }
  else if (state.status === 'paused') { btn.textContent = t('btnResume'); btn.className = 'btn btn-primary' }
  else { btn.textContent = t('btnStart'); btn.className = 'btn btn-primary' }

  api.sendTick(formatTime(state.remaining), state.mode, state.status)
}

function tick() {
  if (state.status !== 'running') return
  state.remaining -= 1
  if (state.remaining <= 0) {
    clearInterval(state.timerId)
    state.timerId = null
    state.status = 'idle'
    setRingRunning(false)
    onTimerComplete()
    return
  }
  updateDisplay()
}

function startTimer() {
  if (state.status === 'paused') {
    state.status = 'running'
    state.timerId = setInterval(tick, 1000)
    setRingRunning(true)
    updateDisplay()
    return
  }
  const duration = state.mode === 'work'
    ? state.settings.workDuration
    : state.mode === 'longbreak'
      ? state.settings.longBreakDuration : state.settings.breakDuration
  state.total = duration * 60
  state.remaining = state.total
  state.status = 'running'
  state.timerId = setInterval(tick, 1000)
  setRingRunning(true)
  updateDisplay()
}

function pauseTimer() {
  clearInterval(state.timerId)
  state.timerId = null
  state.status = 'paused'
  setRingRunning(false)
  updateDisplay()
}

function resetTimer() {
  clearInterval(state.timerId)
  state.timerId = null
  const duration = state.mode === 'work'
    ? state.settings.workDuration
    : state.mode === 'longbreak'
      ? state.settings.longBreakDuration : state.settings.breakDuration
  state.total = duration * 60
  state.remaining = state.total
  state.status = 'idle'
  setRingRunning(false)
  updateDisplay()
}

function onTimerComplete() {
  if (state.mode === 'work') {
    state.completedToday++
    state.sessionCount++
    api.addPomodoro({ duration: state.settings.workDuration })
    if (state.settings.soundEnabled) playNotificationSound('work')
    if (state.settings.notificationEnabled) api.sendDone('work')
    const isLongBreak = state.sessionCount % state.settings.longBreakInterval === 0
    state.mode = isLongBreak ? 'longbreak' : 'break'
    state.total = (isLongBreak ? state.settings.longBreakDuration : state.settings.breakDuration) * 60
    state.remaining = state.total
    state.status = 'idle'
  } else {
    if (state.settings.soundEnabled) playNotificationSound('break')
    if (state.settings.notificationEnabled) api.sendDone('break')
    state.mode = 'work'
    state.total = state.settings.workDuration * 60
    state.remaining = state.total
    state.status = 'idle'
  }
  updateDisplay()
  updateDots()
}

// ── Pomodoro Dots ─────────────────────────────────────────
function updateDots() {
  const container = $('#pomodoro-dots')
  const interval = state.settings.longBreakInterval
  container.innerHTML = ''
  for (let i = 0; i < interval; i++) {
    const dot = document.createElement('div')
    dot.className = 'pomodoro-dot'
    if (i < state.sessionCount % interval) dot.classList.add('completed')
    container.appendChild(dot)
  }
}

// ── Stats ─────────────────────────────────────────────────
async function loadStats() {
  const entries = await api.getStats()
  const today = new Date().toISOString().slice(0, 10)

  const now = new Date()
  const dayOfWeek = now.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const weekDates = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(now.getDate() + mondayOffset + i)
    weekDates.push(d.toISOString().slice(0, 10))
  }

  const todayEntry = entries.find(e => e.date === today)
  state.completedToday = todayEntry ? todayEntry.count : 0

  const weekEntries = entries.filter(e => weekDates.includes(e.date))
  $('#stat-today').textContent = state.completedToday
  $('#stat-week').textContent = weekEntries.reduce((sum, e) => sum + e.count, 0)
  $('#stat-total').textContent = entries.reduce((sum, e) => sum + e.count, 0)
  $('#stat-minutes').textContent = entries.reduce((sum, e) => sum + (e.totalMinutes || 0), 0)

  const dayNames = i18n[state.settings.lang || 'zh-CN'].dayNames
  const chart = $('#week-chart')
  chart.innerHTML = weekDates.map((date, i) => {
    const entry = entries.find(e => e.date === date)
    const count = entry ? entry.count : 0
    const maxCount = Math.max(...weekDates.map(d => {
      const e = entries.find(en => en.date === d)
      return e ? e.count : 0
    }), 1)
    const heightPct = Math.max((count / maxCount) * 100, 4)
    const isToday = date === today
    return `
      <div class="chart-bar-wrapper">
        <div class="chart-bar-value">${count}</div>
        <div class="chart-bar ${isToday ? 'today-bar' : ''}" style="height:${heightPct}%"></div>
        <div class="chart-bar-label" style="${isToday ? 'color:var(--accent);font-weight:600' : ''}">${dayNames[i]}</div>
      </div>
    `
  }).join('')
}

// ── Settings ──────────────────────────────────────────────
async function loadSettings() {
  const s = await api.getSettings()
  state.settings.lang = s.lang || 'zh-CN'
  state.settings = s
  $('#setting-work').value = s.workDuration
  $('#setting-break').value = s.breakDuration
  $('#setting-longbreak').value = s.longBreakDuration
  $('#setting-interval').value = s.longBreakInterval
  $('#setting-sound').checked = s.soundEnabled
  $('#setting-notification').checked = s.notificationEnabled
  $('#setting-lang').value = s.lang || 'zh-CN'
  applyLanguage()
}

async function saveSettings() {
  const s = {
    workDuration: Math.max(1, parseInt($('#setting-work').value) || 25),
    breakDuration: Math.max(1, parseInt($('#setting-break').value) || 5),
    longBreakDuration: Math.max(1, parseInt($('#setting-longbreak').value) || 15),
    longBreakInterval: Math.max(1, parseInt($('#setting-interval').value) || 4),
    soundEnabled: $('#setting-sound').checked,
    notificationEnabled: $('#setting-notification').checked,
    lang: $('#setting-lang').value,
  }
  state.settings.lang = s.lang

  if (state.status === 'idle') {
    state.settings = s
    const duration = state.mode === 'work'
      ? s.workDuration : state.mode === 'longbreak' ? s.longBreakDuration : s.breakDuration
    state.total = duration * 60
    state.remaining = state.total
  } else {
    state.settings = s
  }

  await api.saveSettings(s)
  updateDots()
  applyLanguage()

  const btn = $('#btn-save-settings')
  const orig = btn.textContent
  btn.textContent = t('saved')
  setTimeout(() => { btn.textContent = orig }, 1500)
}

async function resetSettings() {
  if (!confirm(t('confirmReset'))) return
  const defaults = {
    workDuration: 25,
    breakDuration: 5,
    longBreakDuration: 15,
    longBreakInterval: 4,
    soundEnabled: true,
    notificationEnabled: true,
    lang: state.settings.lang,
  }
  state.settings = defaults
  await api.saveSettings(defaults)
  $('#setting-work').value = defaults.workDuration
  $('#setting-break').value = defaults.breakDuration
  $('#setting-longbreak').value = defaults.longBreakDuration
  $('#setting-interval').value = defaults.longBreakInterval
  $('#setting-sound').checked = defaults.soundEnabled
  $('#setting-notification').checked = defaults.notificationEnabled
  state.total = defaults.workDuration * 60
  state.remaining = state.total
  state.status = 'idle'
  updateDots()
  updateDisplay()
  applyLanguage()
}

// ── Tab Navigation ───────────────────────────────────────
function initTabs() {
  $$('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.tab').forEach(t => t.classList.remove('active'))
      tab.classList.add('active')
      const panelId = `#panel-${tab.dataset.tab}`
      $$('.panel').forEach(p => p.classList.remove('active', 'fade-in'))
      const panel = $(panelId)
      panel.classList.add('active')
      panel.classList.remove('fade-in')
      void panel.offsetWidth
      panel.classList.add('fade-in')
      if (tab.dataset.tab === 'stats') loadStats()
    })
  })
}

// ── Title Bar ─────────────────────────────────────────────
function initTitleBar() {
  $('#btn-minimize').addEventListener('click', () => api.minimize())
  $('#btn-close').addEventListener('click', () => api.close())
}

// ── Keyboard Shortcuts ────────────────────────────────────
function initKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return
    if (e.code === 'Space') { e.preventDefault(); toggleTimer() }
    if (e.code === 'KeyR' && !e.ctrlKey && !e.metaKey) resetTimer()
  })
}

function toggleTimer() {
  if (state.status === 'running') pauseTimer()
  else startTimer()
}

// ── Tray Controls ─────────────────────────────────────────
function initTray() {
  api.onTrayControl((action) => {
    if (action === 'start' || action === 'pause') toggleTimer()
    if (action === 'reset') resetTimer()
  })
}

function initSound() {
  api.onPlaySound((mode) => {
    if (state.settings.soundEnabled) playNotificationSound(mode)
  })
}

// ── Init ──────────────────────────────────────────────────
async function init() {
  initTitleBar()
  initTabs()
  initKeyboard()
  initTray()
  initSound()

  await loadSettings()
  await loadStats()
  updateDots()

  const duration = state.settings.workDuration
  state.total = duration * 60
  state.remaining = state.total
  updateDisplay()

  $('#btn-start').addEventListener('click', toggleTimer)
  $('#btn-reset').addEventListener('click', resetTimer)
  $('#btn-save-settings').addEventListener('click', saveSettings)
  $('#btn-reset-settings').addEventListener('click', resetSettings)
  $('#setting-lang').addEventListener('change', () => {
    state.settings.lang = $('#setting-lang').value
    applyLanguage()
  })
}

document.addEventListener('DOMContentLoaded', init)
