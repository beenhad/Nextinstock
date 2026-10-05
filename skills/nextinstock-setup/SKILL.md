---
name: nextinstock-setup
description: Guide a seller through installing or updating a local Nextinstock checkout and optionally connecting Discord alerts.
---

# Nextinstock setup

Read `INSTALL_WITH_AI.md` in the repository root before changing files. For optional Discord, read `DISCORD_SETUP.md` and `DISCORD_TEMPLATE.md` only when the seller requests alerts.

Keep seller data outside the project folder through `npm run setup:local`. Preserve an existing `.env.local` and data directory during updates; back them up before migration. Run the project's check, tests, and build, then verify the local app and worker separately.

Ask the seller to enter eBay credentials and Discord webhook URLs directly into the local file or Settings UI. Never request those secrets in chat, print them, or commit them. Keep eBay write mode at `dry-run` until the seller explicitly chooses a controlled live trial and reviews its plan. A Discord test message proves delivery; it does not prove an eBay sale trigger.

Report which checks passed, which required seller action, and whether any live eBay handoff was independently confirmed.
