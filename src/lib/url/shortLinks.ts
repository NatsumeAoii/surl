import { sanitizeAliasInput } from './alias.ts';

export function normalizeShortUrl(
    shortUrl: string,
    origin = getRuntimeOrigin(),
    basePath = getRuntimeBasePath(),
): string {
    const alias = getShortUrlAlias(shortUrl);
    if (!alias) return shortUrl;

    return `${normalizeOrigin(origin)}${normalizeBasePath(basePath)}${encodeURIComponent(alias)}`;
}

export function getShortUrlAlias(shortUrl: string): string {
    const trimmed = shortUrl.trim();
    if (!trimmed) return '';

    try {
        const parsed = new URL(trimmed, getRuntimeOrigin());
        const pathParts = parsed.pathname.split('/').filter(Boolean);
        return sanitizeAliasInput(pathParts[pathParts.length - 1] || '');
    } catch {
        return sanitizeAliasInput(
            trimmed.split(/[?#]/, 1)[0].split('/').filter(Boolean).pop() || '',
        );
    }
}

export function normalizeOrigin(origin: string): string {
    return origin.replace(/\/+$/, '');
}

export function normalizeBasePath(basePath: string): string {
    const normalized = `/${basePath.replace(/^\/+|\/+$/g, '')}/`;
    return normalized === '//' ? '/' : normalized;
}

function getRuntimeOrigin(): string {
    if (typeof window !== 'undefined' && window.location.origin) return window.location.origin;
    return '';
}

function getRuntimeBasePath(): string {
    return import.meta.env.BASE_URL || '/surl/';
}
