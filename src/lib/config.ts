/**
 * S.url configuration.
 *
 * Vite environment variables may override local React app settings. Shared
 * deployed runtime values live in public/static-config.js so the React app,
 * redirect fallback, and report page can use the same client service URLs.
 */

export interface StaticRuntimeConfig {
    scriptUrl?: string;
    networkLookupUrl?: string;
    requestTimeoutMs?: number;
    networkTimeoutMs?: number;
}

export interface ClientConfig {
    readonly scriptUrl: string;
    readonly networkLookupUrl: string;
    readonly baseDisplay: string;
    readonly appName: string;
    readonly tagline: string;
    readonly aliasLength: number;
    readonly aliasChars: string;
    readonly maxBulkUrls: number;
    readonly requestTimeoutMs: number;
    readonly networkTimeoutMs: number;
}

declare global {
    interface Window {
        SURL_STATIC_CONFIG?: Readonly<StaticRuntimeConfig>;
    }
}

const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const DEFAULT_NETWORK_TIMEOUT_MS = 2_500;

export function resolveClientConfig(
    staticConfig: StaticRuntimeConfig = getStaticRuntimeConfig(),
): ClientConfig {
    return {
        scriptUrl: import.meta.env.VITE_SCRIPT_URL || staticConfig.scriptUrl || '',
        networkLookupUrl: staticConfig.networkLookupUrl || 'https://ipapi.co/json/',
        baseDisplay: import.meta.env.VITE_BASE_DISPLAY || '../',
        appName: import.meta.env.VITE_APP_NAME || 'S',
        tagline: import.meta.env.VITE_TAGLINE || 'Serverless, safe, secure, and fast.',
        aliasLength: 6,
        aliasChars: 'abcdefghjkmnpqrstuvwxyz23456789',
        maxBulkUrls: 10,
        requestTimeoutMs: getPositiveNumber(
            staticConfig.requestTimeoutMs,
            DEFAULT_REQUEST_TIMEOUT_MS,
        ),
        networkTimeoutMs: getPositiveNumber(
            staticConfig.networkTimeoutMs,
            DEFAULT_NETWORK_TIMEOUT_MS,
        ),
    };
}

function getStaticRuntimeConfig(): StaticRuntimeConfig {
    if (typeof window === 'undefined') return {};
    return window.SURL_STATIC_CONFIG || {};
}

function getPositiveNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export const config = resolveClientConfig();
