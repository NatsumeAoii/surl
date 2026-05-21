import { MAX_ALIAS_LENGTH } from './constants.ts';

export function sanitizeAliasInput(rawAlias: string, maxLength = MAX_ALIAS_LENGTH): string {
    return rawAlias
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '')
        .slice(0, maxLength);
}
