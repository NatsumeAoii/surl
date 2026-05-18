import { describe, expect, it } from 'vitest';
import { config } from './config.ts';
import { REQUEST_PROGRESS_STEPS, getRequestProgress } from './loadingProgress.ts';

describe('request loading progress', () => {
    it('keeps frontend service requests patient enough for slow Apps Script responses', () => {
        expect(config.requestTimeoutMs).toBeGreaterThanOrEqual(25_000);
    });

    it('shows staged progress without claiming completion before the request resolves', () => {
        expect(REQUEST_PROGRESS_STEPS.map((step) => step.label)).toEqual([
            'Preparing request',
            'Checking request metadata',
            'Contacting shortener service',
            'Updating Google Sheets',
            'Finalizing response',
        ]);

        expect(getRequestProgress(0, 30_000)).toMatchObject({
            percent: 8,
            label: 'Preparing request',
        });
        expect(getRequestProgress(9_000, 30_000)).toMatchObject({
            label: 'Contacting shortener service',
        });
        expect(getRequestProgress(29_000, 30_000).percent).toBeLessThan(96);
    });
});
