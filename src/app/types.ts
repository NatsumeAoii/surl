export interface BulkResult {
    url: string;
    ok: boolean;
    shortUrl?: string;
    error?: string;
    reused?: boolean;
}

export interface HistoryLink {
    alias: string;
    url: string;
    shortUrl: string;
    created: string;
    expiry: string | null;
    isExpired: boolean;
    isProtected: boolean;
}

export type Theme = 'light' | 'dark';

export type AppView = 'form' | 'result' | 'bulk-result';

export type LinkMode = 'single' | 'bulk';

export type RightPanelMenu = 'profile' | 'links';
