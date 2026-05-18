import { describe, expect, it } from 'vitest';
import { config } from './config.ts';

describe('config', () => {
    it('uses a neutral relative-looking short-link display prefix by default', () => {
        expect(config.baseDisplay).toBe('../');
        expect(config.baseDisplay).not.toMatch(/^ntsm\.url\/$/);
    });
});
