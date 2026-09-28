import type { Browser } from 'playwright-core';

/**
 * The one way this app starts a Chromium, for snapshot capture and thumbnails.
 *
 * Vercel's Node runtime ships no browser, so `chromium.launch()` on its own
 * failed there on every call: thumbnails came back 502 and the dashboard cards
 * sat on their placeholder. On a serverless host we launch the build that
 * @sparticuz/chromium unpacks into /tmp; everywhere else (local dev, a VM, CI)
 * Playwright's own downloaded browser is used as before.
 *
 * Keep @sparticuz/chromium's major version on the Chromium that this
 * playwright-core expects (see its browsers.json), or the protocol drifts.
 */

const SERVERLESS = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

export async function launchChromium(): Promise<Browser> {
  // Imported lazily so a deployment without a browser only fails when one is
  // actually needed, not at module load.
  const { chromium } = await import('playwright-core');

  if (SERVERLESS) {
    const { default: serverless } = await import('@sparticuz/chromium');
    return chromium.launch({
      args: serverless.args,
      executablePath: await serverless.executablePath(),
      headless: true,
    });
  }

  return chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] });
}
