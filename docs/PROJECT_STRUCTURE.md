# Project Structure

This project is organized so campaign content can grow session by session without rewriting the interface.

## What To Edit

- `data/campaign.json` is the main compendium. It holds campaign meta, player characters, NPCs, places, factions, items, terms, hooks, and crosslinks.
- `data/sessions/` contains one structured JSON file per session. These feed recaps, session notes, timelines, hooks surfaced, and session-specific crosslinks.
- `data/transcripts/` contains the transcript text for each session. These are the source archive files for future review and extraction.
- `data/transcript-source.json` points to the live Google Doc transcript source.

## What Builds The Site

- `src/app.js` renders the dashboard interface.
- `src/data-loader.js` loads and connects the campaign/session data.
- `src/styles.css` controls the visual design.
- `tools/validate-data.js` checks that crosslinks and required fields are valid.
- `tools/build-dashboard.js` creates the static site in `public/`.

## What Not To Edit By Hand

- `public/` is generated output. Recreate it with `npm run build`.
- `.vercel/` stores the local Vercel link.
- `.codex/` and `.agents/` are local assistant helper folders.
- `.git/` is Git history and should be left alone.

## Adding A New Session

1. Put or refresh the transcript in `data/transcripts/`.
2. Add a matching structured session file in `data/sessions/`.
3. Update `data/campaign.json` for new or changed characters, places, factions, terms, items, hooks, and relationships.
4. Use `{entryId}` crosslinks whenever a note refers to an existing campaign entry.
5. Run `npm test`, `npm run validate`, and `npm run build`.
6. Commit and push to GitHub so Vercel deploys the update.
