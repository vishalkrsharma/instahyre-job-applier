/**
 * @param {[number, number]} range
 */
export function randomDelayMs(range) {
  const [min, max] = range;
  const ms = min + Math.floor(Math.random() * (max - min + 1));
  return new Promise((r) => setTimeout(r, ms));
}

export function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Playwright throws when the user closes the browser or the context is torn down mid-operation.
 * Treat these as intentional shutdown, not application failures.
 *
 * @param {unknown} e
 */
export function isBrowserClosedError(e) {
  const msg =
    typeof e === 'object' && e !== null && 'message' in e ? String(/** @type {{ message: unknown }} */ (e).message) : String(e ?? '');
  return /has been closed|Browser has been closed|Execution context was destroyed|Target closed|Connection closed/i.test(
    msg,
  );
}
