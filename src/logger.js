/**
 * Timestamped logging + per-run application stats.
 */

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

  function info(...args) {
    console.log(`[${ts()}]`, ...args);
  }

  function warn(...args) {
    console.warn(`[${ts()}]`, ...args);
  }

  function error(...args) {
    console.error(`[${ts()}]`, ...args);
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
    info('--- Run summary ---');
    info(`Applied: ${stats.applied}  Skipped: ${stats.skipped}  Errors: ${stats.errors}`);
    const recent = stats.entries.slice(-20);
    if (recent.length) {
      info('Last entries:');
      for (const e of recent) {
        info(`  [${e.status}] ${e.source} ${e.company || ''} ${e.role || ''} ${e.detail || ''}`);
      }
    }
  }

  return { info, warn, error, record, stats, summary };
}
