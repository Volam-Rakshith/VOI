# VOTE OUT IMPOSTER

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

| Mode            | Devices                        | Players | Needs internet     |
| --------------- | ------------------------------ | ------- | ------------------ |
| **Pass & Play** | One phone/tablet passed around | 2–20    | No — fully offline |
| **Online Room** | One device per player          | 3–20    | Yes (Supabase)     |

Both support the same two assignment styles:

- **Normal** — a fixed number of imposters, always a strict minority, chosen once when the game starts.
- **Chaos** — _anyone can be an imposter._ Every round re-rolls the roles from scratch, so a round can
  have one imposter, several, or literally every player. Nothing is fixed and nobody is guaranteed to
  be crew. Replaying keeps the same players and settings but rolls a **brand-new** assignment — the
  previous one is never reused. Normal Mode is untouched by any of this.

### Everything included

- **Cinematic splash** with glow, blur, glitch and a neon sweep (≈1.6 s), then a smooth hand-off to the menu.
- **Cyberpunk × synthwave HUD**: deep violet `#0B001A`, neon cyan/purple/magenta, glassmorphism, clipped corners, grain, animated particle field that reacts to pointer and device tilt.
- **3D secret cards** with real perspective, pointer-tracked glare, shimmer sweep, and a hard rule: the card is only readable while it is flipped.
- **Endless rounds, one way to win**: 2–20 players, 1–9 imposters (strict minority in Normal Mode, or
  **Chaos Mode**, where one round in every 3–5 re-rolls who the imposters are — any number, up to and
  including everyone), 15/30/45/60/90 s turns, category + difficulty selection, and secret ballots or a
  single open accusation. The game runs until one side has nobody left, and a caught imposter always
  gets one guess at the crew's word first.
- **Circular countdown ring** with escalating states — warning at 10 s, critical pulse at 5 s, time-up flare at 0.
- **Dramatic reveals**: vote tallies animate bar by bar, the accused player's role lands with a burst, winners get confetti or a glitch-shake takeover.
- **One win rule**: crew win by removing the last imposter; imposters win at parity, by outlasting the crew, or by naming the word after being caught.
- **Online rooms** with 6-character codes from an unambiguous alphabet (`A7KQMN`-style — no O/0 or I/1 look-alikes), live lobby, ready states, host controls, host migration, reconnection, refresh-safe seats and a synced shared timer.
- **BLACK BOX** — a hidden admin layer: 3 taps in the top-right corner of the home screen, a passphrase prompt, then a command-centre dashboard with system status, full word-database CRUD, category management, room management and session controls.
- **Custom word engine** with 9 built-in categories (~150 words) across three difficulty tiers, plus import/export JSON, guarded reset-to-defaults and optional cloud sync.
- **Accessibility & comfort**: semantic markup, keyboard navigation, visible focus rings, ARIA labels, 0–2 “theme intensity”, reduced-motion support (system + in-app), optional **haptics** (vibration on deal, reveal, voting, vote
  cast, timer warning and the verdict — every cue is role-agnostic and identical for crew and imposters,
  so a buzz can never identify anyone), and a sound engine built from pure Web Audio (no audio files, nothing autoplays).
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

