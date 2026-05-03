/**
 * Timestamped logging + per-run application stats.
 */

import chalk from 'chalk';

/**
 * @param {unknown[]} args
 */
function tintDebugLeadingString(args) {
  if (args.length === 0 || chalk.level === 0) return args;
  const head = args[0];
  if (typeof head !== 'string' || !head.includes('[debug]')) return args;
  return [chalk.magenta(head), ...args.slice(1)];
}

export function createLogger() {
  const stats = {
    applied: 0,
    skipped: 0,
    errors: 0,
    entries: [],
  };

  function ts() {
    return new Date().toISOString();
  }

  function tsPrefix() {
    return chalk.dim.gray(`[${ts()}]`);
  }

  function info(...args) {
    const prefix = `${tsPrefix()} ${chalk.cyan('INF')}`;
    console.log(prefix, ...tintDebugLeadingString(args));
  }

  function warn(...args) {
    const prefix = `${tsPrefix()} ${chalk.yellow('WRN')}`;
    console.warn(prefix, ...tintDebugLeadingString(args));
  }

  function error(...args) {
    const prefix = `${tsPrefix()} ${chalk.red.bold('ERR')}`;
    console.error(prefix, ...args);
  }

  /**
   * @param {{ company?: string, role?: string, source: string, status: 'applied'|'skipped'|'error', detail?: string }} row
   */
  function record(row) {
    stats.entries.push({ ...row, at: ts() });
    if (row.status === 'applied') stats.applied += 1;
    else if (row.status === 'skipped') stats.skipped += 1;
    else stats.errors += 1;
  }

  function summary() {
    info(chalk.bold.blue('--- Run summary ---'));

    const statsLine = `${chalk.green('Applied:')} ${stats.applied}  ${chalk.gray('Skipped:')} ${stats.skipped}  ${chalk.red('Errors:')} ${stats.errors}`;
    info(statsLine);

    const recent = stats.entries.slice(-20);
    if (recent.length) {
      info(chalk.dim('Last entries:'));
      for (const e of recent) {
        const statusLabel =
          e.status === 'applied'
            ? chalk.green(`[${e.status}]`)
            : e.status === 'skipped'
              ? chalk.gray(`[${e.status}]`)
              : chalk.red(`[${e.status}]`);
        info(`  ${statusLabel} ${e.source} ${e.company || ''} ${e.role || ''} ${e.detail || ''}`);
      }
    }
  }

  return { info, warn, error, record, stats, summary };
}
