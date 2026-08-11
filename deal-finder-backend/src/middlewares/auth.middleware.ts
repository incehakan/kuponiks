import type { FastifyReply, FastifyRequest } from "fastify";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { HttpError } from "../lib/http-error.js";
import type { AccessTokenPayload, AuthUser } from "../types/auth.js";

function parseBearerToken(header: string | undefined): string | null {
  if (!header || !header.startsWith("Bearer ")) {
    return null;
  }

  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

function decodeAuthUser(token: string): AuthUser {
  const decoded = jwt.verify(token, env.JWT_SECRET);

  if (typeof decoded === "string" || !decoded || typeof decoded !== "object") {
    throw new HttpError(
      "Geçersiz oturum jetonu içeriği",
      401,
      "UnauthorizedError",
    );
  }

  const payload = decoded as AccessTokenPayload;

  if (!payload.sub || !payload.phoneNumber || !payload.subscriptionPlan) {
    throw new HttpError(
      "Oturum jetonunda gerekli bilgiler eksik",
      401,
      "UnauthorizedError",
    );
  }

  return {
    id: payload.sub,
    phoneNumber: payload.phoneNumber,
    fullName: payload.fullName ?? "",
    subscriptionPlan: payload.subscriptionPlan,
  };
}

/**
 * Verifies `Authorization: Bearer <token>` and attaches `request.user`.
 */
export async function authenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  try {
    const token = parseBearerToken(request.headers.authorization);

    if (!token) {
      throw new HttpError(
        "Yetkilendirme başlığı eksik veya geçersiz. Beklenen format: Bearer <token>",
        401,
        "UnauthorizedError",
      );
    }

    request.user = decodeAuthUser(token);
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      "Oturum jetonu geçersiz veya süresi dolmuş. Lütfen tekrar giriş yapın.",
      401,
      "UnauthorizedError",
    );
  }
}

/**
 * Attaches `request.user` when a valid Bearer token is present.
 * Does not throw when the header is missing — used for public+personalized routes.
 */
export async function optionalAuthenticate(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const token = parseBearerToken(request.headers.authorization);
  if (!token) {
    return;
  }

  try {
    request.user = decodeAuthUser(token);
  } catch {
    // Invalid token on a public route: treat as anonymous rather than blocking the feed.
    console.warn(
      "[AUTH] Geçersiz token ile public istek — anonim olarak devam ediliyor",
    );
  }
}