| Script                                             | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run dev`                                      | Vite dev server on `0.0.0.0:5173` (LAN + tunnel friendly)                                                                                                                                                                                                                                                                                                                                                                                                          |
| `npm run build`                                    | Production build → `dist/` (+ `404.html`, `.nojekyll`)                                                                                                                                                                                                                                                                                                                                                                                                             |
| `npm run preview`                                  | Serves the built `dist/` on `0.0.0.0:4173`                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `npm run test`                                     | Everything below, in one run                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `npm run test:engine`                              | 167 rule/utility tests (roles + chaos cadence and rolls, last-team-standing and the caught-imposter guess loop, no-role-leak invariants, word bank incl. hints and decoy relevance, online tally math, secret plumbing, error copy, backend config + URL recovery)                                                                                                                                                                                                 |
| `npm run doctor`                                   | Pre-deploy audit of `dist/`: entry point, relative paths, code-split chunks, fonts, and a secrets scan                                                                                                                                                                                                                                                                                                                                                             |
| `npm run test:ui`                                  | 149-check UI smoke test                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `npm run test:live`                                | **23 live multiplayer join cycles + 3 no-show rescue drills** against your real Supabase project — creates rooms (including a sponsor-gated custom code: pinned exactly, refused when taken), joins 3–8 players, verifies rejoin, bad codes and closing, checks realtime delivery, proves a kick re-opens a blocked gate and that a quiet host’s room falls to an online player, then closes every room it made. Requires network access and your published config | : mounts the app in jsdom, **plays a full round, a full chaos round, then the elimination loop until one side is gone**, verifies haptics fire (and fall silent when switched off), the boot failsafe, backend connect and dialog scrolling |
| `npm run deploy`                                   | Builds and pushes `dist/` to a `gh-pages` branch                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `node scripts/set-admin-password.mjs "new phrase"` | Rotates the BLACK BOX passphrase (prints a digest)                                                                                                                                                                                                                                                                                                                                                                                                                 |

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
    │   ├── haptics.js         # vibration cue table (role-agnostic, safe no-op)
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
contains game logic, and the same rules drive local _and_ online play.

---

## Game rules

1. **Everyone gets a secret card.** The crew all receive the same word; the imposter receives
   `YOU ARE THE IMPOSTER` plus an optional _cover word_ to bluff with.
2. **One clue each, in turn order.** A single word that proves you know the secret without
   handing it to the imposter. The timer keeps the table honest (and can be paused or reset).
3. **Debate, then vote.** Secret ballots are cast one device at a time and stay hidden until the
   tally; open accusation mode locks a single call for the whole table.
4. **One player leaves, and the game keeps going.** There is one win rule: the game ends when a
   side has **nobody left**.

| The vote lands on | What happens                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- |
| An imposter       | They get **one private guess** at the crew's word. Naming it hands the game to the imposters; missing it just removes them. |
| A crew member     | They are simply gone — the round ends and play continues.                                                                   |
| A tie             | Nobody leaves; the round starts again. (With only two players left the tie can never be broken, so the imposter takes it.)  |

- **Crew win** by removing the last imposter — including the one who just failed their guess.
- **Imposters win** by outlasting the crew, or by naming the word after being caught.
- There is **no round limit** and no single-vote finish.

**No role is ever announced mid-game.** The screen after a vote shows the tally and who left, never
whether they were crew or imposter. Roles are revealed once, on the winner screen, when the game is
over. The public room document never carries a role either — online, `revealedRoles` is written only
as the game ends, and the host's private `wasImposter` flag is stripped before anything is published
(see `publicResult()`).

Imposters are always a strict minority: with _n_ players you can have at most `floor((n-1)/2)`.
Role assignment uses `crypto.getRandomValues()` with rejection sampling and a Fisher–Yates
shuffle, never plain `Math.random()` alone.

**Chaos Mode is an event, not a state.** A chaos game opens with the ordinary deal and then fires one
chaos round every **3–5 rounds** (`CHAOS_GAP_MIN`/`CHAOS_GAP_MAX`), carrying on with the base
assignment in between. A chaos round re-rolls roles for everyone still in play and can deal **one**
imposter, **several**, **many**, **nobody at all**, or **the whole table** — no normal player is ever
forced to exist, and all-imposter is a real outcome. A round that deals nobody the card has nothing to
catch, so the table is told and the round moves on; the next ordinary round hands the configured count
back so the game can still be won. When _every_ player is an imposter there is no crew left to catch
anyone, and the verdict says exactly that. Online rooms keep the same cadence — the host re-rolls on
the scheduled chaos rounds only.

**Haptics never betray a role.** The vibration cue for revealing a card is byte-for-byte identical
whether you are crew or imposter, and cues are short — a phone on a table should feel the game, not
broadcast it. Vibration is a Settings toggle and is skipped silently on devices that don't support it.

---

## Online rooms: what the host controls

A room is configured **when it is created**, and every player sees the same setup in the lobby:

| Control               | Range                    | Notes                                                                                  |
| --------------------- | ------------------------ | -------------------------------------------------------------------------------------- |
| Imposters             | 1–4                      | Capped to a strict minority of the players who actually joined; disabled in chaos mode |
| Turn length           | 15 / 30 / 45 / 60 / 90 s | Steps through exactly those values                                                     |
| Category + difficulty | any                      | From the host's word database                                                          |
| Game mode             | normal / chaos           | Chaos re-rolls the deal on its scheduled rounds only                                   |

The host can change any of it in the lobby before dealing, and the roster re-checks the imposter count every
time somebody joins or leaves.

### The turn clock (host controls, everyone watches)

Every clue turn **starts its timer by itself** — in online rooms _and_ on the local pass & play table —
nobody hunts for a Start button, and each new player's clock is already running when their turn lands. While a turn is open the **host alone** sees the controls:

- **⏸ Pause timer** — the remainder freezes on every phone at the same second;
- **▶ Resume timer** — it carries on from exactly there, not a fresh full turn;
- **Stop — no limit** — the rest of this turn runs open-ended; the next turn auto-starts normally.

Everyone else sees the ring and its stance label (`seconds` / `paused` / `ready` / `no limit`) and no
buttons — on purpose: one clock, one hand on it. And when a turn becomes yours, your phone gives a
short two-tap knock, the same pattern for every player.

### Nobody showing up? The table frees itself

A party stalls the second one phone goes dark, so the room carries four escape hatches — **host (or the driver
the room fell to) only**, nobody else ever sees these buttons:

| Situation                                            | What the table does                                                                                                                         |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| A player never flips their secret card               | The host gets **Open the round without them** — the seen-gate is waived for that round                                                      |
| A player’s clue turn arrives on a dead phone         | The host gets **Skip NAME's turn — their phone is offline**, right on the clues screen                                                      |
| A ballot never lands                                 | The host gets **Close voting and tally the N ballots in** — missing votes simply do not count                                               |
| The voted-out player vanishes before their one guess | The host gets **Skip their guess — count it as a miss**, and the roster is settled on the spot (last imposter gone = crew wins immediately) |

Plus two room-wide rules:

- **Kick** — in the lobby and mid-game the host can **Remove** a player whose phone is gone for good. Their
  seat, ballot and clue turn are cleared and every count re-derives around them; the table does not have to
  finish the round waiting. A host cannot remove themselves (the button refuses), and removing the accused
  player mid-guess resolves that guess as a miss.
- **The host fell over** — if the host's phone goes quiet for about a minute, the longest-standing online
  player automatically becomes the driver: they get the host buttons, a notice says why, and a promoted driver
  reads each seat's own secret to rebuild the role map, so tallies stay correct. If the host leaves cleanly,
  the same hand-over happens instantly at the moment they go.
- **Every screen has a way out** — card, briefing, clues, voting and the guess screen all end with a
  **leave room / close room** control; nobody is trapped by the back-arrow alone.

And a seat is now per-tab: opening the app fresh never drags you into somebody's room. A stored session is only
offered back as a **"rejoin my last room"** button you press yourself (or resumed automatically after a refresh
in the same tab, which is the one case that _should_ walk you back to your seat).

### The room lifecycle, and why it never fills up

1. **Create** — a four-letter code, a row in `imposter_rooms`.
2. **Play as long as you like** — after a game ends, _Play again_ deals a fresh round to the same table, as
   many times as the group wants. Everyone stays in their seat.
3. **Close** — when the table is finished, the host closes the room. That **deletes the row**: the room, its
   players, its secrets and its history are gone. Nobody can rejoin a closed room, and a player still looking
   at it gets a plain _the host closed this room_ screen.
4. **Housekeeping** — a room nobody has touched for three hours is deleted by the same sweep (available
   manually in BLACK BOX → ROOM MANAGEMENT).

Because every finished game gives its storage back, a single free Supabase project comfortably hosts far more
than 50–100 players: nothing accumulates except rooms that are actually in play right now.

### One-time setup for everyone (no per-device paste)

Pasting the URL and anon key _in the app_ configures **that device only**, so every new phone would need the
same two values. Instead, publish them once:

1. Open **BLACK BOX → BACKEND** on any configured device.
2. Press **Copy runtime-config.json** (or _Download the file_) — the panel builds the finished file from the
   values you already have.
3. Save it as `public/runtime-config.json` in the repository and push. It is served next to `index.html`
   (the build copies it into `dist/` and `docs/`).

Every visitor — any device, any browser, forever — is then connected automatically and is never asked to paste
anything. Precedence per device is: values saved in the app → `runtime-config.json` → build-time
`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`.

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

**The file is safe to run more than once** — every statement is guarded — so if you are unsure whether
a project was set up completely, just paste it again; nothing is dropped and no room data is touched.

To confirm a project is ready without changing anything, run [`supabase/verify.sql`](supabase/verify.sql)
the same way. It is read-only and returns one verdict line plus a per-object checklist:

```text
SETUP STATUS | complete — 20/20 checks passed, online rooms are ready
```

If it reports anything as `MISSING`, run `schema.sql` and check again.

> Line count sanity check: a complete run of `schema.sql` ends with the notice
> `Realtime: imposter_rooms added to supabase_realtime` (or `...is already streamed`). If your last
> paste ended in red text instead, the project is only partly set up — re-run the file.

### 4. Turn on realtime

Realtime is usually enabled by default. Confirm under **Database → Replication** that
`imposter_rooms` is in the `supabase_realtime` publication (the schema script adds it).
If your project has replication disabled entirely, enable it there.

### 5. Play

Rebuild (`npm run build`) or restart `npm run dev`, then:

- **Host**: `ONLINE ROOM → Create room` → share the 6-character code.
- **Everyone else**: `ONLINE ROOM → Join room` → name + code → ready up.
- The host starts the game; each device receives only **its own** secret.

Rooms auto-expire: if the atomic RPCs are present, every write extends the room's life, and
`BLACK BOX → ROOM MANAGEMENT → Sweep` closes stale rooms on demand. You can also schedule
`select imposter_sweep_expired();` with `pg_cron`.

---

## The sponsor break — how the ads work

The game is free and it pays for itself the honest old way: a fifteen-second **sponsor break**
stands in front of every door into play.

| You tap…                           | What happens                                        |
| ---------------------------------- | --------------------------------------------------- |
| **Start game** (local pass & play) | break first, then the deal                          |
| **Create room** (online)           | break first, then the room is made                  |
| **Join room / rejoin** (online)    | break first, then you're seated                     |
| custom room code                   | unlocked by ANY break watched — the same one counts |

While it plays: the clip runs muted (autoplay rules), the SKIP button arms only after fifteen
seconds of actual watching, a short clip holds its last frame until the clock is up, and
**✕ not now** cancels the tap and unlocks nothing. A completed break buys a three-minute grace
window — retry after a typo costs a second ad, waiting for friends does not.

Your eleven sponsor clips ship in `public/ads/` and are listed in `public/ads/playlist.json`;
one is picked at random per break. Swap the files or the list any time — no rebuild, no code
change. With an empty or unreachable playlist the plate shows its own animated _AD SPACE_
placeholder and still runs the same clock, so the game can never be held hostage by a missing ad.

### Custom room codes

Creating a room normally hands out a random six-character code. An organiser who wants their
own — `PARK99`, `MOVNIE`, anything that avoids the letters the game never uses — can type it,
but only after a break has been watched (see above). Codes are pinned exactly as typed: if a
live room already answers to yours, you are told to pick another, and the app never quietly
swaps in a random one.

## Deploying to GitHub Pages

> **Pick ONE source and stick to it.** Pages has two independent deploy mechanisms, and the wrong
> combination fails silently: the branch publisher copies the **repository root** (source:
> `index.html`, `src/`, `package.json`) on every push and _overwrites_ what the Actions workflow
> published. The browser then gets `index.html` asking for `/src/main.jsx`, refuses to execute `.jsx`
> (wrong MIME type), and the app never boots.
>
> **How to spot it:** the page shows the "IMPOSTER could not start" card, and these return HTTP 200 —
> `https://user.github.io/repo/src/main.jsx` and `.../package.json`.
> **Fix:** Settings → Pages → Source must be **GitHub Actions** (Option A), never _Deploy from a
> branch → /(root)_ while the workflow also runs.

