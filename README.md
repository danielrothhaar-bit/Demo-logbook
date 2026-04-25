# Demo Logbook

Mobile-first web app for escape room designers to capture observations during live playthrough tests. Voice-first input, multi-designer collaboration, post-playthrough synthesis, and cross-session trends.

## Stack

- **Frontend:** Vite + React 18 + TailwindCSS
- **Voice input:** Web Speech API (with iOS Safari + Chrome auto-restart handling)
- **Server (prod):** Express, serves the built SPA
- **Deploy:** Railway (Nixpacks)

## Local development

```bash
npm install
npm run dev      # Vite dev server, http://localhost:5173
```

Open the URL on your phone — the dev server binds to `0.0.0.0`. For voice input to work in mobile Chrome/Safari, the page must be served over HTTPS *or* visited as `localhost`. Use a tunnel (e.g. `ngrok`, Cloudflare Tunnel) for HTTPS testing on a real phone.

```bash
npm run build    # production bundle into ./dist
npm start        # runs Express server serving ./dist (uses $PORT)
```

## Modes

1. **Live Logging** — big timer, voice-to-text mic button, quick-tag buttons, instant-save notes feed.
2. **Multi-Designer Collaboration** *(simulated locally)* — toggle the persona switcher in the header to log as different designers; their notes interleave in the unified feed and drive consensus detection.
3. **Review & Synthesis** — full timeline, filter by category/designer/time, automatic consensus + divergence + duplicate detection, auto-summary (top issues, top wins, suggested actions).
4. **Trends** — cross-session aggregation per room, recurring friction by minute, action items with status workflow, before/after comparison once an action item has been re-tested.

## Voice-to-text notes

`src/hooks/useSpeechRecognition.js` handles the API's known quirks:

- **Chrome/Android continuous mode** can stop on silence — we auto-restart from `onend` while the user still wants to listen.
- **iOS Safari** is unreliable in continuous mode, so we use single-utterance mode and surface a "Tap again to keep listening" hint after each utterance.
- Errors `no-speech`, `aborted`, `network` are treated as recoverable; `not-allowed`, `audio-capture`, `service-not-allowed` are surfaced to the UI.

## Deploying to Railway

This repo is Railway-ready out of the box.

1. Push to GitHub.
2. In Railway: **New Project → Deploy from GitHub repo → pick this repo**.
3. Railway auto-detects Node, runs `npm ci && npm run build`, then `node server.js`.
4. Health check is configured at `/healthz`.
5. Set a custom domain in **Settings → Networking → Custom Domain** if desired.

`railway.json` and `nixpacks.toml` pin the build/start commands so the deploy is deterministic.

## What's *not* in this prototype

- **Real persistence:** state is in-memory only. Reload = lose notes. Wire up a DB (Postgres on Railway is one click) and replace the `useReducer` store with API calls.
- **Real multi-user sync:** collaboration is faked via a persona switcher. Replace with WebSockets or a hosted realtime service (e.g. Liveblocks, Supabase Realtime, Ably).
- **Real AI summary:** the post-session summary is a heuristic (clustering + category counts), not an LLM call. Swap `src/utils/synthesis.js#summarize` for a server-side Claude call when ready.

## File structure

```
src/
  App.jsx                  Top-level shell + mode router
  store.jsx                Context + useReducer state, seed data
  hooks/
    useSpeechRecognition.js  Web Speech API wrapper with restart logic
  components/
    Home.jsx               Landing — start session / past sessions
    SessionSetup.jsx       Room name, team size, experience, date
    LiveLogging.jsx        Timer + mic + tags + feed
    MicButton.jsx          Voice input UI
    NoteCard.jsx           Single note display
    CategoryEditor.jsx     Edit quick-tag list
    Review.jsx             Timeline / Synthesis / Summary tabs
    Trends.jsx             Cross-session aggregates + action items
    PersonaSwitcher.jsx    Header — switch active designer
    BottomNav.jsx          Mobile bottom nav
  utils/
    synthesis.js           Pure clustering + dedup + summary heuristics
server.js                  Express SPA server for production
nixpacks.toml              Railway build/start config
railway.json               Railway deploy config
```
