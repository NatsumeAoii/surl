import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api.ts';
import { config } from '../lib/config.ts';
import { MAX_ALIAS_LENGTH } from '../lib/url.ts';
import { copyText, generateAlias, getApiErrorMessage, hasNetworkPayload } from './helpers.ts';

describe('app helpers', () => {
    const originalCrypto = globalThis.crypto;
    const originalDocument = globalThis.document;
    const originalNavigator = globalThis.navigator;
    const originalWindow = globalThis.window;

    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        Object.defineProperty(globalThis, 'crypto', {
            configurable: true,
            value: originalCrypto,
        });
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: originalDocument,
        });
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: originalNavigator,
        });
        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: originalWindow,
        });
    });

    it('generates bounded aliases from the configured character set', () => {
        Object.defineProperty(globalThis, 'crypto', {
            configurable: true,
            value: {
                getRandomValues(bytes: Uint8Array) {
                    bytes.fill(0);
                    return bytes;
                },
            },
        });

        expect(generateAlias(1)).toBe(config.aliasChars[0].repeat(4));
        expect(generateAlias(MAX_ALIAS_LENGTH + 10)).toHaveLength(MAX_ALIAS_LENGTH);
    });

    it('surfaces user-safe script errors and hides unknown details', () => {
        expect(
            getApiErrorMessage(
                new ApiError('INTERNAL', 'Try again later.', undefined, 'raw internal detail'),
            ),
        ).toBe('Try again later.');
        expect(getApiErrorMessage(new Error('secret backend detail'))).toBe(
            'Something went wrong. Check your network or script deployment.',
        );
    });

    it('detects any available network metadata without requiring all fields', () => {
        expect(hasNetworkPayload({})).toBe(false);
        expect(hasNetworkPayload({ ip: '2001:db8::1' })).toBe(true);
        expect(hasNetworkPayload({ country: 'Singapore' })).toBe(true);
        expect(hasNetworkPayload({ network: 'unknown' })).toBe(true);
    });

    it('falls back to a hidden textarea when clipboard access is unavailable', async () => {
        const textarea = {
            value: '',
            setAttribute: vi.fn(),
            style: { cssText: '' },
            select: vi.fn(),
            remove: vi.fn(),
        };
        const fakeDocument = {
            createElement: vi.fn(() => textarea),
            body: { appendChild: vi.fn() },
            execCommand: vi.fn(() => true),
            querySelector: vi.fn(() => null),
        };

        Object.defineProperty(globalThis, 'window', {
            configurable: true,
            value: { isSecureContext: false },
        });
        Object.defineProperty(globalThis, 'navigator', {
            configurable: true,
            value: { clipboard: undefined },
        });
        Object.defineProperty(globalThis, 'document', {
            configurable: true,
            value: fakeDocument,
        });

        await expect(copyText('https://example.com')).resolves.toBe(true);
        expect(textarea.value).toBe('https://example.com');
        expect(fakeDocument.execCommand).toHaveBeenCalledWith('copy');
        expect(textarea.remove).toHaveBeenCalled();
    });
});
