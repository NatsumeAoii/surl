#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const lockfilePath = 'package-lock.json';
const packageJsonPath = 'package.json';
const rootDependencyKeys = ['dependencies', 'devDependencies', 'optionalDependencies'];
const packageSnapshotDependencyKeys = ['dependencies', 'optionalDependencies'];

function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readJsonFile(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}

function dependencyCandidates(importerPath, dependencyName) {
    const normalizedImporterPath = importerPath.replaceAll('\\', '/');

    if (!normalizedImporterPath) {
        return [`node_modules/${dependencyName}`];
    }

    const parts = normalizedImporterPath.split('/');
    const candidates = [`${normalizedImporterPath}/node_modules/${dependencyName}`];

    for (let index = parts.length - 1; index >= 0; index -= 1) {
        if (parts[index] === 'node_modules') {
            candidates.push(`${parts.slice(0, index + 1).join('/')}/${dependencyName}`);
        }
    }

    return [...new Set(candidates)];
}

function dependenciesFor(snapshot, dependencyType) {
    const dependencies = snapshot[dependencyType];
    return isRecord(dependencies) ? dependencies : {};
}

export function findRootManifestMismatches(packageJson, packageLock) {
    const rootSnapshot = packageLock.packages?.[''];
    if (!isRecord(rootSnapshot)) {
        return [
            {
                dependencyName: '<root>',
                dependencyType: 'packages[""]',
                lockfileRange: undefined,
                packageRange: 'present',
            },
        ];
    }

    const mismatches = [];

    for (const dependencyType of rootDependencyKeys) {
        const packageDependencies = dependenciesFor(packageJson, dependencyType);
        const lockfileDependencies = dependenciesFor(rootSnapshot, dependencyType);
        const dependencyNames = new Set([
            ...Object.keys(packageDependencies),
            ...Object.keys(lockfileDependencies),
        ]);

        for (const dependencyName of [...dependencyNames].sort()) {
            const packageRange = packageDependencies[dependencyName];
            const lockfileRange = lockfileDependencies[dependencyName];
            if (packageRange !== lockfileRange) {
                mismatches.push({
                    dependencyName,
                    dependencyType,
                    lockfileRange,
                    packageRange,
                });
            }
        }
    }

    return mismatches;
}

export function findMissingPackageSnapshots(packageLock) {
    const packages = packageLock.packages;
    if (!isRecord(packages)) {
        return [
            {
                dependencyName: '<packages>',
                dependencyType: 'packages',
                importerPath: '',
                expectedPath: 'package-lock.json packages map',
            },
        ];
    }

    const missing = [];

    for (const [importerPath, snapshot] of Object.entries(packages)) {
        if (!isRecord(snapshot)) continue;

        for (const dependencyType of packageSnapshotDependencyKeys) {
            const dependencies = dependenciesFor(snapshot, dependencyType);

            for (const dependencyName of Object.keys(dependencies).sort()) {
                const candidates = dependencyCandidates(importerPath, dependencyName);
                if (candidates.some((candidate) => packages[candidate])) continue;

                missing.push({
                    dependencyName,
                    dependencyType,
                    importerPath,
                    expectedPath: candidates.at(-1),
                });
            }
        }
    }

    return missing;
}

export function formatRootManifestMismatches(mismatches) {
    if (mismatches.length === 0) {
        return 'Package manifest and lockfile root snapshot are in sync.';
    }

    const lines = [
        'LOCKFILE_ROOT_MISMATCH: package.json and package-lock.json disagree.',
        'Run `npm install --package-lock-only` and commit package-lock.json.',
    ];

    for (const mismatch of mismatches) {
        lines.push(
            `- ${mismatch.dependencyType} ${mismatch.dependencyName}: package.json=${JSON.stringify(
                mismatch.packageRange,
            )}, package-lock.json=${JSON.stringify(mismatch.lockfileRange)}`,
        );
    }

    return lines.join('\n');
}

export function formatMissingPackageSnapshots(missing) {
    if (missing.length === 0) {
        return 'Package lock snapshots are complete.';
    }

    const lines = [
        'LOCKFILE_MISSING_PACKAGE_SNAPSHOT: package-lock.json is missing dependency package entries.',
        'Run `npm install --package-lock-only` and commit package-lock.json.',
    ];

    for (const item of missing) {
        lines.push(
            `- ${item.importerPath || '<root>'} ${item.dependencyType} ${item.dependencyName} -> expected ${item.expectedPath}`,
        );
    }

    return lines.join('\n');
}

function printUsage() {
    console.log(`Usage: node scripts/check-package-lock.mjs

Checks package.json and package-lock.json for sync issues that make npm ci fail.

Exit codes:
  0  lockfile is consistent
  1  lockfile is stale or incomplete
  2  invalid usage or unreadable JSON`);
}

export function main(argv = process.argv.slice(2)) {
    if (argv.includes('--help') || argv.includes('-h')) {
        printUsage();
        return 0;
    }

    if (argv.length > 0) {
        console.error('LOCKFILE_CHECK_USAGE: this script does not accept positional arguments.');
        printUsage();
        return 2;
    }

    let packageJson;
    let packageLock;

    try {
        packageJson = readJsonFile(packageJsonPath);
        packageLock = readJsonFile(lockfilePath);
    } catch (error) {
        console.error(`LOCKFILE_CHECK_READ_FAILED: ${error.message}`);
        return 2;
    }

    const rootMismatches = findRootManifestMismatches(packageJson, packageLock);
    const missingSnapshots = findMissingPackageSnapshots(packageLock);

    if (rootMismatches.length > 0 || missingSnapshots.length > 0) {
        if (rootMismatches.length > 0) {
            console.error(formatRootManifestMismatches(rootMismatches));
        }
        if (missingSnapshots.length > 0) {
            console.error(formatMissingPackageSnapshots(missingSnapshots));
        }
        return 1;
    }

    console.log('Package lock consistency check passed.');
    return 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    process.exitCode = main();
}
