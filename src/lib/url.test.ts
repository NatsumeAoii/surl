import { describe, expect, it } from 'vitest';
import {
    MAX_PASSWORD_LENGTH,
    MAX_URL_LENGTH,
    formatLocalDatetime,
    getMinExpiryDatetimeLocal,
    getShortUrlAlias,
    normalizeShortUrl,
    normalizeBasePath,
    normalizeOrigin,
    sanitizeAliasInput,
    toUtcIsoFromDatetimeLocal,
    validateTargetUrl,
} from './url.ts';

describe('validateTargetUrl', () => {
    it('accepts http and https URLs with path @ symbols', () => {
        expect(validateTargetUrl(' https://example.com/@profile ').ok).toBe(true);
        expect(validateTargetUrl('http://localhost:5173/path').ok).toBe(true);
    });

    it('rejects unsafe schemes, empty hosts, embedded credentials, and control characters', () => {
        expect(validateTargetUrl('javascript:alert(1)').code).toBe('URL_PROTOCOL');
        expect(validateTargetUrl('https://')).toMatchObject({ ok: false, code: 'URL_INVALID' });
        expect(validateTargetUrl('https://user:pass@example.com')).toMatchObject({
            ok: false,
            code: 'URL_CREDENTIALS',
        });
        expect(validateTargetUrl('https://example.com/\nnext')).toMatchObject({
            ok: false,
            code: 'URL_CONTROL_CHARS',
        });
    });

    it('enforces the configured length cap', () => {
        expect(validateTargetUrl(`https://example.com/${'a'.repeat(2048)}`)).toMatchObject({
            ok: false,
            code: 'URL_TOO_LONG',
        });
    });
});

describe('alias and expiry helpers', () => {
    it('keeps password length aligned with the backend contract', () => {
        expect(MAX_PASSWORD_LENGTH).toBe(128);
        expect(MAX_URL_LENGTH).toBe(2048);
    });

    it('normalizes aliases to the server-supported lowercase charset', () => {
        expect(sanitizeAliasInput(' My_Alias!! ')).toBe('my_alias');
        expect(sanitizeAliasInput('A'.repeat(70))).toHaveLength(64);
    });

    it('formats datetime-local values from local date parts instead of UTC slicing', () => {
        const date = new Date(2026, 4, 11, 9, 7, 30);
        expect(formatLocalDatetime(date)).toBe('2026-05-11T09:07');
    });

    it('computes the minimum expiry 30 minutes after the supplied local time', () => {
        const now = new Date(2026, 4, 11, 23, 45, 0);
        expect(getMinExpiryDatetimeLocal(now)).toBe(
            formatLocalDatetime(new Date(2026, 4, 12, 0, 15, 0)),
        );
    });

    it('converts datetime-local input to UTC ISO and rejects invalid values', () => {
        const iso = toUtcIsoFromDatetimeLocal('2026-05-11T09:07');
        expect(Number.isNaN(Date.parse(iso))).toBe(false);
        expect(toUtcIsoFromDatetimeLocal('not-a-date')).toBe('');
    });

    it('normalizes API-returned short URLs to the current app base path', () => {
        expect(normalizeOrigin('https://natsumeaoii.github.io/')).toBe(
            'https://natsumeaoii.github.io',
        );
        expect(normalizeBasePath('surl')).toBe('/surl/');
        expect(getShortUrlAlias('https://natsumeaoii.github.io/s-url/B5QPE6?x=1')).toBe('b5qpe6');

        expect(
            normalizeShortUrl(
                'https://natsumeaoii.github.io/natsume-url/b5qpe6',
                'https://natsumeaoii.github.io',
                '/surl/',
            ),
        ).toBe('https://natsumeaoii.github.io/surl/b5qpe6');

        expect(
            normalizeShortUrl(
                'https://natsumeaoii.github.io/s-url/b5qpe6',
                'http://127.0.0.1:5174',
                '/surl/',
            ),
        ).toBe('http://127.0.0.1:5174/surl/b5qpe6');
    });
});
