# Suggested Discord server template

Use the [Nextinstock Alerts Discord server template](https://discord.new/GavFccHpQgcW) if you want a separate server. An existing private server works too. The template copies channel layout and permissions; it does not copy messages or the webhook.

| Item | Suggested setup |
| --- | --- |
| Server | `Nextinstock Alerts` |
| Category | `Notifications` |
| Text channel | `#restock-updates` for the webhook |
| Webhook | Target `#restock-updates`; Nextinstock sets its name and blue `n` avatar when connected |
| Members | Only people you choose to invite |

After creating the server, use **Server Settings → Integrations → Webhooks → New Webhook**. Choose `#restock-updates` and copy the URL directly into Nextinstock Settings. Every buyer must create their own webhook. The URL is a secret; never put it in a server template or AI prompt.

Nextinstock v1 posts to one channel. **Preview all alerts** shows nine simulated states: new sale, awaiting restock, restocking, restocked with another queued copy, restocked with no copy queued, restock on hold, dry-run, failure, and review needed. Real alerts include the sold-count trigger, stock counts, and next action. The webhook sends no Discord role mentions.

Discord templates do not copy the source server icon. The webhook's blue `n` avatar is set automatically when connected. If you also want the server icon to match, upload [`assets/nextinstock-webhook-avatar.png`](assets/nextinstock-webhook-avatar.png) in **Server Settings → Server Profile** after creating your server.
