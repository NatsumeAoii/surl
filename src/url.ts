export const MAX_URL_LENGTH = 2048;
export const MAX_ALIAS_LENGTH = 64;
export const MAX_PASSWORD_LENGTH = 128;

export type UrlValidationCode =
    | 'URL_REQUIRED'
    | 'URL_TOO_LONG'
    | 'URL_CONTROL_CHARS'
    | 'URL_INVALID'
    | 'URL_PROTOCOL'
    | 'URL_CREDENTIALS';

export interface UrlValidationResult {
    ok: boolean;
    code?: UrlValidationCode;
    normalized?: string;
    message?: string;
}

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

export function sanitizeAliasInput(rawAlias: string, maxLength = MAX_ALIAS_LENGTH): string {
    return rawAlias
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, maxLength);
}

export function formatLocalDatetime(date: Date): string {
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getMinExpiryDatetimeLocal(now = new Date()): string {
    return formatLocalDatetime(new Date(now.getTime() + 30 * 60 * 1000));
}

export function toUtcIsoFromDatetimeLocal(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatExpiry(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(getLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(date);
}

function invalidUrl(code: UrlValidationCode): UrlValidationResult {
    return { ok: false, code, message: URL_ERROR_MESSAGES[code] };
}

function getLocale(): string {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return 'en-US';
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

function hasControlCharacter(value: string): boolean {
    for (let i = 0; i < value.length; i++) {
        const code = value.charCodeAt(i);
        if (code < 32 || code === 127) return true;
    }
    return false;
}
