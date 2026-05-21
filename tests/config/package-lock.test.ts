import { describe, expect, it } from 'vitest';

import {
    findMissingPackageSnapshots,
    findRootManifestMismatches,
    formatMissingPackageSnapshots,
} from '../../scripts/check-package-lock.mjs';
import { readProjectFile } from '../support/projectFiles';

describe('package-lock consistency guard', () => {
    it('reports root dependency ranges that differ between package.json and package-lock.json', () => {
        const mismatches = findRootManifestMismatches(
            {
                dependencies: {
                    react: '^19.2.6',
                },
            },
            {
                lockfileVersion: 3,
                packages: {
                    '': {
                        dependencies: {
                            react: '^19.0.0',
                        },
                    },
                },
            },
        );

        expect(mismatches).toEqual([
            {
                dependencyName: 'react',
                dependencyType: 'dependencies',
                lockfileRange: '^19.0.0',
                packageRange: '^19.2.6',
            },
        ]);
    });

    it('reports dependency snapshots missing from the lockfile packages map', () => {
        const missing = findMissingPackageSnapshots({
            lockfileVersion: 3,
            packages: {
                '': {},
                'node_modules/@rolldown/binding-wasm32-wasi': {
                    optionalDependencies: {
                        '@emnapi/core': '1.10.0',
                        '@emnapi/runtime': '1.10.0',
                    },
                },
            },
        });

        expect(missing).toEqual([
            {
                dependencyName: '@emnapi/core',
                dependencyType: 'optionalDependencies',
                importerPath: 'node_modules/@rolldown/binding-wasm32-wasi',
                expectedPath: 'node_modules/@emnapi/core',
            },
            {
                dependencyName: '@emnapi/runtime',
                dependencyType: 'optionalDependencies',
                importerPath: 'node_modules/@rolldown/binding-wasm32-wasi',
                expectedPath: 'node_modules/@emnapi/runtime',
            },
        ]);
        expect(formatMissingPackageSnapshots(missing)).toContain(
            'LOCKFILE_MISSING_PACKAGE_SNAPSHOT',
        );
    });

    it('accepts dependency snapshots resolved from an ancestor node_modules directory', () => {
        const missing = findMissingPackageSnapshots({
            lockfileVersion: 3,
            packages: {
                '': {},
                'node_modules/parent': {
                    dependencies: {
                        child: '1.0.0',
                    },
                },
                'node_modules/parent/node_modules/nested': {
                    dependencies: {
                        child: '1.0.0',
                    },
                },
                'node_modules/child': {},
            },
        });

        expect(missing).toEqual([]);
    });

    it('wires the guard into npm scripts and the committed pre-push hook', () => {
        const packageJson = JSON.parse(readProjectFile('package.json')) as {
            scripts?: Record<string, string>;
        };
        const prePushHook = readProjectFile('.githooks/pre-push');

        expect(packageJson.scripts).toMatchObject({
            prepare: 'node scripts/install-git-hooks.mjs',
            'verify:lockfile': 'node scripts/check-package-lock.mjs',
        });
        expect(prePushHook).toContain('npm run verify:lockfile');
    });
});
