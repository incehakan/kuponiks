import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { normalizeMatchText } from "../lib/text-normalize.js";
import { preferCatalogDisplayName } from "./vehicle-catalog.service.js";

export interface UpsertBrandAliasInput {
  platform: string;
  sourceLabel: string;
  sourceSlug: string;
  brandId: string;
}

export interface UpsertSeriesAliasInput {
  platform: string;
  sourceLabel: string;
  sourceSlug: string;
  brandId: string;
  seriesId: string;
}

export class VehicleCatalogAliasService {
  async upsertBrandAlias(
    input: UpsertBrandAliasInput,
  ): Promise<"created" | "updated" | "unchanged"> {
    const normalizedSource = normalizeMatchText(input.sourceLabel);
    const existing = await prisma.vehicleBrandAlias.findFirst({
      where: {
        platform: input.platform,
        OR: [{ normalizedSource }, { sourceSlug: input.sourceSlug }],
      },
    });

    if (existing) {
      const nextLabel = preferCatalogDisplayName(
        existing.sourceLabel,
        input.sourceLabel,
      );
      const changed =
        existing.brandId !== input.brandId ||
        existing.sourceSlug !== input.sourceSlug ||
        existing.sourceLabel !== nextLabel;
      if (changed) {
        await prisma.vehicleBrandAlias.update({
          where: { id: existing.id },
          data: {
            brandId: input.brandId,
            sourceSlug: input.sourceSlug,
            sourceLabel: nextLabel,
            normalizedSource,
          },
        });
        return "updated";
      }
      return "unchanged";
    }

    try {
      await prisma.vehicleBrandAlias.create({
        data: {
          platform: input.platform,
          sourceLabel: input.sourceLabel,
          normalizedSource,
          sourceSlug: input.sourceSlug,
          brandId: input.brandId,
        },
      });
      return "created";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "unchanged";
      }
      throw error;
    }
  }

  async upsertSeriesAlias(
    input: UpsertSeriesAliasInput,
  ): Promise<"created" | "updated" | "unchanged"> {
    const normalizedSource = normalizeMatchText(input.sourceLabel);
    const existing = await prisma.vehicleSeriesAlias.findFirst({
      where: {
        platform: input.platform,
        OR: [
          { sourceSlug: input.sourceSlug },
          { brandId: input.brandId, normalizedSource },
        ],
      },
    });

    if (existing) {
      const nextLabel = preferCatalogDisplayName(
        existing.sourceLabel,
        input.sourceLabel,
      );
      const changed =
        existing.seriesId !== input.seriesId ||
        existing.sourceSlug !== input.sourceSlug ||
        existing.sourceLabel !== nextLabel;
      if (changed) {
        await prisma.vehicleSeriesAlias.update({
          where: { id: existing.id },
          data: {
            seriesId: input.seriesId,
            sourceSlug: input.sourceSlug,
            sourceLabel: nextLabel,
            normalizedSource,
          },
        });
        return "updated";
      }
      return "unchanged";
    }

    try {
      await prisma.vehicleSeriesAlias.create({
        data: {
          platform: input.platform,
          sourceLabel: input.sourceLabel,
          normalizedSource,
          sourceSlug: input.sourceSlug,
          brandId: input.brandId,
          seriesId: input.seriesId,
        },
      });
      return "created";
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return "unchanged";
      }
      throw error;
    }
  }
}

export const vehicleCatalogAliasService = new VehicleCatalogAliasService();
