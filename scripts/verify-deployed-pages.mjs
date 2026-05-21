const basePath = '/surl/';
const maxAttempts = 6;
const requestTimeoutMs = 10_000;
const rawSourceMessage =
    'Deployed page is serving raw Vite source HTML. Set GitHub repository Settings > Pages > Build and deployment > Source to GitHub Actions, then rerun the Deploy to GitHub Pages workflow.';

const deployUrl = process.argv[2];

if (!deployUrl) {
    console.error('Usage: npm run verify:pages -- <deployed-pages-url>');
    process.exit(2);
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

function withCacheBust(url) {
    const target = new URL(url);
    target.searchParams.set('verify', `${Date.now()}`);
    return target;
}

async function fetchWithTimeout(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

    try {
        return await fetch(url, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
            },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timeout);
    }
}

async function retry(label, operation) {
    let lastError;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            if (attempt === maxAttempts) break;

            const backoffMs = 1000 * 2 ** (attempt - 1);
            const jitterMs = Math.floor(Math.random() * 250);
            await sleep(backoffMs + jitterMs);
        }
    }

    throw new Error(`${label} failed after ${maxAttempts} attempts: ${lastError.message}`);
}

async function getText(url) {
    return retry(`GET ${url}`, async () => {
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        return await response.text();
    });
}

async function assertFetchable(url) {
    await retry(`GET ${url}`, async () => {
        const response = await fetchWithTimeout(url);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
    });
}

async function main() {
    const siteUrl = new URL(deployUrl);
    if (!siteUrl.pathname.endsWith('/')) {
        siteUrl.pathname += '/';
    }

    const indexUrl = withCacheBust(siteUrl);
    const indexHtml = await getText(indexUrl);

    if (indexHtml.includes('/src/main.tsx') || indexHtml.includes('src="/src/')) {
        throw new Error(rawSourceMessage);
    }

    const scriptMatches = [...indexHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+\.js)"[^>]*>/g)];
    const scriptMatch = scriptMatches.find(
        (match) => /\btype=["']module["']/.test(match[0]) && match[1].includes('assets/'),
    );
    if (!scriptMatch) {
        throw new Error('Deployed page does not reference a built module asset.');
    }

    const manifestMatch = indexHtml.match(/<link\b[^>]*\brel="manifest"[^>]*\bhref="([^"]+)"/);
    if (!manifestMatch) {
        throw new Error('Deployed page does not reference a web app manifest.');
    }

    const scriptUrl = withCacheBust(new URL(scriptMatch[1], siteUrl));
    const manifestUrl = withCacheBust(new URL(manifestMatch[1], siteUrl));
    const manifestText = await getText(manifestUrl);
    const manifest = JSON.parse(manifestText);

    if (
        manifest.id !== basePath ||
        manifest.start_url !== basePath ||
        manifest.scope !== basePath
    ) {
        throw new Error('Deployed manifest does not match the /surl/ GitHub Pages base path.');
    }

    await assertFetchable(scriptUrl);

    console.log('Deployed GitHub Pages smoke check passed.');
}

main().catch((error) => {
    console.error(`Deployed GitHub Pages smoke check failed: ${error.message}`);
    process.exitCode = 1;
});
