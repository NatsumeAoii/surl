import { MAX_URL_LENGTH } from './constants.ts';
import type { UrlValidationCode, UrlValidationResult } from './types.ts';

const URL_ERROR_MESSAGES: Record<UrlValidationCode, string> = {
    URL_REQUIRED: 'Please enter a URL to shorten.',
    URL_TOO_LONG: `URL exceeds the ${MAX_URL_LENGTH} character limit.`,
    URL_CONTROL_CHARS: 'URL contains invalid control characters.',
    URL_INVALID: 'Enter a complete URL, including a valid host.',
    URL_PROTOCOL: 'URL must start with http:// or https://',
    URL_CREDENTIALS: 'URL must not contain embedded usernames or passwords.',
};

export function validateTargetUrl(rawUrl: string, maxLength = MAX_URL_LENGTH): UrlValidationResult {
    const url = rawUrl.trim();

    if (!url) return invalidUrl('URL_REQUIRED');
    if (url.length > maxLength) return invalidUrl('URL_TOO_LONG');
    if (hasControlCharacter(url)) return invalidUrl('URL_CONTROL_CHARS');

    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return invalidUrl('URL_INVALID');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return invalidUrl('URL_PROTOCOL');
    }

    if (!parsed.hostname) return invalidUrl('URL_INVALID');

    if (parsed.username || parsed.password) {
        return invalidUrl('URL_CREDENTIALS');
    }

    return { ok: true, normalized: parsed.href };
}

function invalidUrl(code: UrlValidationCode): UrlValidationResult {
    return { ok: false, code, message: URL_ERROR_MESSAGES[code] };
}

function hasControlCharacter(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 32 || code === 127) return true;
    }
    return false;
}
