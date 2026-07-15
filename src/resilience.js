const TRANSIENT_STATUS_CODES = new Set([429, 502, 503, 504]);

export function isRetryableJiraRequest(method, statusCode, retrySafe = false) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  return (normalizedMethod === 'GET' || retrySafe === true)
    && TRANSIENT_STATUS_CODES.has(Number(statusCode));
}

export function retryDelayMs(attempt, retryAfterHeader = null, maximumDelayMs = 2000) {
  const hasRetryAfter = retryAfterHeader !== null && retryAfterHeader !== undefined && String(retryAfterHeader).trim() !== '';
  const retryAfterSeconds = Number(retryAfterHeader);
  if (hasRetryAfter && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(Math.round(retryAfterSeconds * 1000), maximumDelayMs);
  }
  const exponential = 200 * (2 ** Math.max(0, Number(attempt) || 0));
  return Math.min(exponential, maximumDelayMs);
}

export function sleep(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(delayMs) || 0)));
}
