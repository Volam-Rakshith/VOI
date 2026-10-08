#!/usr/bin/env node
/**
 * live-check.mjs — "would a player's phone connect right now?"
 *
 * Takes the REAL published runtime-config.json from the live site, hands it to
 * the real app the same way a browser would (window.fetch), boots it in jsdom
 * and looks at what the Online screen actually renders. This is the exact path
 * that has been failing for players; if this says CONNECTED, the deployed build
 * will connect on a real device.
 */

import { build } from 'esbuild'
import { JSDOM, VirtualConsole } from 'jsdom'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

/*
 * By default this checks the file this package SHIPS (public/runtime-config.json)
 * — the one that lands next to index.html on deploy. Pass `--live` to fetch the
 * copy currently served by GitHub Pages instead, which is how you catch a stale
 * or accidentally-emptied published file.
 */
const useLive = process.argv.includes('--live')
const LIVE = 'https://volam-rakshith.github.io/VOI/runtime-config.json'
const live = useLive
  ? await fetch(LIVE).then((r) => r.text())
  : await (await import('node:fs/promises')).readFile('public/runtime-config.json', 'utf8')
console.log(`checking the ${useLive ? 'LIVE (GitHub Pages)' : 'SHIPPED (public/runtime-config.json)'} file:`)
console.log(' ', live.replace(/\s+/g, ' ').slice(0, 170), '\n')

const outDir = path.resolve('.livecheck')
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
  import * as runtimeConfig from '${path.resolve('src/lib/runtimeConfig.js').replace(/\\/g, '/')}'
  import * as supabaseLib from '${path.resolve('src/lib/supabase.js').replace(/\\/g, '/')}'
  window.__backend = { runtimeConfig, supabaseLib }
  window.__mount = () => {
    createRoot(document.getElementById('root')).render(
      React.createElement(RouterProvider, null,
        React.createElement(SettingsProvider, null,
          React.createElement(WordBankProvider, null,
            React.createElement(ToastProvider, null,
              React.createElement(App, null))))))
  }
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

const virtualConsole = new VirtualConsole()
virtualConsole.on('jsdomError', (e) => {
  if (!/Not implemented/.test(e.message)) console.log('[jsdom-error]', e.message)
})

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="boot">Loading</div><div id="root"></div></body></html>', {
  url: 'https://volam-rakshith.github.io/VOI/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  virtualConsole,
})
const { window } = dom

window.matchMedia =
  window.matchMedia ||
  ((q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }))
window.scrollTo = () => {}
if (!window.requestAnimationFrame) window.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16)
window.HTMLCanvasElement.prototype.getContext = () => new Proxy({}, { get: () => () => {} })

/* THE point of this check: the page can fetch runtime-config.json, and nothing
   is saved on the device. Every other URL (Supabase REST/WS) is refused, which
   is correct here — we only care about configuration, not live calls. */
let configFetches = 0
window.fetch = async (url) => {
  const target = String(url)
  if (target.includes('runtime-config.json')) {
    configFetches += 1
    return { ok: true, text: async () => live, status: 200 }
  }
  throw new Error(`network refused in this check: ${target}`)
}

const { readFileSync } = await import('node:fs')
const bundleSource = readFileSync(bundlePath, 'utf8')
window.eval(bundleSource)
window.__mount()

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const text = () => window.document.body.textContent || ''
const goOnline = () => {
  window.location.hash = '#/online'
  window.dispatchEvent(new window.HashChangeEvent('hashchange'))
}

await wait(2400) // splash
goOnline()
await wait(900)

console.log('--- what the Online screen shows on a fresh device ---')
console.log(text().replace(/\s+/g, ' ').slice(0, 320), '\n')

const status = window.__backend.runtimeConfig.describeBackend()
console.log('--- resolved configuration ---')
console.log('source     :', status.source, '/', status.sourceLabel)
console.log('project    :', status.url, '|', status.host)
console.log('configured :', status.configured)
console.log('client     :', window.__backend.supabaseLib.isOnlineConfigured() ? 'CREATED' : 'none')
console.log('config fetched from the live file:', configFetches > 0 ? 'yes' : 'NO')
console.log()

const connected = /Create room/i.test(text()) && /Join room/i.test(text()) && !/I'm the organiser/i.test(text())
console.log(connected ? '✓ CONNECTED — a fresh device joins straight away, nothing to paste.' : '✗ still not connected')

process.exit(connected ? 0 : 1)
