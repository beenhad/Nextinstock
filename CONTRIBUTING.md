# Contributing to Next

Next is for sellers with another copy waiting on the shelf. If something feels awkward in a real selling workflow, that is useful feedback even if you do not write code.

## Reporting a bug or idea

Use [GitHub Issues](https://github.com/beenhad/Nextinstock/issues/new) and tell us what you were trying to do, what happened, and what you expected. For restock bugs, mention whether the listing was a single item or a variation, and whether Next was in dry-run or live mode. Screenshots help when the problem is visual.

Please remove eBay keys, Discord webhook URLs, buyer information, and private seller details before posting. Report security problems [privately](https://github.com/beenhad/Nextinstock/security/advisories/new).

## Sending a change

Keep pull requests focused on one fix or improvement. Explain what changes for a seller and how you checked it. For UI changes, include a before/after screenshot. For eBay or Discord changes, use fixtures or dry-run mode; do not run automated tests against a live listing.

Run these checks before opening the PR:

```bash
npm ci
npm run check
npm test
npm run build
```

The [setup guide](https://nextinstock.com/docs) covers local configuration. Keep `.env.local` and the local data folder out of commits.
