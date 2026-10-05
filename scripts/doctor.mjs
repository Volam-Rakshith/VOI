#!/usr/bin/env node
/**
 * doctor — pre-flight check for a build that is about to be deployed.
 *
 * Catches the failure mode where a host serves the *source* tree instead of the
 * built `dist/` folder: that leaves the browser unable to execute the app
 * (module scripts refuse non-JS MIME types), which historically showed up as a
 * permanent "LOADING" screen.
 *
 * Usage:  node scripts/doctor.mjs        (or: npm run doctor)
 * Exit:   0 = deployable, 1 = problems found.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(process.cwd())
const dist = join(root, 'dist')

let failures = 0
let warnings = 0

const ok = (label, detail = '') => console.log(`  \u001b[32m✓\u001b[0m ${label}${detail ? ` \u001b[90m${detail}\u001b[0m` : ''}`)
const fail = (label, hint = '') => {
  failures += 1
  console.log(`  \u001b[31m✗\u001b[0m ${label}${hint ? `\n      \u001b[33m→ ${hint}\u001b[0m` : ''}`)
}
const warn = (label, hint = '') => {
  warnings += 1
  console.log(`  \u001b[33m!\u001b[0m ${label}${hint ? `\n      \u001b[90m${hint}\u001b[0m` : ''}`)
}
const section = (title) => console.log(`\n\u001b[35m${title}\u001b[0m`)

/* ── 1. The build exists ──────────────────────────────────────────────────── */
section('BUILD OUTPUT')
if (!existsSync(dist)) {
  fail('dist/ is missing', 'Run: npm run build')
  console.log('\n\u001b[31mCannot continue without a build.\u001b[0m\n')
  process.exit(1)
}
ok('dist/ exists')

const required = ['index.html', '404.html', '.nojekyll', 'manifest.webmanifest', 'sw.js']
for (const name of required) {
  if (existsSync(join(dist, name))) ok(`${name} present`)
  else if (name === 'sw.js' || name === 'manifest.webmanifest') warn(`${name} missing`, 'PWA install / offline shell will be unavailable.')
  else fail(`${name} missing`, name === '404.html' ? 'Deep links would 404 on a static host.' : 'Rebuild — the Pages config plugin did not run.')
}

const assetsDir = join(dist, 'assets')
if (existsSync(assetsDir) && readdirSync(assetsDir).length) ok('assets/ populated', `${readdirSync(assetsDir).length} files`)
else fail('assets/ is empty or missing', 'Run: npm run build')

/* ── 2. index.html points at the BUNDLE, not the source ───────────────────── */
section('ENTRY POINT')
const html = readFileSync(join(dist, 'index.html'), 'utf8')

if (/\/src\/main\.jsx/.test(html)) {
  fail(
    'dist/index.html still references /src/main.jsx',
    'This is the raw Vite dev entry. Browsers cannot execute .jsx (wrong MIME type) — the page will hang on "Loading". Deploy the built dist/, not the repo root.',
  )
} else {
  ok('no dev source reference in dist/index.html')
}

const moduleTags = [...html.matchAll(/<script[^>]*type="module"[^>]*src="([^"]+)"/g)].map((m) => m[1])
if (moduleTags.length) ok(`bundle referenced`, moduleTags.join(', '))
else fail('no module bundle referenced in dist/index.html', 'Rebuild the project.')

/* ── 3. Relative paths (GitHub Pages subpath safety) ──────────────────────── */
section('ASSET PATHS')
const badAbsolutes = moduleTags.filter((src) => src.startsWith('/'))
if (badAbsolutes.length) {
  fail(
    `absolute asset path(s): ${badAbsolutes.join(', ')}`,
    'These break when hosted under /repository-name/. Rebuild with the default base ("./") or set VITE_BASE_PATH=/your-repo/.',
  )
} else {
  ok('bundle paths are relative (works at /, /repo/ and file://)')
}

