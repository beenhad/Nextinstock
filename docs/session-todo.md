# Session Todo

Last updated: 2026-07-23 16:24 EDT

## Current State
- The eBay-parity landing page and `/tool` prototype are the visual baseline.
- The local-first working backend is implemented on `codex/ebay-restock-mvp`.
- SellerMaid already provides the eBay application credentials, refresh-token pattern, Trading API reads, and active-listing normalization.

## Now
- Review the working dry-run slice in `/tool`.
- Configure a stable eBay OAuth callback before requesting the write grant.
- Replace the QA copy with the seller's real next physical copy before any live-mode trial.

## Next
- Reauthorize the eBay account with `sell.inventory` after the dry-run slice is verified.
- Run one controlled live restock against the selected listing while it is held at zero.
- Add Google Drive or object storage before running the worker on hosted infrastructure.
- Expand to additional fixed-price listing shapes after the one-listing live trial.

## Blocked
- Live photo upload and listing revision are intentionally blocked until the new eBay write grant is confirmed.
- Google Drive storage is deferred behind the storage adapter; no Google credentials have been supplied.

## Decisions Made
- MVP listing type: fixed-price, single-variation, Good 'Til Cancelled, with Out-of-Stock Control.
- Safe-zero is mandatory: quantity remains zero until every image and condition update succeeds.
- Local disk is the first storage backend; marketplace URLs are outputs, not the image source of truth.
- eBay writes default to dry-run and require an explicit configuration change after OAuth reauthorization.

## Paperclip Routing
- Chief: No routing needed.
- CTO: Current implementation remains in this Codex task.

## Verification Status
- Real item sync confirmed listing `266994813467` as fixed-price, GTC, zero available, eight sold, 13 photos, no variations, and Out-of-Stock Control enabled.
- The full dry-run flow passed in the browser: sync, upload two images, activate, check eBay, and inspect the blocked mutation plan.
- Local image normalization, SQLite persistence, worker dry-run processing, desktop/mobile layout, and the explicit live-write gate passed.
- The copy-after-copy flow passed through both the persistence layer and the actual browser/API path.
- TypeScript, production build, production dependency audit, empty-state worker, and whitespace checks pass.

## Session Handoff
- Continue on `codex/ebay-restock-mvp`; do not enable live eBay writes until the write-scope reconnect and a reviewed mutation preview are complete.
