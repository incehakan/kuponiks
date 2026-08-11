import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma ORM v7+ CLI configuration.
 * Database URL lives here (not in schema.prisma).
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