// Every local asset the HTML asks for must exist on disk.
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
  .map((m) => m[1])
  .filter((u) => !/^(https?:|data:|mailto:|#)/.test(u))
let missing = []
for (const ref of refs) {
  const clean = ref.split('?')[0].split('#')[0].replace(/^\.\//, '')
  if (!clean || clean === '/') continue
  const target = clean.startsWith('/') ? join(dist, clean) : join(dist, clean)
  if (!existsSync(target)) missing.push(ref)
}
if (missing.length) fail(`${missing.length} referenced file(s) not found: ${missing.join(', ')}`, 'The build is incomplete.')
else ok(`all ${refs.length} local asset references resolve`)

/* ── 4. Foldered asset graph (icons, fonts, chunks) ───────────────────────── */
const entryChunks = moduleTags.map((src) => join(dist, src.replace(/^\.\//, ''))).filter((p) => existsSync(p))
if (entryChunks.length) {
  // Only true module specifiers ("from \"./X.js\"" / import("./X.js")) count —
  // bare strings like "sw.js" or "Node.js" appear in copy and are not imports.
  const missingChunks = []
  const seen = new Set()
  for (const chunkPath of entryChunks) {
    const code = readFileSync(chunkPath, 'utf8')
    const dir = join(chunkPath, '..')
    const specifiers = [...code.matchAll(/(?:from|import)\s*\(?\s*["'`](\.\/[A-Za-z0-9._-]+\.(?:js|css|woff2))["'`]/g)].map((m) => m[1])
    for (const rel of new Set(specifiers)) {
      const name = rel.replace(/^\.\//, '')
      seen.add(name)
      if (!existsSync(join(dir, name)) && !existsSync(join(dist, 'assets', name))) missingChunks.push(name)
    }
  }
  if (missingChunks.length) fail(`${missingChunks.length} lazy asset(s) missing: ${missingChunks.join(', ')}`)
  else ok('lazy chunk imports resolve', `${seen.size} split chunks`)
}

// Fonts and images referenced from CSS must exist too (a missing font silently
// degrades the whole visual identity).
const cssFiles = existsSync(assetsDir) ? readdirSync(assetsDir).filter((f) => f.endsWith('.css')) : []
let cssRefs = 0
const missingCss = []
for (const css of cssFiles) {
  const code = readFileSync(join(assetsDir, css), 'utf8')
  for (const m of code.matchAll(/url\(\s*(?:"|')?(\.\/[A-Za-z0-9._/-]+\.(?:woff2?|png|svg|jpg|jpeg))(?:"|')?\s*\)/g)) {
    const name = m[1].replace(/^\.\//, '')
    cssRefs += 1
    if (!existsSync(join(assetsDir, name))) missingCss.push(name)
  }
}
if (missingCss.length) fail(`${missingCss.length} CSS-referenced asset(s) missing: ${[...new Set(missingCss)].join(', ')}`)
else ok('CSS asset references resolve', `${cssRefs} reference(s) across ${cssFiles.length} stylesheet(s)`)

/* ── 5. Secrets must never ship ───────────────────────────────────────────── */
section('SECRETS')
const scanTargets = [join(dist, 'index.html'), ...entryChunks].filter((f) => existsSync(f))
const bundleText = scanTargets.map((f) => readFileSync(f, 'utf8')).join('\n')

if (/VRdevVOLAMrakshith/.test(bundleText)) {
  fail('admin passphrase found in the shipped bundle', 'Remove it from source and rebuild (rotate the passphrase too).')
} else {
  ok('no admin passphrase in the shipped bundle')
}

// A real service-role key is the one thing that must never be in a client
// bundle. The literal identifier "service_role" is not a secret — it appears in
// validation code — so decode every JWT-looking token and check its payload.
const jwts = [...new Set((bundleText.match(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) || []))]
const roles = jwts
  .map((token) => {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
      return payload?.role || 'unknown'
    } catch {
      return 'unreadable'
    }
  })
  .filter(Boolean)

if (roles.includes('service_role')) {
  fail('a service-role key is baked into the bundle', 'Rotate that key immediately, then use only the anon / publishable key.')
} else if (roles.some((role) => role !== 'anon' && role !== 'authenticated')) {
  warn(`bundle contains JWT(s) with unexpected role: ${[...new Set(roles)].join(', ')}`, 'Confirm these are public client keys.')
} else if (roles.length) {
  ok('only anon-role keys are baked in', `${roles.length} public key(s)`)
} else {
  ok('no keys baked into the bundle')
}

if (/SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey\s*:/.test(bundleText)) {
  fail('a service-role environment variable is referenced in client code', 'Server-only credentials must never be read by the browser bundle.')
} else {
  ok('no service-role variable referenced in client code')
}

/* ── 5b. Runtime backend config ───────────────────────────────────────────── */
section('RUNTIME CONFIG')
const runtimeFile = join(dist, 'runtime-config.json')
if (existsSync(runtimeFile)) {
  try {
    const text = readFileSync(runtimeFile, 'utf8').replace(/^\uFEFF/, '')
    const cleaned = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
      .replace(/,(\s*[}\]])/g, '$1')
    const parsed = JSON.parse(cleaned)
    const url = String(parsed.supabaseUrl ?? parsed.VITE_SUPABASE_URL ?? parsed.url ?? '').trim()
    const key = String(parsed.supabaseAnonKey ?? parsed.VITE_SUPABASE_ANON_KEY ?? parsed.anonKey ?? '').trim()
    if (!url && !key) ok('runtime-config.json ships empty (falls back to in-app / build values)')
    else if (!url || !key) fail('runtime-config.json has only one of the two values', 'Set both, or clear both.')
    else if (/YOUR-|xxx|example\.com|placeholder/i.test(`${url}${key}`)) warn('runtime-config.json still contains placeholder values', 'Online mode will ignore it until real values are set.')
    else ok('runtime-config.json parses with usable values', url)
  } catch (error) {
    fail(`runtime-config.json is not valid JSON (${error.message})`, 'Fix the file — a broken config file is ignored at runtime.')
  }
} else {
  warn('runtime-config.json not found in dist/', 'Optional: publish one to configure the backend without rebuilding.')
}

/* ── 6. Config hygiene ────────────────────────────────────────────────────── */
section('CONFIG')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
ok('scripts', Object.keys(pkg.scripts || {}).join(', '))

const viteConfig = existsSync(join(root, 'vite.config.js')) ? readFileSync(join(root, 'vite.config.js'), 'utf8') : ''
if (/base\s*:/.test(viteConfig)) ok('vite base is configured (env-overridable)')
else warn('no explicit base in vite.config.js')

if (existsSync(join(root, '.env'))) {
  warn('.env present in the working tree', 'Fine locally — just never commit it (.gitignore already excludes it).')
}

const unbuilt = existsSync(join(root, 'index.html')) && /\/src\/main\.jsx/.test(readFileSync(join(root, 'index.html'), 'utf8'))
if (unbuilt) {
  warn(
    'source index.html is a dev entry (expected)',
    'Never publish the repo root as a website — publish dist/ (Actions workflow) or the gh-pages branch.',
  )
}

/* ── Summary ──────────────────────────────────────────────────────────────── */
console.log('')
if (failures === 0) {
  console.log(`\u001b[32m✓ Deployable.\u001b[0m ${warnings ? `${warnings} warning(s) — none blocking.` : ''} Upload dist/ as-is.\n`)
  process.exit(0)
}
console.log(`\u001b[31m✗ ${failures} problem(s) found${warnings ? `, ${warnings} warning(s)` : ''}.\u001b[0m Fix the items above, then re-run: npm run doctor\n`)
process.exit(1)
