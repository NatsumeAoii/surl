/**
 * S.url configuration.
 *
 * Values are read from environment variables (see .env.example).
 * public/404.html has its own SCRIPT_URL and BASE_PATH because it runs
 * outside React/Vite on GitHub Pages fallback routes.
 */

export const config = {
    scriptUrl:
        import.meta.env.VITE_SCRIPT_URL ||
        'https://script.google.com/macros/s/AKfycbzL4HuT8WGLg5hJB-OCZozdNl7npwdP6z2cCkNFQ6A-1t03PcHntLH53tOFYpfbJ8Tr/exec',

    baseDisplay: import.meta.env.VITE_BASE_DISPLAY || '../',

    appName: import.meta.env.VITE_APP_NAME || 'S',

    tagline: import.meta.env.VITE_TAGLINE || 'Serverless, safe, secure, and fast.',

    aliasLength: 6,
    aliasChars: 'abcdefghjkmnpqrstuvwxyz23456789',
    maxBulkUrls: 10,
    requestTimeoutMs: 10_000,
} as const;