### Option A — GitHub Actions (recommended)

1. Push this repository to GitHub.
2. **Settings → Pages → Source: GitHub Actions.** ← this is what stops the branch publisher from
   clobbering the deploy. Change it _before_ re-running the workflow.
3. Optional (online mode): add `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` under
   _Settings → Secrets and variables → Actions_. Not required — you can paste values in the app or
   edit `runtime-config.json` instead (see _Backend configuration_).
4. Push to `main`, or **Actions → Deploy IMPOSTER to GitHub Pages → Run workflow**.

If the **deploy** job sits on `queued` while the build job succeeded, open the run and either approve
the pending `github-pages` deployment (**Review deployments**) or re-run the job. That queue is
GitHub waiting on the Pages environment — it is not a build problem.

### Option B — commit the build to `/docs` (no Actions at all)

The most bulletproof path: branch deploys cannot be blocked by permissions, environment approvals or
concurrency.

```bash
npm run build:docs        # builds into docs/ instead of dist/
npm run doctor -- --dir docs
git add docs && git commit -m "build" && git push
```

Then **Settings → Pages → Source: Deploy from a branch → `main` → `/docs`**. Pages serves that
folder as the site root, so the app lives at `https://user.github.io/repo/`.

Re-run `npm run build:docs` and commit whenever the source changes — the deployed copy is a
snapshot. A **prebuilt `docs/` folder ships in the release archive**, so the first deploy needs no
local tooling at all.

