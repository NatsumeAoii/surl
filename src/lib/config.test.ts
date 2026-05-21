import { describe, expect, it } from 'vitest';
import { config, resolveClientConfig } from './config.ts';

describe('config', () => {
    it('uses a neutral relative-looking short-link display prefix by default', () => {
        expect(config.baseDisplay).toBe('../');
        expect(config.baseDisplay).not.toMatch(/^ntsm\.url\/$/);
    });

    it('uses shared static runtime configuration for client service URLs', () => {
        const resolved = resolveClientConfig({
            scriptUrl: 'https://script.example/exec',
            networkLookupUrl: 'https://lookup.example/json/',
            requestTimeoutMs: 45000,
            networkTimeoutMs: 3000,
        });

        expect(resolved.scriptUrl).toBe('https://script.example/exec');
        expect(resolved.networkLookupUrl).toBe('https://lookup.example/json/');
        expect(resolved.requestTimeoutMs).toBe(45000);
        expect(resolved.networkTimeoutMs).toBe(3000);
    });

    it('falls back to safe timeouts when static runtime values are malformed', () => {
        const resolved = resolveClientConfig({
            scriptUrl: 'https://script.example/exec',
            requestTimeoutMs: -1,
            networkTimeoutMs: Number.NaN,
        });

        expect(resolved.requestTimeoutMs).toBe(30000);
        expect(resolved.networkTimeoutMs).toBe(2500);
    });
});
