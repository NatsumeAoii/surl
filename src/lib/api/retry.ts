const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2_000;

export function getRetryDelay(attempt: number): number {
    const exponential = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
    return exponential + Math.floor(Math.random() * RETRY_BASE_DELAY_MS);
}

export function wait(ms: number): Promise<void> {
    return new Promise((resolve) => windowSetTimeout(resolve, ms));
}

export function windowSetTimeout(
    handler: () => void,
    timeout: number,
): ReturnType<typeof setTimeout> {
    return setTimeout(handler, timeout);
}
