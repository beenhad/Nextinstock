<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/header-dark.png">
    <img src=".github/readme/header-light.png" width="760" alt="next. Restocks that never stop. Free and open source, MIT, runs on your Mac.">
  </picture>
</p>

<p align="center">
  <a href="https://nextinstock.com"><b>nextinstock.com</b></a> &nbsp;·&nbsp;
  <a href="https://nextinstock.com/docs"><b>Setup guide</b></a> &nbsp;·&nbsp;
  <a href="DISCORD_SETUP.md"><b>Discord alerts</b></a>
</p>

<p align="center">
  <img src="public/demos/hero-release-line.webp" width="880" alt="The release line: the copy on eBay now, followed by the copies lined up to sell next, each with its own price.">
</p>

Got five copies of a game and one eBay listing that already has a sold count? That's the headache Next is built for. Line up the copies once. When one sells, Next puts the next one on the **same item number** instead of making you start a new listing.

It's free, open source, and runs on your Mac. You can watch a dry run before you let it touch a live listing. 📦

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/readme/steps-dark.png">
    <img src=".github/readme/steps-light.png" width="880" alt="1 Pick the listing. 2 Line up your copies. 3 Set the pace. 4 It sells, next goes up.">
  </picture>
</p>

<p align="center">
  <img src=".github/readme/restock.gif" width="760" alt="A copy sells and the next one goes live on the same listing.">
</p>

## Get it running

You'll need a Mac with Node.js 22+, an eBay seller account, and your own eBay developer keys. No Next account to make.

```bash
git clone https://github.com/beenhad/Nextinstock.git
cd Nextinstock
npm ci
npm run setup:local      # creates .env.local and a private data folder
npm run build
npm run start:local      # app + worker
```

Open [127.0.0.1:3000/tool](http://127.0.0.1:3000/tool). Put your eBay keys in `.env.local` on your own machine, never in a chat or commit. Next starts in **test mode**; it won't change an eBay listing until you explicitly turn live mode on.

If the eBay developer setup feels fiddly, the [step-by-step guide](https://nextinstock.com/docs) goes through it. There's also an [AI-assisted setup guide](INSTALL_WITH_AI.md) if that's your thing.

## What you can line up

- **One-off copies:** that used game with a scuffed case gets its own photos, condition note, and price. The next copy can be completely different. 🎮
- **Identical stock:** stack copies behind the listing's existing photos. You can set a different price for each one.
- **Your pace:** go right away, wait between copies, or hold one until you give the nod.
- **Variations:** choose the exact option to restock; Next changes that option's quantity and price.
- **Discord pings:** see what sold, what went live, and when a copy needs your approval.

Keys, queue data, and photo originals are stored locally. When you go live, Next sends the listing updates you choose to eBay; Discord alerts go to the webhook you configure.

Works with active fixed-price, Good 'Til Cancelled listings with eBay's Out-of-Stock Control turned on.

<details>
<summary><b>What happens after a sale</b></summary>

1. The worker checks your listings every 30 seconds (`NEXTINSTOCK_POLL_SECONDS`).
2. A sale takes the listing or variation to zero. Out-of-Stock Control keeps it alive.
3. Next waits at least 60 seconds by default, or longer if you set a wait for that copy (`NEXTINSTOCK_RESTOCK_DELAY_SECONDS`, 15–900).
4. For a single-item listing it uploads that copy's photos, updates the condition note and price, reads the listing back to confirm, then sets quantity to 1.
5. For a variation, eBay needs price and quantity in one revision, so Next applies both together and confirms them.
6. The next copy in line moves up.

Next records each handoff. If eBay accepts a change but the confirmation fails, the next check reads eBay first before retrying. One eBay gotcha: changing a price can reset automatic Best Offer thresholds, so check those if you use them.
</details>

<details>
<summary><b>Turning on live restocks</b></summary>

Reading listings only needs a read grant. Writing needs a grant with this scope:

```text
https://api.ebay.com/oauth/api_scope/sell.inventory
```

1. In the eBay developer portal, set your RuName's accepted URL to `https://<your-stable-host>/api/ebay/auth/callback`.
2. In Next, open **Settings** and choose **Allow listing updates**.
3. Let a dry run play out and check the history.
4. Set `NEXTINSTOCK_EBAY_WRITE_MODE=live` in `.env.local` and restart `npm run start:local`.

Live writes need both the `live` setting and the stored write grant. The environment variable alone unlocks nothing.
</details>

<details>
<summary><b>Where your data lives</b></summary>

`npm run setup:local` points `NEXTINSTOCK_DATA_DIR` at `~/Library/Application Support/Nextinstock`, outside the project folder, so `git pull` never touches it. Without that setting it falls back to `.nextinstock/` (gitignored):

```text
nextinstock.sqlite   listings, copies and history
images/              copy photos
secrets.json         eBay grant and Discord webhook (mode 600)
```

Back it up like any other business data.
</details>

## Come back for updates

```bash
git pull && npm ci && npm run build && npm run start:local
```

Your `.env.local` and data folder stay put. If a release changes setup steps, the [guide](https://nextinstock.com/docs) will say so.

## Help make it better

Sell cards, records, games, or something we haven't thought of? [Tell us what breaks or feels awkward](https://github.com/beenhad/Nextinstock/issues/new). Small fixes and pull requests are welcome too. Before opening a PR, run:

```bash
npm run check && npm test && npm run build
```

Please keep `.env.local`, buyer information, and the data folder out of commits and public issues. The site (`/` and `/docs`) deploys to Vercel; the hosted build blocks tool routes. The actual restock tool runs on your machine.

There is a short [contribution guide](CONTRIBUTING.md) for reports and pull requests. If you find a security problem, use the [private reporting instructions](SECURITY.md).

## License

[MIT](LICENSE). Independent software for eBay sellers, not affiliated with eBay.
