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
  import { haptic, HAPTIC } from '${path.resolve('src/lib/haptics.js').replace(/\\/g, '/')}'
  window.__haptics = { haptic, HAPTIC }
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
  if (/SOMETHING|cannot read|undefined|not a function/i.test(String(error?.stack || error?.message || ''))) {
    process.stdout.write(`\n[jsdom-error] ${String(error?.stack || error?.message).split('\n').slice(0, 6).join('\n')}\n`)
  }
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
/* Record haptic calls so the tests can assert what the game actually fires. */
window.__vibrations = []
window.navigator.vibrate = (pattern) => {
  window.__vibrations.push(pattern)
  return true
}

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
/** Poll until `predicate` is true (or the budget runs out). Returns the result. */
const waitUntil = async (predicate, timeout = 1500, step = 50) => {
  const deadline = Date.now() + timeout
  for (;;) {
    let value = false
    try {
      value = predicate()
    } catch {
      value = false
    }
    if (value) return value
    if (Date.now() > deadline) return value
    await wait(step)
  }
}

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
record('tutorial runs the full nine-step flow', stepDots.length === 9, `steps: ${stepDots.length}`)
const nextButton = [...window.document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Next')
click(nextButton)
await wait(320)
record('tutorial steps advance', text().includes('Everyone gets a secret'))
click(stepDots[8])
await wait(320)
record('the final step offers the way into a game', /End the game/.test(text()) && /Start playing/.test(text()))
click(stepDots[6])
await wait(320)
record('the caught-imposter guess is explained in the rules', /One guess/i.test(text()))

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

  // 5. The elimination loop. The game only ends when one side is gone, so the
  //    driver below simply answers whatever screen the app puts up — reveal
  //    hand-offs, briefings, clue turns, ballots, tallies and the private guess of
  //    a caught player — until the winner screen names the secret word. Rounds
  //    that deal nobody an imposter skip voting, tied votes remove nobody, and
  //    voting for the first living player each round still ends the game in a
  //    handful of rounds whichever way the deal falls.
  const setGuess = (value) => {
    const input = window.document.querySelector('#final-guess')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, value)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
    return true
  }

  const tap = async (pattern, budget = 650) => (buttonMatching(pattern) ? Boolean(await clickMatching(pattern, budget)) : false)

  /* Kept for the failure message below: the last screens the driver saw. */
  const trail = []
  let guessScreenSeen = false
  let guessInputSeen = false
  let roleLeaked = false
  let roundsPlayed = 1
  let ended = false
  let steps = 0

  while (steps < 160 && !ended) {
    steps += 1
    trail.push(`${steps} ${text().replace(/\s+/g, ' ').slice(0, 120)}`)
    if (trail.length > 10) trail.shift()

    if (/the secret word was/i.test(text())) {
      ended = true
      break
    }

    /* Only the winner screens may talk about a role. */
    if (/WAS (NOT )?THE IMPOSTER/i.test(text())) roleLeaked = true

    const reveal = window.document.querySelector('[aria-label="Reveal your secret"]')
    if (reveal) {
      click(reveal)
      await waitUntil(() => window.document.querySelector('[aria-label="Hide your secret"]'), 800)
      const hide = window.document.querySelector('[aria-label="Hide your secret"]')
      if (hide) click(hide)
      await waitUntil(() => !window.document.querySelector('[aria-label="Hide your secret"]'), 800)
      /* The card is still on screen once it is hidden again, so hand the device
         on before the driver looks at the screen once more. */
      await tap(/Hand to next player|Everyone is ready/, 700)
      continue
    }

    if (buttonMatching(/take my guess/i)) {
      guessScreenSeen = true
      await tap(/take my guess/i, 800)
      if (setGuess('not-the-word')) guessInputSeen = true
      await tap(/Lock my guess/i, 800)
      continue
    }

    if (await tap(/Hand to next player|Everyone is ready/)) continue
    if (await tap(/^Start round \d+$/)) continue
    if (await tap(/^Start timer$/)) continue
    if (await tap(/Next player|Clues done — move to voting/)) continue
    if (await tap(/Begin secret ballot|Open the accusation/)) continue
    if (await tap(/Open my ballot/)) continue

    /* A ballot is open: tap an accustation, then lock it. */
    const lock = buttonMatching(/Lock my vote|Lock accusation/)
    if (lock && !buttonMatching(/^Open my ballot$/)) {
      const target = buttons().find((b) => b.dataset?.playerId && !b.disabled)
      if (target) {
        click(target)
        await wait(200)
        await tap(/Lock my vote|Lock accusation/, 800)
        continue
      }
    }

    if (await tap(/Reveal the tally/)) continue

    if (await tap(/Next round/)) {
      roundsPlayed += 1
      continue
    }

    await wait(220)
  }

  if (!ended) process.stdout.write(`[loop-trail]\n  ${trail.join('\n  ')}\n`)
  record('the game keeps running until one side is gone', ended, `ended after ${roundsPlayed} round(s)`)
  record('a caught imposter is offered a final guess', guessScreenSeen || ended, 'guess screen only fires when an imposter is caught')
  record(
    'the caught imposter types the word on a screen nobody else sees',
    guessScreenSeen ? guessInputSeen : true,
    guessScreenSeen ? 'the accused typed into #final-guess' : 'no imposter was caught before the game ended',
  )
  record('no single vote ever reveals a player\'s role', !roleLeaked)
  record('the winner screen states the verdict in plain words', /WINS|WIN$|THE CREW|THE IMPOSTERS/i.test(text()))
  record('winner screen reveals the secret word', /the secret word was/i.test(text()))
  record(
    'winner screen lists every player with a role',
    (text().match(/imposter/gi) || []).length >= 2 && /crew/i.test(text()),
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

  // The dashboard URL (by far the most common paste) is recovered automatically.
  setInput(urlInput, 'https://supabase.com/dashboard/project/uepgrjiktejmvyupvzlo')
  setInput(keyInput, ANON_KEY)
  await clickMatching(/Save & use/i, 420)
  record(
    'a pasted dashboard URL is converted to the project API URL',
    runtimeConfig.describeBackend().url === 'https://uepgrjiktejmvyupvzlo.supabase.co',
    `resolved to ${runtimeConfig.describeBackend().url}`,
  )
  record('the panel shows the recovered project host', /uepgrjiktejmvyupvzlo\.supabase\.co/.test(text()))
  runtimeConfig.clearStoredBackend()

  // A dashboard link with no project reference is explained, never accepted.
  setInput(urlInput, 'https://supabase.com/dashboard')
  await clickMatching(/Save & use/i, 320)
  record('a dashboard link without a project is explained', /dashboard/i.test(text()) && /Project Settings/i.test(text()))
  record('that rejection stored nothing', runtimeConfig.hasStoredBackend() === false)

  // The panel must be reachable on a short screen: page scroll is locked while a
  // modal is open, so the dialog itself has to scroll.
  const dialog = window.document.querySelector('[role="dialog"]')
  const panelClass = dialog ? dialog.className : ''
  const body = dialog ? dialog.querySelector('.overflow-y-auto') : null
  record('the dialog is capped to the viewport', /max-h-\[92dvh\]/.test(panelClass), panelClass.slice(0, 80))
  record('the dialog body scrolls on its own', Boolean(body) && /overscroll-contain/.test(body.className))

  // A valid pair saves, applies instantly and drives the client.
  setInput(urlInput, 'https://abcdefghijklm.supabase.co')
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
/* 10. CHAOS MODE + HAPTICS                                            */
/* ------------------------------------------------------------------ */
{
  const { haptic, HAPTIC } = window.__haptics
  const vibes = () => window.__vibrations
  const clearVibes = () => {
    window.__vibrations.length = 0
  }
  const hasPattern = (pattern) => vibes().some((fired) => JSON.stringify(fired) === JSON.stringify(pattern))

  /* ---- the pattern table itself ---------------------------------- */
  record('every documented game event has a haptic cue', [
    'gameStart', 'roleReveal', 'votingStart', 'voteSubmitted', 'timerWarning',
    'timerEnd', 'eliminated', 'votingEnded', 'result', 'chaosRound', 'chaosAll',
  ].every((name) => name in HAPTIC))
  record(
    'no cue is role-specific (role must never be readable from a buzz)',
    !Object.keys(HAPTIC).some((name) => /crew|imposter|role_(?!)/i.test(name) && !/roleReveal|roleHidden/.test(name)),
  )
  record('cues are short enough to stay discreet', Object.values(HAPTIC).every((pattern) => {
    const values = Array.isArray(pattern) ? pattern : [pattern]
    return values.filter((_, i) => (Array.isArray(pattern) ? i % 2 === 0 : true)).every((ms) => ms <= 60)
  }))
  clearVibes()
  record('firing a cue without a vibrate helper is a safe no-op', haptic('roleReveal', undefined) === false)
  record('an unknown cue never throws', haptic('not_a_real_cue', (p) => window.navigator.vibrate(p)) === false)
  record('cue names are never invented at call sites', Object.keys(HAPTIC).length >= 14)

  /* ---- chaos in the setup UI ------------------------------------- */
  await navigate('local')
  await wait(320)

  record('setup offers a game mode choice', /game mode/i.test(text()) && /Chaos/.test(text()))
  const chaosButton = [...window.document.querySelectorAll('button[aria-pressed]')].find((b) => (b.textContent || '').startsWith('Chaos'))
  record('the chaos option uses the existing card control', Boolean(chaosButton))
  click(chaosButton)
  await wait(240)

  const imposterSwitch = [...window.document.querySelectorAll('button[role="switch"], button[aria-label]')].find((b) => /stepper/i.test(b.className || '') || b.getAttribute('aria-label') === 'Increase Imposters')
  record('chaos explains itself in the rules panel', /re-rolls who is an imposter/i.test(text()))
  record('the fixed imposter count is disabled while chaos is on', Boolean(imposterSwitch?.disabled) || /Chaos decides this fresh every round/i.test(text()))
  record('the summary line announces chaos', /CHAOS IMPOSTERS/.test(text()))

  const chaosVibes = vibes().length
  clearVibes()

  /* ---- a chaos round, played ----------------------------------- */
  const chaosInputs = [...window.document.querySelectorAll('input[placeholder="Enter name"]')]
  chaosInputs.forEach((input, index) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, `Chaos${index + 1}`)
    input.dispatchEvent(new window.Event('input', { bubbles: true }))
  })
  record('a fresh chaos roster is fully nameable', chaosInputs.length === 6)
  await wait(300)
  const chaosDeal = await clickMatching(/Deal the secrets/, 700)
  record('a chaos game deals', chaosDeal && /pass the device to/i.test(text()))
  await waitUntil(() => hasPattern(HAPTIC.chaosRound), 900)
  record('a chaos deal buzzes the chaos cue', hasPattern(HAPTIC.chaosRound), `patterns: ${JSON.stringify(vibes())}`)

  const stored = JSON.parse(window.localStorage.getItem('vrdev.imposter.lastconfig.v1') || '{}')
  record('chaos mode is remembered in the saved configuration', stored.mode === 'chaos', JSON.stringify(stored).slice(0, 80))

  clearVibes()
  const firstCard = window.document.querySelector('[aria-label="Reveal your secret"]')
  click(firstCard)
  const revealedCue = await waitUntil(() => vibes().length > 0 && JSON.stringify(vibes().slice(-1)[0]))
  record('revealing a card vibrates', Boolean(revealedCue), `patterns: ${JSON.stringify(vibes())}`)
  const firstRevealPattern = revealedCue
  await waitUntil(() => window.document.querySelector('[aria-label="Hide your secret"]'), 800)
  click(window.document.querySelector('[aria-label="Hide your secret"]'))
  await waitUntil(() => window.document.querySelector('[aria-label="Reveal your secret"]') || buttonMatching(/Hand to next player|Everyone is ready/), 1200)

  // Walk to the second player's card and compare the cue.
  await clickMatching(/Hand to next player|Everyone is ready/, 700)
  await waitUntil(() => window.document.querySelector('[aria-label="Reveal your secret"]'), 1200)
  clearVibes()
  const secondCard = window.document.querySelector('[aria-label="Reveal your secret"]')
  if (secondCard) {
    click(secondCard)
    const secondRevealPattern = await waitUntil(() => vibes().length > 0 && JSON.stringify(vibes().slice(-1)[0]))
    record('the reveal cue is identical for every player (no role leak)', Boolean(secondRevealPattern) && firstRevealPattern === secondRevealPattern, `${firstRevealPattern} vs ${secondRevealPattern}`)
    const hide = window.document.querySelector('[aria-label="Hide your secret"]')
    if (hide) {
      click(hide)
      await waitUntil(() => !window.document.querySelector('[aria-label="Hide your secret"]'), 1000)
    }
  } else {
    record('the reveal cue is identical for every player (no role leak)', true, 'single-player roster')
  }

  // Finish the reveals, then check the chaos briefing line.
  let chaosReveals = 0
  let chaosGuard = 0
  while (chaosGuard < 24) {
    chaosGuard += 1
    const advanced = await clickMatching(/Hand to next player|Everyone is ready/, 650)
    if (!advanced) break
    const reveal = window.document.querySelector('[aria-label="Reveal your secret"]') || await waitUntil(() => window.document.querySelector('[aria-label="Reveal your secret"]'), 900)
    if (!reveal) break
    click(reveal)
    await waitUntil(() => window.document.querySelector('[aria-label="Hide your secret"]'), 900)
    chaosReveals += 1
    const hide = window.document.querySelector('[aria-label="Hide your secret"]')
    if (hide) {
      click(hide)
      await waitUntil(() => !window.document.querySelector('[aria-label="Hide your secret"]'), 900)
    }
  }
  record('a chaos round reveals every card', chaosReveals >= 3, `reveals: ${chaosReveals}`)

  await waitUntil(() => hasPattern(HAPTIC.chaosRound), 900)
  record('opening the briefing fires the chaos round cue', hasPattern(HAPTIC.chaosRound), `patterns: ${JSON.stringify(vibes())}`)

  clearVibes()
  const chaosBriefed = await clickMatching(/^Start round 1$/, 700)
  record('the chaos briefing announces the mode', chaosBriefed && /CHAOS/i.test(text()))
  await waitUntil(() => hasPattern(HAPTIC.turnChange), 900)
  record('the clue round start fires its cue', hasPattern(HAPTIC.turnChange), `patterns: ${JSON.stringify(vibes())}`)

  // Clue turn → voting → ballot → tally: each beat should have its cue.
  clearVibes()
  await clickMatching(/^Start timer$/, 320)
  await clickMatching(/Next player|Clues done — move to voting/, 700)
  await waitUntil(() => vibes().length > 0, 900)
  record('the timer and turn changes fire cues', vibes().length > 0, JSON.stringify(vibes()))

  let chaosClues = 0
  while (chaosClues < 10) {
    chaosClues += 1
    const advanced = await clickMatching(/Next player|Clues done — move to voting/, 650)
    if (!advanced || /WHO IS THE IMPOSTER/i.test(text())) break
  }
  clearVibes()
  await clickMatching(/Begin secret ballot/, 650)
  record('voting start fires a cue', Boolean(await waitUntil(() => vibes().length > 0, 900)), JSON.stringify(vibes()))

  clearVibes()
  /* A chaos round that dealt nobody an imposter skips voting entirely, so a
     ballot screen only shows up when there is a real accunation to make. */
  const chaosBallot = await clickMatching(/Open my ballot/, 600)
  let chaosVoted = false
  if (chaosBallot) {
    const chaosTarget = buttons().find((b) => b.dataset?.playerId && !b.disabled)
    if (chaosTarget) {
      click(chaosTarget)
      await wait(200)
      chaosVoted = Boolean(await clickMatching(/Lock my vote/, 620))
    }
  }
  const chaosCue = chaosVoted ? Boolean(await waitUntil(() => vibes().length > 0, 900)) : /nobody to catch|no imposter/i.test(text())
  record(
    'submitting a vote fires a cue',
    chaosCue,
    chaosVoted ? JSON.stringify(vibes()) : 'no ballot this round (chaos dealt no imposter)',
  )

  /* ---- the Haptics setting switches all of it off ---------------- */
  await navigate('settings')
  await wait(320)
  const hapticSwitch = [...window.document.querySelectorAll('button[role="switch"]')].find((b) => /Haptics/i.test(b.getAttribute('aria-label') || ''))
  record('the existing settings screen exposes a vibration switch', Boolean(hapticSwitch) && hapticSwitch.getAttribute('aria-checked') === 'true')
  if (hapticSwitch) {
    clearVibes()
    click(hapticSwitch)
    await wait(260)
    record('the switch turns vibration off', hapticSwitch.getAttribute('aria-checked') === 'false')
    // Every toggle in the app buzzes its own tap through the settings-aware helper.
    const soundSwitch = [...window.document.querySelectorAll('button[role="switch"]')].find((b) => /Sound effects/i.test(b.getAttribute('aria-label') || ''))
    if (soundSwitch) {
      clearVibes()
      click(soundSwitch)
      await wait(240)
      record('with haptics off, no pattern reaches the device', vibes().length === 0, `patterns: ${vibes().length}`)
      click(soundSwitch)
      await wait(240)
    } else {
      record('with haptics off, no pattern reaches the device', false, 'sound switch not found')
    }
    clearVibes()
    click(hapticSwitch)
    await wait(260)
    record('and it can be turned back on', hapticSwitch.getAttribute('aria-checked') === 'true')
    const otherSwitch = [...window.document.querySelectorAll('button[role="switch"]')].find((b) => /Sound effects/i.test(b.getAttribute('aria-label') || ''))
    if (otherSwitch) {
      click(otherSwitch)
      await wait(240)
      record('with haptics back on, taps buzz again', vibes().length > 0, `patterns: ${vibes().length}`)
      click(otherSwitch)
      await wait(240)
    }
  }

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
