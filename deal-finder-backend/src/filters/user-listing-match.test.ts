import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

vi.mock("../lib/prisma.js", () => ({
  prisma: {
    userListingMatch: {
      create: vi.fn(),
    },
  },
}));

import { prisma } from "../lib/prisma.js";
import { persistUserListingMatches } from "./user-listing-match.service.js";

describe("UserListingMatch persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates unique matches and ignores duplicates", async () => {
    const create = prisma.userListingMatch.create as ReturnType<typeof vi.fn>;
    create
      .mockResolvedValueOnce({ id: "1" })
      .mockRejectedValueOnce(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "test",
        }),
      );

    const result = await persistUserListingMatches({
      userId: "u1",
      listingId: "l1",
      dealScore: 70,
      filterIds: ["f1", "f1", "f2"],
    });

    expect(create).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(1);
    expect(result.existing).toBe(1);
  });
});
