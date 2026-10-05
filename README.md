# Nextinstock

Free, open-source restock automation for eBay sellers. MIT licensed. Website: [nextinstock.com](https://nextinstock.com)

Nextinstock prepares the next physical copy of a replenishable preowned eBay listing and waits for the selected listing or variation to reach zero. Single-item tasks apply queued photos and condition before restoring one unit; variation tasks retain eBay's existing photos and shared listing condition.

The local MVP supports fixed-price listings with or without variations:

- Good 'Til Cancelled
- eBay Out-of-Stock Control enabled
- Ordered queue of up to 100 physical copies per task, each with an optional restock price
- Local image storage on the Mac

For multi-variation listings, choose the exact variation for each task. The setup list can show all options or a saved subset; search always finds every option. Each variation uses its own sold count and available quantity. Tasks on the same eBay item are checked serially.

## Run it locally

For a guided setup with an AI assistant, follow [INSTALL_WITH_AI.md](INSTALL_WITH_AI.md). Setup creates a data directory outside the project folder so `git pull` never touches queued photos or the SQLite ledger. [DISCORD_SETUP.md](DISCORD_SETUP.md) covers optional channel alerts.

```bash
git clone https://github.com/beenhad/Nextinstock.git
cd Nextinstock
npm ci
npm run setup:local
```

Enter your own eBay developer credentials in `.env.local`. Keep `NEXTINSTOCK_EBAY_WRITE_MODE=dry-run` while testing. The setup command places operational data in your user Library outside the project folder.

Build, then run the app and worker together:

```bash
npm run build
npm run start:local
```

Open [http://127.0.0.1:3000/tool](http://127.0.0.1:3000/tool).

Use `npm run worker:once` for a single manual listing check.

## How the handoff works

1. Nextinstock reads the live listing and verifies the supported listing shape.
2. The seller queues copies in selling order, with an internal reference and optional restock price for each. Single-item tasks also require a condition note and photos; variation tasks may store them internally if useful. Queue prices and order can be edited in the tool before a handoff.
3. Photos are normalized to JPEG and stored locally.
4. The worker watches the sold count. The listing remains at zero after the trigger sale. A live restock is scheduled after a persisted 60-second hold by default; the next worker check after that time begins the handoff. Set `NEXTINSTOCK_RESTOCK_DELAY_SECONDS` to adjust the hold (15–900 seconds).
5. For a single-item task in live mode, the worker uploads the queued photos to eBay Picture Services and revises the listing's complete photo set, condition note, and optional planned price while quantity stays at zero.
6. After reading back and verifying those details and the planned price, the worker restores one available unit. For a variation task, eBay requires the variation's price and nonzero quantity in the same revision, so the worker applies them together and verifies both by reading the listing back. The next queued copy then becomes first in line.

For a variation, the prepared mutation changes only that option's quantity and optional planned price. Internal copy photos and notes are optional; eBay retains its existing photos and the listing's shared condition note. Variation writes still require the normal live-write grant. eBay may reset automatic Best Offer thresholds when a fixed-price listing's price changes; review those settings if you use them.

Each sale gets one idempotent handoff run. If eBay accepts a revision but confirmation fails, the next worker pass reads eBay first and reconciles the result before attempting another revision.

## Local data

`npm run setup:local` sets `NEXTINSTOCK_DATA_DIR` to `~/Library/Application Support/Nextinstock` on macOS. Without that setting, the development fallback is `.nextinstock/`:

```text
.nextinstock/
├── nextinstock.sqlite
├── images/
└── secrets.json
```

The directory is gitignored. Back it up like any other operational data. Set `NEXTINSTOCK_DATA_DIR` to place it on another local drive.

The image layer is behind a storage-driver interface so Google Drive or object storage can replace local disk later. Local storage is intentionally not treated as durable on Vercel; a hosted worker should not be enabled until a persistent storage driver is added.

## Enabling eBay writes

An eBay read grant supports the read-only workflow, but Nextinstock requires a user grant containing this scope for writes:

```text
https://api.ebay.com/oauth/api_scope/sell.inventory
```

Before reconnecting:

1. Configure the eBay developer RuName's accepted URL as `https://<your-stable-host>/api/ebay/auth/callback`.
2. Open Settings in Nextinstock and reconnect eBay.
3. Review a dry-run restock plan.
4. Set `NEXTINSTOCK_EBAY_WRITE_MODE=live` and restart the app and worker.

Live writes require both the explicit `live` setting and a locally stored Nextinstock grant with the write scope. Changing the environment variable alone does not unlock writes.

## Verification

```bash
npm run check
npm run build
npm audit --omit=dev
```

The UI and API remain useful in dry-run mode: listing sync, task creation, local image persistence, sold-count checks, restock plans, activity history, and repeat-copy queuing all run without mutating eBay.

## Website

The marketing site (`/` and `/docs`) deploys to Vercel. The hosted build blocks every local tool route (`/tool` and the task, eBay, photo, and settings APIs), so the tool only ever runs on your own machine.

## Contributing

Issues and pull requests are welcome. Run `npm run check`, `npm test`, and `npm run build` before opening a PR. Never commit `.env.local` or the data folder.

## License

[MIT](LICENSE)
