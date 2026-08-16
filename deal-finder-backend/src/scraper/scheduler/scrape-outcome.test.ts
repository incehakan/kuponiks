import { describe, expect, it } from "vitest";
import { classifyScrapeOutcome } from "./scrape-outcome.js";

describe("classifyScrapeOutcome", () => {
  it("marks adapter errors as failure", () => {
    expect(
      classifyScrapeOutcome({
        platform: "arabam",
        rawCount: 10,
        error: new Error("boom"),
      }),
    ).toBe("failure");
  });

  it("marks zero raw as empty (including Letgo)", () => {
    expect(
      classifyScrapeOutcome({
        platform: "letgo",
        rawCount: 0,
        error: null,
      }),
    ).toBe("empty");
  });

  it("marks positive raw as success", () => {
    expect(
      classifyScrapeOutcome({
        platform: "arabam",
        rawCount: 12,
        error: null,
      }),
    ).toBe("success");
  });
});
