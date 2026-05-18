import { describe, expect, it, vi } from 'vitest';
import { getNetworkContext, toNetworkParams } from './fingerprint.ts';

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
});
