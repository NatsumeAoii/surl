import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export function projectFilePath(path: string): string {
    return resolve(process.cwd(), path);
}

export function readProjectFile(path: string): string {
    return readFileSync(projectFilePath(path), 'utf8');
}
