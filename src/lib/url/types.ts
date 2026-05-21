export type UrlValidationCode =
    | 'URL_REQUIRED'
    | 'URL_TOO_LONG'
    | 'URL_CONTROL_CHARS'
    | 'URL_INVALID'
    | 'URL_PROTOCOL'
    | 'URL_CREDENTIALS';

export interface UrlValidationResult {
    ok: boolean;
    code?: UrlValidationCode;
    normalized?: string;
    message?: string;
}
