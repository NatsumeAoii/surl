import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import viteConfig, { isLocalShortLinkRoute } from './vite.config.ts';

const BASE_PATH = '/surl/';
const PRODUCTION_URL = 'https://natsumeaoii.github.io/surl/';
const OLD_BASE_PATH = '/natsume-url/';
const OLD_PRODUCTION_URL = 'https://natsumeaoii.github.io/surl//';
const WRONG_BASE_PATH = '/s-url/';
const WRONG_PRODUCTION_URL = 'https://natsumeaoii.github.io/s-url/';

function readText(path: string): string {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('GitHub Pages routing configuration', () => {
    it('builds Vite assets under the current repository path', () => {
        expect((viteConfig as { base?: string }).base).toBe(BASE_PATH);
    });

    it('serves the local experiment on a strict development port', () => {
        const server = (
            viteConfig as {
                server?: { host?: string; port?: number; strictPort?: boolean };
            }
        ).server;

        expect(server).toMatchObject({
            host: '127.0.0.1',
            port: 5174,
            strictPort: true,
        });
    });

    it('serves short-link fallback routes locally during development', () => {
        const configSource = readText('./vite.config.ts');
        const config = viteConfig as {
            plugins?: Array<{ name?: string; apply?: string; configureServer?: unknown }>;
        };

        expect(
            config.plugins?.some(
                (plugin) =>
                    plugin.name === 'surl-local-short-link-fallback' &&
                    plugin.apply === 'serve' &&
                    typeof plugin.configureServer === 'function',
            ),
        ).toBe(true);
        expect(isLocalShortLinkRoute('/surl/example')).toBe(true);
        expect(isLocalShortLinkRoute('/surl/example?preview=1')).toBe(true);
        expect(isLocalShortLinkRoute('/surl/')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/index.html')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/manifest.json')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/assets/index.js')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/@vite/client')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/@react-refresh')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/src/main.tsx?sw-clear=1')).toBe(false);
        expect(isLocalShortLinkRoute('/surl/node_modules/.vite/deps/react.js')).toBe(false);
        expect(isLocalShortLinkRoute('/s-url/example')).toBe(false);
        expect(configSource).toContain('request.url = `${basePath}404.html`;');
    });

    it('keeps static fallback and PWA routes under the current repository path', () => {
        const fallback = readText('./public/404.html');
        const index = readText('./index.html');
        const manifest = JSON.parse(readText('./public/manifest.json')) as {
            id: string;
            start_url: string;
            scope: string;
        };
        const serviceWorker = readText('./public/sw.js');

        expect(fallback).toContain(`var BASE_PATH = '${BASE_PATH}';`);
        expect(fallback).toContain("method: 'GET'");
        expect(fallback).not.toContain("method: 'POST'");
        expect(fallback).not.toContain(OLD_BASE_PATH);
        expect(manifest).toMatchObject({
            id: BASE_PATH,
            start_url: BASE_PATH,
            scope: BASE_PATH,
        });
        expect(index).toContain('href="manifest.json"');
        expect(index).toContain('href="favicon.svg"');
        expect(index).not.toContain('href="%BASE_URL%manifest.json"');
        expect(index).not.toContain('href="%BASE_URL%favicon.svg"');
        expect(index).not.toContain('href="/s-url/manifest.json"');
        expect(index).not.toContain('href="/s-url/favicon.svg"');
        expect(fallback).not.toContain(WRONG_BASE_PATH);
        expect(serviceWorker).not.toContain(WRONG_BASE_PATH);
        expect(serviceWorker).toContain(`'${BASE_PATH}'`);
        expect(serviceWorker).not.toContain(OLD_BASE_PATH);
        expect(serviceWorker).toContain('fallbackNavigation');
    });

    it('loads a cache-busted dev entry and disables PWA caching during development', () => {
        const index = readText('./index.html');
        const entry = readText('./src/main.tsx');

        expect(index).toContain('id="boot-fallback"');
        expect(index).toContain('window.__surlSourceLoadFailed');
        expect(index).toContain('src="/src/main.tsx?sw-clear=1"');
        expect(entry).toContain('import.meta.env.PROD');
        expect(entry).toContain('clearDevelopmentServiceWorker');
        expect(entry).toContain("key.startsWith('ntsm-url-')");
    });

    it('validates the deploy artifact and deployed Pages output in CI', () => {
        const workflow = readText('./.github/workflows/deploy.yml');
        const packageJson = JSON.parse(readText('./package.json')) as {
            scripts?: Record<string, string>;
        };

        expect(packageJson.scripts).toMatchObject({
            'validate:deploy': 'node scripts/validate-deploy-artifact.mjs',
            'verify:pages': 'node scripts/verify-deployed-pages.mjs',
        });
        expect(workflow).toContain('run: npm run validate:deploy');
        expect(workflow).toContain(
            'run: npm run verify:pages -- "${{ steps.deployment.outputs.page_url }}"',
        );
        expect(workflow.indexOf('run: npm run build')).toBeLessThan(
            workflow.indexOf('run: npm run validate:deploy'),
        );
        expect(workflow.indexOf('uses: actions/deploy-pages')).toBeLessThan(
            workflow.indexOf('run: npm run verify:pages'),
        );
    });

    it('publishes SEO metadata for the current production URL only', () => {
        const files = [
            readText('./index.html'),
            readText('./public/robots.txt'),
            readText('./public/sitemap.xml'),
            readText('./public/og-image.svg'),
        ].join('\n');

        expect(files).toContain(PRODUCTION_URL);
        expect(files).not.toContain(OLD_PRODUCTION_URL);
        expect(files).not.toContain(OLD_BASE_PATH);
        expect(files).not.toContain(WRONG_PRODUCTION_URL);
        expect(files).not.toContain(WRONG_BASE_PATH);
    });

    it('keeps Apps Script short-link responses on the current production URL', () => {
        const scripts = [
            readText('./google/combined.gs'),
            readText('./google/get.gs'),
            readText('./google/post.gs'),
        ].join('\n');

        expect(scripts).toContain(PRODUCTION_URL);
        expect(scripts).not.toContain(OLD_PRODUCTION_URL);
        expect(scripts).not.toContain(WRONG_PRODUCTION_URL);
    });
});
