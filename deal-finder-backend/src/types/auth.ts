import type { SubscriptionPlan } from "@prisma/client";

/**
 * Authenticated user context attached to Fastify requests after JWT verification.
 */
export interface AuthUser {
  id: string;
  phoneNumber: string;
  fullName: string;
  subscriptionPlan: SubscriptionPlan;
}

/**
 * JWT access-token payload shape.
 */
export interface AccessTokenPayload {
  sub: string;
  phoneNumber: string;
  fullName: string;
  subscriptionPlan: SubscriptionPlan;
}

declare module "fastify" {
  interface FastifyRequest {
    /** Populated by `authenticate` / `optionalAuthenticate` after a valid Bearer token. */
    user?: AuthUser;
  }
}
