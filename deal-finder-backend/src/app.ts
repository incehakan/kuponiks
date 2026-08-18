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
import { coverageRoutes } from "./coverage/coverage.routes.js";
import { subscriptionRoutes } from "./modules/subscriptions/subscription.routes.js";
import { telegramRoutes } from "./modules/telegram/telegram.routes.js";
import { paymentRoutes } from "./modules/payment/payment.routes.js";
import { notificationHistoryRoutes } from "./modules/notifications/notification-history.routes.js";
import { taxonomyRoutes } from "./modules/taxonomy/taxonomy.routes.js";
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
    origin: (origin, callback) => {
      // Non-browser clients (RN native / curl) often omit Origin.
      if (!origin) {
        callback(null, true);
        return;
      }

      const fromEnv = (env.CORS_ORIGINS ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (env.NODE_ENV === "production") {
        const allowedOrigins = new Set(fromEnv);

        if (
          allowedOrigins.has(origin) ||
          origin.endsWith(".exp.direct") ||
          origin.startsWith("exp://")
        ) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS blocked for origin: ${origin}`), false);
        return;
      }

      const defaultDevOrigins = [
        "https://45.43.152.58.nip.io",
        "http://45.43.152.58",
        "http://localhost:8081",
        "http://127.0.0.1:8081",
        "http://localhost:19006",
        "http://127.0.0.1:19006",
      ];

      const allowedOrigins = new Set([...defaultDevOrigins, ...fromEnv]);

      if (
        allowedOrigins.has(origin) ||
        origin.endsWith(".exp.direct") ||
        origin.startsWith("exp://")
      ) {
        callback(null, true);
        return;
      }

      // Development: allow any origin for Expo web / local tooling.
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
   * Liveness + minimal ops readiness (presence/availability only — no secrets).
   */
  app.get("/health", async () => {
    const { getNotificationOpsHealth } = await import(
      "./notifications/notification-ops-health.js"
    );
    const { getSchedulerHealth } = await import(
      "./scraper/scheduler/scheduler-state.js"
    );
    const role = process.env.PROCESS_ROLE?.trim().toLowerCase();
    const notifications = await getNotificationOpsHealth({
      redisMode:
        role === "api" ||
        (!role && env.NODE_ENV === "production")
          ? "not_checked"
          : "cached",
    });
    const scheduler = getSchedulerHealth();
    const { getProviderHealthSummary } = await import(
      "./coverage/provider-reliability-report.js"
    );
    const providers = await getProviderHealthSummary().catch(() => ({
      arabam: "unknown",
      letgo: "unknown",
      sahibinden: "unknown",
    }));
    return {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      role: role || (env.NODE_ENV === "production" ? "api" : "all"),
      redis: notifications.redis,
      providers,
      scheduler: {
        role: scheduler.role,
        enabled: scheduler.enabled,
        lastCycleAt: scheduler.lastCycleAt,
        lastCycleDurationMs: scheduler.lastCycleDurationMs,
        lastQueuedJobs: scheduler.lastQueuedJobs,
        activeFilterCount: scheduler.activeFilterCount,
        queryGroupCount: scheduler.queryGroupCount,
      },
      notifications: {
        expoProvider: notifications.expoProvider,
        expoAccessToken: notifications.expoAccessToken,
        telegramBotToken: notifications.telegramBotToken,
      },
    };
  });

  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(dealRoutes, { prefix: "/api/deals" });
  await app.register(categoryRoutes, { prefix: "/api/categories" });
  await app.register(cityRoutes, { prefix: "/api/cities" });
  await app.register(filterRoutes, { prefix: "/api/filters" });
  await app.register(coverageRoutes, { prefix: "/api/filters" });
  await app.register(taxonomyRoutes, { prefix: "/api/taxonomy" });
  await app.register(subscriptionRoutes, { prefix: "/api/subscriptions" });
  await app.register(telegramRoutes, { prefix: "/api/telegram" });
  await app.register(paymentRoutes, { prefix: "/api/payment" });
  await app.register(notificationHistoryRoutes, { prefix: "/api/notifications" });
  await app.register(scraperRoutes, { prefix: "/api/scraper" });

  return app;
}
