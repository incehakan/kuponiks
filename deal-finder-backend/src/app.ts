import cors from "@fastify/cors";
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { env } from "./config/env.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { categoryRoutes } from "./modules/categories/category.routes.js";
import { cityRoutes } from "./modules/cities/city.routes.js";
import { dealRoutes } from "./modules/deals/deal.routes.js";
import { filterRoutes } from "./modules/filters/filter.routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { telegramRoutes } from "./modules/telegram/telegram.routes.js";
import { paymentRoutes } from "./modules/payment/payment.routes.js";
import { userRoutes } from "./modules/users/user.routes.js";
import { scraperRoutes } from "./routes/scraper.routes.js";
import "./types/auth.js";

/**
 * Builds and configures the Fastify application instance.
 * Routes and plugins are registered here; listening happens in server.ts.
 */
export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
    },
  });

  await app.register(cors, {
    // React Native / Expo Go often send no Origin; browsers & nip.io HTTPS need explicit allow.
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      const allowedOrigins = new Set([
        "https://45.43.152.58.nip.io",
        "http://45.43.152.58",
        "http://localhost:8081",
        "http://localhost:19006",
      ]);

      if (
        allowedOrigins.has(origin) ||
        origin.endsWith(".exp.direct") ||
        origin.startsWith("exp://")
      ) {
        callback(null, true);
        return;
      }

      // Fallback: allow all origins (mobile web / dev clients)
      callback(null, true);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept"],
  });

  /**
   * Incoming request tracer — helps debug Auth/JWT vs public route issues.
   */
  app.addHook("onRequest", async (request) => {
    const hasAuth = Boolean(request.headers.authorization?.trim());
    console.log(
      "[HTTP REQUEST]:",
      request.method,
      request.url,
      hasAuth ? "Auth Var" : "Auth Yok",
    );
  });

  /**
   * Centralized error handler — returns readable JSON without leaking internals in production.
   */
  app.setErrorHandler(
    (error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error.statusCode ?? 500;
      const isClientError = statusCode >= 400 && statusCode < 500;

      app.log.error(
        {
          err: error,
          statusCode,
        },
        error.message,
      );

      // Fastify schema validation errors
      if (error.validation) {
        return reply.status(400).send({
          statusCode: 400,
          error: "ValidationError",
          message: error.message,
          details: error.validation,
        });
      }

      return reply.status(statusCode).send({
        statusCode,
        error: isClientError ? error.name : "Internal Server Error",
        message: isClientError
          ? error.message
          : env.NODE_ENV === "production"
            ? "Beklenmeyen bir hata oluştu."
            : error.message,
      });
    },
  );

  /**
   * Liveness probe — confirms the HTTP process is up.
   */
  app.get("/health", async () => {
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(dealRoutes, { prefix: "/api/deals" });
  await app.register(categoryRoutes, { prefix: "/api/categories" });
  await app.register(cityRoutes, { prefix: "/api/cities" });
  await app.register(filterRoutes, { prefix: "/api/filters" });
  await app.register(subscriptionRoutes, { prefix: "/api/subscriptions" });
  await app.register(telegramRoutes, { prefix: "/api/telegram" });
  await app.register(paymentRoutes, { prefix: "/api/payment" });
  await app.register(scraperRoutes, { prefix: "/api/scraper" });

  return app;
}
