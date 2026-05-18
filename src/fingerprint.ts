/**
 * Anonymous visitor identification and coarse device analytics.
 *
 * Data tiers:
 * - Device info (device, browser, OS, language, screen): collected without cookies.
 * - UID and referrer: appended only after cookie consent.
 */

const COOKIE_NAME = 'ntsm_uid';
const CONSENT_KEY = 'ntsm-consent';
const DISMISS_KEY = 'ntsm-dismiss';
const COOKIE_PATH = import.meta.env.BASE_URL || '/surl/';
const COOKIE_MAX_AGE = 31536000;
const UID_BYTES = 16;
const NETWORK_LOOKUP_URL = 'https://ipapi.co/json/';
const NETWORK_LOOKUP_TIMEOUT_MS = 2500;
const MAX_NETWORK_FIELD_LENGTH = 64;
const MAX_IP_LENGTH = 45;

export interface DeviceInfo {
    device: string;
    browser: string;
    os: string;
    lang: string;
    scr: string;
}

export interface NetworkContext {
    ip?: string;
    country?: string;
    region?: string;
    city?: string;
    tz?: string;
}

export type NetworkParams = NetworkContext & {
    network?: string;
    metadataVersion?: number;
};

export function generateUID(): string {
    const bytes = new Uint8Array(UID_BYTES);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function getUID(): string | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([a-f0-9]{32})`));
    return match ? match[1] : null;
}

export function setUID(uid: string): void {
    const parts = [
        `${COOKIE_NAME}=${uid}`,
        `path=${COOKIE_PATH}`,
        `max-age=${COOKIE_MAX_AGE}`,
        'SameSite=Strict',
    ];

    if (location.protocol === 'https:') parts.push('Secure');
    document.cookie = parts.join('; ');
}

export function hasConsent(): boolean {
    return getLocalItem(CONSENT_KEY) === 'granted';
}

export function grantConsent(): string {
    setLocalItem(CONSENT_KEY, 'granted');
    removeSessionItem(DISMISS_KEY);
    const uid = getUID() || generateUID();
    setUID(uid);
    return uid;
}

export function isDismissed(): boolean {
    return getSessionItem(DISMISS_KEY) === '1';
}

export function dismissBanner(): void {
    setSessionItem(DISMISS_KEY, '1');
}

export function getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;
    return {
        device: detectDevice(ua),
        browser: detectBrowser(ua),
        os: detectOS(ua),
        lang: (navigator.language || '').slice(0, 10),
        scr: `${window.screen.width}x${window.screen.height}`,
    };
}

export function appendAnalytics(endpoint: string): string {
    const info = getDeviceInfo();
    let params =
        endpoint +
        `&device=${encodeURIComponent(info.device)}` +
        `&browser=${encodeURIComponent(info.browser)}` +
        `&os=${encodeURIComponent(info.os)}` +
        `&lang=${encodeURIComponent(info.lang)}` +
        `&scr=${encodeURIComponent(info.scr)}`;

    if (hasConsent()) {
        const uid = getUID();
        if (uid) params += `&uid=${encodeURIComponent(uid)}`;
        if (document.referrer) {
            try {
                params += `&ref=${encodeURIComponent(new URL(document.referrer).hostname)}`;
            } catch {
                // Ignore malformed referrer values.
            }
        }
    }

    return params;
}

export async function getNetworkContext(
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = NETWORK_LOOKUP_TIMEOUT_MS,
): Promise<NetworkContext> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

    try {
        const response = await fetchImpl(NETWORK_LOOKUP_URL, {
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) return {};

        const data = (await response.json()) as Record<string, unknown>;
        return compactNetworkContext({
            ip: cleanIp(data.ip),
            country: cleanNetworkField(data.country_name || data.country),
            region: cleanNetworkField(
                data.region || data.region_code || data.city || data.country_name,
            ),
            city: cleanNetworkField(data.city),
            tz: cleanNetworkField(data.timezone),
        });
    } catch {
        return {};
    } finally {
        clearTimeout(timeoutId);
    }
}

export function toNetworkParams(context: NetworkContext): NetworkParams {
    const normalized = compactNetworkContext({
        ip: cleanIp(context.ip),
        country: cleanNetworkField(context.country),
        region: cleanNetworkField(context.region || context.city || context.country),
        city: cleanNetworkField(context.city),
        tz: cleanNetworkField(context.tz),
    });

    if (Object.keys(normalized).length === 0) return {};

    return {
        ...normalized,
        network: JSON.stringify(normalized),
        metadataVersion: 2,
    };
}

export async function getNetworkParams(
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = NETWORK_LOOKUP_TIMEOUT_MS,
): Promise<NetworkParams> {
    return toNetworkParams(await getNetworkContext(fetchImpl, timeoutMs));
}

function detectDevice(ua: string): string {
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android.*mobile|opera mini|iemobile/i.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua: string): string {
    if (/edg\//i.test(ua)) return extract(ua, /edg\/([\d.]+)/i, 'Edge');
    if (/opr\//i.test(ua) || /opera/i.test(ua))
        return extract(ua, /(?:opr|opera)\/([\d.]+)/i, 'Opera');
    if (/vivaldi/i.test(ua)) return extract(ua, /vivaldi\/([\d.]+)/i, 'Vivaldi');
    if (/brave/i.test(ua)) return 'Brave';
    if (/yabrowser/i.test(ua)) return extract(ua, /yabrowser\/([\d.]+)/i, 'Yandex');
    if (/samsungbrowser/i.test(ua)) return extract(ua, /samsungbrowser\/([\d.]+)/i, 'Samsung');
    if (/ucbrowser/i.test(ua)) return extract(ua, /ucbrowser\/([\d.]+)/i, 'UC Browser');
    if (/firefox|fxios/i.test(ua)) return extract(ua, /(?:firefox|fxios)\/([\d.]+)/i, 'Firefox');
    if (/crios/i.test(ua)) return extract(ua, /crios\/([\d.]+)/i, 'Chrome');
    if (/chrome/i.test(ua) && !/chromium/i.test(ua))
        return extract(ua, /chrome\/([\d.]+)/i, 'Chrome');
    if (/chromium/i.test(ua)) return extract(ua, /chromium\/([\d.]+)/i, 'Chromium');
    if (/safari/i.test(ua) && !/chrome/i.test(ua))
        return extract(ua, /version\/([\d.]+)/i, 'Safari');
    if (/trident|msie/i.test(ua)) return 'IE';
    return 'Unknown';
}

function detectOS(ua: string): string {
    if (/windows nt 10/i.test(ua)) return 'Windows 10+';
    if (/windows nt 6\.3/i.test(ua)) return 'Windows 8.1';
    if (/windows nt 6\.2/i.test(ua)) return 'Windows 8';
    if (/windows nt 6\.1/i.test(ua)) return 'Windows 7';
    if (/windows/i.test(ua)) return 'Windows';
    if (/mac os x ([\d_]+)/i.test(ua))
        return 'macOS ' + (ua.match(/mac os x ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '');
    if (/cros/i.test(ua)) return 'Chrome OS';
    if (/iphone|ipad|ipod/i.test(ua))
        return 'iOS ' + (ua.match(/os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || '');
    if (/android ([\d.]+)/i.test(ua))
        return 'Android ' + (ua.match(/android ([\d.]+)/i)?.[1] || '');
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
}

function extract(ua: string, pattern: RegExp, name: string): string {
    const match = ua.match(pattern);
    const version = match?.[1]?.split('.').slice(0, 2).join('.') || '';
    return version ? `${name} ${version}` : name;
}

function compactNetworkContext(context: NetworkContext): NetworkContext {
    return Object.fromEntries(
        Object.entries(context).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
}

function cleanIp(value: unknown): string {
    const ip = cleanNetworkField(value, MAX_IP_LENGTH);
    if (!ip || !/^[a-fA-F0-9:.]+$/.test(ip)) return '';
    return ip;
}

function cleanNetworkField(value: unknown, maxLength: number = MAX_NETWORK_FIELD_LENGTH): string {
    return String(value ?? '')
        .split('')
        .filter(isPrintableCharacter)
        .join('')
        .trim()
        .replace(/^[=+\-@]+/, '')
        .trim()
        .slice(0, maxLength);
}

function isPrintableCharacter(character: string): boolean {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
}

function getLocalItem(key: string): string | null {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function setLocalItem(key: string, value: string): void {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Consent cookie still carries the user identifier when storage is blocked.
    }
}

function getSessionItem(key: string): string | null {
    try {
        return sessionStorage.getItem(key);
    } catch {
        return null;
    }
}

function setSessionItem(key: string, value: string): void {
    try {
        sessionStorage.setItem(key, value);
    } catch {
        // Banner dismissal is non-critical.
    }
}

function removeSessionItem(key: string): void {
    try {
        sessionStorage.removeItem(key);
    } catch {
        // Banner dismissal is non-critical.
    }
}
