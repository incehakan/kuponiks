import { Prisma, SubscriptionPlan, type User } from "@prisma/client";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { HttpError } from "../../lib/http-error.js";
import { prisma } from "../../lib/prisma.js";
import type { AccessTokenPayload, AuthUser } from "../../types/auth.js";

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = "7d";

/**
 * Public user fields returned by auth endpoints (never includes passwordHash).
 */
export interface PublicUser {
  id: string;
  fullName: string;
  phoneNumber: string;
  subscriptionPlan: SubscriptionPlan;
  telegramChatId: string | null;
  fcmDeviceToken: string | null;
  expoPushToken: string | null;
  createdAt: Date;
}

export interface RegisterInput {
  fullName: string;
  phoneNumber: string;
  password: string;
}

export interface LoginInput {
  phoneNumber: string;
  password: string;
}

export interface UpdateTokensInput {
  fcmDeviceToken?: string | null;
  telegramChatId?: string | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: string;
  user: PublicUser;
}

/**
 * Authentication & identity service (register / login / device tokens).
 */
export class AuthService {
  /**
   * Registers a new user with a hashed password and returns a JWT session.
   */
  async register(input: RegisterInput): Promise<AuthTokenResponse> {
    try {
      const fullName = input.fullName.trim();
      const phoneNumber = this.normalizePhone(input.phoneNumber);
      this.assertPasswordStrength(input.password);

      if (fullName.length < 2) {
        throw new HttpError("Ad soyad en az 2 karakter olmalıdır", 400);
      }

      const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

      const user = await prisma.user.create({
        data: {
          fullName,
          phoneNumber,
          passwordHash,
        },
      });

      return this.buildAuthResponse(user);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new HttpError(
          "Bu telefon numarası ile kayıtlı bir kullanıcı zaten var",
          409,
          "ConflictError",
        );
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen kayıt hatası";
      console.error(`AuthService.register failed: ${message}`);
      throw new HttpError("Kayıt işlemi başarısız oldu", 500);
    }
  }

  /**
   * Authenticates by phone + password and returns a JWT session.
   */
  async login(input: LoginInput): Promise<AuthTokenResponse> {
    try {
      const phoneNumber = this.normalizePhone(input.phoneNumber);

      if (!input.password) {
        throw new HttpError("Şifre zorunludur", 400);
      }

      const user = await prisma.user.findUnique({
        where: { phoneNumber },
      });

      if (!user) {
        throw new HttpError(
          "Telefon numarası veya şifre hatalı",
          401,
          "UnauthorizedError",
        );
      }

      const passwordValid = await bcrypt.compare(
        input.password,
        user.passwordHash,
      );

      if (!passwordValid) {
        throw new HttpError(
          "Telefon numarası veya şifre hatalı",
          401,
          "UnauthorizedError",
        );
      }

      return this.buildAuthResponse(user);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen giriş hatası";
      console.error(`AuthService.login failed: ${message}`);
      throw new HttpError("Giriş işlemi başarısız oldu", 500);
    }
  }

  /**
   * Updates FCM and/or Telegram destination tokens for the authenticated user.
   */
  async updateTokens(
    userId: string,
    input: UpdateTokensInput,
  ): Promise<PublicUser> {
    try {
      if (
        input.fcmDeviceToken === undefined &&
        input.telegramChatId === undefined
      ) {
        throw new HttpError(
          "fcmDeviceToken veya telegramChatId alanlarından en az birini gönderin",
          400,
        );
      }

      const data: Prisma.UserUpdateInput = {};

      if (input.fcmDeviceToken !== undefined) {
        data.fcmDeviceToken = input.fcmDeviceToken;
      }
      if (input.telegramChatId !== undefined) {
        data.telegramChatId = input.telegramChatId;
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data,
      });

      return this.toPublicUser(user);
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2025"
      ) {
        throw new HttpError("Kullanıcı bulunamadı", 404, "NotFoundError");
      }

      const message =
        error instanceof Error ? error.message : "Bilinmeyen token güncelleme hatası";
      console.error(`AuthService.updateTokens failed: ${message}`);
      throw new HttpError("Cihaz tokenları güncellenemedi", 500);
    }
  }

  /**
   * Signs a JWT access token for the given user claims.
   */
  signAccessToken(user: AuthUser): string {
    const payload: AccessTokenPayload = {
      sub: user.id,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      subscriptionPlan: user.subscriptionPlan,
    };

    return jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  }

  private buildAuthResponse(user: User): AuthTokenResponse {
    const accessToken = this.signAccessToken({
      id: user.id,
      phoneNumber: user.phoneNumber,
      fullName: user.fullName,
      subscriptionPlan: user.subscriptionPlan,
    });

    return {
      accessToken,
      tokenType: "Bearer",
      expiresIn: JWT_EXPIRES_IN,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      fullName: user.fullName,
      phoneNumber: user.phoneNumber,
      subscriptionPlan: user.subscriptionPlan,
      telegramChatId: user.telegramChatId,
      fcmDeviceToken: user.fcmDeviceToken,
      expoPushToken: user.expoPushToken,
      createdAt: user.createdAt,
    };
  }

  /**
   * Normalizes phone numbers to digits with an optional leading +.
   */
  private normalizePhone(raw: string): string {
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new HttpError("Telefon numarası zorunludur", 400);
    }

    const normalized = trimmed.replace(/[\s\-()]/g, "");
    if (!/^\+?[0-9]{10,15}$/.test(normalized)) {
      throw new HttpError(
        "Telefon numarası 10–15 haneli olmalıdır (isteğe bağlı + ile başlayabilir)",
        400,
      );
    }

    return normalized;
  }

  private assertPasswordStrength(password: string): void {
    if (!password || password.length < 8) {
      throw new HttpError(
        "Şifre en az 8 karakter olmalıdır",
        400,
      );
    }
  }
}

/** Shared auth service instance. */
export const authService = new AuthService();
