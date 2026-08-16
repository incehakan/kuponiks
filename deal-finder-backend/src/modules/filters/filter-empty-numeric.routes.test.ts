/**
 * Proves Fastify/Ajv empty/null numeric coercion and filter route hardening.
 *
 * Root cause (production maxMileage=0):
 * anyOf:[{type:integer},{type:null}] + coerceTypes coerces JSON null → 0.
 * Mobile sends maxMileage:null for empty inputs → DB stored 0.
 */
import Fastify from "fastify";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("../../middlewares/auth.middleware.js", () => ({
  authenticate: async (request: {
    user?: { id: string; subscriptionPlan: string };
  }) => {
    request.user = { id: "u1", subscriptionPlan: "VIP" };
  },
  optionalAuthenticate: async () => undefined,
}));

vi.mock("./filter.service.js", () => ({
  filterService: {
    createFilter: vi.fn(async (_u, _p, input) => ({
      id: "f1",
      ...input,
    })),
    updateFilter: vi.fn(async (_id, _u, input) => ({
      id: "f1",
      ...input,
    })),
    getUserFilters: vi.fn(async () => []),
    deleteFilter: vi.fn(),
  },
}));

import { filterRoutes } from "./filter.routes.js";
import { filterService } from "./filter.service.js";
import { normalizeEmptyNumericFilterFields } from "./optional-numeric.js";

describe("Ajv nullable numeric footgun (documented)", () => {
  it("integer-first anyOf coerces null → 0 (legacy bug)", async () => {
    const app = Fastify();
    app.post(
      "/",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              maxMileage: {
                anyOf: [{ type: "integer", minimum: 0 }, { type: "null" }],
              },
            },
          },
        },
      },
      async (request) => request.body,
    );
    await app.ready();
    const res = await app.inject({
      method: "POST",
      url: "/",
      payload: { maxMileage: null },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ maxMileage: 0 });
    await app.close();
  });

  it("type:[integer,null] keeps null, 0, and empty→null", async () => {
    const app = Fastify();
    app.post(
      "/",
      {
        schema: {
          body: {
            type: "object",
            properties: {
              maxMileage: { type: ["integer", "null"], minimum: 0 },
            },
          },
        },
      },
      async (request) => request.body,
    );
    await app.ready();
    for (const [payload, expected] of [
      [{ maxMileage: null }, { maxMileage: null }],
      [{ maxMileage: "" }, { maxMileage: null }],
      [{ maxMileage: 0 }, { maxMileage: 0 }],
      [{ maxMileage: "0" }, { maxMileage: 0 }],
    ] as const) {
      const res = await app.inject({
        method: "POST",
        url: "/",
        payload,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(expected);
    }
    await app.close();
  });
});

describe("Filter routes empty-numeric hardening", () => {
  const app = Fastify();

  beforeAll(async () => {
    await app.register(filterRoutes, { prefix: "/filters" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("POST create: empty strings become null before service", async () => {
    vi.mocked(filterService.createFilter).mockClear();
    const res = await app.inject({
      method: "POST",
      url: "/filters",
      payload: {
        category: "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
        minYear: 2016,
        maxYear: 2018,
        minMileage: "",
        maxMileage: "",
        minDealScore: 50,
        city: "Tüm Türkiye",
      },
    });
    expect(res.statusCode).toBe(201);
    const input = vi.mocked(filterService.createFilter).mock.calls[0]?.[2];
    expect(input?.maxMileage).toBeNull();
    expect(input?.minMileage).toBeNull();
  });

  it("POST create: explicit null stays null (production mobile path)", async () => {
    vi.mocked(filterService.createFilter).mockClear();
    const res = await app.inject({
      method: "POST",
      url: "/filters",
      payload: {
        category: "Vasıta > Otomobil",
        brand: "Honda",
        series: "Civic",
        minYear: 2016,
        maxYear: 2018,
        minMileage: null,
        maxMileage: null,
        minDealScore: 50,
        city: "Tüm Türkiye",
      },
    });
    expect(res.statusCode).toBe(201);
    const input = vi.mocked(filterService.createFilter).mock.calls[0]?.[2];
    expect(input?.maxMileage).toBeNull();
    expect(input?.minMileage).toBeNull();
  });

  it("PUT update: empty maxMileage → null", async () => {
    vi.mocked(filterService.updateFilter).mockClear();
    const res = await app.inject({
      method: "PUT",
      url: "/filters/6a70c7f0-c475-470b-a5f7-def15bebf885",
      payload: {
        maxMileage: "",
        minDealScore: 50,
      },
    });
    expect(res.statusCode).toBe(200);
    const input = vi.mocked(filterService.updateFilter).mock.calls[0]?.[2];
    expect(input?.maxMileage).toBeNull();
  });

  it("PUT update: explicit null → null", async () => {
    vi.mocked(filterService.updateFilter).mockClear();
    const res = await app.inject({
      method: "PUT",
      url: "/filters/6a70c7f0-c475-470b-a5f7-def15bebf885",
      payload: { maxMileage: null, minMileage: null },
    });
    expect(res.statusCode).toBe(200);
    const input = vi.mocked(filterService.updateFilter).mock.calls[0]?.[2];
    expect(input?.maxMileage).toBeNull();
    expect(input?.minMileage).toBeNull();
  });

  it("PUT update: explicit 0 preserved", async () => {
    vi.mocked(filterService.updateFilter).mockClear();
    const res = await app.inject({
      method: "PUT",
      url: "/filters/6a70c7f0-c475-470b-a5f7-def15bebf885",
      payload: { maxMileage: 0 },
    });
    expect(res.statusCode).toBe(200);
    const input = vi.mocked(filterService.updateFilter).mock.calls[0]?.[2];
    expect(input?.maxMileage).toBe(0);
  });

  it("PUT update: omitted maxMileage not present on body after normalize", async () => {
    const body: Record<string, unknown> = { minDealScore: 50 };
    normalizeEmptyNumericFilterFields(body);
    expect("maxMileage" in body).toBe(false);
  });

  it("mobile payload builder: empty mileage → null (shared util)", async () => {
    const { buildVehicleNumericPayload } = await import(
      "../../../../deal-finder-mobile/src/utils/filterNumericPayload.ts"
    );
    const payload = buildVehicleNumericPayload({
      minYear: "2016",
      maxYear: "2018",
      minMileage: "",
      maxMileage: "",
      minPrice: "",
      maxPrice: "",
    });
    expect(payload.maxMileage).toBeNull();
    expect(payload.minMileage).toBeNull();
  });
});