### Option C — push the build to a `gh-pages` branch

```bash
npm run deploy
```

Builds `dist/`, commits it to a `gh-pages` branch and pushes. Then set
**Settings → Pages → Deploy from a branch → `gh-pages` / root**.

### Verifying a deploy

```bash
npm run doctor            # audits dist/   (or: npm run doctor -- --dir docs)
```

Then in the browser: no `/assets/...` 404s, the menu appears, and refreshing a deep link
(`#/settings`) still boots the app. Seeing an old version? Hard-refresh once (**Ctrl+Shift+R**) — a
service worker from a previous deploy can hold a cached page.

### Why it works under `/repository-name/`

- **Hash routing** (`#/local`, `#/lobby?room=A7KQMN`). There is no history-based route to 404, so
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

| Section             | Contents                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **SYSTEM STATUS**   | Storage/RNG/network/Supabase checks, word counts per tier, build version, local audit log                                                    |
| **WORD DATABASE**   | Create/read/update/delete words, category create/rename/delete, search, difficulty filter, tier chips, import/export JSON, reset to defaults |
| **ROOM MANAGEMENT** | Live rooms (code, host, players, status, phase), terminate with confirmation, sweep expired rooms                                            |
| **SETTINGS**        | Operator defaults, cloud word sync (push/pull), lock the session now, clear all local data                                                   |

