import { randomDelayMs } from './utils.js';

const ALREADY_APPLIED = /Withdraw|Applied|Interest sent|Already applied|Applied successfully/i;
const APPLY_BTN = /I'm interested|Apply now|^Apply$|Express interest|1-?\s*click\s*apply/i;
const VIEW_BTN = /^View(?:\s+job)?(?:\s*»)?$/i;

/**
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {import('playwright').Locator} opts.container
 * @param {ReturnType<import('./logger.js').createLogger>} opts.logger
 * @param {string} opts.source
 * @param {boolean} opts.dryRun
 * @param {string} [opts.company]
 * @param {string} [opts.role]
 * @param {[number, number]} opts.delayRange
 */
export async function tryApply(page, opts) {
  const { container, logger, source, dryRun, company, role, delayRange } = opts;

  if (dryRun) {
    const hasBtn = await container.getByRole('button', { name: APPLY_BTN }).first().isVisible().catch(() => false);
    logger.info('[dry-run]', source, company || '', role || '', hasBtn ? '(would try apply)' : '(no apply button)');
    return 'skipped';
  }

  const appliedState = container.getByRole('button', { name: ALREADY_APPLIED }).first();
  if (await appliedState.isVisible().catch(() => false)) {
    logger.record({
      company,
      role,
      source,
      status: 'skipped',
      detail: 'already applied',
    });
    return 'skipped';
  }

  const btn = container.getByRole('button', { name: APPLY_BTN }).first();
  if (!(await btn.isVisible().catch(() => false))) {
    logger.record({
      company,
      role,
      source,
      status: 'skipped',
      detail: 'no apply button',
    });
    return 'skipped';
  }

  try {
    await btn.click({ timeout: 8000 });
  } catch (e) {
    logger.record({
      company,
      role,
      source,
      status: 'error',
      detail: String(e?.message || e),
    });
    return 'error';
  }

  const confirm = page.getByRole('button', { name: /^(Confirm|Yes|OK|Apply)$/i }).first();
  if (await confirm.isVisible({ timeout: 4000 }).catch(() => false)) {
    await confirm.click().catch(() => {});
  }

  await page.waitForTimeout(1200);

  const stillOpen = await container.getByRole('button', { name: APPLY_BTN }).first().isVisible().catch(() => false);
  if (!stillOpen) {
    logger.record({ company, role, source, status: 'applied' });
    await randomDelayMs(delayRange);
    return 'applied';
  }

  const nowApplied = await container.getByRole('button', { name: ALREADY_APPLIED }).first().isVisible().catch(() => false);
  if (nowApplied) {
    logger.record({ company, role, source, status: 'applied' });
    await randomDelayMs(delayRange);
    return 'applied';
  }

  logger.record({
    company,
    role,
    source,
    status: 'error',
    detail: 'apply outcome unclear',
  });
  await randomDelayMs(delayRange);
  return 'error';
}

/**
 * Open first visible View button and chain-apply within popup until exhausted.
 * Returns number of successful apply clicks completed in this popup pass.
 *
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {ReturnType<import('./logger.js').createLogger>} opts.logger
 * @param {string} opts.source
 * @param {boolean} opts.dryRun
 * @param {[number, number]} opts.delayRange
 * @param {number} opts.remainingCap
 */
export async function applyViaViewPopup(page, opts) {
  const { logger, source, dryRun, delayRange, remainingCap } = opts;
  if (remainingCap <= 0) return 0;

  const viewButton = page
    .locator('button#interested-btn')
    .or(page.getByRole('button', { name: VIEW_BTN }))
    .first();
  if (!(await viewButton.isVisible().catch(() => false))) {
    return 0;
  }

  if (dryRun) {
    logger.info('[dry-run]', source, '(would open first View popup and chain apply)');
    return 0;
  }

  try {
    await viewButton.click({ timeout: 8000 });
  } catch (e) {
    logger.warn(`[debug] ${source}: failed to open View popup`, e?.message || e);
    return 0;
  }
  await page.waitForTimeout(900);

  let appliedInPopup = 0;
  let stagnant = 0;
  let guard = 0;

  while (appliedInPopup < remainingCap && stagnant < 4 && guard < 120) {
    guard += 1;

    const applyButton = page.getByRole('button', { name: APPLY_BTN }).first();
    const applyVisible = await applyButton.isVisible().catch(() => false);
    if (!applyVisible) break;

    const before = await page
      .locator('[role="dialog"], [class*="modal"], [class*="drawer"], body')
      .first()
      .innerText()
      .catch(() => '');

    try {
      await applyButton.click({ timeout: 8000 });
    } catch (e) {
      logger.warn(`[debug] ${source}: apply click failed in popup`, e?.message || e);
      break;
    }

    const confirm = page.getByRole('button', { name: /^(Confirm|Yes|OK|Apply)$/i }).first();
    if (await confirm.isVisible({ timeout: 2500 }).catch(() => false)) {
      await confirm.click().catch(() => {});
    }

    await page.waitForTimeout(1000);

    const after = await page
      .locator('[role="dialog"], [class*="modal"], [class*="drawer"], body')
      .first()
      .innerText()
      .catch(() => '');

    const progressed = after.slice(0, 500) !== before.slice(0, 500);
    const nowApplied = await page.getByRole('button', { name: ALREADY_APPLIED }).first().isVisible().catch(() => false);

    if (progressed || nowApplied) {
      appliedInPopup += 1;
      logger.record({ source, status: 'applied', detail: 'popup-chain' });
      await randomDelayMs(delayRange);
      stagnant = 0;
      continue;
    }

    stagnant += 1;
  }

  await dismissOverlays(page);
  return appliedInPopup;
}

/**
 * @param {import('playwright').Page} page
 */
export async function dismissOverlays(page) {
  const close = page.locator('[aria-label="Close"], button:has-text("×"), .modal-close').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => {});
  }
}
