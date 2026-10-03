---
name: nextinstock-setup
description: Guide a buyer through installing or updating a local Nextinstock release and optionally connecting Discord alerts.
---

# Nextinstock setup

Read `INSTALL_WITH_AI.md` in the release root before changing files. For optional Discord, read `DISCORD_SETUP.md` and `DISCORD_TEMPLATE.md` only when the buyer requests alerts.

Keep customer data outside the release folder through `npm run setup:local`. Preserve an existing `.env.local` and data directory during updates; back them up before migration. Run the package's check, tests, and build, then verify the local app and worker separately.

Ask the buyer to enter eBay credentials and Discord webhook URLs directly into the local file or Settings UI. Never request those secrets in chat, print them, or commit them. Keep eBay write mode at `dry-run` until the buyer explicitly chooses a controlled live trial and reviews its plan. A Discord test message proves delivery; it does not prove an eBay sale trigger.

Report which checks passed, which required buyer action, and whether any live eBay handoff was independently confirmed.
