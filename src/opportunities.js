import { tryApply, dismissOverlays } from './applier.js';

/** Tweak if Instahyre changes layout */
export const SELECTORS = {
  /** Cards that contain an apply-style button */
  cardHasApply:
    'div[class*="job"], div[class*="Job"], div[class*="card"], article, section[class*="item"]',
};

const OPPORTUNITIES_URL = 'https://www.instahyre.com/candidate/opportunities/';

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} logger
 * @param {{ getApplied: () => number, bumpApplied: () => void }} limits
 */
export async function applyOpportunitiesTab(page, config, logger, limits) {
  if (!config.behavior.applyToOpportunities) {
    logger.info('Skipping Opportunities (behavior.applyToOpportunities is false).');
    return;
  }

  await page.goto(OPPORTUNITIES_URL, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await page.waitForTimeout(2000);

  const delayRange = config.behavior.delayBetweenApplicationsMs;
  const max = config.behavior.maxApplicationsPerRun;
  const seen = new Set();
  let stagnant = 0;
  let scrolls = 0;

  while (limits.getApplied() < max && scrolls < 400 && stagnant < 25) {
    await dismissOverlays(page);

    const candidates = page.locator(SELECTORS.cardHasApply).filter({
      has: page.locator('button').filter({ hasText: /I'm interested|Apply/i }),
    });
    const count = await candidates.count();
    let progressed = false;

    for (let i = 0; i < count && limits.getApplied() < max; i++) {
      const card = candidates.nth(i);
      if (!(await card.isVisible().catch(() => false))) continue;

      const fingerprint = (await card.innerText().catch(() => '')).slice(0, 280).replace(/\s+/g, ' ').trim();
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const lines = fingerprint.split('\n').map((l) => l.trim()).filter(Boolean);
      const company = lines[0] || undefined;
      const role = lines[1] || undefined;

      const before = limits.getApplied();
      const result = await tryApply(page, {
        container: card,
        logger,
        source: 'opportunities',
        dryRun: config.behavior.dryRun,
        company,
        role,
        delayRange,
      });
      if (result === 'applied') limits.bumpApplied();
      if (limits.getApplied() !== before || result !== 'skipped') progressed = true;
    }

    if (!progressed) stagnant += 1;
    else stagnant = 0;

    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
    scrolls += 1;
  }

  logger.info(`Opportunities pass finished (${limits.getApplied()} successful applies toward cap).`);
}
