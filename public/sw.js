/// <reference lib="webworker" />

const CACHE_NAME = 'ntsm-url-v3';
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATIC_ASSETS = [
    '/surl/',
    '/surl/index.html',
    '/surl/404.html',
    '/surl/favicon.svg',
    '/surl/manifest.json',
    '/surl/og-image.svg',
    '/surl/robots.txt',
    '/surl/sitemap.xml',
];

function isCacheable(url) {
    return url.protocol === 'http:' || url.protocol === 'https:';
}

function isApiCall(url) {
    return url.hostname.includes('script.google.com')
        || url.hostname.includes('script.googleusercontent.com');
}

async function putWithTimestamp(cache, request, response) {
    const headers = new Headers(response.headers);
    headers.set('x-ntsm-cache-time', String(Date.now()));
    const body = await response.clone().blob();
    await cache.put(request, new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers,
    }));
}

async function matchFresh(cache, request) {
    const cached = await cache.match(request);
    if (!cached) return null;

    const cachedAt = Number(cached.headers.get('x-ntsm-cache-time') || '0');
    if (!cachedAt || Date.now() - cachedAt > CACHE_TTL_MS) {
        await cache.delete(request);
        return null;
    }

    return cached;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(
                keys
                    .filter((key) => key !== CACHE_NAME)
                    .map((key) => caches.delete(key))
            )
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    if (!isCacheable(url) || isApiCall(url)) return;

    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then(async (response) => {
                    if (response.ok) {
                        const cache = await caches.open(CACHE_NAME);
                        await putWithTimestamp(cache, event.request, response);
                    }
                    return response;
                })
                .catch(async () => {
                    const cache = await caches.open(CACHE_NAME);
                    return await matchFresh(cache, event.request)
                        || await matchFresh(cache, '/surl/index.html')
                        || await matchFresh(cache, '/surl/404.html')
                        || Response.error();
                })
        );
        return;
    }

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await matchFresh(cache, event.request);
            if (cached) return cached;

            const response = await fetch(event.request);
            if (response.ok && isCacheable(url)) {
                await putWithTimestamp(cache, event.request, response);
            }
            return response;
        })
    );
});
