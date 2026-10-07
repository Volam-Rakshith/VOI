# TESTING CHECKLIST — IMPOSTER by VR DEVELOPMENTS

Use this to run a pass, then report back. Each line is something you can confirm or break —
anything that fails, note the **device + browser + step** and I'll fix it.

---

## 0. If the site is broken right now

Run this single command (replace with your URL) — it tells you instantly which failure you have:

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<user>.github.io/<repo>/src/main.jsx
```

- **200** → Pages is serving your **source tree**. Set Pages → Source to **GitHub Actions** (or the
  `/docs` folder). See section 7.
- **404** with a working menu → you're serving the build correctly.

## 0b. Setup (2 commands)

```bash
npm ci            # or: npm install
npm run dev       # → http://localhost:5173
```

Optional but recommended before committing:

```bash
npm run build         # → dist/ with index.html, 404.html, .nojekyll, sw.js, icons
npm run test:engine   # 115 rule/utility tests → expect "115 passed, 0 failed"
npm run test:ui       # 106 UI checks (a full round, the elimination loop to a winner, a chaos round, haptics, the failsafe, backend setup and scrolling)
npm run doctor        # audits that build: entry point, paths, chunks, fonts, secrets
```

> Build **before** `test:ui`: the UI suite also inspects the built `dist/`, and without one it reports
> `dist/index.html exists (run npm run build first)` as its only failure.

> **Never publish the repo root as a website.** `index.html` in the source tree is the Vite dev
> entry (`/src/main.jsx`); browsers cannot execute it off a static host, which is what produced a
> permanent "LOADING" screen. Publish `dist/` — via the Actions workflow or `npm run deploy`.

---

## 1. Startup & shell

- [ ] Splash appears (studio mark + IMPOSTER), lasts ~1.5 s, then dissolves into the menu
- [ ] Menu shows `PLAY LOCAL / ONLINE ROOM / HOW TO PLAY / SETTINGS`, version badge, footer credit
- [ ] Particles drift; moving the mouse (desktop) shifts them slightly
- [ ] No white flash on reload, no console errors (open DevTools once)
- [ ] Rotate to landscape and back — no clipping or horizontal scroll

## 2. Pass & play (the core loop)

- [ ] Setup starts at 6 players; stepper goes 2 → 20; imposter max updates correctly
- [ ] Empty names block the start; duplicate names are flagged on both fields
- [ ] Long names/emoji are trimmed or rejected (16 char cap)
- [ ] Deal → "pass the device to" screen names player 1
- [ ] Tap card → flips in 3D, glare follows your finger/mouse, word (or IMPOSTER + cover word) shows
- [ ] Tap again → hides; **"Hand to next player"** appears only after hiding
- [ ] Repeat for all players; the last one says "Everyone is ready"
- [ ] Briefing shows round, objective, win condition, then "Start round 1"
- [ ] The secret card looks **identical** whichever role you hold — same cyan/indigo treatment, no
      colour tell while the device is handed around
- [ ] A long custom word ("kitchen sink", or a full 28-character word) fits inside the card without
      spilling off the edge; the type steps down and wraps
- [ ] Clue screen: timer Start / Pause / Resume / Reset all work
- [ ] At 10 s the ring turns amber; at 5 s it pulses magenta; at 0 it flares and stops
- [ ] Clue order is random each round but every living player gets exactly one turn
- [ ] Last clue → "Clues done — move to voting" → voting intro
- [ ] Secret ballot: each voter gets a hand-off, no vote is visible before the tally
- [ ] Cannot vote for yourself; each voter can only vote once
- [ ] Reveal the tally → bars animate, the eliminated player's name shows — and **no role is stated**
      for them, ever, at this point
- [ ] Vote out a crew member → the round ends with "the hunt continues" and **Next round** keeps the
      game going with one fewer player
- [ ] Vote out an imposter → the guess hand-off appears; the accused types the word on a screen nobody
      else sees. Right guess → imposters win outright. Wrong guess → they are out and play continues
- [ ] Catch the **last** imposter and they miss → THE CREW WINS on the spot
- [ ] Keep voting crew out until the crew is gone → THE IMPOSTERS WIN, with no false reason line
- [ ] A split vote removes nobody: "the vote was split — nobody leaves", and the next round starts with
      the same roster
- [ ] A split vote with exactly two players left resolves (each can only vote for the other) instead of
      looping forever
- [ ] Roles are revealed **only** on the winner screen, listed for every player
- [ ] There is no round limit anywhere in Setup — only the "how the game ends" statement, which matches
      what actually happens
- [ ] Play again re-rolls roles and the word; word never repeats back-to-back
- [ ] Quit mid-game asks for confirmation and returns to the menu

## 2b. Chaos Mode (anyone can be an imposter)

- [ ] On **PLAY LOCAL**, Setup → Game Mode shows both cards; picking **Chaos** explains that a round
      every few rounds is re-rolled and greys out the fixed imposter count
- [ ] Start a 4+ player chaos game: **round one is an ordinary round** with the configured imposter
      count, and reveals, clues, voting and results behave exactly as in Normal Mode
- [ ] A chaos round lands **3–5 rounds in** (not every round) and announces itself on the briefing
      screen; the rounds in between keep the same assignment
- [ ] Across enough runs you see the different flavours: one imposter, several, many, nobody, and the
      whole table
- [ ] A **nobody-is-an-imposter** chaos round says so on the tally screen (there is nothing to vote on),
      and the next ordinary round puts the configured imposter count back
- [ ] An **all-imposter** round resolves with the imposters taking it, and the verdict says exactly that
- [ ] Online rooms keep the same cadence: the host re-rolls on the scheduled chaos rounds only, not
      every round
- [ ] Every player gets a turn as imposter across enough rounds; nobody is permanently crew
- [ ] **Play again** re-rolls: the same player is not stuck with the same role as the last game
- [ ] In an all-imposter round nobody is falsely accused — the verdict states that every player was an
      imposter instead of crediting a crew win
- [ ] **Normal Mode is unchanged**: fixed imposter count, strict minority, same reveals and results
- [ ] Online rooms: the host sees the same Chaos option; after the round ends, **Next round**
      re-rolls every living player's role (eliminated players keep the role they were judged on)

## 3. Mobile feel (do this on a real phone if possible)

- [ ] Every button is comfortably tappable, no accidental double-taps
- [ ] Secret card fits fully on screen at 320 px, 375 px and 430 px widths
- [ ] Hold the phone portrait — the card, timer and vote grid never clip
- [ ] Haptics fire on tap/reveal (Android; iOS Safari has no vibration API)
- [ ] The reveal buzz feels the same when you are crew and when you are the imposter (it must not
      identify anyone), and Settings → Haptics OFF silences every cue
- [ ] Sound plays after first tap, and Settings → Sound OFF silences everything

## 4. Settings, tutorial, accessibility

- [ ] Settings toggles persist across reload
- [ ] Theme intensity Calm / Standard / Intense visibly changes particles + glow
- [ ] "Reduced motion" removes particles/glitch/shake; also confirm it auto-engages when your OS
      is set to "reduce motion"
- [ ] Reset preferences / Reset words / Clear everything each confirm first
- [ ] Tutorial: 8 steps, dots navigate, animations run, final step offers "Start playing"
- [ ] Keyboard only: Tab to every control, Enter/Space flips the card, Esc closes modals
- [ ] Screen reader announces modal titles, toasts, and the timer status

## 5. BLACK BOX (hidden admin)

- [ ] **3 quick taps in the top-right corner of the home screen** opens the passphrase prompt
      (no visible button appears anywhere)
- [ ] Wrong passphrase → "Incorrect access phrase. N attempts left."
- [ ] 5 wrong attempts → 60 s lockout with countdown
- [ ] Correct passphrase → dashboard (SYSTEM STATUS by default)
- [ ] Word DB: add a word → playable in under a minute (pick its category in setup)
- [ ] Edit a word inline; change its difficulty chip; delete it (confirm dialog)
- [ ] Create / rename / delete a category
- [ ] Search + difficulty filter work; export JSON downloads; re-import restores it
- [ ] Reset to defaults asks for confirmation
- [ ] SYSTEM STATUS shows storage / RNG / network / Supabase checks and an activity log
- [ ] "Lock Black Box now" returns to the menu and the route falls back to home
- [ ] Confirm the passphrase appears nowhere in `src/` (grep it yourself — it should be a 64-char digest)

## 5b. Connecting the backend (no rebuild)

- [ ] Supabase project check: SQL Editor → paste `supabase/verify.sql` → `SETUP STATUS | complete — 20/20`
- [ ] Paste `supabase/schema.sql` a second time → runs clean (it is guarded, nothing is dropped)
- [ ] Online Room → **Connect a backend** opens the panel with both fields
- [ ] Paste a URL without `https://` → normalised; a bare project ref → expanded to `*.supabase.co`
- [ ] Paste the **service-role** key → refused with a security explanation, nothing saved
- [ ] Paste a short or space-broken key → refused with a specific reason
- [ ] **Test connection** against a bad project → friendly failure, nothing saved
- [ ] **Save & use** with good values → CONNECTED banner, project host shown, Create/Join appears
- [ ] Reload → still connected (values live in this browser)
- [ ] BLACK BOX → BACKEND shows the same panel plus the source label (`this device` / `runtime-config.json` / `build environment`)
- [ ] Edit `dist/runtime-config.json` on the host with real values → reload → the file is named as the source
- [ ] Put a typo in that file → the panel says it was ignored, and why (never silent)
- [ ] **Forget device values** → falls back to the file / build values
- [ ] Paste the Supabase **dashboard** address (`supabase.com/dashboard/project/…`) → it is converted to the project URL automatically
- [ ] Paste `supabase.com/dashboard` (no project) → refused with an explanation
- [ ] Scroll the connect panel on a short screen / phone landscape → the panel scrolls internally
- [ ] SYSTEM STATUS → Supabase row shows the host and its source

