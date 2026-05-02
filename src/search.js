import { tryApply, dismissOverlays } from './applier.js';
import { escapeRegExp } from './utils.js';

export const SELECTORS = {
  filterSidebar: 'aside, [class*="filter"], [class*="Filter"], [class*="sidebar"]',
  jobRow:
    'div[class*="job"], div[class*="Job"], li[class*="job"], article, [class*="search-result"], [class*="listing"]',
};

const SEARCH_JOBS_URL = 'https://www.instahyre.com/search-jobs/';

/**
 * @param {import('playwright').Page} page
 * @param {string} sectionTitle
 */
async function openFilterHeader(page, sectionTitle) {
  const sidebar = page.locator(SELECTORS.filterSidebar).first();
  const n = await sidebar.count();
  const scope = n > 0 ? sidebar : page;

  const sectionRe = new RegExp(`^${escapeRegExp(sectionTitle)}$`, 'i');
  const header = scope
    .locator('button, [role="button"], div, span, a, h3, h4, h5')
    .filter({ hasText: sectionRe })
    .first();

  await header.click({ timeout: 10_000 }).catch(async () => {
    await scope.getByText(sectionTitle, { exact: false }).first().click({ timeout: 10_000 });
  });
  await page.waitForTimeout(450);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} sectionTitle
 * @param {string[]} values
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
async function pickFilterSection(page, sectionTitle, values, log) {
  if (!values?.length) return;

  await openFilterHeader(page, sectionTitle);

  const sidebar = page.locator(SELECTORS.filterSidebar).first();
  const n = await sidebar.count();
  const scope = n > 0 ? sidebar : page;

  for (const v of values) {
    const trimmed = String(v).trim();
    if (!trimmed) continue;

    const exact = scope.getByText(trimmed, { exact: true }).first();
    const loose = scope.getByText(new RegExp(`^${escapeRegExp(trimmed)}$`, 'i')).first();

    try {
      if (await exact.isVisible({ timeout: 1200 }).catch(() => false)) {
        await exact.click({ timeout: 5000 });
      } else if (await loose.isVisible({ timeout: 1200 }).catch(() => false)) {
        await loose.click({ timeout: 5000 });
      } else {
        log.warn(`Filter value not found: [${sectionTitle}] "${trimmed}"`);
      }
    } catch (e) {
      log.warn(`Filter value not clickable: [${sectionTitle}] "${trimmed}"`, e?.message || '');
    }
    await page.waitForTimeout(300);
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
export async function applySearchFilters(page, config, log) {
  const f = config.filters;

  await page.goto(SEARCH_JOBS_URL, { waitUntil: 'domcontentloaded' });
  await dismissOverlays(page);
  await page.waitForTimeout(2000);

  const run = async (title, values) => {
    if (!values?.length) return;
    try {
      await pickFilterSection(page, title, values, log);
    } catch (e) {
      log.warn(`Filter section failed: ${title}`, e?.message || e);
    }
  };

  await run('Skills', f.skills);

  if (f.jobFunctions?.length) {
    try {
      await pickFilterSection(page, 'Job function', f.jobFunctions, log);
    } catch {
      await pickFilterSection(page, 'Job functions', f.jobFunctions, log);
    }
  }

  await run('Industries', f.industries);
  await run('Locations', f.locations);
  await run('Companies', f.companies);
  await run('Company size', f.companySize);

  const exp = f.experience;
  if (exp && (exp.min != null || exp.max != null)) {
    try {
      await openFilterHeader(page, 'Experience');
      const sidebar = page.locator(SELECTORS.filterSidebar).first();
      const n = await sidebar.count();
      const scope = n > 0 ? sidebar : page;

      if (exp.min != null) {
        const minInput = scope
          .locator('input[placeholder*="Min" i], input[name*="min" i], input[aria-label*="min" i]')
          .first();
        if (await minInput.isVisible({ timeout: 2500 }).catch(() => false)) {
          await minInput.fill(String(exp.min));
        }
      }
      if (exp.max != null) {
        const maxInput = scope
          .locator('input[placeholder*="Max" i], input[name*="max" i], input[aria-label*="max" i]')
          .first();
        if (await maxInput.isVisible({ timeout: 2500 }).catch(() => false)) {
          await maxInput.fill(String(exp.max));
        }
      }
      await page.keyboard.press('Enter').catch(() => {});
    } catch (e) {
      log.warn('Experience filter could not be set', e?.message || e);
    }
  }

  await page.waitForTimeout(1500);
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} logger
 * @param {{ getApplied: () => number, bumpApplied: () => void }} limits
 */
export async function applyFromSearchResults(page, config, logger, limits) {
  if (!config.behavior.applyToCustomSearch) {
    logger.info('Skipping custom search (behavior.applyToCustomSearch is false).');
    return;
  }

  await applySearchFilters(page, config, logger);

  const delayRange = config.behavior.delayBetweenApplicationsMs;
  const max = config.behavior.maxApplicationsPerRun;
  const seen = new Set();
  let stagnant = 0;
  let scrolls = 0;

  while (limits.getApplied() < max && scrolls < 500 && stagnant < 30) {
    await dismissOverlays(page);

    const rows = page.locator(SELECTORS.jobRow).filter({
      has: page.locator('button').filter({ hasText: /I'm interested|Apply/i }),
    });
    const count = await rows.count();
    let progressed = false;

    for (let i = 0; i < count && limits.getApplied() < max; i++) {
      const card = rows.nth(i);
      if (!(await card.isVisible().catch(() => false))) continue;

      const fingerprint = (await card.innerText().catch(() => '')).slice(0, 320).replace(/\s+/g, ' ').trim();
      if (!fingerprint || seen.has(fingerprint)) continue;
      seen.add(fingerprint);

      const lines = fingerprint.split('\n').map((l) => l.trim()).filter(Boolean);
      const company = lines[0] || undefined;
      const role = lines[1] || undefined;

      const before = limits.getApplied();
      const result = await tryApply(page, {
        container: card,
        logger,
        source: 'search',
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

    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(700);
    scrolls += 1;
  }

  logger.info(`Search results pass finished (${limits.getApplied()} successful applies toward cap).`);
}
