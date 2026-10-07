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
  const copy = (n, ref, note, price, photo, grade = null) => ({
    id: `copy-${n}`, taskId: "demo-task", queuePosition: n, internalReference: ref, targetPrice: price,
    conditionId: "3000", conditionName: "Good", conditionDescription: note, releaseDelaySeconds: null, needsApproval: false, grade,
    status: "queued", createdAt: now,
    photos: [{ id: `photo-${n}`, copyId: `copy-${n}`, position: 1, originalName: "copy.webp", mimeType: "image/webp",
      byteSize: 200000, width: 1600, height: 1600, sha256: "demo", url: photo, ebayImageId: null, ebayImageUrl: null }],
  });
  const copies = [
    copy(1, "PKXD-011", "No manual. Light disc scratches, tested.", 89.99, next, "good"),
    copy(2, "PKXD-009", "Complete in box, case wear on spine.", 94.99, current, "good"),
    { ...copy(3, "PKXD-012", "Complete, near-mint disc and manual.", 109.99, next, "great"), releaseDelaySeconds: 172800 },
    { ...copy(4, "SAME-1", "", 109.99, next), photos: [], needsApproval: true },
    { ...copy(5, "SAME-2", "", 112.99, next), photos: [] },
    { ...copy(6, "SAME-3", "", 115.99, next), photos: [] },
  ];
  const task = {
    id: "demo-task", itemId: listing.itemId, variationKey: null, status: "active", restockDelaySeconds: null, priceRule: null, listing,
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
    if (path === "/api/tasks" && method === "POST") {
      await wait(latencyMs);
      const created = { ...structuredClone(data.task), id: `task-${tasks.length + 1}`, queuedCopies: [], queuedCopy: null };
      tasks.unshift(created);
      return json(route, { task: created }, 201);
    }
    const approveMatch = path.match(/^\/api\/tasks\/([^/]+)\/approve$/);
    if (approveMatch) {
      const task = tasks.find((t) => t.id === approveMatch[1]);
      task.status = "active";
      return json(route, { approved: true, task });
    }
    if (path === "/api/activity") return json(route, { events: [] });
    if (path === "/api/system/status") return json(route, { status: {
      ebayConfigured: true, ebayCredentialSource: "nextinstock", writeMode: "dry-run", storageDriver: "local",
      storagePath: "", persistentStorage: true, pollSeconds: 30, restockDelaySeconds: 60,
      defaultItemId: "", liveWritesAuthorized: false, liveWritesBlocker: null, discordConnected: true,
    } });
    if (path === "/api/ebay/profile") return json(route, { profile: { userId: "Demo seller", avatarUrl: null, profileUrl: "" } });
    if (path === "/api/ebay/listings") { await wait(400); return json(route, { listing: data.listing }); }
    const taskMatch = path.match(/^\/api\/tasks\/([^/]+)$/);
    if (taskMatch && method === "PATCH") {
      await wait(latencyMs);
      const task = tasks.find((t) => t.id === taskMatch[1]);
      const body = request.postDataJSON();
      if (body.restockDelaySeconds !== undefined) task.restockDelaySeconds = body.restockDelaySeconds;
      if (body.priceRule !== undefined) task.priceRule = body.priceRule;
      if (body.order) task.queuedCopies = body.order.map((id) => task.queuedCopies.find((c) => c.id === id));
      if (body.prices) for (const entry of body.prices) { const c = task.queuedCopies.find((x) => x.id === entry.copyId); c.targetPrice = entry.targetPrice === null ? null : Number(entry.targetPrice); }
      reorder(task);
      return json(route, { task });
    }
    const addMatch = path.match(/^\/api\/tasks\/([^/]+)\/copies$/);
    if (addMatch && method === "POST") {
      await wait(latencyMs);
      const task = tasks.find((t) => t.id === addMatch[1]);
      const text = request.postData() ?? "";
      const field = (name) => (text.match(new RegExp(`name="${name}"\\r\\n\\r\\n([^\\r]*)`)) ?? [])[1];
      const count = Number(field("count") ?? 1);
      const prices = field("prices") ? JSON.parse(field("prices")) : [];
      const start = Number(field("startIndex") ?? 1);
      if (/name="photos"/.test(text)) {
        const n = task.queuedCopies.length + 200;
        task.queuedCopies.push({ id: `copy-${n}`, taskId: task.id, queuePosition: n, internalReference: field("internalReference"),
          targetPrice: field("targetPrice") ? Number(field("targetPrice")) : null, conditionId: "3000", conditionName: "Good",
          conditionDescription: field("conditionDescription") ?? "", releaseDelaySeconds: null, needsApproval: false, grade: field("grade") || null,
          status: "queued", createdAt: new Date().toISOString(),
          photos: [{ id: `p-${n}`, copyId: `copy-${n}`, position: 0, originalName: "x.webp", mimeType: "image/webp", byteSize: 1, width: 1, height: 1, sha256: "x", url: data.next, ebayImageId: null, ebayImageUrl: null }] });
        reorder(task);
        return json(route, { task }, 201);
      }
      for (let i = 0; i < count; i += 1) {
        const n = task.queuedCopies.length + 100 + i;
        task.queuedCopies.push({ id: `copy-${n}`, taskId: task.id, queuePosition: n, internalReference: `${field("internalReference")}-${start + i}`,
          targetPrice: prices[i] === null || prices[i] === undefined ? null : Number(prices[i]), conditionId: "3000", conditionName: "Good",
          conditionDescription: "", releaseDelaySeconds: null, needsApproval: false, grade: null, status: "queued", createdAt: new Date().toISOString(), photos: [] });
      }
      reorder(task);
      return json(route, { task }, 201);
    }
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
        if (body.action === "details") Object.assign(c, Object.fromEntries(Object.entries({ internalReference: body.internalReference, conditionDescription: body.conditionDescription, releaseDelaySeconds: body.releaseDelaySeconds, needsApproval: body.needsApproval, grade: body.grade }).filter(([, v]) => v !== undefined)));
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
