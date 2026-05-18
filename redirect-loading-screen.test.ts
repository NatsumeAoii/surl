import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const redirectHtml = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');

describe('redirect loading screen', () => {
    it('uses the same card-style theme as the redirect preview states', () => {
        expect(redirectHtml).toContain('<section id="s-loading" class="panel">');
        expect(redirectHtml).toContain('Resolving link');
        expect(redirectHtml).toContain('Checking this short link');
        expect(redirectHtml).toContain('loading-line');
        expect(redirectHtml).toContain('var REQUEST_TIMEOUT_MS = 30000;');
        expect(redirectHtml).toContain('@media (prefers-reduced-motion: reduce)');
    });
});
