/** User-facing marketplace names. Internal slugs stay lowercase. */
export function listingPlatformLabel(platform: string | null | undefined): string {
  const key = (platform ?? "").trim().toLowerCase();
  switch (key) {
    case "arabam":
      return "Arabam";
    case "otoplus":
      return "Otoplus";
    case "letgo":
      return "Letgo";
    case "sahibinden":
      return "Sahibinden";
    case "hepsiemlak":
      return "Hepsiemlak";
    default:
      return platform?.trim() || "";
  }
}
