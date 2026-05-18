import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';

interface CombinedScriptContext {
    MAX_REQUEST_BODY_LENGTH: number;
    RATE_LIMIT_GLOBAL_MAX: number;
    RATE_LIMIT_MAX: number;
    buildReusableUrlMap_(
        data: unknown[][],
        requestedUrls?: Record<string, boolean>,
    ): Record<string, string>;
    checkActionRateLimit_(
        scope: string,
        identity: string,
    ): { allowed: boolean; retryAfter?: number };
    collectAnalytics_(event: { parameter: Record<string, string> }): {
        uid: string;
        device: string;
        browser: string;
        os: string;
        lang: string;
        ref: string;
        scr: string;
    };
    collectNetworkContext_(event: { parameter: Record<string, string> }): {
        ip: string;
        ipHash: string;
        country: string;
        region: string;
        city: string;
        timezone: string;
    };
    normalizeEvent_(event: { postData?: { contents?: string } }): {
        parameter: Record<string, string>;
        error?: { code: string; error: string };
    };
    sanitizeReportReason_(raw: string): string;
    sanitizeSheetCell_(raw: string): string;
    validateUrl_(url: string): { code: string; message: string } | null;
    extractDomain_(url: string): string;
    handlePreview_(event: { parameter: Record<string, string> }): unknown;
    handleRead_(event: { parameter: Record<string, string> }): unknown;
    handleWrite_(event: { parameter: Record<string, string> }): unknown;
    handleReport_(event: { parameter: Record<string, string> }): unknown;
    respond_(payload: unknown): unknown;
    getSheet_(name: string): unknown;
    getSpreadsheet_(): unknown;
    PASSWORD_RATE_LIMIT_MAX: number;
    PASSWORD_RATE_LIMIT_GLOBAL_MAX: number;
    generateAlias_(): string;
    verifyPassword_(password: string, storedHash: string): boolean;
}

