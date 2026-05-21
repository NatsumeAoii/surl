import { ApiError, isRetryable, normalizeError } from './api/errors.ts';
import { getRetryDelay, wait } from './api/retry.ts';
import { requestOnce } from './api/transport.ts';
import type { CallScriptOptions, ScriptAction, ScriptParams } from './api/types.ts';

export { ApiError, isRetryable, normalizeError } from './api/errors.ts';
export { buildScriptRequestUrl, parseScriptUrl, serializeParams } from './api/requestUrl.ts';
export { getRetryDelay } from './api/retry.ts';
export type {
    CallScriptOptions,
    ScriptAction,
    ScriptParamValue,
    ScriptParams,
} from './api/types.ts';

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
