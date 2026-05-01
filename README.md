# Blood of the Enemy Dashboard

Static campaign dashboard for Blood of the Enemy.

## Update Flow

1. Add or revise structured campaign data in `data/campaign.json`.
2. Add or revise one session file in `data/sessions/`.
3. Store long transcript text in `data/transcripts/`.
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
