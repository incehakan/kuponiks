import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { authenticate } from "../../middlewares/auth.middleware.js";
import { HttpError } from "../../lib/http-error.js";
import { authService } from "./auth.service.js";

interface LoginBody {
  phoneNumber?: string | null;
  email?: string | null;
  password?: string | null;
}

interface RegisterBody {
  fullName?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  password?: string | null;
}

function resolvePhoneOrEmail(
  phoneNumber?: string | null,
  email?: string | null,
): string {
  const phone =
    typeof phoneNumber === "string" ? phoneNumber.trim() : "";
  const mail = typeof email === "string" ? email.trim() : "";

  if (phone) {
    return phone;
  }

  if (mail) {
    return mail;
  }

  throw new HttpError(
    "Telefon numarası veya e-posta zorunludur",
    400,
    "ValidationError",
  );
}

function assertPassword(password?: string | null): string {
  if (typeof password !== "string" || !password.trim()) {
    throw new HttpError("Şifre zorunludur", 400, "ValidationError");
  }

  return password;
}

/**
 * Auth HTTP routes: register, login, and device-token updates.
 */
export const authRoutes: FastifyPluginAsync = async (
  app: FastifyInstance,
) => {
  app.post(
    "/register",
    {
      schema: {
        body: {
          type: "object",
          required: ["fullName", "password"],
          additionalProperties: false,
          properties: {
            fullName: { type: "string", minLength: 2, maxLength: 120 },
            phoneNumber: { type: "string", minLength: 10, maxLength: 20 },
            email: { type: "string", minLength: 5, maxLength: 120 },
            password: { type: "string", minLength: 8, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as RegisterBody;

      const fullName =
        typeof body.fullName === "string" ? body.fullName.trim() : "";
      if (!fullName) {
        throw new HttpError("Ad soyad zorunludur", 400, "ValidationError");
      }

      const phoneNumber = resolvePhoneOrEmail(body.phoneNumber, body.email);
      const password = assertPassword(body.password);

      const result = await authService.register({
        fullName,
        phoneNumber,
        password,
      });
      return reply.status(201).send(result);
    },
  );

  app.post(
    "/login",
    {
      schema: {
        body: {
          type: "object",
          required: ["password"],
          additionalProperties: false,
          properties: {
            phoneNumber: { type: "string", minLength: 10, maxLength: 20 },
            email: { type: "string", minLength: 5, maxLength: 120 },
            password: { type: "string", minLength: 1, maxLength: 128 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as LoginBody;

      const phoneNumber = resolvePhoneOrEmail(body.phoneNumber, body.email);
      const password = assertPassword(body.password);

      const result = await authService.login({ phoneNumber, password });
      return reply.status(200).send(result);
    },
  );

  app.patch(
    "/tokens",
    {
      preHandler: [authenticate],
      schema: {
        body: {
          type: "object",
          additionalProperties: false,
          properties: {
            fcmDeviceToken: { type: ["string", "null"], maxLength: 512 },
            telegramChatId: { type: ["string", "null"], maxLength: 64 },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        fcmDeviceToken?: string | null;
        telegramChatId?: string | null;
      };

      const user = await authService.updateTokens(request.user!.id, body);
      return reply.status(200).send({ user });
    },
  );
};
