# IMPOSTER

**A cinematic social deduction party game — by VR DEVELOPMENTS**

> Give one clue. Find the imposter before they find you.
> One device in the middle of the table, or every player on their own phone.

Built as a **100% static, backend-free web app**: no server, no paid hosting, no accounts.
Local pass & play works offline. Online rooms are optional and run on a free Supabase project.

---

## Table of contents

1. [Feature tour](#feature-tour)
2. [Quick start](#quick-start)
3. [Project structure](#project-structure)
4. [Game rules](#game-rules)
5. [Online rooms: Supabase setup](#online-rooms-supabase-setup)
6. [Deploying to GitHub Pages](#deploying-to-github-pages)
7. [The BLACK BOX admin panel](#the-black-box-admin-panel)
8. [Configuration reference](#configuration-reference)
9. [Security notes (read this)](#security-notes-read-this)
10. [Testing](#testing)
11. [Accessibility & performance](#accessibility--performance)
12. [Troubleshooting](#troubleshooting)

---

## Feature tour

### Two ways to play

| Mode | Devices | Players | Needs internet |
| --- | --- | --- | --- |
| **Pass & Play** | One phone/tablet passed around | 2–20 | No — fully offline |
| **Online Room** | One device per player | 3–20 | Yes (Supabase) |

### Everything included

- **Cinematic splash** with glow, blur, glitch and a neon sweep (≈1.6 s), then a smooth hand-off to the menu.
- **Cyberpunk × synthwave HUD**: deep violet `#0B001A`, neon cyan/purple/magenta, glassmorphism, clipped corners, grain, animated particle field that reacts to pointer and device tilt.
- **3D secret cards** with real perspective, pointer-tracked glare, shimmer sweep, and a hard rule: the card is only readable while it is flipped.
- **Configurable rounds**: 2–20 players, 1–9 imposters (always a strict minority), 15/30/45/60/90 s turns, category + difficulty selection, secret ballots or a single open accusation, and two win rules (*Classic* / *Manhunt*).
- **Circular countdown ring** with escalating states — warning at 10 s, critical pulse at 5 s, time-up flare at 0.
- **Dramatic reveals**: vote tallies animate bar by bar, the accused player's role lands with a burst, winners get confetti or a glitch-shake takeover.
- **Online rooms** with 4-character codes from an unambiguous alphabet (`A7KQ`-style), live lobby, ready states, host controls, host migration, reconnection, refresh-safe seats and a synced shared timer.
- **BLACK BOX** — a hidden admin layer: 3 taps in the top-right corner of the home screen, a passphrase prompt, then a command-centre dashboard with system status, full word-database CRUD, category management, room management and session controls.
- **Custom word engine** with 9 built-in categories (~150 words) across three difficulty tiers, plus import/export JSON, guarded reset-to-defaults and optional cloud sync.
- **Accessibility & comfort**: semantic markup, keyboard navigation, visible focus rings, ARIA labels, 0–2 “theme intensity”, reduced-motion support (system + in-app), optional haptics, and a sound engine built from pure Web Audio (no audio files, nothing autoplays).
- **PWA-ready & offline-capable**: web manifest, maskable icon, theme colour, safe-area handling, plus an optional
  service worker (production only) that keeps the app bootable with no connection at all — local pass & play genuinely
  works on a plane.
- **GitHub Pages ready**: hash routing, relative asset paths, automatic `404.html` fallback, optional Actions workflow.

---

## Quick start

```bash
# 1. install
npm install

# 2. run locally  →  http://localhost:5173
npm run dev

# 3. build a static bundle into dist/
npm run build

# 4. sanity check the production bundle
npm run preview
```

That is the whole setup for **pass & play**. Online rooms need the two Supabase values
described [below](#online-rooms-supabase-setup) — everything else works with zero configuration.

### Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server on `0.0.0.0:5173` (LAN + tunnel friendly) |
| `npm run build` | Production build → `dist/` (+ `404.html`, `.nojekyll`) |
| `npm run preview` | Serves the built `dist/` on `0.0.0.0:4173` |
| `npm run test` | Everything below, in one run |
| `npm run test:engine` | 50 rule/utility tests (roles, win conditions, validation, word bank, online tally math, error copy) |
| `npm run test:ui` | 36-check UI smoke test: mounts the app in jsdom and **plays a full round end to end** |
| `npm run deploy` | Builds and pushes `dist/` to a `gh-pages` branch |
| `node scripts/set-admin-password.mjs "new phrase"` | Rotates the BLACK BOX passphrase (prints a digest) |

---

## Project structure

```text
.
├── index.html                 # shell + pre-hydration boot plate (no white flash)
├── vite.config.js             # relative base, GH Pages 404 fallback, chunk splitting
├── tailwind.config.js         # design tokens, keyframes, neon palette
├── postcss.config.js
├── .env.example               # copy to .env for online rooms
├── public/
│   ├── manifest.webmanifest   # PWA manifest
│   └── icons/                 # SVG app icons (any + maskable)
├── supabase/
│   └── schema.sql             # tables, RLS policies, atomic RPC functions
├── scripts/
│   ├── engine-tests.mjs       # rule + utility test suite
│   ├── smoke-test.mjs         # headless full-round UI test
│   ├── set-admin-password.mjs # rotate the BLACK BOX passphrase
│   └── gh-pages-deploy.mjs    # one-command gh-pages deploy
├── .github/workflows/deploy.yml
└── src/
    ├── main.jsx               # providers + mount
    ├── App.jsx                # routes, splash, error boundary, Black Box gate
    ├── assets/fonts/          # self-hosted Orbitron + Rajdhani (offline capable)
    ├── styles/
    │   ├── index.css          # tokens, base layer, HUD component classes
    │   └── fonts.css
    ├── data/
    │   ├── constants.js       # BRAND, LIMITS, phases, routes, storage keys
    │   ├── defaults.js        # default config + sanitizers
    │   └── words.js           # built-in word database (3 tiers)
    ├── lib/
    │   ├── gameEngine.js      # ALL rules, pure functions, reducer
    │   ├── onlineGame.js      # online tally math + phase routing
    │   ├── onlineService.js   # room CRUD, RPC-first writes, realtime, error mapping
    │   ├── supabase.js        # client bootstrap + configuration detection
    │   ├── wordBank.js        # word bank CRUD, sanitising, selection
    │   ├── blackbox.js        # admin gate: salted digest, throttling, audit log
    │   ├── router.jsx         # tiny hash router (refresh-safe on Pages)
    │   ├── sound.js           # Web Audio synth cues
    │   └── confetti.js        # victory / defeat bursts (fault tolerant)
    ├── context/
    │   ├── SettingsContext.jsx
    │   ├── WordBankContext.jsx
    │   └── ToastContext.jsx
    ├── hooks/
    │   ├── useLocalGame.js    # pass & play state machine + timer
    │   └── useOnlineRoom.js   # online session, sync, reconnection, host duties
    ├── components/
    │   ├── ui/                # Button, Panel, Modal, Controls, Feedback, Layout, Logo, Footer
    │   ├── effects/           # AmbientBackground, SplashScreen
    │   ├── game/              # SecretCard, CountdownRing, PlayerBits, WinnerScreen, SetupScreen, LocalPhases
    │   ├── lobby/             # RoomCodeCard, PlayerList, OnlineSetup
    │   ├── online/            # OnlineSession, LobbyView, OnlineGamePhases, ConnectionBanner
    │   └── admin/             # BlackBoxGate, SystemStatus, WordManager, RoomManager, AdminSettings
    ├── pages/                 # Home, LocalGame, OnlineGame, Lobby, HowToPlay, Settings, BlackBox
    └── utils/                 # random (crypto), storage (safe), validate
```

Every rule lives in `src/lib/gameEngine.js` as a pure function — `createGame`, `assignRoles`,
`startRound`, `castVote`, `calculateVotes`, `determineWinner`, `resetGame` — so the UI never
contains game logic, and the same rules drive local *and* online play.

---

## Game rules

1. **Everyone gets a secret card.** The crew all receive the same word; the imposter receives
   `YOU ARE THE IMPOSTER` plus an optional *cover word* to bluff with.
2. **One clue each, in turn order.** A single word that proves you know the secret without
   handing it to the imposter. The timer keeps the table honest (and can be paused or reset).
3. **Debate, then vote.** Secret ballots are cast one device at a time and stay hidden until the
   tally; open accusation mode locks a single call for the whole table.
4. **Resolve the round.**

| Win rule | Crew wins when | Imposters win when |
| --- | --- | --- |
| **Classic** (one vote decides) | The vote lands on an imposter | The vote lands on a crew member, **or** the vote ties (nobody is accused) |
| **Manhunt** (multi-round) | Every imposter has been removed | Imposters equal the remaining crew, or they survive all rounds |

Imposters are always a strict minority: with *n* players you can have at most `floor((n-1)/2)`.
Role assignment uses `crypto.getRandomValues()` with rejection sampling and a Fisher–Yates
shuffle, never plain `Math.random()` alone.

---

## Online rooms: Supabase setup

Online mode is optional. It uses a free Supabase project — no server of your own, no paid tier.

### 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) and create a project (free).
2. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

### 2. Configure the client

```bash
cp .env.example .env
```

```dotenv
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

> These are **public** client values; they are meant to ship in a static bundle.
> Never put a `service_role` key in a `VITE_` variable — everything prefixed with `VITE_`
> ends up in the shipped JavaScript.

### 3. Create the database

Open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql)
and run it. That single script creates:

- `imposter_rooms` — one row per room (`room` = public state, `secrets` = per-player private state)
- `imposter_words` — the optional shared word database
- Row Level Security policies (rooms open to the anon role by design; shared **words are write-restricted to authenticated users**)
- Atomic RPC functions: `imposter_join_room`, `imposter_leave_room`, `imposter_set_ready`,
  `imposter_heartbeat`, `imposter_patch_room`, `imposter_set_secrets`, `imposter_submit_vote`,
  `imposter_terminate_room`, `imposter_sweep_expired`
- Realtime publication for the rooms table

### 4. Turn on realtime

Realtime is usually enabled by default. Confirm under **Database → Replication** that
`imposter_rooms` is in the `supabase_realtime` publication (the schema script adds it).
If your project has replication disabled entirely, enable it there.

### 5. Play

Rebuild (`npm run build`) or restart `npm run dev`, then:

- **Host**: `ONLINE ROOM → Create room` → share the 4-character code.
- **Everyone else**: `ONLINE ROOM → Join room` → name + code → ready up.
- The host starts the game; each device receives only **its own** secret.

Rooms auto-expire: if the atomic RPCs are present, every write extends the room's life, and
`BLACK BOX → ROOM MANAGEMENT → Sweep` closes stale rooms on demand. You can also schedule
`select imposter_sweep_expired();` with `pg_cron`.

---

## Deploying to GitHub Pages

### Option A — GitHub Actions (recommended)

1. Push this repository to GitHub.
2. **Settings → Pages → Source: GitHub Actions.**
3. Add repository secrets (optional, only for online mode):
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` → *Settings → Secrets and variables → Actions*.
4. Push to `main` (or run the workflow manually). The workflow runs the engine tests, builds,
   and publishes `dist/`.

### Option B — from your machine

```bash
npm run deploy
```

This builds `dist/`, commits it to a `gh-pages` branch and pushes. Then set
**Settings → Pages → Deploy from a branch → `gh-pages` / root**.

### Why it works under `/repository-name/`

- **Hash routing** (`#/local`, `#/lobby?room=A7KQ`). There is no history-based route to 404, so
  refreshing, deep-linking and the back button behave identically on a project page, a user page
  (`username.github.io`) and a custom domain.
- **Relative asset paths** (`base: './'`), so `assets/index-*.js` resolves under any sub-path.
  Prefer an absolute base? Build with `VITE_BASE_PATH=/repository-name/ npm run build`.
- **`404.html` is generated at build time** as a copy of `index.html`, so even a stray URL under
  `/repo/anything` boots the app instead of GitHub's 404 page.
- **`.nojekyll`** is emitted so Pages never runs the output through Jekyll.

Also safe for plain static hosts: Netlify, Cloudflare Pages, Vercel, S3, or `file://`.

---

## The BLACK BOX admin panel

1. On the home screen, tap the **top-right corner three times** (within ~1.4 s). There is no
   visible button — only a single faint dot after the second tap.
2. Enter the access phrase at the prompt.
3. The dashboard opens with four sections:

| Section | Contents |
| --- | --- |
| **SYSTEM STATUS** | Storage/RNG/network/Supabase checks, word counts per tier, build version, local audit log |
| **WORD DATABASE** | Create/read/update/delete words, category create/rename/delete, search, difficulty filter, tier chips, import/export JSON, reset to defaults |
| **ROOM MANAGEMENT** | Live rooms (code, host, players, status, phase), terminate with confirmation, sweep expired rooms |
| **SETTINGS** | Operator defaults, cloud word sync (push/pull), lock the session now, clear all local data |

The unlock lasts 30 minutes in the tab (`sessionStorage`) and the panel can be locked manually.
Failed attempts are throttled: 5 tries then a 60-second lockout, with every event written to a
local audit log.

### Rotating the access phrase

The passphrase is never stored in the source — only a salted SHA-256 digest is:

```bash
node scripts/set-admin-password.mjs "your new passphrase"
# → paste the printed DIGEST over the DIGEST constant in src/lib/blackbox.js
```

`npm run test:engine` includes a check that the passphrase string appears nowhere under `src/`.

---

## Configuration reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | For online rooms | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | For online rooms | Public anon key |
| `VITE_ROOM_TTL_MINUTES` | No (default `180`) | Idle lifetime for a room |
| `VITE_BASE_PATH` | No (default `./`) | Absolute asset base, e.g. `/my-repo/` |

User-facing settings (Settings screen, stored in `localStorage`):
sound · animations · reduced motion · haptics · imposter cover word · theme intensity (0–2).

---

## Security notes (read this)

This is an honest description of a static client-side app.

**What is genuinely protected**

- **Secrets are not broadcast.** The public room document contains players, phases, votes and
  results — never the secret word or the role assignment. Each device reads only its own slice of
  `secrets`, and the word is written at game start, not in the lobby.
- **Shared word writes need a real session.** `imposter_words` is publicly readable but writable
  only by an `authenticated` role, enforced by Row Level Security in Postgres — not by the client.
- **Writes are atomic.** Room mutations go through Postgres functions, so two players joining or
  voting simultaneously cannot overwrite each other.
- **No secrets in the repo.** The admin passphrase exists only as a salted digest; the public
  Supabase keys are public by design. Never put a `service_role` key in a `VITE_` variable.

**What is explicitly *not* protected**

- The **BLACK BOX gate is a convenience layer, not authentication.** A determined user with devtools
  can inspect or bypass client-side gating. It hides the panel and slows casual access — nothing more.
- Similarly, a player who reads the raw room row in devtools could inspect the `secrets` column.
  Keeping secrets out of the *public* document stops accidental leakage and ordinary curiosity; it is
  not cryptographic protection. If you need that, run your own server-side game logic — which this
  project deliberately avoids so it can be hosted for free.
- The anon role can create/update room rows. Rate-limit or add auth if you deploy this publicly at scale.

---

## Testing

```bash
npm run test          # runs both suites back to back

npm run test:engine   # 50 tests: role assignment, reveal lifecycle, timer, win conditions
                      # for both rulesets, illegal-move rejection, name/code/word validation,
                      # word-bank CRUD + import sanitising, online vote math and phase routing,
                      # user-facing error copy, plus a source scan proving the admin
                      # passphrase is not committed anywhere under src/

npm run test:ui       # 36 checks: bundles the real app with esbuild, mounts it in jsdom and
                      # plays a complete local round — deal → six reveals/hides → briefing →
                      # timer start/pause/reset → clues → secret ballot → tally → winner →
                      # play again — while also covering the splash hand-off, the hidden
                      # three-tap admin gesture, passphrase rejection/acceptance, the
                      # eight-step tutorial, the settings screen and every route fallback
```

The UI suite runs headless with no browser download — `jsdom` is the only extra dev dependency.

The UI test bundles the actual application with esbuild, so a broken import, a render crash, a
stuck phase transition or a broken route fails the run.

---

## Accessibility & performance

- Semantic landmarks, `aria-live` regions for toasts and status, `role="switch"`/`radiogroup`
  controls, labelled inputs, error text tied to fields via `aria-describedby`.
- Full keyboard support: cards flip with `Enter`/`Space`, modals trap focus and close on `Escape`,
  the segmented controls behave like radio groups, focus rings are always visible.
- `prefers-reduced-motion` is honoured automatically, and can be forced on in Settings — which
  disables particles, parallax, glitch, shake and confetti.
- Sound is off until a user interacts, and can be turned off entirely.
- Performance: one canvas rAF loop capped at ~45 fps with counts scaled by the intensity setting,
  transform/opacity-only animations, route-level code splitting, memoised context values,
  frame-rate-friendly springs, and no layout-thrashing loops.
- Targets are all ≥ 44 px with safe-area padding; layouts are checked from 320 px up to 1440 px+.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| “Online rooms need configuration” | Add `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` to `.env`, then restart the dev server / rebuild. |
| “The room database is not set up yet” | Run `supabase/schema.sql` in the SQL editor. |
| Lobby never updates on other devices | Enable Realtime and make sure `imposter_rooms` is in the `supabase_realtime` publication. |
| “That code contains a character we never use” | Room codes exclude `O I L 0 1 S Z 2 5` to avoid misreads — check the code again. |
| “GAME IN PROGRESS” | You can only join a running game by reusing the same name (that is the reconnect path). |
| Cloud word sync rejected | Expected: shared word writes require an authenticated Supabase session (RLS). |
| Blank page after deploying to Pages | Confirm the workflow/branch uploaded the `dist/` **contents** (index.html at the root) and hard-refresh. |
| Refreshing a deep link 404s on another host | That host lacks the `404.html` fallback; Pages and the bundled `dist/404.html` handle it automatically. |

---

## Credits & licensing

- Original game design, rules, UI, art direction, word database and code: **VR DEVELOPMENTS**.
- Inspired by the social-deduction party genre. No third-party game's branding, text, assets or
  proprietary implementation is copied or bundled.
- Only open-source libraries are used (React, Vite, Tailwind CSS, Framer Motion, canvas-confetti,
  `@supabase/supabase-js`), each under its own licence. Fonts (Orbitron, Rajdhani) are
  self-hosted under the SIL Open Font License.
- Supabase is optional and free-tier friendly; no paid services are required anywhere.

**IMPOSTER — Crafted with passion by VR DEVELOPMENTS.**
