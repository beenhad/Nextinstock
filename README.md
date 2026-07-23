# Nextinstock

Nextinstock prepares the next physical copy of a replenishable preowned eBay listing, waits for the current copy to sell, and then applies the queued photos and condition note before restoring one unit of available quantity.

This first working slice supports one eBay listing shape:

- Fixed-price, single-variation listing
- Good 'Til Cancelled
- eBay Out-of-Stock Control enabled
- One queued physical copy at a time
- Local image storage on the Mac

## Run it locally

Nextinstock can reuse the existing SellerMaid eBay application credentials without copying them into this repository.

```bash
npm install
cp .env.example .env.local
```

Set `SELLERMAID_ENV_FILE` in `.env.local` to SellerMaid's private environment file. Keep `NEXTINSTOCK_EBAY_WRITE_MODE=dry-run` while testing.

Run the app and worker in separate terminals:

```bash
npm run dev
npm run worker
```

Open [http://localhost:3000/tool](http://localhost:3000/tool).

Use `npm run worker:once` for a single manual listing check.

## How the handoff works

1. Nextinstock reads the live listing and verifies the supported listing shape.
2. The seller adds the next copy's internal reference, condition note, and photos.
3. Photos are normalized to JPEG and stored locally.
4. The worker watches the sold count. The listing remains at zero after the trigger sale.
5. In live mode, the worker uploads the queued photos to eBay Picture Services, replaces the listing's complete photo set, revises the condition note, and restores one available unit.
6. Nextinstock reads the listing again before marking the handoff complete.

Each sale gets one idempotent handoff run. If eBay accepts a revision but confirmation fails, the next worker pass reads eBay first and reconciles the result before attempting another revision.

## Local data

The default data directory is `.nextinstock/`:

```text
.nextinstock/
├── nextinstock.sqlite
├── images/
└── secrets.json
```

The directory is gitignored. Back it up like any other operational data. Set `NEXTINSTOCK_DATA_DIR` to place it on another local drive.

The image layer is behind a storage-driver interface so Google Drive or object storage can replace local disk later. Local storage is intentionally not treated as durable on Vercel; a hosted worker should not be enabled until a persistent storage driver is added.

## Enabling eBay writes

SellerMaid's existing refresh token is enough for the read-only workflow, but Nextinstock requires a new user grant containing:

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
