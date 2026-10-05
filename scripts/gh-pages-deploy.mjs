#!/usr/bin/env node
/**
 * Optional one-command deploy to GitHub Pages (no extra tooling required).
 *
 *   npm run deploy
 *
 * It builds `dist/`, copies it into a throwaway worktree of the `gh-pages`
 * branch and pushes — the classic branch-based Pages setup.
 *
 * Prefer the GitHub Actions workflow in .github/workflows/deploy.yml if you
 * would rather not push a build artefact branch from your machine.
 *
 * Configure the remote with either:
 *   • git remote origin (as usual), or
 *   • GH_PAGES_REPO, GH_PAGES_USER, GH_PAGES_TOKEN env vars for CI.
 */

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const run = (args, options = {}) => execFileSync('git', args, { stdio: 'inherit', ...options })
const capture = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

const distDir = resolve('dist')
if (!existsSync(distDir)) {
  console.error('✗ dist/ not found. Run `npm run build` first (or just use `npm run deploy`, which builds for you).')
  process.exit(1)
}

/* Work out the remote to push to. */
let remote = 'origin'
if (process.env.GH_PAGES_REPO && process.env.GH_PAGES_USER) {
  remote = `https://${process.env.GH_PAGES_USER}:${process.env.GH_PAGES_TOKEN || ''}@github.com/${process.env.GH_PAGES_REPO}.git`
} else {
  try {
    capture(['remote', 'get-url', 'origin'])
  } catch {
    console.error('✗ No git remote named "origin". Add one, or set GH_PAGES_REPO + GH_PAGES_USER + GH_PAGES_TOKEN.')
    process.exit(1)
  }
}

let branch = 'gh-pages'
try {
  if (typeof process.env.GH_PAGES_BRANCH === 'string' && process.env.GH_PAGES_BRANCH) branch = process.env.GH_PAGES_BRANCH
} catch {
  /* keep default */
}

const stamp = new Date().toISOString()
const worktree = mkdtempSync(join(tmpdir(), 'imposter-gh-pages-'))

console.log(`→ publishing dist/ to "${branch}"`)
cpSync(distDir, worktree, { recursive: true })
writeFileSync(join(worktree, '.nojekyll'), '')
writeFileSync(join(worktree, 'DEPLOYED_AT.txt'), `${stamp}\nIMPOSTER by VR DEVELOPMENTS\n`)

try {
  run(['init', '-q'], { cwd: worktree })
  run(['checkout', '-q', '-b', branch], { cwd: worktree })
  run(['add', '-A'], { cwd: worktree })
  run(['-c', 'user.name=vr-developments', '-c', 'user.email=deploy@vrdev.local', 'commit', '-q', '-m', `deploy: IMPOSTER ${stamp}`], {
    cwd: worktree,
  })
  run(['push', '-f', remote, `${branch}:${branch}`], { cwd: worktree })
  console.log('\n✓ Deployed. GitHub Pages will publish within a minute.')
  console.log('  Enable it once under: Settings → Pages → Deploy from a branch → ' + branch)
} catch (error) {
  console.error('\n✗ Deploy failed:', error.message)
  process.exitCode = 1
} finally {
  rmSync(worktree, { recursive: true, force: true })
}
