import { describe, expect, it } from "vitest";
import { shouldTripCircuitOnEmpty } from "./circuit-breaker.js";

describe("platform circuit policy", () => {
  it("backs off Sahibinden empty/blocked results without treating Letgo empty as failure", () => {
    expect(shouldTripCircuitOnEmpty("sahibinden")).toBe(true);
    expect(shouldTripCircuitOnEmpty("letgo")).toBe(false);
    expect(shouldTripCircuitOnEmpty("arabam")).toBe(false);
  });
});
