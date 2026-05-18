import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

interface CombinedScriptContext {
    MAX_REQUEST_BODY_LENGTH: number;
    RATE_LIMIT_GLOBAL_MAX: number;
    RATE_LIMIT_MAX: number;
    buildReusableUrlMap_(data: unknown[][], requestedUrls?: Record<string, boolean>): Record<string, string>;
    checkActionRateLimit_(scope: string, identity: string): { allowed: boolean; retryAfter?: number };
    collectAnalytics_(event: { parameter: Record<string, string> }): {
        uid: string;
        device: string;
        browser: string;
        os: string;
        lang: string;
        ref: string;
        scr: string;
    };
    normalizeEvent_(event: { postData?: { contents?: string } }): {
        parameter: Record<string, string>;
        error?: { code: string; error: string };
    };
    sanitizeReportReason_(raw: string): string;
    sanitizeSheetCell_(raw: string): string;
    validateUrl_(url: string): { code: string; message: string } | null;
    extractDomain_(url: string): string;
}

interface PostScriptContext {
    validateUrl_(url: string): string | null;
    extractDomain_(url: string): string;
}

function loadScript<TContext extends object>(path: string, globals: Record<string, unknown> = {}): TContext {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');
    const context = vm.createContext(globals);
    vm.runInContext(source, context, { filename: path });
    return context as TContext;
}

function createAppsScriptGlobals(): Record<string, unknown> {
    const cache = new Map<string, string>();

    return {
        CacheService: {
            getScriptCache: () => ({
                get: (key: string) => cache.get(key) ?? null,
                put: (key: string, value: string) => {
                    cache.set(key, value);
                },
            }),
        },
        Utilities: {
            Charset: { UTF_8: 'UTF_8' },
            DigestAlgorithm: { SHA_256: 'SHA_256' },
            computeDigest: (_algorithm: string, value: string) =>
                Array.from(createHash('sha256').update(String(value)).digest()).map((byte) =>
                    byte > 127 ? byte - 256 : byte,
                ),
            getUuid: () => '00000000-0000-4000-8000-000000000000',
        },
    };
}

describe('Google Apps Script URL validation', () => {
    it('keeps the combined API validator aligned with browser URL parsing', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');

        expect(script.validateUrl_('https://example.com/@profile')).toBeNull();
        expect(script.extractDomain_('https://example.com:443/path')).toBe('example.com');
        expect(script.extractDomain_('https://[2001:db8::1]:443/path')).toBe('2001:db8::1');
        expect(script.validateUrl_('https://example.com:bad/path')).toMatchObject({
            code: 'URL_INVALID',
        });
        expect(script.validateUrl_('https://[2001:db8::1/path')).toMatchObject({
            code: 'URL_INVALID',
        });
        expect(script.validateUrl_('https://example.com:70000/path')).toMatchObject({
            code: 'URL_INVALID',
        });
    });

    it('neutralizes spreadsheet formula injection in untrusted stored text fields', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');

        expect(script.sanitizeSheetCell_('=IMPORTXML("https://evil.example")')).toBe(
            '\'=IMPORTXML("https://evil.example")',
        );
        expect(script.sanitizeSheetCell_('+cmd')).toBe("'+cmd");
        expect(script.sanitizeSheetCell_('-cmd')).toBe("'-cmd");
        expect(script.sanitizeSheetCell_('@cmd')).toBe("'@cmd");
        expect(script.sanitizeSheetCell_('normal text')).toBe('normal text');
        expect(script.sanitizeReportReason_('=HYPERLINK("https://evil.example","x")')).toMatch(
            /^'=/,
        );

        const analytics = script.collectAnalytics_({
            parameter: {
                uid: '=uid',
                device: '+device',
                browser: '-browser',
                os: '@os',
                lang: 'en-US',
                ref: 'example.com',
                scr: '1920x1080',
            },
        });

        expect(analytics).toMatchObject({
            uid: "'=uid",
            device: "'+device",
            browser: "'-browser",
            os: "'@os",
            lang: 'en-US',
            ref: 'example.com',
            scr: '1920x1080',
        });
    });

    it('enforces a global action rate limit that spoofed client identities cannot bypass', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        script.RATE_LIMIT_GLOBAL_MAX = 2;
        script.RATE_LIMIT_MAX = 10;

        expect(script.checkActionRateLimit_('write', 'uid:one')).toMatchObject({ allowed: true });
        expect(script.checkActionRateLimit_('write', 'uid:two')).toMatchObject({ allowed: true });
        expect(script.checkActionRateLimit_('write', 'uid:three')).toMatchObject({
            allowed: false,
        });
    });

    it('rejects oversized POST bodies before parsing JSON payloads', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');
        script.MAX_REQUEST_BODY_LENGTH = 32;

        const event = script.normalizeEvent_({
            postData: { contents: JSON.stringify({ action: 'bulk', urls: 'x'.repeat(80) }) },
        });

        expect(event.error).toMatchObject({
            code: 'PAYLOAD_TOO_LARGE',
        });
    });

    it('builds a reusable URL lookup map in one sheet pass for bulk duplicate checks', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');
        const data = [
            ['2026-01-01T00:00:00.000Z', 'alpha', 'https://example.com/a', '', '', '', '', '', '', '', '', ''],
            ['2026-01-01T00:00:00.000Z', 'unrequested', 'https://example.com/unrequested', '', '', '', '', '', '', '', '', ''],
            ['2026-01-01T00:00:00.000Z', 'beta', 'https://example.com/b', '', '', '', '', '', '', '', '2030-01-01T00:00:00.000Z', ''],
            ['2026-01-01T00:00:00.000Z', 'gamma', 'https://example.com/c', '', '', '', '', '', '', '', '', 'hash'],
            ['2026-01-01T00:00:00.000Z', '', 'https://example.com/no-alias', '', '', '', '', '', '', '', '', ''],
            ['2026-01-01T00:00:00.000Z', 'bad', 'javascript:alert(1)', '', '', '', '', '', '', '', '', ''],
        ];

        expect(
            script.buildReusableUrlMap_(data, {
                'https://example.com/a': true,
                'https://example.com/b': true,
                'https://example.com/unrequested': false,
            }),
        ).toEqual({
            'https://example.com/a': 'alpha',
        });
    });

    it('keeps the legacy POST validator from accepting malformed direct API URLs', () => {
        const script = loadScript<PostScriptContext>('./google/post.gs');

        expect(script.validateUrl_('https://example.com/@profile')).toBeNull();
        expect(script.extractDomain_('https://example.com:443/path')).toBe('example.com');
        expect(script.extractDomain_('https://[2001:db8::1]:443/path')).toBe('2001:db8::1');
        expect(script.validateUrl_('https://example.com:bad/path')).toContain('valid port');
        expect(script.validateUrl_('https://[2001:db8::1/path')).toContain('valid host');
        expect(script.validateUrl_('https://example.com:70000/path')).toContain('valid port');
    });
});
