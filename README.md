# Vault Duel

A once-a-day, single-player card duel for the browser, built for phones. Everyone faces the Collector on the
same seed each calendar day. The app is a static PWA (Vite + React) with no backend: the engine runs on the
device, and the daily seeds ship as a prebuilt manifest (`apps/web/public/seeds.json`).

Version: v0.1. For how the code fits together, read `docs/DEVELOPER_GUIDE.md`. The rules live in
`docs/DESIGN.md`.

## Requirements

- Node 24 (`engines.node` is `24.x`; `.nvmrc` says `24`)
- pnpm 12.11.2, pinned in `packageManager`. Run `corepack enable` once and corepack picks it up.

## Run it locally

```sh
pnpm install
pnpm dev          # generates the keyword index, then starts the Vite dev server
```

In dev builds only, `?date=YYYY-MM-DD` plays another day, and `?set=` and `?debug` are available (D-176,
D-262). Production ignores them.

| Command | What it does |
| --- | --- |
| `pnpm test` | All Vitest suites. Run from the repo root only. |
| `pnpm typecheck` | `tsc -b` |
| `pnpm lint` | ESLint |
| `pnpm content:check` | Validates the content JSON |
| `pnpm seeds --from YYYY-MM-DD --days 90` | Regenerates the daily seeds manifest (takes a few minutes) |
| `pnpm seeds:check` | Warns when the manifest is stale or covers fewer than the next 30 days |
| `pnpm build` | Everything Vercel runs: content checks, `seeds:check`, typecheck, then the web build into `apps/web/dist` |

## Deploy to Vercel

The repo already has a `vercel.json` (D-263) that sets the install command, build command, output
directory, cache headers and SPA fallback. Don't override them in the dashboard.

1. In Vercel, choose **Add New → Project** and import `hassanshirazi-ls/vault-duel` from GitHub. If the repo
   isn't listed, choose **Adjust GitHub App Permissions** and give the Vercel app access to it.
2. Project settings on the import screen:
   - **Framework Preset:** Other
   - **Root Directory:** `./` (the repo root, not `apps/web`)
   - **Build and Output Settings:** leave every override off. `vercel.json` sets
     `pnpm install --frozen-lockfile`, `pnpm build` and `apps/web/dist`.
3. Add the environment variables below, then choose **Deploy**.
4. Production deploys from `main`. Every push to `main` redeploys. Pushes to other branches get preview
   deployments, which by default need a Vercel login to open.
5. After the first deploy:
   - In the build log, `content:check` passes and `seeds:check` prints no warning.
   - **Settings → Build and Deployment → Node.js Version** shows 24.x. It comes from `engines.node`.
   - Open the site on a phone. Loading a path such as `/anything` should show the app, not a 404.

### Environment variables

Set these in **Settings → Environment Variables**, for Production and Preview.

| Variable | Required | Value | Why |
| --- | --- | --- | --- |
| `ENABLE_EXPERIMENTAL_COREPACK` | **Yes** | `1` | Makes Vercel use pnpm 12.11.2 from `packageManager`. Without it Vercel picks an older pnpm from the lockfile version, which ignores `allowBuilds`, so the install or build breaks. |
| `VITE_FEEDBACK_URL` | No | A Tally form URL, e.g. `https://tally.so/r/XXXX` | Shows the feedback link on Home and the daily Result. Unset, or not `https`, hides the link. The link adds `date`, `seed` and `build` query parameters for the form's hidden fields. |

`VITE_FEEDBACK_URL` is read at build time, so redeploy after you change it. For local dev, copy
`apps/web/.env.example` to `apps/web/.env.local` (git ignores it).

Vercel sets `VERCEL_GIT_COMMIT_SHA` on its own. The build stamps its first 7 characters, plus
`CONTENT_VERSION`, as the app's build id. You don't need to set it.

### Commit author

Vercel blocks a deploy when the author of the deployed commit isn't a member of the Vercel account or team.
The latest commit on `main` must be authored with an email on the `hassanshirazi-ls` GitHub account. This
clone sets that locally: `git config user.email hassan.shirazi@leonisstudios.com`. Set the same on any other
machine you commit from.

### Keeping the seeds current

The manifest covers a fixed window of days (now 2026-10-15 to 2027-01-12). When a day has no manifest
entry, or a content or globals change makes the manifest stale, the app falls back to rating the day on the
device, which is slower but still correct. `pnpm build` prints a warning when fewer than the next 30 days are
covered. To refresh it, run `pnpm seeds --from <yesterday> --days 91` (Practice plays yesterday's vault), commit `apps/web/public/seeds.json` and
push.

## Docs

| Document | What it is |
| --- | --- |
| `docs/DEVELOPER_GUIDE.md` | Start here: layout, data flow, commands, deploy |
| `docs/DESIGN.md` | Rules and AI behavior |
| `docs/ARCHITECTURE.md` | Engine, content, AI, sim and web internals |
| `docs/CONTENT_GUIDE.md` | Editing cards, text and numbers without code |
| `docs/DECISIONS.md` | The decision log (D-numbers) |
| `docs/CHANGELOG.md` | Owner-facing tooling changes |
