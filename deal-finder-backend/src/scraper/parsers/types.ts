/**
 * Shared DOM listing row shape used by marketplace parsers.
 */
export interface ParsedListingRow {
  externalId: string | null;
  title: string | null;
  priceText: string | null;
  city: string | null;
  url: string | null;
  imageUrl: string | null;
}

/**
 * Diagnostics from a live page probe (for logs / tmp dumps).
 */
export interface DomProbeReport {
  title: string;
  htmlLength: number;
  waitSelectorHits: Record<string, number>;
  topCardClasses: Array<{ name: string; count: number }>;
  sampleHrefs: string[];
}
