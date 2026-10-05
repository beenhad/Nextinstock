# Install Nextinstock with Codex or Claude

Give your AI assistant this file and your clone of the Nextinstock repository. You can use this prompt:

> Set up this local Nextinstock checkout on my Mac. Read `INSTALL_WITH_AI.md` and `README.md`. Keep eBay writes in dry-run. Never display, paste into chat, or commit my eBay credentials or Discord webhook. Show me the exact file or browser field where I should enter each secret myself. Verify the app, worker, and a real listing read before saying setup is complete.

## Local setup

1. Install Node.js 22 or newer from its official site if it is missing. In the project folder, run `npm ci` and `npm run setup:local`.
2. Enter your own eBay developer app ID, cert ID, RuName, and refresh token in `.env.local`. The file is private and ignored by git.
3. Run `npm run check`, `npm test`, and `npm run build`.
4. Run `npm run start:local` and open `http://127.0.0.1:3000/tool`. Keep the terminal open and the Mac awake while monitoring.
5. Select an active supported eBay listing and queue its next physical copy. Review a worker check in dry-run before considering live writes.

eBay OAuth write access requires a RuName with a working callback. The current callback setup is described in `README.md`; it is not a one-click customer flow yet. Do not switch to live mode just because the Settings screen says eBay credentials exist.

## Optional Discord alerts

Read `DISCORD_SETUP.md`. You create a webhook in their own server and pastes its URL directly into Nextinstock Settings. A Discord developer account is not needed for outbound alerts.

## Updating

Stop Nextinstock first. Back up `.env.local` and the data directory shown in Settings. Run `git pull`, then `npm ci` and `npm run build`, then restart. The task ledger, photos, and saved grants remain in the separate data directory created by `npm run setup:local`. Never copy an old `.nextinstock/` over a newer version without a backup and migration review.
