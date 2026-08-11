/**
 * Builds residential proxy URL from discrete Webshare-style env vars
 * or falls back to PROXY_URL / RESIDENTIAL_PROXY_URL.
 */
export function buildProxyUrlFromProcessEnv(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const enabledRaw = env.PROXY_ENABLED?.trim().toLowerCase();
  const enabled =
    enabledRaw === undefined ||
    enabledRaw === "" ||
    enabledRaw === "1" ||
    enabledRaw === "true" ||
    enabledRaw === "yes";

  if (!enabled) {
    return undefined;
  }

  const host = env.PROXY_HOST?.trim();
  const port = env.PROXY_PORT?.trim();
  const user = env.PROXY_USER?.trim();
  const pass = env.PROXY_PASS?.trim();

  if (host && port) {
    const auth =
      user !== undefined && user.length > 0
        ? `${encodeURIComponent(user)}:${encodeURIComponent(pass ?? "")}@`
        : "";
    return `http://${auth}${host}:${port}`;
  }

  const residential = env.RESIDENTIAL_PROXY_URL?.trim();
  if (residential) {
    return residential;
  }

  const proxyUrl = env.PROXY_URL?.trim();
  return proxyUrl || undefined;
}

/**
 * Returns true when the error/response indicates we should rotate IP and retry.
 */
export function isProxyRetryableFailure(input: {
  status?: number;
  message?: string;
  bodySnippet?: string;
}): boolean {
  const status = input.status;
  if (status === 403 || status === 407 || status === 429 || status === 503) {
    return true;
  }

  const haystack = `${input.message ?? ""} ${input.bodySnippet ?? ""}`.toLowerCase();
  return (
    haystack.includes("timeout") ||
    haystack.includes("timed out") ||
    haystack.includes("etimedout") ||
    haystack.includes("econnreset") ||
    haystack.includes("econnrefused") ||
    haystack.includes("socket hang up") ||
    haystack.includes("captcha") ||
    haystack.includes("cloudflare") ||
    haystack.includes("access denied") ||
    haystack.includes("forbidden") ||
    haystack.includes("proxy") ||
    haystack.includes("challenge")
  );
}
