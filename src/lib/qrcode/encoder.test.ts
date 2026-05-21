import { describe, expect, it } from 'vitest';
import { encodeToModules } from './encoder.ts';

describe('encodeToModules', () => {
    it('encodes text into a square QR module matrix', () => {
        const modules = encodeToModules('https://example.com');

        expect(modules.length).toBeGreaterThanOrEqual(21);
        expect(modules.every((row) => row.length === modules.length)).toBe(true);
        expect(modules.flat().every((module) => typeof module === 'boolean')).toBe(true);
    });
});
