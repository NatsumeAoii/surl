export type ScriptAction = 'write' | 'bulk' | 'history' | 'preview' | 'read' | 'report';
export type ScriptParamValue = string | number | boolean | null | undefined;
export type ScriptParams = Record<string, ScriptParamValue>;

interface CallScriptOptions {
    fetchImpl?: typeof fetch;
    timeoutMs?: number;
    retries?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const RETRY_BASE_DELAY_MS = 250;
const RETRY_MAX_DELAY_MS = 2_000;
const MAX_SCRIPT_REQUEST_URL_LENGTH = 12_000;

export class ApiError extends Error {
    readonly code: string;
    readonly userMessage: string;
    readonly status?: number;

    constructor(code: string, userMessage: string, status?: number, cause?: unknown) {
        super(userMessage);
        this.name = 'ApiError';
        this.code = code;
        this.userMessage = userMessage;
        this.status = status;
        if (cause) {
            (this as Error & { cause?: unknown }).cause = cause;
        }
    }
}

export async function callScript<T>(
    scriptUrl: string,
    action: ScriptAction,
    params: ScriptParams = {},
    options: CallScriptOptions = {},
): Promise<T> {
    if (!scriptUrl) {
        throw new ApiError('CONFIG_ERROR', 'The shortener service is not configured.');
    }

    const maxAttempts = Math.max(1, (options.retries ?? 0) + 1);
    let lastError: ApiError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await requestOnce<T>(scriptUrl, action, params, options);
        } catch (error) {
            const apiError = normalizeError(error);
            lastError = apiError;

            if (attempt >= maxAttempts || !isRetryable(apiError)) {
                throw apiError;
            }

            await wait(getRetryDelay(attempt));
        }
    }

    throw lastError ?? new ApiError('NETWORK_ERROR', 'Network error. Please try again.');
}

async function requestOnce<T>(
    scriptUrl: string,
    action: ScriptAction,
    params: ScriptParams,
    options: CallScriptOptions,
): Promise<T> {
    const fetchImpl = options.fetchImpl ?? fetch;
    const requestUrl = buildScriptRequestUrl(scriptUrl, action, params);
    const controller = new AbortController();
    const timeoutId = windowSetTimeout(
        () => controller.abort(),
        options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
        const response = await fetchImpl(requestUrl, {
            method: 'GET',
            signal: controller.signal,
            redirect: 'follow',
            cache: 'no-store',
        });

        if (!response.ok) {
            throw new ApiError(
                'HTTP_ERROR',
                'The shortener service is unavailable. Try again shortly.',
                response.status,
            );
        }

        try {
            return (await response.json()) as T;
        } catch (error) {
            throw new ApiError(
                'BAD_JSON',
                'The shortener service returned an unreadable response.',
                undefined,
                error,
            );
        }
    } catch (error) {
        throw normalizeError(error);
    } finally {
        clearTimeout(timeoutId);
    }
}

function buildScriptRequestUrl(
    scriptUrl: string,
    action: ScriptAction,
    params: ScriptParams,
): string {
    const url = new URL(scriptUrl);
    url.searchParams.set('action', action);

    for (const [key, value] of Object.entries(serializeParams(params))) {
        url.searchParams.set(key, value);
    }

    const requestUrl = url.toString();
    if (requestUrl.length > MAX_SCRIPT_REQUEST_URL_LENGTH) {
        throw new ApiError('REQUEST_TOO_LARGE', 'Request is too large. Try fewer or shorter URLs.');
    }

    return requestUrl;
}

function serializeParams(params: ScriptParams): Record<string, string> {
    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        serialized[key] = String(value);
    }
    return serialized;
}

function normalizeError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (
        typeof DOMException !== 'undefined' &&
        error instanceof DOMException &&
        error.name === 'AbortError'
    ) {
        return new ApiError(
            'REQUEST_TIMEOUT',
            'The shortener service took too long to respond.',
            undefined,
            error,
        );
    }
    return new ApiError('NETWORK_ERROR', 'Network error. Please try again.', undefined, error);
}

function isRetryable(error: ApiError): boolean {
    return (
        error.code === 'REQUEST_TIMEOUT' ||
        error.code === 'NETWORK_ERROR' ||
        error.status === 429 ||
        (error.status ?? 0) >= 500
    );
}

function getRetryDelay(attempt: number): number {
    const exponential = Math.min(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1), RETRY_MAX_DELAY_MS);
    return exponential + Math.floor(Math.random() * RETRY_BASE_DELAY_MS);
}

function wait(ms: number): Promise<void> {
    return new Promise((resolve) => windowSetTimeout(resolve, ms));
}

function windowSetTimeout(handler: () => void, timeout: number): ReturnType<typeof setTimeout> {
    return setTimeout(handler, timeout);
}
