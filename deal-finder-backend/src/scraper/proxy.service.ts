import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
  isAxiosError,
} from "axios";
import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import { env } from "../config/env.js";
import {
  buildProxyUrlFromProcessEnv,
  isProxyRetryableFailure,
} from "./proxy-config.js";

/**
 * Mobile User-Agent pool used for request fingerprint rotation.
 */
const MOBILE_USER_AGENTS: readonly string[] = [
  "Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 12; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
] as const;

const DEFAULT_MAX_RETRIES = 3;

/**
 * HTTP client factory with Webshare rotating residential proxy
 * (https-proxy-agent) and mobile User-Agent rotation.
 */
export class ProxyService {
  private readonly proxyUrl: string | undefined;

  constructor(proxyUrl: string | undefined = env.PROXY_URL) {
    this.proxyUrl =
      proxyUrl?.trim() ||
      buildProxyUrlFromProcessEnv() ||
      undefined;

    if (this.proxyUrl) {
      try {
        const parsed = new URL(this.proxyUrl);
        console.log(
          `[ProxyService] Rotating residential proxy → ${parsed.hostname}:${parsed.port || "80"}`,
        );
      } catch {
        console.log("[ProxyService] Rotating residential proxy configured");
      }
    } else {
      console.log("[ProxyService] Proxy disabled — direct connections");
    }
  }

  isEnabled(): boolean {
    return Boolean(this.proxyUrl);
  }

  getProxyUrl(): string | undefined {
    return this.proxyUrl;
  }

  /**
   * Fresh agents per call so rotating endpoints can assign a new exit IP.
   */
  createProxyAgents(proxyUrl: string = this.proxyUrl ?? ""): {
    httpAgent: HttpProxyAgent<string>;
    httpsAgent: HttpsProxyAgent<string>;
  } | null {
    if (!proxyUrl) {
      return null;
    }
    return {
      httpAgent: new HttpProxyAgent(proxyUrl),
      httpsAgent: new HttpsProxyAgent(proxyUrl),
    };
  }

  getRandomUserAgent(): string {
    const index = Math.floor(Math.random() * MOBILE_USER_AGENTS.length);
    return MOBILE_USER_AGENTS[index] ?? MOBILE_USER_AGENTS[0]!;
  }

  /**
   * Creates a fresh Axios instance. When proxy is enabled, uses
   * http(s)-proxy-agent and disables Axios built-in `proxy` option.
   */
  createClient(overrides: AxiosRequestConfig = {}): AxiosInstance {
    const agents = this.proxyUrl ? this.createProxyAgents(this.proxyUrl) : null;

    const instance = axios.create({
      timeout: 30_000,
      maxRedirects: 5,
      headers: {
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7",
        ...overrides.headers,
      },
      ...overrides,
      // Always disable Axios built-in proxy; tunnel via agents when configured.
      proxy: false,
      ...(agents
        ? { httpAgent: agents.httpAgent, httpsAgent: agents.httpsAgent }
        : {}),
    });

    instance.interceptors.request.use((config) => {
      config.headers.set("User-Agent", this.getRandomUserAgent());
      return config;
    });

    return instance;
  }

  /**
   * GET with automatic retry + IP rotation on timeout / 403 / captcha.
   */
  async getWithRotation<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
    maxRetries: number = DEFAULT_MAX_RETRIES,
  ): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = this.createClient();
        console.log(
          `[ProxyService] GET attempt=${attempt}/${maxRetries} proxy=${this.isEnabled() ? "on" : "off"} → ${url}`,
        );
        const response = await client.get<T>(url, config);

        const bodySnippet =
          typeof response.data === "string"
            ? response.data.slice(0, 800)
            : "";

        if (
          isProxyRetryableFailure({
            status: response.status,
            bodySnippet,
          })
        ) {
          throw new Error(
            `Retryable upstream status/body (status=${response.status})`,
          );
        }

        return response;
      } catch (error) {
        lastError = error;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        const message =
          error instanceof Error ? error.message : "Unknown GET error";
        const retryable = isProxyRetryableFailure({
          ...(status !== undefined ? { status } : {}),
          message,
        });

        console.warn(
          `[ProxyService] GET failed attempt=${attempt}/${maxRetries} retryable=${retryable}: ${message}`,
        );

        if (!retryable || attempt >= maxRetries) {
          break;
        }

        // Brief pause so rotating gateway can hand out a new exit IP.
        await new Promise((r) => setTimeout(r, 800 + attempt * 400));
      }
    }

    const finalMessage =
      lastError instanceof Error ? lastError.message : "Unknown GET error";
    throw new Error(`ProxyService.get failed for ${url}: ${finalMessage}`);
  }

  async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    return this.getWithRotation<T>(url, config, DEFAULT_MAX_RETRIES);
  }

  async post<T = unknown>(
    url: string,
    data?: unknown,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= DEFAULT_MAX_RETRIES; attempt++) {
      try {
        return await this.createClient().post<T>(url, data, config);
      } catch (error) {
        lastError = error;
        const status = isAxiosError(error) ? error.response?.status : undefined;
        const message =
          error instanceof Error ? error.message : "Unknown POST error";
        if (
          !isProxyRetryableFailure({
            ...(status !== undefined ? { status } : {}),
            message,
          }) ||
          attempt >= DEFAULT_MAX_RETRIES
        ) {
          break;
        }
        await new Promise((r) => setTimeout(r, 800 + attempt * 400));
      }
    }

    const finalMessage =
      lastError instanceof Error ? lastError.message : "Unknown POST error";
    throw new Error(`ProxyService.post failed for ${url}: ${finalMessage}`);
  }
}

/** Shared proxy / HTTP rotation service. */
export const proxyService = new ProxyService();
