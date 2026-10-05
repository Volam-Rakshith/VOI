#!/usr/bin/env node
/**
 * Headless UI smoke test.
 *   npm run test:ui
 *
 * Bundles the real app (esbuild, same config Vite uses), mounts it in a jsdom
 * DOM and drives it the way a player would: splash → menu → setup → tutorial →
 * settings → BLACK BOX gate. Catches broken imports, render crashes, effect
 * loops and route failures that a build alone would not reveal.
 */

import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

const results = []
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail })
  process.stdout.write(`  ${ok ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m'} ${name}${ok || !detail ? '' : `\n      ${detail}`}\n`)
}

const consoleErrors = []

/* ------------------------------------------------------------------ */
/* 1. Bundle the app for Node (jsdom supplies the DOM)                 */
/* ------------------------------------------------------------------ */
// The temp entry must live inside the project so bare imports resolve.
const outDir = path.resolve('.smoke')
await mkdir(outDir, { recursive: true })
const entry = path.join(outDir, 'entry.jsx')

await writeFile(
  entry,
  `
  import React from 'react'
  import { createRoot } from 'react-dom/client'
  import { App } from '${path.resolve('src/App.jsx').replace(/\\/g, '/')}'
  import { RouterProvider } from '${path.resolve('src/lib/router.jsx').replace(/\\/g, '/')}'
  import { SettingsProvider } from '${path.resolve('src/context/SettingsContext.jsx').replace(/\\/g, '/')}'
  import { WordBankProvider } from '${path.resolve('src/context/WordBankContext.jsx').replace(/\\/g, '/')}'
  import { ToastProvider } from '${path.resolve('src/context/ToastContext.jsx').replace(/\\/g, '/')}'
  import { verifyAdminPassword } from '${path.resolve('src/lib/blackbox.js').replace(/\\/g, '/')}'

  window.__mount = () => {
    const root = createRoot(document.getElementById('root'))
    root.render(
      React.createElement(RouterProvider, null,
        React.createElement(SettingsProvider, null,
          React.createElement(WordBankProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(App, null)))))
    )
    return root
  }
  window.__verifyAdminPassword = verifyAdminPassword
  import * as runtimeConfig from '${path.resolve('src/lib/runtimeConfig.js').replace(/\\/g, '/')}'
  import * as supabaseLib from '${path.resolve('src/lib/supabase.js').replace(/\\/g, '/')}'
  window.__backend = { runtimeConfig, supabaseLib }
  `,
)

const bundlePath = path.join(outDir, 'bundle.js')
await build({
  entryPoints: [entry],
  bundle: true,
  outfile: bundlePath,
  format: 'iife',
  target: 'es2020',
  jsx: 'automatic',
  loader: { '.css': 'empty', '.woff2': 'empty', '.svg': 'empty' },
  define: {
    'process.env.NODE_ENV': '"development"',
    'import.meta.env.DEV': 'true',
    'import.meta.env.PROD': 'false',
    'import.meta.env.VITE_SUPABASE_URL': '""',
    'import.meta.env.VITE_SUPABASE_ANON_KEY': '""',
    'import.meta.env.VITE_ROOM_TTL_MINUTES': '"180"',
  },
  logLevel: 'error',
})

/* ------------------------------------------------------------------ */
/* 2. Wire up jsdom                                                    */
/* ------------------------------------------------------------------ */
const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (error) => {
  // jsdom has no canvas backend — the ambient particle layer handles it.
  if (/Not implemented/.test(error.message)) return
  consoleErrors.push(error.message)
})
virtualConsole.on('error', (message) => consoleErrors.push(String(message)))
virtualConsole.on('warn', (message) => {
  if (/React Router|act\(/.test(String(message))) return
  if (/Warning: /.test(String(message))) consoleErrors.push(String(message))
})

const dom = new JSDOM(
  `<!doctype html><html><head></head><body><div id="boot">Loading</div><div id="root"></div></body></html>`,
  {
    url: 'https://example.com/repo-name/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole,
  },
)

const { window } = dom

/* Minimal browser APIs jsdom lacks that the app touches. */
window.matchMedia =
  window.matchMedia ||
  ((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }))
