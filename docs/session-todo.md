# Nextinstock MVP status

Updated: 2026-10-02 EDT

## Verified today

- The local app loads, and the eBay credentials supplied through SellerMaid can read the configured listing. Live writes remain in dry-run mode.
- The configured item `266994813467` is now **Completed**, with zero available and eight sold. The task builder rejects it as unsupported. It cannot serve as the next live trial.
- The local ledger currently has no restock tasks or activity. The July browser run in the old session notes is historical evidence, not a current end-to-end result.
- `nextinstock.vercel.app` still serves an older production deployment from July. Its `/api/system/status` returns 404; none of this session's backend or UI changes are deployed there.
- TypeScript, production build, the handoff confirmation test, and the production dependency audit pass. The dependency audit reports zero vulnerabilities after the Next.js and Sharp updates.
- The worker now stages photos and condition at zero, verifies them, then restores one available unit and verifies again. A recoverable per-task lease prevents simultaneous worker and manual checks. These paths are covered by local tests, not a live eBay trial. Live writes are blocked on Vercel's ephemeral filesystem.
- Multi-variation item `267535199020` reads 26 color options, including SKU-less options. The local UI can show all colors or a saved subset and search all 26. The seller selects one restock target per task; task checks use that color's sold/available counts, and item-level leasing serializes revisions. Browser check, parser tests, schema migration tests, TypeScript, and build pass.
- The variation revision is quantity-only, using existing eBay variation photos and the shared listing condition. Next-copy photos and notes are optional internal records. No live variation revision has been attempted.
- An isolated local dry-run created a task for zero-stock Spice Orange with no photo or condition note. The worker returned `dry_run_ready` with only the selected variation's quantity-to-one mutation in its plan; the temporary database was removed afterward.
- The sold-count trigger now has direct tests for manual 1→0, sold-count increase at zero, and a task created at zero. Discord settings, test/demo messages, and deduplicated delivery code build locally; no Discord webhook or live sale alert is connected yet.
- A one-time Checkout path, paid-session download gate, setup guide, and source release ZIP are prepared locally. Stripe credentials, a release asset URL, payment tests, fulfillment email, and the live eBay handoff are still missing. Sales default to off.

## Next functional gates

1. For a single-item live trial, select an **active**, fixed-price, no-variation, Good 'Til Cancelled listing with Out-of-Stock Control and at most one available unit. Obtain its actual next-copy photos and condition note. For a variation dry-run, use a color from `267535199020`.
2. Repeat the full dry-run: sync, queue, worker check, plan inspection, and repeat-copy flow with that item. Keep write mode dry-run.
3. Configure a stable eBay OAuth callback, obtain a Nextinstock grant with `sell.inventory`, and review the exact mutation plan before a controlled live trial. The photo upload and listing revision have **not** been independently verified live.
4. Verify the live readback on eBay: item number, available quantity, every photo in order, condition, and activity history. Rehearse failure and retry handling.

## Local download launch gates

- Prove a controlled live eBay handoff and a new buyer's OAuth setup without SellerMaid credentials.
- Verify the downloadable release on a clean Mac account, including data preservation after an update.
- Connect a buyer-owned Discord webhook and verify test, demo, and worker alerts in a private channel.
- Configure Stripe's one-time price, release asset, and fulfillment email. Test success, cancellation, unpaid download denial, and repeat download. Sales remain off until these pass.
- Deploy the marketing checkout with local tool routes blocked and verify that block on the hosted origin.

## Current blockers

- Need an active trial item and its next physical copy.
- No live eBay revision has been verified. New buyer OAuth callback setup remains too manual.
- Discord server/webhook setup and Stripe checkout are not yet connected or verified externally.
