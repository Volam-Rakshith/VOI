# Vote Out Imposter (VR DEVELOPMENTS)
One-device pass-and-play party game. Open `index.html` — works offline, no backend.
`npm run build` regenerates index.html from src/. `npm test` runs engine tests.

## Host on GitHub Pages
1. Create a new public repo on github.com (e.g. `vote-out-imposter`).
2. Upload ALL files from this zip (drag & drop in "Add file → Upload files"), commit to `main`.
3. Repo → Settings → Pages → Source: "Deploy from a branch", Branch: `main`, Folder: `/ (root)` → Save.
4. Wait ~1 minute; your game is at `https://<username>.github.io/vote-out-imposter/`.
Share that link; works on phones. Update by re-uploading a changed index.html.

## Online mode (multiple devices) — Supabase setup (one time, by the host)
1. Create a free project at supabase.com.
2. SQL Editor → paste `supabase/migrations/001_rooms.sql` → Run.
3. Deploy the function: `npm i -g supabase`, `supabase login`, `supabase link --project-ref <ref>`,
   then `supabase functions deploy game --no-verify-jwt`.
4. Project Settings → API: copy the Project URL and the **anon public** key (NEVER service_role).
5. Every player opens the game → Play online → pastes URL + anon key (saved on their device) → Create/Join room.
Note: state is kept by polling every 1.5 s through the function, so roles/votes are delivered only to the
player holding the matching token. Not yet live-tested against a real Supabase project.

## Keys: set once in config.js
Edit `config.js` in the repo root: put your Supabase Project URL and anon PUBLIC key there and commit. Players never paste anything. No .env is needed on the website (a static site can't read one); the edge function gets its own secrets from Supabase automatically.
Also run `supabase/migrations/002_version.sql` and redeploy the function (`supabase functions deploy game --no-verify-jwt`).