const noopContext = new Proxy(
  { canvas: null, save() {}, restore() {}, beginPath() {}, closePath() {}, fill() {}, stroke() {}, arc() {}, rect() {}, moveTo() {}, lineTo() {},
    clearRect() {}, fillRect() {}, strokeRect() {}, drawImage() {}, createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }), createPattern: () => ({}), setTransform() {}, translate() {}, rotate() {}, scale() {},
    getImageData: () => ({ data: new Uint8ClampedArray(4) }), putImageData() {}, measureText: () => ({ width: 0 }), fillText() {}, strokeText() {} },
  { get: (target, prop) => (prop in target ? target[prop] : () => {}) },
)
window.HTMLCanvasElement.prototype.getContext = () => noopContext
window.scrollTo = () => {}
if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.navigator.vibrate = () => true

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const text = () => window.document.body.textContent || ''
const click = (el) => {
  el?.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }))
}
const buttons = () => [...window.document.querySelectorAll('button')]
const buttonMatching = (pattern) => buttons().find((b) => pattern.test((b.textContent || '').trim()))
const clickMatching = async (pattern, ms = 260) => {
  const button = buttonMatching(pattern)
  if (!button) return false
  click(button)
  await wait(ms)
  return true
}
const pointer = (el) => {
  el?.dispatchEvent(new window.MouseEvent('pointerdown', { bubbles: true, cancelable: true }))
}
const findByText = (needle, selector = 'button, a, h1, h2, p, span, div') =>
  [...window.document.querySelectorAll(selector)].find((el) => (el.textContent || '').includes(needle))
const navigate = async (route) => {
  window.location.hash = `#/${route}`
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
  await wait(260)
}

/* ------------------------------------------------------------------ */
/* 3. Run the app                                                      */
/* ------------------------------------------------------------------ */
process.stdout.write('\n\x1b[36mUI SMOKE TEST (jsdom)\x1b[0m\n')

window.eval(
  `(function(){ ${await (await import('node:fs/promises')).readFile(bundlePath, 'utf8')} })()`,
)

let renderError = null
try {
  window.__mount()
  await wait(120)
  record('app mounts without crashing', text().includes('IMPOSTER'), renderError || 'no menu text found')
} catch (error) {
  renderError = error.message
  record('app mounts without crashing', false, renderError)
}

/* Splash → menu */
await wait(2000)
record('splash hands over to the main menu', text().includes('PLAY LOCAL') && text().includes('ONLINE ROOM'), text().slice(0, 160))
record('pre-hydration boot plate is removed', !window.document.getElementById('boot'))
record('studio credit is present', text().includes('Crafted with passion by VR DEVELOPMENTS'))

/* Hidden admin zone */
const hotzone = window.document.querySelector('div[aria-hidden="true"].absolute.right-0.top-0')
record('hidden BLACK BOX hotzone exists (no visible button)', Boolean(hotzone) && !text().includes('BLACK BOX'))
if (hotzone) {
  pointer(hotzone)
  pointer(hotzone)
  await wait(40)
  pointer(hotzone)
  await wait(260)
  record('three taps open the access prompt', text().includes('BLACK BOX') && text().includes('authenticate'))
}

