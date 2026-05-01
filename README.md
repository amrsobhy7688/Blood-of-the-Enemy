# Blood of the Enemy Dashboard

Static campaign dashboard for Blood of the Enemy.

## Update Flow

1. Update the live Google Doc listed in `data/transcript-source.json`.
2. Ask Codex to update the dashboard from the transcript source.
3. Codex reads the Google Doc, updates `data/transcripts/`, `data/sessions/`, `data/campaign.json`, hooks, timeline entries, and crosslinks.
4. Run `npm run validate`.
5. Run `npm run build`.
6. Serve `public/` locally or push to GitHub for Vercel deployment.

## Commands

```bash
npm test
npm run validate
npm run build
```

Vercel runs `npm run vercel-build`, which generates the deployable static site in `public/`.
