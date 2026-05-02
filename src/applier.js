import { randomDelayMs } from './utils.js';

const ALREADY_APPLIED = /Withdraw|Applied|Interest sent|Already applied|Applied successfully/i;
const APPLY_BTN = /I'm interested|Apply now|^Apply$|Express interest|1-?\s*click\s*apply/i;

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
 * @param {import('playwright').Page} page
 */
export async function dismissOverlays(page) {
  const close = page.locator('[aria-label="Close"], button:has-text("×"), .modal-close').first();
  if (await close.isVisible({ timeout: 500 }).catch(() => false)) {
    await close.click().catch(() => {});
  }
}
