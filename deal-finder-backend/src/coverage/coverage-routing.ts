/**
 * Coverage routing flag.
 * Explicit env wins. Unset: enabled in development/test, disabled in production.
 */
export function isPlatformCoverageRoutingEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = env.PLATFORM_COVERAGE_ROUTING_ENABLED?.trim().toLowerCase();
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") {
    return true;
  }
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") {
    return false;
  }
  return env.NODE_ENV !== "production";
}
