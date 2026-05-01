# Blood of the Enemy Dashboard

Static campaign dashboard for the Blood of the Enemy campaign.

The site is built from modular campaign data instead of one giant HTML file. Update the JSON and transcript files, run the checks, then push to GitHub. Vercel automatically rebuilds and publishes the dashboard.

## Main Folders

- `data/` - campaign content, session notes, transcripts, hooks, people, places, and crosslinks.
- `src/` - dashboard code and styles.
- `tools/` - scripts that validate the data and build the static site.
- `test/` - automated checks for the archive tools.
- `assets/` - local vendor files used by the browser build.
- `docs/` - human notes about structure and maintenance.

Generated or private folders are intentionally not part of Git:

- `public/` - generated site output from `npm run build`.
- `.vercel/` - local Vercel project link.
- `.codex/` and `.agents/` - local assistant/project helper settings.

## Update Flow

1. Update the live Google Doc listed in `data/transcript-source.json`.
2. Ask Codex to update the dashboard from the transcript source.
3. Codex reads the Google Doc, updates transcripts, session notes, campaign entries, hooks, timelines, and crosslinks.
4. Run the checks below.
5. Push to GitHub. Vercel deploys automatically.

## Commands

```bash
npm test
npm run validate
npm run build
```

Vercel runs `npm run vercel-build`, which generates the deployable static site in `public/`.

More detail: see `docs/PROJECT_STRUCTURE.md`.
