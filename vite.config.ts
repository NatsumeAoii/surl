import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const basePath = '/surl/';
const staticFilePattern = /\/[^/]+\.[^/]+$/;
const devOnlyPrefixes = [
    `${basePath}@`,
    `${basePath}src/`,
    `${basePath}node_modules/`,
    `${basePath}.vite/`,
];

export function isLocalShortLinkRoute(requestUrl: string | undefined): boolean {
    if (!requestUrl) return false;

    const pathname = requestUrl.split(/[?#]/, 1)[0] || '';
    if (!pathname.startsWith(basePath)) return false;
    if (pathname === basePath || pathname === `${basePath}index.html`) return false;
    if (pathname.startsWith(`${basePath}assets/`)) return false;
    if (devOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))) return false;

    return !staticFilePattern.test(pathname);
}

function localShortLinkFallbackPlugin(): Plugin {
    return {
        name: 'surl-local-short-link-fallback',
        apply: 'serve',
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                const request = req as { url?: string };
                if (!isLocalShortLinkRoute(request.url)) {
                    next();
                    return;
                }

                res.statusCode = 404;
                request.url = `${basePath}404.html`;
                next();
            });
        },
    };
}

export default defineConfig({
    plugins: [react(), localShortLinkFallbackPlugin()],
    base: basePath,
    server: {
        host: '127.0.0.1',
        port: 5174,
        strictPort: true,
    },
});
