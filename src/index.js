import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { launchBrowser } from './browser.js';
import { ensureLoggedIn } from './auth.js';
import { applyOpportunitiesTab } from './opportunities.js';
import { applyFromSearchResults } from './search.js';

async function main() {
  const logger = createLogger();
  let context;

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

    const shutdown = async (fromSignal = false) => {
      if (fromSignal) logger.warn('Interrupt received.');
      logger.summary();
      await context?.close().catch(() => {});
    };

    process.once('SIGINT', async () => {
      await shutdown(true);
      process.exit(0);
    });

    await ensureLoggedIn(page, config, logger);
    await applyOpportunitiesTab(page, config, logger, limits);
    await applyFromSearchResults(page, config, logger, limits);

    await shutdown(false);
  } catch (e) {
    logger.error(e?.stack || e?.message || e);
    process.exitCode = 1;
    await context?.close().catch(() => {});
    logger.summary();
  }
}

main();
