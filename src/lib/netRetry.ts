// Network resilience helpers.
// "Failed to fetch" / "Load failed" are transient browser-level network errors
// (mobile data hiccup, sleeping tab, DNS blip). Retrying a couple of times with
// a short backoff clears almost all of them without the user seeing an error.

const NETWORK_HINTS = [
  "failed to fetch",
  "load failed",
  "networkerror",
  "network request failed",
  "fetch failed",
  "err_network",
  "err_internet_disconnected",
  "timeout",
  "aborted",
];

export function isNetworkError(err: unknown): boolean {
  const msg =
    typeof err === "string"
      ? err
      : (err as { message?: string })?.message ?? "";
  const lower = msg.toLowerCase();
  return NETWORK_HINTS.some((h) => lower.includes(h));
}

export const NETWORK_ERROR_MESSAGE =
  "Network connection problem. Please check your internet and try again.";

export class RequestTimeoutError extends Error {
  constructor(message = "Request timeout. Please try again.") {
    super(message);
    this.name = "RequestTimeoutError";
  }
}

/** Prevents a browser/network request from leaving the UI loading forever. */
export function withTimeout<T>(promise: Promise<T>, timeoutMs = 12_000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new RequestTimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

/**
 * Runs `fn`, retrying only when it fails with a transient network error.
 * Works for both thrown errors and Supabase-style `{ data, error }` results.
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  options: { retries?: number; baseDelayMs?: number; attemptTimeoutMs?: number } = {}
): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelay = options.baseDelayMs ?? 600;
  const attemptTimeout = options.attemptTimeoutMs ?? 12_000;

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(fn(), attemptTimeout);
      const resultError = (result as { error?: unknown } | null)?.error;
      if (resultError && isNetworkError(resultError) && attempt < retries) {
        lastError = resultError;
        await sleep(baseDelay * (attempt + 1));
        continue;
      }
      return result;
    } catch (err) {
      lastError = err;
      if (!isNetworkError(err) || attempt === retries) throw err;
      await sleep(baseDelay * (attempt + 1));
    }
  }
  throw lastError;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
