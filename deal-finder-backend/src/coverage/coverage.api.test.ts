import Fastify from "fastify";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "../lib/http-error.js";

vi.mock("../middlewares/auth.middleware.js", () => ({
  authenticate: async (request: {
    headers: { authorization?: string };
    user?: { id: string; subscriptionPlan: string };
  }) => {
    const header = request.headers.authorization;
    if (!header) {
      throw new HttpError(
        "Yetkilendirme başlığı eksik veya geçersiz. Beklenen format: Bearer <token>",
        401,
        "UnauthorizedError",
      );
    }
    if (header.includes("other")) {
      request.user = { id: "user-b", subscriptionPlan: "VIP" };
      return;
    }
    request.user = { id: "user-a", subscriptionPlan: "VIP" };
  },
}));

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    userFilter: { findFirst: vi.fn() },
  },
}));

vi.mock("./platform-availability.js", () => ({
  loadAvailabilityMap: vi.fn(async () => ({
    arabam: { availability: "AVAILABLE", reason: "none" },
    letgo: { availability: "DEGRADED", reason: "empty" },
    sahibinden: { availability: "UNAVAILABLE", reason: "cloudflare" },
  })),
}));

vi.mock("./provider-reliability-store.js", () => ({
  loadReliabilityMap: vi.fn(async () => ({
    arabam: "HEALTHY",
    letgo: "NO_DATA",
    sahibinden: "FAILING",
  })),
}));

import { prisma } from "../lib/prisma.js";
import { coverageRoutes } from "./coverage.routes.js";
import { defaultAvailabilityMap } from "./coverage-engine.js";

const hondaFilter = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "user-a",
  category: "Vasıta > Otomobil",
  brand: "Honda",
  series: "Civic",
  trim: null,
  minYear: 2016,
  maxYear: 2018,
  minMileage: null,
  maxMileage: null,
  city: "Tüm Türkiye",
  keywords: [],
  minDealScore: 50,
  notifyPush: true,
};

describe("Coverage API", () => {
  const mockedPrisma = prisma as unknown as {
    userFilter: { findFirst: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockedPrisma.userFilter.findFirst.mockResolvedValue(hondaFilter);
  });

  async function buildTestApp() {
    const app = Fastify();
    app.setErrorHandler((error, _request, reply) => {
      const statusCode = (error as { statusCode?: number }).statusCode ?? 500;
      return reply.status(statusCode).send({
        statusCode,
        error: error.name,
        message: error.message,
      });
    });
    await app.register(coverageRoutes, { prefix: "/api/filters" });
    await app.ready();
    return app;
  }

  it("21. filter owner coverage 200", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
      headers: { authorization: "Bearer owner-token" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.filterId).toBe(hondaFilter.id);
    expect(body.monitoredPlatformCount).toBe(1);
    expect(body.activeSourceCount).toBe(1);
    expect(body.statusLabel).toBe("1 kaynak aktif");
    expect(body.monitoredLabel).not.toContain("2/3");
    const letgo = body.platforms.find((p: { platform: string }) => p.platform === "letgo");
    expect(letgo.reliability).toBe("NO_DATA");
    expect(letgo.effectiveStatus).toBe("NO_DATA");
    expect(body.platforms.find((p: { platform: string }) => p.platform === "arabam").status).toBe(
      "FULL",
    );
    await app.close();
  });

  it("22. other user 404", async () => {
    mockedPrisma.userFilter.findFirst.mockResolvedValue(null);
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
      headers: { authorization: "Bearer other-token" },
    });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it("23. unauth 401", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it("24. response is secret-free", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
      headers: { authorization: "Bearer owner-token" },
    });
    const raw = res.body;
    expect(raw).not.toMatch(/JWT|DATABASE_URL|password|Bearer |cloudflare/i);
    await app.close();
  });

  it("25. Cloudflare reason is simplified for users", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
      headers: { authorization: "Bearer owner-token" },
    });
    const sahibinden = res.json().platforms.find(
      (p: { platform: string }) => p.platform === "sahibinden",
    );
    expect(sahibinden.availability).toBe("UNAVAILABLE");
    expect(sahibinden.availabilityReason).toBe("temporarily_unavailable");
    expect(JSON.stringify(sahibinden)).not.toMatch(/cloudflare/i);
    await app.close();
  });

  it("no_data is not counted as active", async () => {
    const app = await buildTestApp();
    const res = await app.inject({
      method: "GET",
      url: `/api/filters/${hondaFilter.id}/coverage`,
      headers: { authorization: "Bearer owner-token" },
    });
    const body = res.json();
    expect(body.activeSourceCount).toBe(1);
    expect(body.limitedSourceCount).toBe(2);
    expect(body.unavailableSourceCount).toBe(1);
    const otoplus = body.platforms.find(
      (p: { platform: string }) => p.platform === "otoplus",
    );
    expect(otoplus.reliability).toBe("UNKNOWN");
    expect(otoplus.effectiveStatus).toBe("LIMITED");
    await app.close();
  });
});

describe("default availability (no live Redis)", () => {
  it("matches production known defaults", () => {
    const map = defaultAvailabilityMap();
    expect(map.arabam?.availability).toBe("AVAILABLE");
    expect(map.otoplus?.availability).toBe("AVAILABLE");
    expect(map.letgo?.availability).toBe("DEGRADED");
    expect(map.sahibinden?.availability).toBe("UNAVAILABLE");
    expect(map.sahibinden?.reason).toBe("cloudflare");
  });
});
