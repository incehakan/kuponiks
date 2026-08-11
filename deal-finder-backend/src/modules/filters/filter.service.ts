import {
  Prisma,
  SubscriptionPlan,
  type UserFilter,
} from "@prisma/client";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import {
  getFilterLimit,
  limitReachedMessage,
  resolveNotifyFlagsForPlan,
} from "../../lib/subscription-plan.js";

/**
 * User filter CRUD with subscription plan limits from the database.
 */

export interface CreateFilterInput {
  category: string;
  subcategory?: string | null;
  brand?: string | null;
  model?: string | null;
  series?: string | null;
  trim?: string | null;
  variant?: string | null;
  minYear?: number | null;
  maxYear?: number | null;
  minMileage?: number | null;
  maxMileage?: number | null;
  city?: string | null;
  district?: string | null;
  minPrice?: number | null;
  maxPrice?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  sellerType?: string | null;
  /** Free-text keywords ("3+1, Yeşilyurt") or pre-split array. */
  keywords?: string | string[];
  excludedKeywords?: string | string[];
  minDealScore?: number;
  notifyTelegram?: boolean;
  notifyPush?: boolean;
  notifyWhatsapp?: boolean;
  isActive?: boolean;
}

export type UpdateFilterInput = Partial<CreateFilterInput>;

/**
 * Normalizes optional keyword free-text / array into a clean string[].
 */
function normalizeKeywords(input?: string | string[]): string[] {
  if (input == null) {
    return [];
  }

  const parts = Array.isArray(input) ? input : input.split(/[,;\n]+/);

  return parts
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .slice(0, 50);
}

function assertRange(
  min: number | null | undefined,
  max: number | null | undefined,
  label: string,
): void {
  if (min != null && max != null && min > max) {
    throw new HttpError(
      `Minimum ${label}, maksimum ${label} değerinden büyük olamaz`,
      400,
    );
  }
}

function maxAllowedYear(): number {
  return new Date().getFullYear() + 1;
}

function assertYearBounds(year: number | null | undefined, label: string): void {
  if (year == null || !Number.isFinite(year)) {
    return;
  }
  const maxYear = maxAllowedYear();
  if (year < 1900 || year > maxYear) {
    throw new HttpError(
      `${label} 1900 ile ${maxYear} arasında olmalıdır`,
      400,
    );
  }
}

