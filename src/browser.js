import { chromium } from 'playwright';
import fs from 'fs';

/**
 * @param {Awaited<ReturnType<typeof import('./config.js').loadConfig>>} config
 */
export async function launchBrowser(config) {
  const { userDataDir, headless, channel, slowMoMs } = config.browser;

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: channel || 'chrome',
    headless: Boolean(headless),
    slowMo: Number(slowMoMs) || 0,
    viewport: { width: 1400, height: 900 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = context.pages()[0] || (await context.newPage());
  page.setDefaultTimeout(45_000);
  page.setDefaultNavigationTimeout(60_000);

  return { context, page };
}