## 6. Online rooms (needs Supabase running — any of the three ways above)

- [ ] Without any configuration: Online Room shows the connect card (no broken UI)
- [ ] After setup: Create room → 4-char code, copy invite link works
- [ ] Join from a second device/browser with the code → appears in the lobby in < 2 s
- [ ] Ready toggle syncs; host start button blocked until everyone is ready
- [ ] Host can change imposters / turn length / rounds / category / win rule live
- [ ] Start → every device sees only its own card; the word is never shown to the imposter
- [ ] All-seen → briefing auto-opens; host opens the clue round
- [ ] Shared timer is roughly in sync across devices (±1 s)
- [ ] Voting: one ballot per player, "N/M voted" updates live, counts stay hidden
- [ ] Result appears on all devices with the same elimination and winner
- [ ] Refresh a mid-game device → it rejoins its own seat with the same card
- [ ] Close the host's tab → another player takes over transitions
- [ ] Turn a phone to airplane mode → banner says CONNECTION LOST, then recovers
- [ ] Terminate the room from BLACK BOX → all devices see "Room closed"
- [ ] Try a bad code / full room / game-in-progress name → friendly messages, no raw errors

## 7. Deployment

**Read this before debugging a blank page:** Pages has two deploy mechanisms. If **Settings → Pages →
Source** is *Deploy from a branch → /(root)* while the workflow also runs, the branch publisher wins
on every push and serves your **source tree**. The app then dies on `/src/main.jsx` (browsers refuse
`.jsx`). One-line check — if this returns 200, you are serving source:

```
https://<user>.github.io/<repo>/src/main.jsx
```

- [ ] `npm run build` produces `dist/` with `index.html`, `404.html`, `.nojekyll`, `assets/`, `sw.js`, `icons/`
- [ ] `npm run build:docs` produces the same into `docs/` (the no-Actions deploy path)
- [ ] `npm run doctor` (or `-- --dir docs`) reports **Deployable**
- [ ] `npm run preview` → game works from the built bundle
- [ ] **Settings → Pages → Source = GitHub Actions** (not "Deploy from a branch / (root)")
- [ ] Actions run: build job green, **deploy** job green (if it sits on `queued`, approve or re-run it)
- [ ] `…/src/main.jsx` now returns **404** ← proof you are serving the build, not the source
- [ ] `…/assets/` loads with no 404s in the Network tab; menu appears; no console errors
- [ ] Deep link `…#/lobby?room=TEST` then refresh → app boots
- [ ] Ctrl+Shift+R shows the current build (a stale service worker can hold the old page)
- [ ] Rename the repo → still works (relative paths) or rebuild with `VITE_BASE_PATH=/new-repo/`

---

## Known watch-list (already on my list — confirm or contradict)

These are the areas I could not fully verify in this sandbox. If any misbehave, that's the top of the fix queue.

1. **Real-device layout** — everything was validated from 320 px upward in a headless DOM, not on
   physical hardware. iOS Safari's dynamic toolbar (address bar collapse) and notches are the
   likeliest places for a small gap or jump.
2. **iOS audio** — Web Audio unlocks on the first pointer/key event; I couldn't hear it. If the
   first cue is silent, tap once anywhere and it should work from then on.
3. **Live Supabase flow** — the online code path is written against the schema in
   `supabase/schema.sql` and unit-tested at the logic level, but no real project was reachable from
   here. Among the things to watch: whether the atomic RPCs install cleanly on your Postgres
   version, and realtime latency for the shared timer.
4. **Concurrent joins/votes at the exact same millisecond** — guarded by Postgres functions and a
   retry loop; hard to reproduce manually, so run two devices at once and see if a player ever
   vanishes from the lobby.
5. **Two players with names differing only by case/emoji** — validation compares case-insensitively;
   report anything that slips through.
6. **Service worker staleness** — it is network-first for navigations, so a redeploy should replace
   itself. If you ever see an old build after deploying, hard-refresh once.
7. **Long rosters (18–20 players)** — clue rounds get long. Tell me if you want a "shorter round"
   setting (skip N clues / one clue per pair) added.
8. **Vibration feel** — patterns are deliberately short (8–60 ms steps) so a phone on a table doesn't
   broadcast the game. If a cue feels too strong, weak, or too frequent on your device, tell me which
   moment it was and I'll tune that single pattern.

---

## How to report back

Paste this shape and I'll turn it into fixes:

```
1) What I did:      (e.g. "iPhone 13, Safari, 5 players, chaos mode, voted out an imposter in round 3 and lost the guess")
2) What I expected: (e.g. "round 3 starts with 4 living players")
3) What happened:   (e.g. "round counter jumped to 3 but the eliminated player still got a clue turn")
4) Console:         (any red text — even one line)
5) Repeatable:      always / sometimes / once
```

Screenshots and a room code both help. Anything that is just taste (colour, copy, timing) is worth
sending too — I'll fold it in.
