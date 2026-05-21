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

export function normalizeError(error: unknown): ApiError {
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

export function isRetryable(error: ApiError): boolean {
    return (
        error.code === 'REQUEST_TIMEOUT' ||
        error.code === 'NETWORK_ERROR' ||
        error.status === 429 ||
        (error.status ?? 0) >= 500
    );
}
