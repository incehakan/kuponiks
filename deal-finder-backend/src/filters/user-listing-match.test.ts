import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    userListingMatch: {
      createMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { persistUserListingMatches } from "./user-listing-match.service.js";

describe("UserListingMatch persistence (stabilization)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. first match creates rows via createMany", async () => {
    const createMany = prisma.userListingMatch.createMany as ReturnType<
      typeof vi.fn
    >;
    createMany.mockResolvedValueOnce({ count: 1 });

    const result = await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 90,
      filterIds: ["f1"],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          filterId: "f1",
          listingId: "l1",
          dealScore: 90,
        },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ created: 1, existing: 0 });
    expect(prisma.userListingMatch.create).not.toHaveBeenCalled();
  });

  it("2. duplicate user/filter/listing does not create a second row", async () => {
    const createMany = prisma.userListingMatch.createMany as ReturnType<
      typeof vi.fn
    >;
    createMany.mockResolvedValueOnce({ count: 0 });

    const result = await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 90,
      filterIds: ["f1"],
    });

    expect(result).toEqual({ created: 0, existing: 1 });
    expect(prisma.userListingMatch.update).not.toHaveBeenCalled();
  });

  it("3. uses skipDuplicates — no P2002 create/catch control flow", async () => {
    const createMany = prisma.userListingMatch.createMany as ReturnType<
      typeof vi.fn
    >;
    createMany.mockResolvedValueOnce({ count: 0 });

    await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 70,
      filterIds: ["f1"],
    });

    expect(createMany.mock.calls[0]?.[0]?.skipDuplicates).toBe(true);
    expect(prisma.userListingMatch.create).not.toHaveBeenCalled();
  });

  it("4. matchedAt preserved — duplicates never update existing rows", async () => {
    const createMany = prisma.userListingMatch.createMany as ReturnType<
      typeof vi.fn
    >;
    createMany.mockResolvedValueOnce({ count: 0 });

    await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 99,
      filterIds: ["f1"],
    });

    expect(prisma.userListingMatch.update).not.toHaveBeenCalled();
    expect(prisma.userListingMatch.create).not.toHaveBeenCalled();
  });

  it("5. multiple filters create separate match rows", async () => {
    const createMany = prisma.userListingMatch.createMany as ReturnType<
      typeof vi.fn
    >;
    createMany.mockResolvedValueOnce({ count: 2 });

    const result = await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 80,
      filterIds: ["f1", "f2", "f1"],
    });

    expect(createMany).toHaveBeenCalledWith({
      data: [
        {
          userId: "u1",
          filterId: "f1",
          listingId: "l1",
          dealScore: 80,
        },
        {
          userId: "u1",
          filterId: "f2",
          listingId: "l1",
          dealScore: 80,
        },
      ],
      skipDuplicates: true,
    });
    expect(result).toEqual({ created: 2, existing: 0 });
  });

  it("6. empty filterIds is a no-op", async () => {
    const result = await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 80,
      filterIds: [],
    });
    expect(result).toEqual({ created: 0, existing: 0 });
    expect(prisma.userListingMatch.createMany).not.toHaveBeenCalled();
  });
});