function optionalTrimmed(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * User filter CRUD with subscription plan limits from the database.
 */
export class FilterService {
  private async resolveSubscriptionPlan(
    userId: string,
  ): Promise<SubscriptionPlan> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { subscriptionPlan: true },
    });

    if (!user) {
      throw new HttpError("Kullanıcı bulunamadı", 404, "NotFoundError");
    }

    return user.subscriptionPlan;
  }

  async createFilter(
    userId: string,
    _subscriptionPlanFromToken: SubscriptionPlan | undefined,
    input: CreateFilterInput,
  ): Promise<UserFilter> {
    try {
      const category = input.category.trim();
      if (!category) {
        throw new HttpError("Kategori zorunludur", 400);
      }

      assertRange(input.minPrice, input.maxPrice, "fiyat");
      assertRange(input.minYear, input.maxYear, "yıl");
      assertRange(input.minMileage, input.maxMileage, "kilometre");
      assertYearBounds(input.minYear, "Minimum yıl");
      assertYearBounds(input.maxYear, "Maksimum yıl");

      if (
        input.minDealScore !== undefined &&
        (input.minDealScore < 0 || input.minDealScore > 100)
      ) {
        throw new HttpError(
          "Minimum fırsat skoru 0 ile 100 arasında olmalıdır",
          400,
        );
      }

      const subscriptionPlan = await this.resolveSubscriptionPlan(userId);
      const limit = getFilterLimit(subscriptionPlan);

      if (limit !== null) {
        const activeCount = await prisma.userFilter.count({
          where: { userId, isActive: true },
        });

        if (activeCount >= limit) {
          throw new HttpError(
            limitReachedMessage(subscriptionPlan, limit),
            403,
            "ForbiddenError",
          );
        }
      }

      const keywords = normalizeKeywords(input.keywords);
      const excludedKeywords = normalizeKeywords(input.excludedKeywords);
      const notifyFlags = resolveNotifyFlagsForPlan(subscriptionPlan, {
        ...(input.notifyTelegram !== undefined
          ? { notifyTelegram: input.notifyTelegram }
          : {}),
        ...(input.notifyPush !== undefined ? { notifyPush: input.notifyPush } : {}),
        ...(input.notifyWhatsapp !== undefined
          ? { notifyWhatsapp: input.notifyWhatsapp }
          : {}),
      });

      return await prisma.userFilter.create({
        data: {
          userId,
          category,
          keywords,
          excludedKeywords,
          notifyPush: notifyFlags.notifyPush,
          notifyTelegram: notifyFlags.notifyTelegram,
          notifyWhatsapp: notifyFlags.notifyWhatsapp,
          ...(input.city !== undefined
            ? { city: optionalTrimmed(input.city) ?? null }
            : {}),
          ...(input.district !== undefined
            ? { district: optionalTrimmed(input.district) ?? null }
            : {}),
          ...(input.subcategory !== undefined
            ? { subcategory: optionalTrimmed(input.subcategory) ?? null }
            : {}),
          ...(input.brand !== undefined
            ? { brand: optionalTrimmed(input.brand) ?? null }
            : {}),
          ...(input.model !== undefined
            ? { model: optionalTrimmed(input.model) ?? null }
            : {}),
          ...(input.series !== undefined
            ? { series: optionalTrimmed(input.series) ?? null }
            : {}),
          ...(input.trim !== undefined
            ? { trim: optionalTrimmed(input.trim) ?? null }
            : {}),
          ...(input.variant !== undefined
            ? { variant: optionalTrimmed(input.variant) ?? null }
            : {}),
          ...(input.fuelType !== undefined
            ? { fuelType: optionalTrimmed(input.fuelType) ?? null }
            : {}),
          ...(input.transmission !== undefined
            ? { transmission: optionalTrimmed(input.transmission) ?? null }
            : {}),
          ...(input.sellerType !== undefined
            ? { sellerType: optionalTrimmed(input.sellerType) ?? null }
            : {}),
          ...(input.minPrice !== undefined ? { minPrice: input.minPrice } : {}),
          ...(input.maxPrice !== undefined ? { maxPrice: input.maxPrice } : {}),
          ...(input.minYear !== undefined ? { minYear: input.minYear } : {}),
          ...(input.maxYear !== undefined ? { maxYear: input.maxYear } : {}),
          ...(input.minMileage !== undefined
            ? { minMileage: input.minMileage }
            : {}),
          ...(input.maxMileage !== undefined
            ? { maxMileage: input.maxMileage }
            : {}),
          ...(input.minDealScore !== undefined
            ? { minDealScore: input.minDealScore }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen filtre oluşturma hatası";
      console.error(`FilterService.createFilter failed: ${message}`);
      throw new HttpError("Filtre oluşturulamadı", 500);
    }
  }

  async getUserFilters(userId: string): Promise<UserFilter[]> {
    try {
      return await prisma.userFilter.findMany({
        where: { userId },
        orderBy: [{ isActive: "desc" }, { createdAt: "desc" }],
        take: 100,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Bilinmeyen filtre listeleme hatası";
      console.error(`FilterService.getUserFilters failed: ${message}`);
      throw new HttpError("Filtreler listelenemedi", 500);
    }
  }

  async updateFilter(
    filterId: string,
    userId: string,
    updateData: UpdateFilterInput,
  ): Promise<UserFilter> {
    try {
      if (!filterId?.trim()) {
        throw new HttpError("Filtre kimliği zorunludur", 400);
      }

      const existing = await prisma.userFilter.findFirst({
        where: { id: filterId, userId },
      });

      if (!existing) {
        throw new HttpError(
          "Filtre bulunamadı veya bu filtreyi güncelleme yetkiniz yok",
          404,
          "NotFoundError",
        );
      }

      if (updateData.isActive === true && !existing.isActive) {
        const plan = await this.resolveSubscriptionPlan(userId);
        const limit = getFilterLimit(plan);

        if (limit !== null) {
          const activeCount = await prisma.userFilter.count({
            where: { userId, isActive: true },
          });
          if (activeCount >= limit) {
            throw new HttpError(limitReachedMessage(plan, limit), 403);
          }
        }
      }

      const nextMinPrice =
        updateData.minPrice !== undefined
          ? updateData.minPrice
          : existing.minPrice;
      const nextMaxPrice =
        updateData.maxPrice !== undefined
          ? updateData.maxPrice
          : existing.maxPrice;
      const nextMinYear =
        updateData.minYear !== undefined ? updateData.minYear : existing.minYear;
      const nextMaxYear =
        updateData.maxYear !== undefined ? updateData.maxYear : existing.maxYear;
      const nextMinMileage =
        updateData.minMileage !== undefined
          ? updateData.minMileage
          : existing.minMileage;
      const nextMaxMileage =
        updateData.maxMileage !== undefined
          ? updateData.maxMileage
          : existing.maxMileage;

      assertRange(nextMinPrice, nextMaxPrice, "fiyat");
      assertRange(nextMinYear, nextMaxYear, "yıl");
      assertRange(nextMinMileage, nextMaxMileage, "kilometre");
      assertYearBounds(nextMinYear, "Minimum yıl");
      assertYearBounds(nextMaxYear, "Maksimum yıl");

      if (
        updateData.minDealScore !== undefined &&
        (updateData.minDealScore < 0 || updateData.minDealScore > 100)
      ) {
        throw new HttpError(
          "Minimum fırsat skoru 0 ile 100 arasında olmalıdır",
          400,
        );
      }

      if (updateData.category !== undefined && !updateData.category.trim()) {
        throw new HttpError("Kategori boş olamaz", 400);
      }

      const subscriptionPlan = await this.resolveSubscriptionPlan(userId);
      const notifyFlags =
        updateData.notifyTelegram !== undefined ||
        updateData.notifyPush !== undefined ||
        updateData.notifyWhatsapp !== undefined
          ? resolveNotifyFlagsForPlan(subscriptionPlan, {
              notifyTelegram:
                updateData.notifyTelegram ?? existing.notifyTelegram,
              notifyPush: updateData.notifyPush ?? existing.notifyPush,
              notifyWhatsapp:
                updateData.notifyWhatsapp ?? existing.notifyWhatsapp,
            })
          : null;

      return await prisma.userFilter.update({
        where: { id: existing.id },
        data: {
          ...(updateData.category !== undefined
            ? { category: updateData.category.trim() }
            : {}),
          ...(updateData.subcategory !== undefined
            ? { subcategory: optionalTrimmed(updateData.subcategory) ?? null }
            : {}),
          ...(updateData.brand !== undefined
            ? { brand: optionalTrimmed(updateData.brand) ?? null }
            : {}),
          ...(updateData.model !== undefined
            ? { model: optionalTrimmed(updateData.model) ?? null }
            : {}),
          ...(updateData.series !== undefined
            ? { series: optionalTrimmed(updateData.series) ?? null }
            : {}),
          ...(updateData.trim !== undefined
            ? { trim: optionalTrimmed(updateData.trim) ?? null }
            : {}),
          ...(updateData.variant !== undefined
            ? { variant: optionalTrimmed(updateData.variant) ?? null }
            : {}),
          ...(updateData.city !== undefined
            ? { city: optionalTrimmed(updateData.city) ?? null }
            : {}),
          ...(updateData.district !== undefined
            ? { district: optionalTrimmed(updateData.district) ?? null }
            : {}),
          ...(updateData.fuelType !== undefined
            ? { fuelType: optionalTrimmed(updateData.fuelType) ?? null }
            : {}),
          ...(updateData.transmission !== undefined
            ? { transmission: optionalTrimmed(updateData.transmission) ?? null }
            : {}),
          ...(updateData.sellerType !== undefined
            ? { sellerType: optionalTrimmed(updateData.sellerType) ?? null }
            : {}),
          ...(updateData.minPrice !== undefined
            ? { minPrice: updateData.minPrice }
            : {}),
          ...(updateData.maxPrice !== undefined
            ? { maxPrice: updateData.maxPrice }
            : {}),
          ...(updateData.minYear !== undefined
            ? { minYear: updateData.minYear }
            : {}),
          ...(updateData.maxYear !== undefined
            ? { maxYear: updateData.maxYear }
            : {}),
          ...(updateData.minMileage !== undefined
            ? { minMileage: updateData.minMileage }
            : {}),
          ...(updateData.maxMileage !== undefined
            ? { maxMileage: updateData.maxMileage }
            : {}),
          ...(updateData.keywords !== undefined
            ? { keywords: normalizeKeywords(updateData.keywords) }
            : {}),
          ...(updateData.excludedKeywords !== undefined
            ? {
                excludedKeywords: normalizeKeywords(
                  updateData.excludedKeywords,
                ),
              }
            : {}),
          ...(updateData.minDealScore !== undefined
            ? { minDealScore: updateData.minDealScore }
            : {}),
          ...(notifyFlags
            ? {
                notifyPush: notifyFlags.notifyPush,
                notifyTelegram: notifyFlags.notifyTelegram,
                notifyWhatsapp: notifyFlags.notifyWhatsapp,
              }
            : {}),
          ...(updateData.isActive !== undefined
            ? { isActive: updateData.isActive }
            : {}),
        },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new HttpError("Filtre bulunamadı", 404, "NotFoundError");
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen filtre güncelleme hatası";
      console.error(`FilterService.updateFilter failed: ${message}`);
      throw new HttpError("Filtre güncellenemedi", 500);
    }
  }

  async deleteFilter(userId: string, filterId: string): Promise<UserFilter> {
    try {
      if (!filterId?.trim()) {
        throw new HttpError("Filtre kimliği zorunludur", 400);
      }

      const filter = await prisma.userFilter.findFirst({
        where: { id: filterId, userId },
      });

      if (!filter) {
        throw new HttpError("Filtre bulunamadı", 404, "NotFoundError");
      }

      if (!filter.isActive) {
        return filter;
      }

      return await prisma.userFilter.update({
        where: { id: filter.id },
        data: { isActive: false },
      });
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new HttpError("Filtre bulunamadı", 404, "NotFoundError");
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen filtre silme hatası";
      console.error(`FilterService.deleteFilter failed: ${message}`);
      throw new HttpError("Filtre silinemedi", 500);
    }
  }
}

/** Shared filter service instance. */
export const filterService = new FilterService();
