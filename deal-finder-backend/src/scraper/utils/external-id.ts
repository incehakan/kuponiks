/**
 * Canonical platform-scoped external id: `platform:rawId` (no double prefix).
 */
export function canonicalizeExternalId(
  platform: string,
  rawId: string,
): string {
  const p = platform.trim().toLowerCase();
  let id = rawId.trim();
  const prefix = `${p}:`;
  while (id.toLocaleLowerCase("tr-TR").startsWith(prefix)) {
    id = id.slice(prefix.length).trim();
  }
  if (!id) {
    throw new Error(`canonicalizeExternalId: empty id for platform=${p}`);
  }
  return `${p}:${id}`;
}