The unlock lasts 30 minutes in the tab (`sessionStorage`) and the panel can be locked manually.
Failed attempts are throttled: 5 tries then a 60-second lockout, with every event written to a
local audit log.

### Adding your own words & categories

Everything lives in **BLACK BOX → WORD DATABASE**:

1. Go to the main menu.
2. **Tap the top-right corner three times, quickly** (the zone is invisible; a triple-tap is the door).
3. Enter the access phrase, then open **WORD DATABASE** — add, edit, delete, search, filter by
   category/difficulty, import/export JSON, and reset to defaults. **CATEGORIES** lets you create
   your own group; it appears in the game setup's category list straight away.

New words are stored on this device and are immediately playable. The Settings screen repeats these
steps under _CUSTOM WORDS & CATEGORIES_, so you never have to remember them.

**Cover words (hints).** Every word can carry up to **six** cover words — the words the imposter is
offered as a bluff. Type them into the _cover words_ field beside a word (comma separated); if a word
has several, the game draws **one at random** each time it is dealt, so the same word bluffs
differently on every replay. Leave the field empty and the imposter is offered another word **from the
same category** instead, which keeps the bluff in the same world as the real word. Hints travel with
the JSON export/import and with cloud word sync, so a shared database keeps them.

Every **built-in** word (all 150) now ships with **five hand-written cover words** that fit its world,
so a fresh install never has to fall back. Word databases saved by an earlier version pick these up
automatically the next time the app opens — words and categories you wrote yourself are left alone,
and your own cover words always win.

