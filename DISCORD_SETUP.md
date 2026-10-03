# Optional Discord updates

Nextinstock sends messages to one channel through an incoming webhook. A normal Discord server is enough; no developer account or bot is needed. Discord is optional and cannot block an eBay restock.

For a dedicated server, follow [DISCORD_TEMPLATE.md](DISCORD_TEMPLATE.md). It gives the exact channel and webhook layout without needing a bot.

## Manual steps

1. Use an existing private server or create a new one. A server template can provide channel names and permissions, but it cannot supply your private webhook URL.
2. Create a text channel such as `#restock-updates`. In Server Settings → Integrations → Webhooks, create a webhook that posts to that channel. You need permission to manage webhooks.
3. Copy the webhook URL. In Nextinstock → Settings → Discord updates, expand the section, paste the URL, and choose **Connect**. Nextinstock names the webhook and sets its blue `n` avatar automatically. The URL stays in the local secrets file and is never shown again by the app.
4. Choose **Send test message** to verify delivery. Choose **Preview all alerts** to send nine simulated cards using a current one-unit listing and photo from the connected eBay store. They show new sale, awaiting restock, restocking, restocked with and without another queued copy, restock on hold, dry-run, failure, and a listing that needs review. The preview never changes eBay inventory.
5. Keep Nextinstock's worker running for real updates. Real alerts are generated after an eBay listing check confirms the restock state.

The webhook URL is a secret: anyone holding it can post to that channel. Do not paste it into AI chat, screenshots, or a public repository. If exposed, delete the webhook in Discord and create a new one.

Real alerts use the eBay listing or selected variation photo as the thumbnail and the time the worker recorded the event. Sold appears above Available. A sale observed since the previous worker check is labeled **New sale**; a task activated at an already-zero listing is labeled **Awaiting restock**. Green marks new sale, awaiting restock, or completion; blue marks restocking or dry-run; amber marks a hold; red needs attention. The footer identifies the sold-count trigger. The action block shows the queued copy, work to be done, and when restocking becomes eligible. The worker begins on its next check after that time, so it may run later. Completed alerts state how many copies remain queued. The photo must have a public eBay image URL; otherwise the alert omits the thumbnail.

To stop alerts, choose **Disconnect** in Settings. To route alerts to another channel, create a webhook for that channel and use **Replace**. The first version supports one destination channel.
