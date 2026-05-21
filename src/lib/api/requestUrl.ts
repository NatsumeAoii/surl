import { ApiError } from './errors.ts';
import type { ScriptAction, ScriptParams } from './types.ts';

const MAX_SCRIPT_REQUEST_URL_LENGTH = 12_000;

export function buildScriptRequestUrl(
    scriptUrl: string,
    action: ScriptAction,
    params: ScriptParams,
): string {
    const url = parseScriptUrl(scriptUrl);
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

export function parseScriptUrl(scriptUrl: string): URL {
    try {
        const url = new URL(scriptUrl);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            throw new Error('Unsupported script URL protocol.');
        }
        return url;
    } catch (error) {
        throw new ApiError(
            'CONFIG_ERROR',
            'The shortener service is not configured correctly.',
            undefined,
            error,
        );
    }
}

export function serializeParams(params: ScriptParams): Record<string, string> {
    const serialized: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        serialized[key] = String(value);
    }
    return serialized;
}
