// Shared fixture API for screenshots, recordings, and UI checks of /tool.
export function fixtureData(base) {
  const now = new Date().toISOString();
  const current = `${base}/demos/pokemon-xd-current.webp`;
  const next = `${base}/demos/pokemon-xd-next.webp`;
  const listing = {
    itemId: "900000000102", sku: null, title: "Pokémon XD: Gale of Darkness",
    listingUrl: "", listingType: "FixedPriceItem", listingStatus: "Active", listingDuration: "GTC",
    conditionId: "3000", conditionName: "Good", conditionDescription: "Complete in box. Disc tested.",
    price: 84.99, currency: "USD", quantityTotal: 9, quantitySold: 8, quantityAvailable: 1,
    imageUrls: [current], variationCount: 0, variations: [], variationPictureAxis: null,
    outOfStockControl: true, supported: true, unsupportedReasons: [], fetchedAt: now,
  };
  const copy = (n, ref, note, price, photo) => ({
    id: `copy-${n}`, taskId: "demo-task", queuePosition: n, internalReference: ref, targetPrice: price,
    conditionId: "3000", conditionName: "Good", conditionDescription: note, status: "queued", createdAt: now,
    photos: [{ id: `photo-${n}`, copyId: `copy-${n}`, position: 1, originalName: "copy.webp", mimeType: "image/webp",
      byteSize: 200000, width: 1600, height: 1600, sha256: "demo", url: photo, ebayImageId: null, ebayImageUrl: null }],
  });
  const copies = [
    copy(1, "GC-PKXD-009", "Complete in box. Disc tested.", 84.99, next),
    copy(2, "GC-PKXD-010", "Case has a small crack on the back. Disc clean.", 79.99, current),
    copy(3, "GC-PKXD-011", "No manual. Disc light scratches, tested.", 69.99, next),
  ];
  const task = {
    id: "demo-task", itemId: listing.itemId, variationKey: null, status: "active", listing,
    queuedCopy: copies[0], queuedCopies: copies, armedQuantitySold: 8, lastSeenQuantitySold: 8,
    lastSeenQuantityAvailable: 1, lastCheckedAt: now, lastError: null, createdAt: now, updatedAt: now,
  };
  return { listing, task, current, next };
}

export function installFixtureApi(page, base, { latencyMs = 120, initialTasks } = {}) {
  const data = fixtureData(base);
  let tasks = initialTasks ?? [structuredClone(data.task)];
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reorder = (task) => { task.queuedCopies.forEach((c, i) => { c.queuePosition = i + 1; }); task.queuedCopy = task.queuedCopies[0] ?? null; };
  return page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (path === "/api/tasks" && method === "GET") return json(route, { tasks });
    if (path === "/api/activity") return json(route, { events: [] });
    if (path === "/api/system/status") return json(route, { status: {
      ebayConfigured: true, ebayCredentialSource: "nextinstock", writeMode: "dry-run", storageDriver: "local",
      storagePath: "", persistentStorage: true, pollSeconds: 30, restockDelaySeconds: 60,
      defaultItemId: "", liveWritesAuthorized: false, liveWritesBlocker: null, discordConnected: true,
    } });
    if (path === "/api/ebay/profile") return json(route, { profile: { userId: "Demo seller", avatarUrl: null, profileUrl: "" } });
    if (path === "/api/ebay/listings") { await wait(400); return json(route, { listing: data.listing }); }
    const copyMatch = path.match(/^\/api\/tasks\/([^/]+)\/copies\/([^/]+)$/);
    if (copyMatch) {
      await wait(latencyMs);
      const task = tasks.find((t) => t.id === copyMatch[1]);
      const index = task.queuedCopies.findIndex((c) => c.id === copyMatch[2]);
      if (method === "DELETE") task.queuedCopies.splice(index, 1);
      else {
        const body = request.postDataJSON();
        const c = task.queuedCopies[index];
        if (body.action === "price") c.targetPrice = body.targetPrice ? Number(body.targetPrice) : null;
        if (body.action === "details") Object.assign(c, Object.fromEntries(Object.entries({ internalReference: body.internalReference, conditionDescription: body.conditionDescription }).filter(([, v]) => v !== undefined)));
        if (body.action === "move") { const j = index + (body.direction === "up" ? -1 : 1); [task.queuedCopies[index], task.queuedCopies[j]] = [task.queuedCopies[j], task.queuedCopies[index]]; }
      }
      reorder(task);
      return json(route, { task });
    }
    if (path.endsWith("/check")) {
      await wait(750);
      const task = tasks[0];
      const used = task.queuedCopies.shift();
      task.listing = { ...task.listing, quantitySold: task.listing.quantitySold + 1, imageUrls: [used.photos[0].url], conditionDescription: used.conditionDescription };
      reorder(task);
      return json(route, { result: { message: "Next copy is live on the same listing" } });
    }
    return json(route, { error: `Fixture has no route for ${method} ${path}` }, 404);
  });
}
