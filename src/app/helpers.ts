import { ApiError } from '../lib/api.ts';
import { config } from '../lib/config.ts';
import { appendAnalytics } from '../lib/fingerprint.ts';
import { MAX_ALIAS_LENGTH } from '../lib/url.ts';

export function generateAlias(length: number = config.aliasLength): string {
    const chars = config.aliasChars;
    const safeLength = Math.min(MAX_ALIAS_LENGTH, Math.max(4, Math.floor(length)));
    const limit = 256 - (256 % chars.length);
    let alias = '';

    while (alias.length < safeLength) {
        const bytes = new Uint8Array(safeLength - alias.length);
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b >= limit) continue;
            alias += chars[b % chars.length];
            if (alias.length === safeLength) break;
        }
    }

    return alias;
}

export function getApiErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.userMessage;
    return 'Something went wrong. Check your network or script deployment.';
}

export function getAnalyticsParams(): Record<string, string> {
    const query = appendAnalytics('').replace(/^&/, '');
    return Object.fromEntries(new URLSearchParams(query));
}

export function hasNetworkPayload(params: {
    ip?: unknown;
    country?: unknown;
    region?: unknown;
    city?: unknown;
    tz?: unknown;
    network?: unknown;
}): boolean {
    return Boolean(
        params.ip || params.country || params.region || params.city || params.tz || params.network,
    );
}

export async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall back to the hidden textarea path below.
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}
