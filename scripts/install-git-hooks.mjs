#!/usr/bin/env node

import { chmodSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('.git') || !existsSync('.githooks')) {
    process.exit(0);
}

try {
    chmodSync('.githooks/pre-push', 0o755);
} catch (error) {
    console.warn(`GIT_HOOK_CHMOD_SKIPPED: ${error.message}`);
}

const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], {
    stdio: 'inherit',
});

if (result.error) {
    console.warn(`GIT_HOOK_SETUP_SKIPPED: ${result.error.message}`);
    process.exit(0);
}

process.exit(result.status ?? 1);
