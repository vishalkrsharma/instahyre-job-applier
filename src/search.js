import { applyViaViewPopup, dismissOverlays } from './applier.js';
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
async function openFilterHeader(page, sectionTitle, log) {
  log?.info?.('[debug] filter: open section header', JSON.stringify(sectionTitle));

  const sidebar = page.locator(SELECTORS.filterSidebar).first();
  const n = await sidebar.count();
  const scope = n > 0 ? sidebar : page;

  log?.info?.('[debug] filter: sidebar match count=', n, 'scope=', n > 0 ? 'sidebar' : 'page');

  const sectionRe = new RegExp(`^${escapeRegExp(sectionTitle)}$`, 'i');
  const header = scope
    .locator('button, [role="button"], div, span, a, h3, h4, h5')
    .filter({ hasText: sectionRe })
    .first();

  try {
    await header.click({ timeout: 10_000 });
  } catch (e) {
    log?.warn?.('[debug] filter: primary header click failed, trying fuzzy text:', e?.message || e);
    await scope.getByText(sectionTitle, { exact: false }).first().click({ timeout: 10_000 });
  }
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

  await openFilterHeader(page, sectionTitle, log);

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
 * @param {{ min?: number | null, max?: number | null } | undefined} exp
 * @returns {Array<{ min: number, max: number } | null>}
 *   Single `null` entry means skip experience controls. Otherwise one entry per year in range.
 */
function experienceFilterIterations(exp) {
  if (!exp || (exp.min == null && exp.max == null)) {
    return [null];
  }
  const rawStart = exp.min ?? exp.max;
  const rawEnd = exp.max ?? exp.min;
  if (typeof rawStart !== 'number' || typeof rawEnd !== 'number') {
    return [null];
  }
  let start = Math.floor(rawStart);
  let end = Math.floor(rawEnd);
  if (start > end) [start, end] = [end, start];

  /** @type {Array<{ min: number, max: number }>} */
  const out = [];
  for (let y = start; y <= end; y += 1) {
    out.push({ min: y, max: y });
  }
  return out;
}

/**
 * Skills, locations, etc. Does not navigate or touch experience.
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
export async function applyNonExperienceFilters(page, config, log) {
  const f = config.filters;

  const run = async (title, values) => {
    if (!values?.length) return;
    log.info('[debug] filter section:', title, 'count=', values.length);
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
}

/**
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./logger.js').createLogger>} log
 * @param {{ min?: number | null, max?: number | null }} range
 */
async function fillExperienceRange(page, log, range) {
  await openFilterHeader(page, 'Experience', log);
  const sidebar = page.locator(SELECTORS.filterSidebar).first();
  const n = await sidebar.count();
  const scope = n > 0 ? sidebar : page;

  try {
    if (range.min != null) {
      const minInput = scope
        .locator('input[placeholder*="Min" i], input[name*="min" i], input[aria-label*="min" i]')
        .first();
      if (await minInput.isVisible({ timeout: 2500 }).catch(() => false)) {
        await minInput.fill(String(range.min));
      }
    }
    if (range.max != null) {
      const maxInput = scope
        .locator('input[placeholder*="Max" i], input[name*="max" i], input[aria-label*="max" i]')
        .first();
      if (await maxInput.isVisible({ timeout: 2500 }).catch(() => false)) {
        await maxInput.fill(String(range.max));
      }
    }
    await page.keyboard.press('Enter').catch(() => {});
  } catch (e) {
    log.warn('Experience filter could not be set', e?.message || e);
  }
}

/**
 * Load search-jobs, apply non-experience filters, then optional experience (tier slice or partial range).
 * @param {import('playwright').Page} page
 * @param {{ min?: number | null, max?: number | null } | null} experience When iterating, `{ min: y, max: y }`. Omit with `null` to skip experience controls.
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
export async function prepareSearchJobsPage(page, config, experience, log) {
  log.info('[debug] prepareSearchJobsPage: goto', SEARCH_JOBS_URL, 'from', page.url());
  await page.goto(SEARCH_JOBS_URL, { waitUntil: 'domcontentloaded' });
  log.info('[debug] prepareSearchJobsPage: after goto URL=', page.url());

  await dismissOverlays(page);
  await page.waitForTimeout(2000);

  log.info('[debug] prepareSearchJobsPage: applying non-experience filters');
  await applyNonExperienceFilters(page, config, log);
  log.info('[debug] prepareSearchJobsPage: non-experience filters done');

  if (experience && (experience.min != null || experience.max != null)) {
    try {
      await fillExperienceRange(page, log, experience);
    } catch (e) {
      log.warn('Experience filter section failed', e?.message || e);
    }
  } else {
    log.info('[debug] prepareSearchJobsPage: skipping experience filter block (none or empty range)');
  }

  await page.waitForTimeout(1500);
  log.info('[debug] prepareSearchJobsPage: finished, URL=', page.url());
}

/**
 * One-shot convenience: same navigation + filters as a single pass from config (experience uses config min/max once, partial fills allowed).
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
export async function applySearchFilters(page, config, log) {
  const exp = config.filters.experience;
  const patch = exp && (exp.min != null || exp.max != null) ? exp : null;
  await prepareSearchJobsPage(page, config, patch, log);
}

/**
 * Scroll search results and try to apply until cap or stagnant.
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} logger
 * @param {{ getApplied: () => number, bumpApplied: () => void }} limits
 * @param {Set<string>} seen Fingerprints deduped across experience tiers.
 */
async function scrollApplyFromSearch(page, config, logger, limits, seen) {
  const delayRange = config.behavior.delayBetweenApplicationsMs;
  const max = config.behavior.maxApplicationsPerRun;
  let stagnant = 0;
  let scrolls = 0;

  while (limits.getApplied() < max && scrolls < 500 && stagnant < 30) {
    await dismissOverlays(page);

    const visibleViewButton = page.getByRole('button', { name: /^View(\s+job)?$/i }).first();
    const hasView = await visibleViewButton.isVisible().catch(() => false);
    const count = await page.locator(SELECTORS.jobRow).count();
    let progressed = false;

    logger.info(
      `[debug] search scroll loop: scrolls=${scrolls} stagnant=${stagnant}/30 rows=${count} hasView=${hasView} applied=${limits.getApplied()}/${max} url=${page.url()}`,
    );

    if (hasView) {
      const before = limits.getApplied();
      const appliedInPopup = await applyViaViewPopup(page, {
        logger,
        source: 'search',
        dryRun: config.behavior.dryRun,
        delayRange,
        remainingCap: max - limits.getApplied(),
      });
      for (let i = 0; i < appliedInPopup; i += 1) limits.bumpApplied();
      if (limits.getApplied() !== before || appliedInPopup > 0) progressed = true;
      if (appliedInPopup > 0) {
        const pageFingerprint = (await page.locator('body').innerText().catch(() => ''))
          .slice(0, 320)
          .replace(/\s+/g, ' ')
          .trim();
        if (pageFingerprint) seen.add(pageFingerprint);
      }
    }

    if (!progressed) stagnant += 1;
    else stagnant = 0;

    await page.mouse.wheel(0, 1000);
    await page.waitForTimeout(700);
    scrolls += 1;
  }

  logger.info(
    `[debug] search scroll loop exit: scrolls=${scrolls} stagnant=${stagnant} applied=${limits.getApplied()}/${config.behavior.maxApplicationsPerRun} reason=${
      limits.getApplied() >= max ? 'cap' : scrolls >= 500 ? 'max_scrolls' : 'stagnant'
    }`,
  );
}

/**
 * Opportunities / recommended jobs run first in `index.js`. This pass applies sidebar filters after that:
 * all filter fields except experience are applied fresh each tier; experience is iterated from min..max (inclusive),
 * setting both min and max inputs to each year while other filters stay the same configuration.
 *
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} logger
 * @param {{ getApplied: () => number, bumpApplied: () => void }} limits
 */
export async function applyFromSearchResults(page, config, logger, limits) {
  if (!config.behavior.applyToCustomSearch) {
    logger.info('Skipping custom search (behavior.applyToCustomSearch is false).');
    logger.info('[debug] applyFromSearchResults: skipped; still on:', page.url());
    return;
  }

  logger.info('[debug] applyFromSearchResults: starting, URL=', page.url());
  const seen = new Set();
  const iterations = experienceFilterIterations(config.filters.experience);
  logger.info('[debug] experience tier iterations:', iterations.length, JSON.stringify(iterations));

  for (let t = 0; t < iterations.length; t += 1) {
    if (limits.getApplied() >= config.behavior.maxApplicationsPerRun) break;

    const tier = iterations[t];
    if (tier) {
      logger.info(
        `Search filtered results: experience min=${tier.min} max=${tier.max} (${t + 1}/${iterations.length} tiers).`,
      );
    } else {
      logger.info('Search filtered results: single pass without experience filters.');
    }

    await prepareSearchJobsPage(page, config, tier, logger);
    await scrollApplyFromSearch(page, config, logger, limits, seen);
  }

  logger.info(`Search results pass finished (${limits.getApplied()} successful applies toward cap).`);
}
