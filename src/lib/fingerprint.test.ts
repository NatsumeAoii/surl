import { afterEach, describe, expect, it, vi } from 'vitest';
import { getNetworkContext, setUID, toNetworkParams } from './fingerprint.ts';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('getNetworkContext', () => {
    it('returns sanitized IP and region metadata from the lookup response', async () => {
        const fetchImpl = vi.fn(
            async () =>
                new Response(
                    JSON.stringify({
                        ip: '203.0.113.4',
                        country_name: '+Indonesia',
                        region: '-Jakarta',
                        city: '@Central Jakarta',
                        timezone: 'Asia/Jakarta',
                    }),
                    { status: 200 },
                ),
        ) as typeof fetch;

        await expect(getNetworkContext(fetchImpl, 1000)).resolves.toEqual({
            ip: '203.0.113.4',
            country: 'Indonesia',
            region: 'Jakarta',
            city: 'Central Jakarta',
            tz: 'Asia/Jakarta',
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://ipapi.co/json/',
            expect.objectContaining({ cache: 'no-store' }),
        );
    });

    it('returns empty metadata when lookup fails', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new Error('blocked');
        }) as typeof fetch;

        await expect(getNetworkContext(fetchImpl, 1000)).resolves.toEqual({});
    });

    it('uses an injected network lookup URL and skips lookup when it is missing', async () => {
        const fetchMock = vi.fn(
            async () => new Response(JSON.stringify({ ip: '203.0.113.4' }), { status: 200 }),
        );
        const fetchImpl = fetchMock as unknown as typeof fetch;

        await expect(
            getNetworkContext(fetchImpl, 1000, 'https://lookup.example/json/'),
        ).resolves.toMatchObject({
            ip: '203.0.113.4',
        });
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://lookup.example/json/',
            expect.objectContaining({ cache: 'no-store' }),
        );

        fetchMock.mockClear();
        await expect(getNetworkContext(fetchImpl, 1000, '')).resolves.toEqual({});
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('serializes network metadata as individual params and a JSON fallback payload', () => {
        expect(
            toNetworkParams({
                ip: '203.0.113.4',
                country: 'Indonesia',
                city: 'Central Jakarta',
                tz: 'Asia/Jakarta',
            }),
        ).toEqual({
            ip: '203.0.113.4',
            country: 'Indonesia',
            region: 'Central Jakarta',
            city: 'Central Jakarta',
            tz: 'Asia/Jakarta',
            network: JSON.stringify({
                ip: '203.0.113.4',
                country: 'Indonesia',
                region: 'Central Jakarta',
                city: 'Central Jakarta',
                tz: 'Asia/Jakarta',
            }),
            metadataVersion: 2,
        });
    });

    it('does not write malformed UIDs into the visitor cookie', () => {
        let cookie = '';
        const documentStub = {
            get cookie() {
                return cookie;
            },
            set cookie(value: string) {
                cookie = value;
            },
        };

        vi.stubGlobal('document', documentStub);
        vi.stubGlobal('location', { protocol: 'https:' });

        setUID('bad; path=/');
        expect(cookie).toBe('');

        setUID('0123456789abcdef0123456789abcdef');
        expect(cookie).toContain('ntsm_uid=0123456789abcdef0123456789abcdef');
        expect(cookie).toContain('SameSite=Strict');
        expect(cookie).toContain('Secure');
    });
});
