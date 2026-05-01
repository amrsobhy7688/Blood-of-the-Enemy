# Structured Dashboard Rebuild Design

## Goal

Keep the Blood of the Enemy dashboard interface visually unchanged while making the campaign archive modular, easy to validate, and easy to update from future session transcripts.

## Architecture

The current deployed `index.html` is the visual baseline. The rebuild splits that file into source assets:

- `src/styles.css` contains the current CSS.
- `src/app.js` contains the React rendering and interaction code.
- `src/data-loader.js` builds `window.BOTE` from structured data.
- `data/campaign.json` contains campaign metadata, entities, and hooks.
- `data/sessions/*.json` contains one session per file.
- `data/transcripts/*.txt` contains long transcript text, keyed by session id.
- `tools/build-dashboard.js` generates the deployable `index.html` and browser data bundle.
- `tools/validate-data.js` checks data integrity and crosslinks.

The production site remains static on Vercel. GitHub `main` remains the source for automatic Vercel deployment after reviewed updates.

## Data Model

Campaign data is JSON. Explicit crosslinks keep the current `{entityId}` syntax so future transcript updates can add or revise references without editing rendering code. Session files own recaps, beats, scenes, timeline material, surfaced hooks, consequences, and quote echoes. Transcript files remain plain text because they are long and are usually copied in from outside the app.

## Update Workflow

For each new session transcript, Codex will add or update a session JSON file, store the transcript text, revise affected compendium entities and hooks, validate all crosslinks, rebuild the dashboard, and visually compare the result before pushing to GitHub.

## Testing

Validation must fail on broken `{id}` references, duplicate IDs, missing transcript files, malformed sessions, and hook tags that do not resolve to known entities. The build must produce the same dashboard content as the source data. Browser verification must confirm the Recaps page renders after the rebuild.

## Scope

This rebuild does not redesign the UI, rename visible tabs, change Vercel project ownership, or add a CMS. It creates a maintainable static site structure for future transcript-driven updates.
