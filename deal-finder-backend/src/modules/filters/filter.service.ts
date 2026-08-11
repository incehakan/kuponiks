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
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Free-text keywords ("3+1, Yeşilyurt") or pre-split array. */
  keywords?: string | string[];
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

/**
 * User filter CRUD with subscription plan limits from the database.
 */
export class FilterService {
  /**
   * Resolves the user's current subscription plan from the database.
   */
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

  /**
   * Creates a new active filter if the user's DB plan limit allows it.
   */
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

      if (
        input.minPrice !== undefined &&
        input.maxPrice !== undefined &&
        input.minPrice > input.maxPrice
      ) {
        throw new HttpError(
          "Minimum fiyat, maksimum fiyattan büyük olamaz",
          400,
        );
      }

      if (
        input.minDealScore !== undefined &&
        (input.minDealScore < 0 || input.minDealScore > 100)
      ) {
        throw new HttpError(
          "Minimum kelepir skoru 0 ile 100 arasında olmalıdır",
          400,
        );
      }

      // Always trust DB plan (not JWT) so upgrades apply immediately.
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
          notifyPush: notifyFlags.notifyPush,
          notifyTelegram: notifyFlags.notifyTelegram,
          notifyWhatsapp: notifyFlags.notifyWhatsapp,
          ...(input.city !== undefined
            ? { city: input.city.trim() || null }
            : {}),
          ...(input.minPrice !== undefined ? { minPrice: input.minPrice } : {}),
          ...(input.maxPrice !== undefined ? { maxPrice: input.maxPrice } : {}),
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

  /**
   * Lists the authenticated user's filters (active + passive) for alarm management.
   */
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

  /**
   * Updates a filter owned by the authenticated user.
   */
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

      // Reactivating a passive filter must respect plan limits.
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

      if (
        nextMinPrice != null &&
        nextMaxPrice != null &&
        nextMinPrice > nextMaxPrice
      ) {
        throw new HttpError(
          "Minimum fiyat, maksimum fiyattan büyük olamaz",
          400,
        );
      }

      if (
        updateData.minDealScore !== undefined &&
        (updateData.minDealScore < 0 || updateData.minDealScore > 100)
      ) {
        throw new HttpError(
          "Minimum kelepir skoru 0 ile 100 arasında olmalıdır",
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
          ...(updateData.city !== undefined
            ? { city: updateData.city.trim() || null }
            : {}),
          ...(updateData.minPrice !== undefined
            ? { minPrice: updateData.minPrice }
            : {}),
          ...(updateData.maxPrice !== undefined
            ? { maxPrice: updateData.maxPrice }
            : {}),
          ...(updateData.keywords !== undefined
            ? { keywords: normalizeKeywords(updateData.keywords) }
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

  /**
   * Soft-deletes a filter owned by the user (`isActive = false`).
   */
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
