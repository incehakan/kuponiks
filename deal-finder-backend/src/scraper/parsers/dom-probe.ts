import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "puppeteer";
import type { DomProbeReport } from "./types.js";

/**
 * Logs selector probe results and optionally writes HTML dump under tmp/html-dumps.
 */
export async function logDomProbe(
  platform: string,
  page: Page,
  probeScript: string,
  options: { dumpHtml?: boolean } = {},
): Promise<DomProbeReport | null> {
  try {
    const report = (await page.evaluate(probeScript)) as DomProbeReport;
    const nonZero = Object.entries(report.waitSelectorHits || {}).filter(
      ([, n]) => typeof n === "number" && n > 0,
    );
    console.warn(
      `[${platform}] DOM probe title="${report.title}" htmlLen=${report.htmlLength}`,
    );
    console.warn(
      `[${platform}] nonZeroSelectors=${JSON.stringify(nonZero.slice(0, 12))}`,
    );
    console.warn(
      `[${platform}] topCardClasses=${JSON.stringify((report.topCardClasses || []).slice(0, 12))}`,
    );
    if (report.sampleHrefs?.length) {
      console.warn(
        `[${platform}] sampleHrefs=${JSON.stringify(report.sampleHrefs.slice(0, 5))}`,
      );
    }

    if (options.dumpHtml !== false) {
      try {
        const dir = join(process.cwd(), "tmp", "html-dumps");
        mkdirSync(dir, { recursive: true });
        const html = await page.content();
        const stamp = new Date().toISOString().replace(/[:.]/g, "-");
        const htmlPath = join(dir, `${platform}-${stamp}.html`);
        const jsonPath = join(dir, `${platform}-${stamp}-probe.json`);
        writeFileSync(htmlPath, html, "utf8");
        writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
        console.warn(`[${platform}] HTML dump → ${htmlPath}`);
      } catch (dumpError) {
        const message =
          dumpError instanceof Error ? dumpError.message : "dump failed";
        console.warn(`[${platform}] HTML dump atlandı: ${message}`);
      }
    }

    return report;
  } catch (error) {
    const message = error instanceof Error ? error.message : "probe failed";
    console.warn(`[${platform}] DOM probe başarısız: ${message}`);
    return null;
  }
}
