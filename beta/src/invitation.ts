export function roomInviteCode(location: Pick<Location, "search" | "hash">): string | null {
  const query = new URLSearchParams(location.search);
  const candidate = query.get("room") ?? query.get("invite") ?? location.hash.match(/^#\/room\/([A-Z0-9]{6})/i)?.[1] ?? "";
  const code = candidate.trim().toUpperCase();
  return /^[A-Z0-9]{6}$/.test(code) ? code : null;
}
