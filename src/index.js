import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { launchBrowser } from './browser.js';
import { ensureLoggedIn } from './auth.js';
import { applyOpportunitiesTab } from './opportunities.js';
import { applyFromSearchResults } from './search.js';
import { isBrowserClosedError } from './utils.js';

async function main() {
  const logger = createLogger();
  /** @type {import('playwright').BrowserContext | undefined} */
  let context;
  let runFinished = false;

  const shutdown = async (fromSignal = false) => {
    if (runFinished) return;
    runFinished = true;
    if (fromSignal) logger.warn('Interrupt received.');
    logger.summary();
    await context?.close().catch(() => {});
  };

  /** Second Ctrl+C (or SIGTERM while closing) should not fall through to Node's default exit 130. */
  let interruptInProgress = false;
  const onSignal = () => {
    if (interruptInProgress) {
      process.exit(0);
      return;
    }
    interruptInProgress = true;
    void shutdown(true).finally(() => process.exit(0));
  };
  process.on('SIGINT', onSignal);
  process.on('SIGTERM', onSignal);

  try {
    const config = loadConfig();
    const launched = await launchBrowser(config);
    context = launched.context;
    const { page } = launched;

    let appliedCount = 0;
    const limits = {
      getApplied: () => appliedCount,
      bumpApplied: () => {
        appliedCount += 1;
      },
    };

    await ensureLoggedIn(page, config, logger);
    logger.info('[debug] Logged in, URL:', page.url());

    logger.info('[debug] Phase: opportunities tab');
    await applyOpportunitiesTab(page, config, logger, limits);
    logger.info('[debug] Opportunities phase done. URL:', page.url(), 'applied:', limits.getApplied());

    logger.info('[debug] Phase: custom search (search-jobs)');
    await applyFromSearchResults(page, config, logger, limits);
    logger.info('[debug] Search phase done. URL:', page.url(), 'applied:', limits.getApplied());

    await shutdown(false);
    process.exitCode = 0;
  } catch (e) {
    if (isBrowserClosedError(e)) {
      if (!runFinished) {
        logger.info('Stopped (browser was closed).');
        await shutdown(false);
      }
      process.exit(0);
      return;
    }
    logger.error(e?.stack || e?.message || e);
    process.exitCode = 1;
    await context?.close().catch(() => {});
    logger.summary();
  }
}

main();
