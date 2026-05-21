const COOKIE_NAME = 'ntsm_uid';
const CONSENT_KEY = 'ntsm-consent';
const DISMISS_KEY = 'ntsm-dismiss';
const COOKIE_PATH = import.meta.env.BASE_URL || '/surl/';
const COOKIE_MAX_AGE = 31536000;
const UID_BYTES = 16;
const UID_PATTERN = /^[a-f0-9]{32}$/;

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
    if (!UID_PATTERN.test(uid)) return;

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
