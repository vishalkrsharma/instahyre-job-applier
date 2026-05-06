import { applyViaViewPopup, dismissOverlays } from './applier.js';

/** Tweak if Instahyre changes layout */
export const SELECTORS = {
  /** Cards that contain an apply-style button */
  cardHasApply:
    'div[class*="job"], div[class*="Job"], div[class*="card"], article, section[class*="item"]',
  viewButton: 'button:has-text("View »")',
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
  logger.info('[debug] opportunities: navigated', OPPORTUNITIES_URL, 'actual:', page.url());
  await dismissOverlays(page);
  await page.waitForLoadState('networkidle').catch(() => {});

  const initialViewButton = page
    .locator('button#interested-btn')
    .or(page.getByRole('button', { name: /^View(?:\s+job)?(?:\s*»)?$/i }))
    .first();
  const initialCards = page.locator(SELECTORS.cardHasApply).first();
  await Promise.race([
    initialViewButton.waitFor({ state: 'visible', timeout: 12000 }),
    initialCards.waitFor({ state: 'visible', timeout: 12000 }),
  ]).catch(() => {});
  const initialCardCount = await page.locator(SELECTORS.cardHasApply).count();
  const initialHasView = await initialViewButton.isVisible().catch(() => false);
  logger.info(
    `[debug] opportunities: initial wait done cards=${initialCardCount} hasView=${initialHasView}`,
  );

  const delayRange = config.behavior.delayBetweenApplicationsMs;
  const max = config.behavior.maxApplicationsPerRun;
  let stagnant = 0;
  let scrolls = 0;
  let foundAnyJob = false;

  while (limits.getApplied() < max && scrolls < 400 && stagnant < 25) {
    await dismissOverlays(page);

    const visibleViewButton = page
      .locator('button#interested-btn')
      .or(page.getByRole('button', { name: /^View(?:\s+job)?(?:\s*»)?$/i }))
      .first();
    const hasView = await visibleViewButton.isVisible().catch(() => false);
    const count = await page.locator(SELECTORS.cardHasApply).count();
    let progressed = false;

    logger.info(
      `[debug] opportunities loop: scrolls=${scrolls} stagnant=${stagnant}/${25} cards=${count} hasView=${hasView} applied=${limits.getApplied()}/${max}`,
    );

    if (!hasView && !foundAnyJob && scrolls === 0) {
      logger.info('[debug] opportunities: no jobs with View button. Moving to filtered search.');
      break;
    }

    if (hasView) {
      foundAnyJob = true;
      const before = limits.getApplied();
      const appliedInPopup = await applyViaViewPopup(page, {
        logger,
        source: 'opportunities',
        dryRun: config.behavior.dryRun,
        delayRange,
        remainingCap: max - limits.getApplied(),
      });
      for (let i = 0; i < appliedInPopup; i += 1) limits.bumpApplied();
      if (limits.getApplied() !== before || appliedInPopup > 0) progressed = true;
    }

    if (!progressed) stagnant += 1;
    else stagnant = 0;

    await page.mouse.wheel(0, 900);
    await page.waitForTimeout(600);
    scrolls += 1;
  }

  logger.info(`Opportunities pass finished (${limits.getApplied()} successful applies toward cap).`);
}
