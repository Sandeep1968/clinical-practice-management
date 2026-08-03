// Minimal in-process job queue with retry + backoff.
// PRODUCTION: replace with SQS/Cloud Tasks + separate worker pods — the
// enqueue() signature is designed so call sites don't change.
const MAX_RETRIES = 3;

export function enqueue(name, fn, { delayMs = 0 } = {}) {
  const run = async (attempt = 1) => {
    try {
      await fn();
      console.log(`[job:${name}] done`);
    } catch (e) {
      console.error(`[job:${name}] attempt ${attempt} failed:`, e.message);
      if (attempt < MAX_RETRIES) {
        setTimeout(() => run(attempt + 1), 1000 * 2 ** attempt);
      } else {
        console.error(`[job:${name}] gave up after ${MAX_RETRIES} attempts (dead-letter)`);
      }
    }
  };
  setTimeout(() => run(), delayMs);
}
