const OPPORTUNITIES_URL = 'https://www.instahyre.com/candidate/opportunities/';

/**
 * Navigate to Opportunities; if login is required, submit email/password.
 * @param {import('playwright').Page} page
 * @param {ReturnType<import('./config.js').loadConfig>} config
 * @param {ReturnType<import('./logger.js').createLogger>} log
 */
export async function ensureLoggedIn(page, config, log) {
  await page.goto(OPPORTUNITIES_URL, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  const onLogin =
    /\/login/i.test(page.url()) ||
    (await page
      .locator('input[name="email"], input#id_email, input[type="email"][autocomplete="username"]')
      .first()
      .isVisible()
      .catch(() => false));

  if (onLogin) {
    log.info('Login required; entering credentials from config...');

    const emailInput = page
      .locator('input[name="email"], input#id_email, input[type="email"]')
      .first();
    await emailInput.waitFor({ state: 'visible', timeout: 30_000 });
    await emailInput.fill(config.credentials.email);

    const pwdInput = page
      .locator('input[name="password"], input#id_password, input[type="password"]')
      .first();
    await pwdInput.fill(config.credentials.password);

    const submit = page
      .locator(
        'button[type="submit"], input[type="submit"], button:has-text("Log in"), button:has-text("Sign in")',
      )
      .first();
    await submit.click();

    try {
      await page.waitForURL(
        (url) =>
          /instahyre\.com\/(candidate|opportunities|search-jobs)/i.test(url.href) &&
          !/\/login/i.test(url.href),
        { timeout: 120_000 },
      );
    } catch {
      log.warn(
        'Still on or redirected to an unexpected URL after login. Complete any CAPTCHA/2FA in the browser, then re-run.',
      );
    }
  }

  log.info('Auth step finished. Current URL:', page.url());
}
