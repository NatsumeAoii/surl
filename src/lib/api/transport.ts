import { ApiError, normalizeError } from './errors.ts';
import { buildScriptRequestUrl } from './requestUrl.ts';
import { windowSetTimeout } from './retry.ts';
import type { CallScriptOptions, ScriptAction, ScriptParams } from './types.ts';

const DEFAULT_TIMEOUT_MS = 30_000;

export async function requestOnce<T>(
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
