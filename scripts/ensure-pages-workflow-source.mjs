const apiVersion = '2022-11-28';
const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;
const dryRun = process.argv.includes('--dry-run');

function fail(message) {
    console.error(`GitHub Pages source check failed: ${message}`);
    process.exit(1);
}

if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
    fail('GITHUB_REPOSITORY must be set to owner/repo.');
}

if (!token && !dryRun) {
    fail('GITHUB_TOKEN is required.');
}

async function request(method, path, body) {
    const response = await fetch(`https://api.github.com${path}`, {
        method,
        headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'X-GitHub-Api-Version': apiVersion,
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    return { ok: response.ok, status: response.status, payload };
}

async function main() {
    const pagesPath = `/repos/${repository}/pages`;

    if (dryRun) {
        console.log(`Would ensure ${repository} GitHub Pages build_type is workflow.`);
        return;
    }

    const update = await request('PUT', pagesPath, { build_type: 'workflow' });
    if (update.ok) {
        console.log('GitHub Pages source is configured for GitHub Actions.');
        return;
    }

    if (update.status !== 404) {
        fail(update.payload?.message || `unexpected HTTP ${update.status} while updating Pages`);
    }

    const create = await request('POST', pagesPath, { build_type: 'workflow' });
    if (!create.ok) {
        fail(create.payload?.message || `unexpected HTTP ${create.status} while creating Pages`);
    }

    console.log('GitHub Pages site created with GitHub Actions as the source.');
}

main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error));
});