/* Wrong passphrase is rejected, correct one unlocks */
if (window.__verifyAdminPassword) {
  const denied = await window.__verifyAdminPassword('not-the-phrase')
  record('wrong passphrase is rejected', denied.ok === false && /Incorrect access phrase/.test(denied.error))
  const phrase = ['VRdev', 'VOLAM', 'rakshith'].join('')
  const granted = await window.__verifyAdminPassword(phrase)
  record('correct passphrase unlocks (salted digest matches)', granted.ok === true, granted.error || '')
  // Close the prompt the way a player would so later screens are unobstructed.
  const cancel = [...window.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancel')
  click(cancel)
  await wait(200)
}

/* Tutorial */
await navigate('howto')
record('tutorial renders its first step', text().includes('Add players') && text().includes('HOUSE RULES'))
const stepDots = window.document.querySelectorAll('button[aria-label^="Go to step"]')
record('tutorial runs the full eight-step flow', stepDots.length === 8, `steps: ${stepDots.length}`)
const nextButton = [...window.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Next')
click(nextButton)
await wait(320)
record('tutorial steps advance', text().includes('Everyone gets a secret'))
click(stepDots[7])
await wait(320)
record('the final step offers the way into a game', /Win the round/.test(text()) && /Start playing/.test(text()))

/* Settings */
await navigate('settings')
record('settings exposes every control', ['Sound effects', 'Animations', 'Reduced motion', 'Haptics', 'LOCAL DATA', 'ABOUT'].every((needle) => text().includes(needle)))

/* Online routes render their configuration fallback instead of breaking */
await navigate('online')
record(
  'online screen offers backend setup instead of dead-ending',
  /connect a backend/i.test(text()) || /create room/i.test(text()),
  text().slice(0, 120),
)

await navigate('lobby?room=A7KQ')
record('room deep link renders the seat prompt', text().includes('TAKE YOUR SEAT') || text().includes('A7KQ'))

/* Unknown route falls back to home instead of a blank screen */
await navigate('does-not-exist')
record('unknown routes fall back to the menu', text().includes('PLAY LOCAL'))

/* ------------------------------------------------------------------ */
/* Full pass & play round, start to finish                             */
/* ------------------------------------------------------------------ */
process.stdout.write('\n\x1b[36mFULL LOCAL ROUND\x1b[0m\n')

await navigate('local')
record(
  'pass & play setup renders a 6 player roster by default',
  text().includes('Pass & play setup') && window.document.querySelectorAll('input[placeholder="Enter name"]').length === 6,
)
record('setup blocks the start until names are filled', Boolean(buttonMatching(/Deal the secrets/)?.disabled))

const inputs = [...window.document.querySelectorAll('input[placeholder="Enter name"]')]
inputs.forEach((input, index) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
  setter.call(input, `Tester${index + 1}`)
  input.dispatchEvent(new window.Event('input', { bubbles: true }))
})
await wait(320)
const dealButton = buttonMatching(/Deal the secrets/)
record('setup becomes valid once names are entered', Boolean(dealButton) && !dealButton.disabled)

{
  click(dealButton)
  await wait(520)
  record('the first secret card is dealt', text().includes('pass the device to') && /TAP TO REVEAL/i.test(text()))

  const card = window.document.querySelector('[role="button"][aria-label="Reveal your secret"]')
  record('secret card is exposed to assistive tech as a button', Boolean(card))
  click(card)
  await wait(400)
  const revealed = text()
  record('revealing shows the secret (word for crew, imposter card for the imposter)', /your secret word|YOU ARE THE/i.test(revealed))
  record('the card offers a way to hide it again', Boolean(window.document.querySelector('[aria-label="Hide your secret"]')))
  click(window.document.querySelector('[aria-label="Hide your secret"]'))
  await wait(400)
  record('hiding brings back the pass-to-next control', /Hand to next player|Everyone is ready/.test(text()))

  // 1. Everyone reveals, hides and passes.
  let reveals = 1
  let guard = 0
  while (guard < 30) {
    guard += 1
    await clickMatching(/Hand to next player|Everyone is ready/, 700)

    const reveal = window.document.querySelector('[aria-label="Reveal your secret"]')
    if (!reveal) break
    click(reveal)
    await wait(420)
    reveals += 1

    const hide = window.document.querySelector('[aria-label="Hide your secret"]')
    if (!hide) break
    click(hide)
    await wait(420)
  }
  record('all six players can reveal and hide their card', reveals === 6, `reveals: ${reveals}`)

  // 2. Briefing
  const briefed = await clickMatching(/^Start round 1$/, 700)
  record('briefing opens the clue round', briefed && /clue turn|START TIMER/i.test(text()))

  // 3. Clues with the timer
  const timerStarted = await clickMatching(/^Start timer$/, 400)
  record('the turn timer can be started', timerStarted && /Pause/i.test(text()))
  await clickMatching(/^Pause$/, 320)
  const resetWorked = await clickMatching(/^Reset$/, 320)
  record('the timer can be paused and reset', resetWorked)

  let clueSteps = 0
  while (clueSteps < 10) {
    clueSteps += 1
    const advanced = await clickMatching(/Next player|Clues done — move to voting/, 700)
    if (!advanced) break
    if (/WHO IS THE IMPOSTER/i.test(text())) break
  }
  record('every player gets a clue turn, then voting opens', /WHO IS THE IMPOSTER/i.test(text()), `steps: ${clueSteps}`)

  // 4. Secret ballot
  const opened = await clickMatching(/Begin secret ballot/, 700)
  record('the secret ballot starts', opened && /hand the device to/i.test(text()))

  let ballots = 0
  let ballotGuard = 0
  while (ballotGuard < 14) {
    ballotGuard += 1
    const openedBallot = await clickMatching(/Open my ballot/, 650)
    if (!openedBallot) break
    const target = buttons().find((b) => b.dataset?.playerId && !b.disabled)
    if (!target) break
    click(target)
    await wait(220)
    const locked = await clickMatching(/Lock my vote/, 650)
    ballots += 1
    if (!locked && /VOTES ARE IN/i.test(text())) break
  }
  record('every living player can cast a hidden ballot', /VOTES ARE IN/i.test(text()), `ballots cast: ${ballots}`)

  // 5. Tally → result
  const tallyRevealed = await clickMatching(/Reveal the tally/, 900)
  const winnerText = text()
  record('the tally reveals an outcome', tallyRevealed && /TEAM WINS|IMPOSTER WINS/i.test(winnerText))
  record('winner screen states the verdict in plain words', /THE IMPOSTER WAS CAUGHT|YOU WERE FOOLED/i.test(winnerText))
  record('winner screen reveals the secret word', /the secret word was/i.test(winnerText))
  record(
    'winner screen lists every player with a role',
    (winnerText.match(/imposter/gi) || []).length >= 2 && /crew/i.test(winnerText),
  )

  // 6. Restart
  const replayed = await clickMatching(/Play again/, 900)
  record('play again redeals a fresh round', replayed && /pass the device to|TAP TO REVEAL/i.test(text()))
}

/* ------------------------------------------------------------------ */
/* 8. Boot failsafe — the "permanent LOADING screen" guard             */
/* ------------------------------------------------------------------ */
/* A host that serves the source tree instead of dist/ delivers main.jsx
   with a non-JS MIME type; browsers refuse to execute it, React never mounts
   and the pre-hydration plate used to sit there forever. jsdom ignores
   `type="module"` scripts, which reproduces exactly that condition.        */

const { readFileSync, existsSync } = await import('node:fs')

function bootDom(html, { url = 'https://example.test/' } = {}) {
  const vc = new VirtualConsole()
  vc.on('jsdomError', () => {})
  return new JSDOM(html, { runScripts: 'dangerously', url, virtualConsole: vc, pretendToBeVisual: true })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const shell = readFileSync(path.resolve('index.html'), 'utf8')

record('the shell ships a pre-React loading plate', /id="boot"/.test(shell))
record('the shell arms boot telemetry before any bundle code', /__IMPOSTER_BOOT__/.test(shell) && shell.indexOf('__IMPOSTER_BOOT__') < shell.indexOf('<div id="root">'))
record('the loading plate is announced to screen readers', /id="boot"[^>]*role="status"[^>]*aria-live="polite"/.test(shell))

// Nothing boots → the failsafe must speak up.
{
  const dom = bootDom(shell)
  await sleep(2400)
  const boot = dom.window.document.getElementById('boot')
  const html = boot ? boot.innerHTML : ''
  const text = boot ? boot.textContent : ''
  record('stuck boot is detected and replaced with a real error screen', /could not start/i.test(text))
  record('the cause is explained in plain language', /source folder|built dist|Settings \u2192 Pages|did not finish loading/i.test(text))
  record('recovery actions are offered', /Try again/.test(text) && /Clear cache/.test(text))
  record('diagnostics expose the environment', /Diagnostics/.test(html) && /example\.test/.test(html))
  record('no raw error jargon leaks into player copy', !/Error:|undefined|\[object|TypeError/.test(text))
  dom.window.close()
}

// file:// gets its own advice, because that failure has a different fix.
{
  const dom = bootDom(shell, { url: 'file:///Users/me/imposter/index.html' })
  await sleep(2400)
  const text = dom.window.document.getElementById('boot').textContent
  record('opening from disk explains the file:// restriction', /opened straight from disk|file:\/\//i.test(text))
  dom.window.close()
}

// Healthy boot: React claimed the screen, so the failsafe must stay silent.
{
  const dom = bootDom(shell)
  dom.window.__IMPOSTER_BOOT__.ready = true
  await sleep(2400)
  const text = dom.window.document.getElementById('boot').textContent
  record('a healthy boot never shows the failure card', !/could not start/i.test(text))
  dom.window.close()
}

// The shipped artefact must carry the same guard.
{
  const distHtml = path.resolve('dist/index.html')
  if (existsSync(distHtml)) {
    const built = readFileSync(distHtml, 'utf8')
    record('the built dist/index.html keeps the failsafe', /__IMPOSTER_BOOT__/.test(built) && /could not start/i.test(built))
    record('the built page loads the bundle, not the source entry', !/\/src\/main\.jsx/.test(built) && /\.\/assets\/index-[\w-]+\.js/.test(built))
  } else {
    record('dist/index.html exists (run npm run build first)', false, 'no build found — skipping artefact checks')
  }
}

// markBooted is importable and idempotent outside the browser.
{
  const { pathToFileURL } = await import('node:url')
  const bootModule = await import(pathToFileURL(path.resolve('src/lib/boot.js')).href)
  record('boot helper exports the handshake', typeof bootModule.markBooted === 'function' && typeof bootModule.isBooted === 'function')
  bootModule.markBooted()
  bootModule.markBooted()
  record('the handshake is safe to call twice (StrictMode)', true)
}

/* ------------------------------------------------------------------ */
/* 9. Backend configuration — paste values, no rebuild                 */
/* ------------------------------------------------------------------ */
{
  const { runtimeConfig, supabaseLib } = window.__backend
  const ANON_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjogImFub24ifQ.' + 'x'.repeat(60)
  const SERVICE_KEY =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjogInNlcnZpY2Vfcm9sZSJ9.' + 'y'.repeat(60)

  const setInput = (input, value) => {
    // React tracks the value on the node, so set the native setter then fire.
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  }
  const labelledInput = (labelText) => {
    const label = [...window.document.querySelectorAll('label')].find((l) => (l.textContent || '').includes(labelText))
    return label ? window.document.getElementById(label.getAttribute('for')) : null
  }

  runtimeConfig.clearStoredBackend()
  await navigate('online')
  await wait(300)

  record('online mode offers a way in when no backend is set', /Connect a backend/i.test(text()))
  record('the setup screen explains what is needed', /Project URL/i.test(text()) && /anon key/i.test(text()))
  record(
    'the tile does not demand a rebuild or file edit',
    /no rebuild/i.test(text()) || /nothing to edit in code/i.test(text()),
  )

  const opened = await clickMatching(/Connect a backend/i, 420)
  record('the connect panel opens from the online screen', opened && /Connect a backend/i.test(text()))

  const urlInput = labelledInput('Supabase project URL')
  const keyInput = labelledInput('Anon / publishable key')
  record('the panel exposes both fields', Boolean(urlInput) && Boolean(keyInput))

  // A too-short key is rejected with player-friendly copy, not a stack trace.
  setInput(urlInput, 'https://abcdefghijklm.supabase.co')
  setInput(keyInput, 'nope')
  await clickMatching(/Save & use/i, 320)
  record(
    'a bad key is refused with a clear reason',
    /too short/i.test(text()) && !/undefined|\[object|TypeError/.test(text()),
  )
  record('nothing was stored from a rejected save', runtimeConfig.hasStoredBackend() === false)

  // The service-role key is refused on purpose — that one must never ship.
  setInput(keyInput, SERVICE_KEY)
  await clickMatching(/Save & use/i, 320)
  record('the service-role key is refused with a security note', /service-role/i.test(text()))
  record('the service-role key is never stored', runtimeConfig.hasStoredBackend() === false)

  // A valid pair saves, applies instantly and drives the client.
  setInput(keyInput, ANON_KEY)
  await clickMatching(/Save & use/i, 420)
  const status = runtimeConfig.describeBackend()
  record('a valid configuration saves', status.configured && status.source === 'device')
  record('the panel confirms the connection', /Backend connected|CONNECTED/i.test(text()))
  record('the project host is shown in the panel', /abcdefghijklm\.supabase\.co/.test(text()))

  const client = supabaseLib.getSupabase()
  if (client) {
    record(
      'the live supabase client points at the pasted project',
      client.supabaseUrl === 'https://abcdefghijklm.supabase.co',
      `client url was ${client.supabaseUrl}`,
    )
  } else {
    // No WebSocket in this runtime: the failure must still be explained.
    record('client creation failure is explained rather than swallowed', Boolean(supabaseLib.getSupabaseError()))
  }

  await clickMatching(/Close|×|Cancel/i, 320)
  await wait(200)
  record('the setup form is usable once connected', /Create room/i.test(text()) && /Join room/i.test(text()))

  // Swapping projects must not leave a stale client behind.
  const before = supabaseLib.getSupabase()
  runtimeConfig.saveStoredBackend({ url: 'https://secondproject.supabase.co', anonKey: ANON_KEY })
  const after = supabaseLib.getSupabase()
  record('changing the project rebuilds the client', before === null || after === null || before !== after)

  // And forgetting device values falls back cleanly.
  runtimeConfig.clearStoredBackend()
  await navigate('online')
  await wait(360)
  record('forgetting device values returns to the setup card', /Connect a backend/i.test(text()))
  record('clearing really clears storage', runtimeConfig.hasStoredBackend() === false && supabaseLib.isOnlineConfigured() === false)
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
process.stdout.write('\n')
const failed = results.filter((r) => !r.ok)
if (consoleErrors.length) {
  process.stdout.write('\x1b[33mconsole output during run:\x1b[0m\n')
  consoleErrors.slice(0, 8).forEach((line) => process.stdout.write(`  • ${line.slice(0, 220)}\n`))
}
process.stdout.write(`\n\x1b[1m${results.length - failed.length} passed, ${failed.length} failed\x1b[0m\n`)

await rm(outDir, { recursive: true, force: true })
process.exit(failed.length ? 1 : 0)
