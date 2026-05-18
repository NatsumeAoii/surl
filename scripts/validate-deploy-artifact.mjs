import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const basePath = '/surl/';
const distDir = new URL('../dist/', import.meta.url);
const distPath = fileURLToPath(distDir);

function fail(message) {
    console.error(`Deploy artifact validation failed: ${message}`);
    process.exit(1);
}

function readDistFile(fileName) {
    const filePath = new URL(fileName, distDir);
    if (!existsSync(filePath)) {
        fail(`missing dist/${fileName}`);
    }
    return readFileSync(filePath, 'utf8');
}

const requiredFiles = [
    'index.html',
    '404.html',
    'manifest.json',
    'favicon.svg',
    'sw.js',
    'robots.txt',
    'sitemap.xml',
];

for (const fileName of requiredFiles) {
    if (!existsSync(join(distPath, fileName))) {
        fail(`missing dist/${fileName}`);
    }
}

const indexHtml = readDistFile('index.html');

if (indexHtml.includes('/src/main.tsx') || indexHtml.includes('src="/src/')) {
    fail('dist/index.html still points at the Vite source entry instead of built assets');
}

if (indexHtml.includes('%BASE_URL%')) {
    fail('dist/index.html contains an unresolved Vite base placeholder');
}

if (!new RegExp(`src="${basePath}assets/[^"]+\\.js"`).test(indexHtml)) {
    fail(`dist/index.html does not reference a built JavaScript asset under ${basePath}assets/`);
}

if (!new RegExp(`href="${basePath}assets/[^"]+\\.css"`).test(indexHtml)) {
    fail(`dist/index.html does not reference a built CSS asset under ${basePath}assets/`);
}

const manifest = JSON.parse(readDistFile('manifest.json'));
for (const key of ['id', 'start_url', 'scope']) {
    if (manifest[key] !== basePath) {
        fail(
            `dist/manifest.json has ${key}=${JSON.stringify(manifest[key])}, expected ${basePath}`,
        );
    }
}

console.log('Deploy artifact validation passed.');
