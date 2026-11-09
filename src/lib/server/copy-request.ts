import { createHash } from "node:crypto";

export async function copyRequest(form: FormData, taskId = "new"): Promise<{ id: string; fingerprint: string } | undefined> {
  const id = String(form.get("requestId") ?? "");
  if (!id) return undefined;
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error("Invalid copy request ID");
  const hash = createHash("sha256").update(taskId);
  for (const key of ["itemId", "variationKey", "internalReference", "conditionDescription", "targetPrice", "startEmpty", "count", "prices", "releaseDelaySeconds", "needsApproval", "grade", "afterCopyId", "startIndex"]) {
    hash.update(JSON.stringify([key, String(form.get(key) ?? "")]));
  }
  for (const file of form.getAll("photos")) {
    if (!(file instanceof File)) throw new Error("Invalid photo");
    if (file.size > 20 * 1024 * 1024) throw new Error("Each photo must be at most 20 MB");
    hash.update(JSON.stringify([file.name, file.type, file.size]));
    hash.update(new Uint8Array(await file.arrayBuffer()));
  }
  return { id, fingerprint: hash.digest("hex") };
}