### The published config ships WITH the app

`public/runtime-config.json` now carries the real (public) project URL and publishable key, so it is
copied into `dist/` and `docs/` on every build and lands next to `index.html` on every deploy. **Updating
the app can never wipe it again** — earlier packages shipped that file empty, and copying one over the
repo silently erased the published values (which is exactly why players saw "waiting for the room
server"). A test now fails the build if that file is ever blanked.

Extra safety net: `node scripts/live-check.mjs` boots the real app with the shipped file and reports
whether a fresh device connects; add `--live` to test the copy GitHub Pages is _currently_ serving.

### Refreshing mid-game is survivable

A reload used to throw a pass & play table away instantly. Now:

- **Before it happens**, while a game is running, the app registers the browser's own _"Leave site?"_ prompt — on
  desktop and most Android phones a refresh is caught before it does anything.
- **If the reload goes through anyway** (a phone's pull-to-refresh, or iOS which ignores that prompt), the tab
  remembers it was reloaded and the table is restored from per-tab `sessionStorage` — an open secret card is closed
  again and the countdown is paused rather than eaten.
- **On the way back** the app shows a full-screen warning — **!! HUGE WARNING !! REFRESHING RESETS CURRENT GAME** —
  with two ways out: **CONTINUE GAME** (keep the table exactly where it was) or **LEAVE [REFRESH]** (end it and go
  back to the menu). Online rooms get the same warning, and _LEAVE_ quits the room for real.

The snapshot lives in `sessionStorage`, so it dies with the tab: closing the browser still ends the table.

### How a game ends

Two ways, and both are quick:

- **The crew wins** by removing the last imposter (the caught imposter still gets their one guess first).
- **The imposters win** the moment **parity** is reached — as many imposters alive as crew. From that point no
  vote can remove them: they can tie every ballot, and with two players left the split can never be broken.
  That is why a four-player game ends after two crewmates are voted out, exactly as it should, instead of
  grinding through rounds nobody can win. They also win by outlasting the crew or by naming the word after
  being caught.

The vote result says what happened, in plain words: **"<name> is out of the game. You voted out a crewmate !
{players} remain."** — or "you caught an imposter !". Nobody has to guess which side just lost a player.

### Cards are dealt once, not every round

Everyone looks at their secret card in round one. After that the table already knows its roles and the word,
so ordinary rounds open straight into the briefing — the card pass only returns when something actually
changes: a **chaos round** re-rolls every role, and the round that restores the base assignment afterwards
deals a fresh hand too.

### The word never repeats on a replay

"Play again" (and replaying a finished table) deals a **fresh word**: the last five words a table has
already seen are skipped, so the same word cannot come straight back. The list relaxes oldest-first,
which means a small custom category still rotates instead of repeating. Online rooms keep that list
inside the room's **private** secrets — it is never part of public room state, so nobody can read the
round's word out of the shared document.

### Waiting for the room server (players never paste anything)

The room server is published **once** by the organiser in `runtime-config.json` next to `index.html`.
Every other device reads it automatically — and if someone opens the app (or an invite link) before it
has been published, the screen says _"Waiting for the room server"_ with a **Check again** button.
The app also re-reads the file by itself every 15 seconds, and whenever the tab is focused, so the
waiting screen clears on its own within moments of the file going live. No player is ever asked for a
URL or a key; only **I'm the organiser** opens the connect panel.

### Rotating the access phrase

The passphrase is never stored in the source — only a salted SHA-256 digest is:

```bash
node scripts/set-admin-password.mjs "your new passphrase"
# → paste the printed DIGEST over the DIGEST constant in src/lib/blackbox.js
```

`npm run test:engine` includes a check that the passphrase string appears nowhere under `src/`.

---

## Configuration reference

| Variable                 | Required           | Purpose                                                                                           |
| ------------------------ | ------------------ | ------------------------------------------------------------------------------------------------- |
| `VITE_SUPABASE_URL`      | Optional           | Supabase project URL — **fallback only**; in-app settings and `runtime-config.json` take priority |
| `VITE_SUPABASE_ANON_KEY` | Optional           | Public anon key — same precedence                                                                 |
| `VITE_ROOM_TTL_MINUTES`  | No (default `180`) | Idle lifetime for a room                                                                          |
| `VITE_BASE_PATH`         | No (default `./`)  | Absolute asset base, e.g. `/my-repo/`                                                             |

User-facing settings (Settings screen, stored in `localStorage`):
sound · animations · reduced motion · haptics (vibration ON/OFF) · imposter cover word · theme intensity (0–2).

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

**What is explicitly _not_ protected**

- The **BLACK BOX gate is a convenience layer, not authentication.** A determined user with devtools
  can inspect or bypass client-side gating. It hides the panel and slows casual access — nothing more.
- Similarly, a player who reads the raw room row in devtools could inspect the `secrets` column.
  Keeping secrets out of the _public_ document stops accidental leakage and ordinary curiosity; it is
  not cryptographic protection. If you need that, run your own server-side game logic — which this
  project deliberately avoids so it can be hosted for free.
- The anon role can create/update room rows. Rate-limit or add auth if you deploy this publicly at scale.

---

## Testing

```bash
npm run test          # runs both suites back to back (build first — the UI suite checks dist/)

npm run test:engine   # 98 tests: role assignment (incl. chaos rolls, per-seat fairness and
                      # re-roll freshness), reveal lifecycle, timer, win conditions
                      # for both rulesets, illegal-move rejection, name/code/word validation,
                      # word-bank CRUD + import sanitising, online vote math and phase routing,
                      # user-facing error copy, plus a source scan proving the admin
                      # passphrase is not committed anywhere under src/

npm run test:ui       # 102 checks: bundles the real app with esbuild, mounts it in jsdom and
                      # plays a complete local round — deal → six reveals/hides → briefing →
                      # timer start/pause/reset → clues → secret ballot → tally → winner →
                      # play again — plus a full Chaos Mode round and the haptic cues for every
                      # phase, while also covering the splash hand-off, the hidden
                      # three-tap admin gesture, passphrase rejection/acceptance, the
                      # eight-step tutorial, the settings screen and every route fallback.
                      # It also loads index.html in a raw DOM with no bundle attached and asserts
                      # the boot failsafe explains itself instead of hanging on "LOADING" — the
                      # exact symptom of a host serving the source tree instead of dist/
```

The UI suite runs headless with no browser download — `jsdom` is the only extra dev dependency.

The UI test bundles the actual application with esbuild, so a broken import, a render crash, a
stuck phase transition or a broken route fails the run.

---

## Backend configuration (no rebuild, no re-deploy)

Online rooms need a Supabase project. **You never have to edit code or rebuild to point the app at
one** — the values are resolved at runtime, in this order:

| #   | Where                     | Best for               | How                                                                                                                                                                                     |
| --- | ------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **In the app**            | quickest, per device   | Online Room → **Connect a backend**, or BLACK BOX → **BACKEND**. Paste the URL and anon key once; stored in that browser and applied immediately.                                       |
| 2   | **`runtime-config.json`** | one place for everyone | Lives next to `index.html` in `dist/`. Edit the two values on the host and every visitor picks it up — no rebuild, no redeploy. A `runtime-config.sample.json` is shipped alongside it. |
| 3   | **Build variables**       | a baked-in default     | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` (`.env`, or CI secrets). Optional now — this is just a fallback.                                                                         |

First hit wins, so a value you paste in the app always overrides the published file, which overrides
the build. Clearing the device values falls back down the chain.

```jsonc
// dist/runtime-config.json  (comments allowed; blanks fall through to the build values)
{
  "supabaseUrl": "https://abcdefghijklm.supabase.co",
  "supabaseAnonKey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9....",
}
```

**Safety rails built in**

- The **service-role key is rejected** on paste, with an explanation — it bypasses all security and
  must never reach a browser. A `SUPABASE_SERVICE_ROLE_KEY` reference in client code fails the
  pre-deploy audit too.
- Values are validated before saving: scheme, host shape, key length and JWT role. A URL pasted with
  `/rest/v1` or a trailing slash is normalised; a bare project ref (`abcdefghijklm`) is expanded to
  `https://abcdefghijklm.supabase.co`.
- **Test connection** probes the rooms table with a throwaway client, so a typo can never break a
  working setup. Nothing is saved until you press _Save & use_.
- A `runtime-config.json` that is present but malformed is **ignored with a visible warning** in the
  panel, never silently swallowed.
- Only the project URL and anon key are ever read. No service-role key, ever.

Run `supabase/schema.sql` once in the project and online rooms are live.

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

| Symptom                                                 | Fix                                                                                                                                                                                                                  |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| “Connect a backend to play online”                      | Paste your project URL + anon key right there (or BLACK BOX → BACKEND). No rebuild needed.                                                                                                                           |
| Values ignored after editing `runtime-config.json`      | The panel says why — usually a placeholder left in, a missing value, or invalid JSON. In-app values outrank the file, so clear those if you meant to switch.                                                         |
| “That is the service-role key”                          | Working as intended — use the anon / publishable key. The service-role key must never be in a browser.                                                                                                               |
| Pasted the Supabase **dashboard** URL by mistake        | No longer a problem: `supabase.com/dashboard/project/<ref>` is converted automatically to `https://<ref>.supabase.co`. A dashboard link without a project reference is refused with instructions.                    |
| A tall panel can't be scrolled on a phone               | Fixed: the page behind a dialog is scroll-locked, so dialogs now cap themselves to the viewport and scroll internally.                                                                                               |
| The crew caught an imposter but the imposters still won | Expected: a caught imposter gets one guess at the word, and naming it hands them the game. Vote out every imposter (or let them miss) and the crew takes it.                                                         |
| “The room database is not set up yet”                   | Run `supabase/schema.sql` in the SQL editor.                                                                                                                                                                         |
| Lobby never updates on other devices                    | Enable Realtime and make sure `imposter_rooms` is in the `supabase_realtime` publication.                                                                                                                            |
| “That code contains a character we never use”           | Room codes exclude `O I L 0 1 S Z 2 5` to avoid misreads — check the code again.                                                                                                                                     |
| “GAME IN PROGRESS”                                      | You can only join a running game by reusing the same name (that is the reconnect path).                                                                                                                              |
| Cloud word sync rejected                                | Expected: shared word writes require an authenticated Supabase session (RLS).                                                                                                                                        |
| Stuck on “LOADING” forever                              | The host is serving the **source tree**, not the built site — browsers refuse `.jsx` (wrong MIME type), so React never mounts. Set Pages → Source to **GitHub Actions**, or point it at the `/docs` folder.          |
| The site reverts to source after each push              | Pages is set to _Deploy from a branch → /(root)_ **and** the workflow runs. The branch publisher wins every push. Switch Pages → Source to **GitHub Actions**, or move to the `/docs` option and stop using Actions. |
| Workflow `deploy` job stuck on `queued`                 | The build succeeded; GitHub is waiting on the Pages environment. Open the run → **Review deployments → Approve**, or re-run the job after setting Pages → Source to GitHub Actions.                                  |
| “IMPOSTER could not start” card                         | That is the built-in failsafe, not a crash. Expand **Diagnostics** in the card for the page URL, bundle path and service-worker state, then follow the fix it names.                                                 |
| Blank page after deploying to Pages                     | Confirm the workflow/branch uploaded the `dist/` **contents** (index.html at the root) and hard-refresh. Run `npm run doctor` to audit the output before pushing.                                                    |
| Refreshing a deep link 404s on another host             | That host lacks the `404.html` fallback; Pages and the bundled `dist/404.html` handle it automatically.                                                                                                              |

---

## Credits & licensing

- Original game design, rules, UI, art direction, word database and code: **VR DEVELOPMENTS**.
- Inspired by the social-deduction party genre. No third-party game's branding, text, assets or
  proprietary implementation is copied or bundled.
- Only open-source libraries are used (React, Vite, Tailwind CSS, Framer Motion, canvas-confetti,
  `@supabase/supabase-js`), each under its own licence. Fonts (Orbitron, Rajdhani) are
  self-hosted under the SIL Open Font License.
- Supabase is optional and free-tier friendly; no paid services are required anywhere.

**VOTE OUT IMPOSTER — Crafted with passion by VR DEVELOPMENTS.**