function loadScript<TContext extends object>(
    path: string,
    globals: Record<string, unknown> = {},
): TContext {
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
        LockService: {
            getScriptLock: () => ({
                tryLock: () => true,
                releaseLock: () => undefined,
            }),
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

        const network = script.collectNetworkContext_({
            parameter: {
                ip: '=203.0.113.4',
                country: '+Indonesia',
                region: '-Jakarta',
                city: '@Central',
                tz: 'Asia/Jakarta',
            },
        });

        expect(network).toEqual({
            ip: '',
            ipHash: '',
            country: "'+Indonesia",
            region: "'-Jakarta",
            city: "'@Central",
            timezone: 'Asia/Jakarta',
        });
    });

    it('avoids prototype-polluting request parameter names while normalizing events', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');

        const event = script.normalizeEvent_({
            postData: {
                contents: JSON.stringify({
                    action: 'write',
                    name: 'safe',
                    __proto__: { polluted: true },
                    constructor: 'blocked',
                    prototype: 'blocked',
                }),
            },
        });

        expect(event.parameter).toEqual({
            action: 'write',
            name: 'safe',
        });
        expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
    });

    it('uses non-Math.random alias generation and constant-time password hash comparison', () => {
        const source = readFileSync(new URL('./google/combined.gs', import.meta.url), 'utf8');
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );

        expect(source).not.toContain('Math.random');
        expect(source).toContain('constantTimeEquals_');
        expect(script.generateAlias_()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{6}$/);
    });

    it('collects network metadata from the serialized client fallback payload', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );

        expect(
            script.collectNetworkContext_({
                parameter: {
                    network: JSON.stringify({
                        ip: '203.0.113.4',
                        country: 'Indonesia',
                        city: 'Central Jakarta',
                        tz: 'Asia/Jakarta',
                    }),
                },
            }),
        ).toEqual({
            ip: '203.0.113.4',
            ipHash: createHash('sha256').update('203.0.113.4').digest('hex'),
            country: 'Indonesia',
            region: 'Central Jakarta',
            city: 'Central Jakarta',
            timezone: 'Asia/Jakarta',
        });
    });

    it('increments access counters only when a link read succeeds', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');
        const rows = [
            [
                '2026-01-01T00:00:00.000Z',
                'open',
                'https://example.com/open',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                2,
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'locked',
                'https://example.com/locked',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'hash',
                7,
                '',
            ],
        ];
        const writes: Array<{ row: number; column: number; values: unknown[][] }> = [];

        script.respond_ = (payload: unknown) => payload;
        script.getSheet_ = () => ({
            getLastRow: () => rows.length,
            getDataRange: () => ({ getValues: () => rows }),
            getRange: (row: number, column: number, _rowCount: number, _columnCount: number) => ({
                setValues: (values: unknown[][]) => {
                    writes.push({ row, column, values });
                },
            }),
        });

        expect(script.handleRead_({ parameter: { name: 'open' } })).toMatchObject({
            ok: true,
            url: 'https://example.com/open',
        });
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatchObject({
            row: 1,
            column: 13,
            values: [[3, expect.any(String)]],
        });

        expect(script.handleRead_({ parameter: { name: 'locked' } })).toMatchObject({
            ok: false,
            code: 'PASSWORD_REQUIRED',
        });
        expect(writes).toHaveLength(1);
    });

    it('rate-limits password verification attempts for protected short links', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        script.PASSWORD_RATE_LIMIT_MAX = 1;
        script.PASSWORD_RATE_LIMIT_GLOBAL_MAX = 20;
        const passwordHash = createHash('sha256').update('correct-password').digest('hex');
        const rows = [
            [
                '2026-01-01T00:00:00.000Z',
                'locked',
                'https://example.com/locked',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                passwordHash,
                0,
                '',
            ],
        ];

        script.respond_ = (payload: unknown) => payload;
        script.getSheet_ = () => ({
            getLastRow: () => rows.length,
            getDataRange: () => ({ getValues: () => rows }),
            getRange: () => ({
                setValues: () => undefined,
            }),
        });

        expect(
            script.handleRead_({
                parameter: {
                    name: 'locked',
                    password: 'wrong-password',
                    device: 'desktop',
                    browser: 'Chrome',
                    os: 'Windows',
                    lang: 'en-US',
                    scr: '1920x1080',
                },
            }),
        ).toMatchObject({
            ok: false,
            code: 'WRONG_PASSWORD',
        });

        expect(
            script.handleRead_({
                parameter: {
                    name: 'locked',
                    password: 'another-wrong-password',
                    device: 'desktop',
                    browser: 'Chrome',
                    os: 'Windows',
                    lang: 'en-US',
                    scr: '1920x1080',
                },
            }),
        ).toMatchObject({
            ok: false,
            code: 'RATE_LIMITED',
        });
    });

    it('stores reports with separate reason, description, destination, and network context columns', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        const appendedRows: unknown[][] = [];
        const insertedSheets: string[] = [];

        script.respond_ = (payload: unknown) => payload;
        script.getSpreadsheet_ = () => ({
            getSheetByName: () => null,
            insertSheet: (name: string) => {
                insertedSheets.push(name);
                return {
                    appendRow: (row: unknown[]) => appendedRows.push(row),
                };
            },
        });

        expect(
            script.handleReport_({
                parameter: {
                    name: 'abc123',
                    reason: 'Malicious or phishing',
                    description: '=clicked prompt',
                    destination: 'https://example.com/login',
                    ip: '203.0.113.4',
                    country: 'Indonesia',
                    city: 'Central Jakarta',
                    tz: 'Asia/Jakarta',
                },
            }),
        ).toMatchObject({ ok: true });

        expect(insertedSheets).toEqual(['reports']);
        expect(appendedRows[0]).toEqual([
            'Timestamp',
            'Alias',
            'Reason',
            'Description',
            'Destination',
            'ReporterIp',
            'ReporterIpHash',
            'Country',
            'Region',
            'City',
            'Timezone',
            'Reporter',
        ]);
        expect(appendedRows[1]).toEqual([
            expect.any(String),
            'abc123',
            'Malicious or phishing',
            "'=clicked prompt",
            'https://example.com/login',
            '203.0.113.4',
            createHash('sha256').update('203.0.113.4').digest('hex'),
            'Indonesia',
            'Central Jakarta',
            'Central Jakarta',
            'Asia/Jakarta',
            '',
        ]);
    });

    it('upgrades database headers and writes network metadata across the full database row', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        const headerWrites: unknown[][][] = [];
        const dataWrites: Array<{
            row: number;
            column: number;
            rowCount: number;
            columnCount: number;
            rows: unknown[][];
        }> = [];

        script.respond_ = (payload: unknown) => payload;
        script.getSheet_ = () => ({
            getLastRow: () => 1,
            getDataRange: () => ({
                getValues: () => [
                    [
                        'Timestamp',
                        'Alias',
                        'Long link',
                        'uid',
                        'device',
                        'browser',
                        'OS',
                        'lang',
                        'referer',
                        'screen',
                        'exp',
                        'password hash',
                    ],
                ],
            }),
            getRange: (row: number, column: number, rowCount: number, columnCount: number) => ({
                getValues: () => [
                    [
                        'Timestamp',
                        'Alias',
                        'Long link',
                        'uid',
                        'device',
                        'browser',
                        'OS',
                        'lang',
                        'referer',
                        'screen',
                        'exp',
                        'password hash',
                    ],
                ],
                setValues: (rows: unknown[][]) => {
                    if (row === 1) {
                        headerWrites.push(rows);
                    } else {
                        dataWrites.push({ row, column, rowCount, columnCount, rows });
                    }
                },
            }),
        });

        expect(
            script.handleWrite_({
                parameter: {
                    name: 'netmeta',
                    url: 'https://example.com/path',
                    ip: '203.0.113.4',
                    country: 'Indonesia',
                    city: 'Central Jakarta',
                    tz: 'Asia/Jakarta',
                },
            }),
        ).toMatchObject({
            ok: true,
            shortUrl: 'https://natsumeaoii.github.io/surl/netmeta',
            metadataStored: true,
        });

        expect(headerWrites[0][0]).toEqual([
            'Timestamp',
            'Alias',
            'Long link',
            'uid',
            'device',
            'browser',
            'OS',
            'lang',
            'referer',
            'screen',
            'exp',
            'password hash',
            'access count',
            'last accessed',
            'creator IP',
            'creator IP hash',
            'country',
            'region',
            'city',
            'timezone',
        ]);
        expect(dataWrites[0]).toMatchObject({
            row: 2,
            column: 1,
            rowCount: 1,
            columnCount: 20,
        });
        expect(dataWrites[0].rows[0].slice(12)).toEqual([
            0,
            '',
            '203.0.113.4',
            createHash('sha256').update('203.0.113.4').digest('hex'),
            'Indonesia',
            'Central Jakarta',
            'Central Jakarta',
            'Asia/Jakarta',
        ]);
    });

    it('updates missing network metadata when a write reuses an existing URL row', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        const dataRows = [
            [
                'Timestamp',
                'Alias',
                'Long link',
                'uid',
                'device',
                'browser',
                'OS',
                'lang',
                'referer',
                'screen',
                'exp',
                'password hash',
                'access count',
                'last accessed',
                'creator IP',
                'creator IP hash',
                'country',
                'region',
                'city',
                'timezone',
            ],
            [
                '2026-05-18T10:00:00.000Z',
                'existing',
                'https://example.com/path',
                '',
                'desktop',
                'Chrome 148.0',
                'Windows 10+',
                'en-US',
                '',
                '1920x1080',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
        ];
        const metadataWrites: Array<{ row: number; column: number; rows: unknown[][] }> = [];

        script.respond_ = (payload: unknown) => payload;
        script.getSheet_ = () => ({
            getLastRow: () => dataRows.length,
            getDataRange: () => ({ getValues: () => dataRows }),
            getRange: (row: number, column: number) => ({
                getValues: () => [dataRows[0]],
                setValues: (rows: unknown[][]) => {
                    if (row !== 1) metadataWrites.push({ row, column, rows });
                },
            }),
        });

        expect(
            script.handleWrite_({
                parameter: {
                    name: 'newalias',
                    url: 'https://example.com/path',
                    ip: '203.0.113.4',
                    country: 'Indonesia',
                    city: 'Central Jakarta',
                    tz: 'Asia/Jakarta',
                },
            }),
        ).toMatchObject({
            ok: true,
            shortUrl: 'https://natsumeaoii.github.io/surl/existing',
            reused: true,
            metadataStored: true,
        });

        expect(metadataWrites).toEqual([
            {
                row: 2,
                column: 15,
                rows: [
                    [
                        '203.0.113.4',
                        createHash('sha256').update('203.0.113.4').digest('hex'),
                        'Indonesia',
                        'Central Jakarta',
                        'Central Jakarta',
                        'Asia/Jakarta',
                    ],
                ],
            },
        ]);
    });

    it('updates an existing reports sheet header before appending expanded report rows', () => {
        const script = loadScript<CombinedScriptContext>(
            './google/combined.gs',
            createAppsScriptGlobals(),
        );
        const headerWrites: unknown[][][] = [];
        const appendedRows: unknown[][] = [];

        script.respond_ = (payload: unknown) => payload;
        script.getSpreadsheet_ = () => ({
            getSheetByName: () => ({
                getLastRow: () => 1,
                getRange: () => ({
                    getValues: () => [['Timestamp', 'Alias', 'Reason', 'Reporter']],
                    setValues: (rows: unknown[][]) => headerWrites.push(rows),
                }),
                appendRow: (row: unknown[]) => appendedRows.push(row),
            }),
        });

        expect(
            script.handleReport_({
                parameter: {
                    name: 'abc123',
                    reason: 'Spam or abuse',
                    description: 'spam landing page',
                    destination: 'https://example.com/spam',
                },
            }),
        ).toMatchObject({ ok: true });

        expect(headerWrites).toEqual([
            [
                [
                    'Timestamp',
                    'Alias',
                    'Reason',
                    'Description',
                    'Destination',
                    'ReporterIp',
                    'ReporterIpHash',
                    'Country',
                    'Region',
                    'City',
                    'Timezone',
                    'Reporter',
                ],
            ],
        ]);
        expect(appendedRows[0]).toEqual([
            expect.any(String),
            'abc123',
            'Spam or abuse',
            'spam landing page',
            'https://example.com/spam',
            '',
            '',
            '',
            '',
            '',
            '',
            '',
        ]);
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
            [
                '2026-01-01T00:00:00.000Z',
                'alpha',
                'https://example.com/a',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'unrequested',
                'https://example.com/unrequested',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'beta',
                'https://example.com/b',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '2030-01-01T00:00:00.000Z',
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'gamma',
                'https://example.com/c',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'hash',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                '',
                'https://example.com/no-alias',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'bad',
                'javascript:alert(1)',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
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

    it('returns sandbox preview URLs only for unprotected and unexpired links', () => {
        const script = loadScript<CombinedScriptContext>('./google/combined.gs');
        const rows = [
            [
                '2026-01-01T00:00:00.000Z',
                'open',
                'https://example.com/open',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'locked',
                'https://example.com/locked',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                'hash',
            ],
            [
                '2026-01-01T00:00:00.000Z',
                'expired',
                'https://example.com/expired',
                '',
                '',
                '',
                '',
                '',
                '',
                '',
                '2000-01-01T00:00:00.000Z',
                '',
            ],
        ];

        script.respond_ = (payload: unknown) => payload;
        script.getSheet_ = () => ({
            getLastRow: () => rows.length,
            getDataRange: () => ({ getValues: () => rows }),
        });

        expect(script.handlePreview_({ parameter: { name: 'open' } })).toMatchObject({
            ok: true,
            domain: 'example.com',
            previewUrl: 'https://example.com/open',
            hasPassword: false,
            isExpired: false,
        });
        expect(script.handlePreview_({ parameter: { name: 'locked' } })).toMatchObject({
            ok: true,
            domain: 'example.com',
            hasPassword: true,
            previewUrl: null,
        });
        expect(script.handlePreview_({ parameter: { name: 'expired' } })).toMatchObject({
            ok: true,
            domain: 'example.com',
            isExpired: true,
            previewUrl: null,
        });
    });

    it('keeps legacy split Apps Script files from defining deployment entry points', () => {
        const getScript = readFileSync(new URL('./google/get.gs', import.meta.url), 'utf8');
        const postScript = readFileSync(new URL('./google/post.gs', import.meta.url), 'utf8');

        expect(getScript).not.toMatch(/\bfunction\s+do(?:Get|Post)\s*\(/);
        expect(postScript).not.toMatch(/\bfunction\s+do(?:Get|Post)\s*\(/);
        expect(getScript).toContain('Deploy google/combined.gs instead.');
        expect(postScript).toContain('Deploy google/combined.gs instead.');
    });
});
