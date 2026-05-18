import {
    useState,
    useEffect,
    useCallback,
    useRef,
    lazy,
    Suspense,
    type FormEvent,
    type ClipboardEvent,
} from 'react';
import { ApiError, callScript } from './api.ts';
import { config } from './config.ts';
import { getUID, hasConsent, appendAnalytics, getNetworkParams } from './fingerprint.ts';
import { generateQRCodeDataURL } from './qrcode.ts';
import { fireConfetti } from './confetti.ts';
import { getRequestProgress, type RequestProgressState } from './loadingProgress.ts';
import {
    SunIcon,
    MoonIcon,
    CopyIcon,
    CheckIcon,
    QRIcon,
    ShareIcon,
    ChevronIcon,
    DiceIcon,
    LinkIcon,
    ClockIcon,
    LockIcon,
    RowsIcon,
    HistoryIcon,
    SparkIcon,
} from './icons.tsx';
import {
    MAX_ALIAS_LENGTH,
    MAX_PASSWORD_LENGTH,
    formatExpiry,
    getMinExpiryDatetimeLocal,
    normalizeShortUrl,
    sanitizeAliasInput,
    toUtcIsoFromDatetimeLocal,
    validateTargetUrl,
} from './url.ts';

const CookieConsent = lazy(() => import('./CookieConsent.tsx'));

interface BulkResult {
    url: string;
    ok: boolean;
    shortUrl?: string;
    error?: string;
    reused?: boolean;
}

interface HistoryLink {
    alias: string;
    url: string;
    shortUrl: string;
    created: string;
    expiry: string | null;
    isExpired: boolean;
    isProtected: boolean;
}

function generateAlias(length: number = config.aliasLength): string {
    const chars = config.aliasChars;
    const safeLength = Math.min(MAX_ALIAS_LENGTH, Math.max(4, Math.floor(length)));
    const limit = 256 - (256 % chars.length);
    let alias = '';

    while (alias.length < safeLength) {
        const bytes = new Uint8Array(safeLength - alias.length);
        crypto.getRandomValues(bytes);
        for (const b of bytes) {
            if (b >= limit) continue;
            alias += chars[b % chars.length];
            if (alias.length === safeLength) break;
        }
    }

    return alias;
}

function getInitialTheme(): 'light' | 'dark' {
    try {
        const stored = localStorage.getItem('ntsm-theme');
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // Storage can be blocked in hardened browser contexts.
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getApiErrorMessage(error: unknown): string {
    if (error instanceof ApiError) return error.userMessage;
    return 'Something went wrong. Check your network or script deployment.';
}

function getAnalyticsParams(): Record<string, string> {
    const query = appendAnalytics('').replace(/^&/, '');
    return Object.fromEntries(new URLSearchParams(query));
}

function hasNetworkPayload(params: {
    ip?: unknown;
    country?: unknown;
    region?: unknown;
    city?: unknown;
    tz?: unknown;
    network?: unknown;
}): boolean {
    return Boolean(
        params.ip || params.country || params.region || params.city || params.tz || params.network,
    );
}

async function copyText(text: string): Promise<boolean> {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // Fall back to the hidden textarea path below.
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.cssText = 'position:fixed;left:-9999px;top:0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        return document.execCommand('copy');
    } catch {
        return false;
    } finally {
        textarea.remove();
    }
}

function RequestProgress({ progress }: { progress: RequestProgressState }) {
    return (
        <div className="request-progress" role="status" aria-live="polite">
            <div className="request-progress__header">
                <span>{progress.label}</span>
                <strong>{progress.percent}%</strong>
            </div>
            <div
                className="request-progress__bar"
                role="progressbar"
                aria-label="Shortener request progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
            >
                <span
                    className="request-progress__bar-fill"
                    style={{ width: `${progress.percent}%` }}
                />
            </div>
            <p>{progress.detail}</p>
        </div>
    );
}

export default function App() {
    const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);

    const [longUrl, setLongUrl] = useState('');
    const [alias, setAlias] = useState('');
    const [placeholder] = useState(() => generateAlias());
    const [resultUrl, setResultUrl] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [toast, setToast] = useState('');
    const [shakeField, setShakeField] = useState('');
    const [showQR, setShowQR] = useState(false);
    const [qrDataUrl, setQrDataUrl] = useState('');
    const [showShare, setShowShare] = useState(false);
    const [aliasLength, setAliasLength] = useState<number>(config.aliasLength);

    const [showAdvanced, setShowAdvanced] = useState(false);
    const [expiry, setExpiry] = useState('');
    const [password, setPassword] = useState('');

    const [bulkUrls, setBulkUrls] = useState('');
    const [bulkResults, setBulkResults] = useState<BulkResult[]>([]);

    const [mode, setMode] = useState<'single' | 'bulk'>('single');
    const [honeypot, setHoneypot] = useState('');

    const [resultExpiry, setResultExpiry] = useState('');
    const [resultProtected, setResultProtected] = useState(false);

    const [userUid, setUserUid] = useState<string | null>(getUID);
    const [historyLinks, setHistoryLinks] = useState<HistoryLink[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [rightPanelMenu, setRightPanelMenu] = useState<'profile' | 'links'>('profile');

    const [view, setView] = useState<'form' | 'result' | 'bulk-result'>('form');
    const [transitioning, setTransitioning] = useState(false);
    const [requestProgress, setRequestProgress] = useState<RequestProgressState>(() =>
        getRequestProgress(0, config.requestTimeoutMs),
    );

    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const historyRequestId = useRef(0);
    const historyUnlocked = Boolean(userUid && hasConsent());

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('ntsm-theme', theme);
        } catch {
            // Non-critical preference persistence failure.
        }
    }, [theme]);

    useEffect(() => {
        const onConsent = () => setUserUid(getUID());
        window.addEventListener('ntsm:consent', onConsent);
        return () => window.removeEventListener('ntsm:consent', onConsent);
    }, []);

    useEffect(() => {
        if (!loading) {
            setRequestProgress(getRequestProgress(0, config.requestTimeoutMs));
            return;
        }

        const startedAt = Date.now();
        setRequestProgress(getRequestProgress(0, config.requestTimeoutMs));
        const timer = window.setInterval(() => {
            setRequestProgress(getRequestProgress(Date.now() - startedAt, config.requestTimeoutMs));
        }, 350);

        return () => window.clearInterval(timer);
    }, [loading]);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 2500);
    }, []);

    const triggerShake = useCallback((field: string) => {
        setShakeField(field);
        setTimeout(() => setShakeField(''), 500);
    }, []);

    const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

    const transitionTo = useCallback((target: 'form' | 'result' | 'bulk-result') => {
        setTransitioning(true);
        setTimeout(() => {
            setView(target);
            setTransitioning(false);
        }, 200);
    }, []);

    const handlePaste = useCallback(
        (_e: ClipboardEvent<HTMLInputElement>) => {
            setTimeout(() => {
                const value = urlInputRef.current?.value ?? '';
                if (validateTargetUrl(value).ok) {
                    document.getElementById('alias')?.focus();
                    showToast('URL detected. Set an alias or hit Shorten.');
                }
            }, 50);
        },
        [showToast],
    );

    const fetchHistory = useCallback(async () => {
        const requestId = historyRequestId.current + 1;
        historyRequestId.current = requestId;
        const isCurrentRequest = () => historyRequestId.current === requestId;
        const uid = getUID();
        if (!uid || !hasConsent()) {
            if (historyRequestId.current !== requestId) return;
            setHistoryLinks([]);
            setHistoryError('Grant cookie consent to view your link history.');
            setHistoryLoading(false);
            return;
        }

        setHistoryLoading(true);
        setHistoryError('');

        try {
            const data = await callScript<{ ok: boolean; links?: HistoryLink[]; error?: string }>(
                config.scriptUrl,
                'history',
                { uid },
                { timeoutMs: config.requestTimeoutMs, retries: 1 },
            );

            if (historyRequestId.current !== requestId) return;
            if (data.ok && data.links) {
                const normalizedLinks = data.links.map((link) => ({
                    ...link,
                    shortUrl: normalizeShortUrl(link.shortUrl),
                }));
                setHistoryLinks(normalizedLinks);
                setHistoryError(
                    normalizedLinks.length === 0 ? 'No links found. Shorten your first URL!' : '',
                );
            } else {
                setHistoryLinks([]);
                setHistoryError(data.error || 'Failed to load history.');
            }
        } catch (historyError) {
            if (historyRequestId.current !== requestId) return;
            setHistoryLinks([]);
            setHistoryError(getApiErrorMessage(historyError));
        } finally {
            if (isCurrentRequest()) setHistoryLoading(false);
        }
    }, []);

    const selectMode = (nextMode: 'single' | 'bulk') => {
        setMode(nextMode);
        setError('');
    };

    const showLinksMenu = () => {
        if (!historyUnlocked) return;

        setRightPanelMenu('links');
        if (rightPanelMenu !== 'links' && !historyLoading) {
            fetchHistory();
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setCopied(false);

        if (honeypot) {
            setError('Submission rejected.');
            return;
        }

        const validation = validateTargetUrl(longUrl);
        if (!validation.ok || !validation.normalized) {
            setError(validation.message || 'Enter a valid URL.');
            triggerShake('url');
            return;
        }

        const expiryIso = toUtcIsoFromDatetimeLocal(expiry);
        if (expiry && !expiryIso) {
            setError('Choose a valid expiration date and time.');
            triggerShake('url');
            return;
        }

        const shortAlias = alias.trim() || placeholder;
        setLoading(true);

        try {
            const networkParams = await getNetworkParams();
            const data = await callScript<{
                ok: boolean;
                shortUrl?: string;
                error?: string;
                reused?: boolean;
                expiry?: string;
                isProtected?: boolean;
                metadataStored?: boolean;
            }>(
                config.scriptUrl,
                'write',
                {
                    ...getAnalyticsParams(),
                    ...networkParams,
                    name: shortAlias,
                    url: validation.normalized,
                    expiry: expiryIso,
                    password,
                },
                { timeoutMs: config.requestTimeoutMs },
            );

            if (data.ok && data.shortUrl) {
                const normalizedShortUrl = normalizeShortUrl(data.shortUrl);
                setResultUrl(normalizedShortUrl);
                setQrDataUrl(generateQRCodeDataURL(normalizedShortUrl, 200));
                setResultExpiry(data.expiry || expiryIso);
                setResultProtected(data.isProtected || !!password);
                if (hasNetworkPayload(networkParams) && data.metadataStored !== true) {
                    showToast('Short URL created, but metadata storage is not confirmed.');
                } else {
                    showToast(
                        data.reused ? 'URL already exists. Here it is.' : 'Short URL created.',
                    );
                }
                transitionTo('result');
                if (!data.reused) setTimeout(() => fireConfetti(), 300);
            } else {
                setError(data.error || 'Failed to create short URL.');
                triggerShake('url');
            }
        } catch (submitError) {
            setError(getApiErrorMessage(submitError));
        } finally {
            setLoading(false);
        }
    };

    const handleBulkSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError('');
        setBulkResults([]);

        if (honeypot) {
            setError('Submission rejected.');
            return;
        }

        const lines = bulkUrls
            .split('\n')
            .map((line) => line.trim())
            .filter(Boolean);
        if (lines.length === 0) {
            setError('Paste at least one URL, one per line.');
            triggerShake('bulk');
            return;
        }

        if (lines.length > config.maxBulkUrls) {
            setError(`Maximum ${config.maxBulkUrls} URLs per batch.`);
            triggerShake('bulk');
            return;
        }

        const normalizedLines: string[] = [];
        for (const line of lines) {
            const validation = validateTargetUrl(line);
            if (!validation.ok || !validation.normalized) {
                setError(`${validation.message || 'Invalid URL'}: ${line}`);
                triggerShake('bulk');
                return;
            }
            normalizedLines.push(validation.normalized);
        }

        setLoading(true);

        try {
            const networkParams = await getNetworkParams();
            const data = await callScript<{ ok: boolean; results?: BulkResult[]; error?: string }>(
                config.scriptUrl,
                'bulk',
                {
                    ...getAnalyticsParams(),
                    ...networkParams,
                    urls: JSON.stringify(normalizedLines),
                },
                { timeoutMs: config.requestTimeoutMs },
            );

            if (data.ok && data.results) {
                const normalizedResults = data.results.map((result) =>
                    result.shortUrl
                        ? { ...result, shortUrl: normalizeShortUrl(result.shortUrl) }
                        : result,
                );
                setBulkResults(normalizedResults);
                transitionTo('bulk-result');
                const successCount = normalizedResults.filter((r) => r.ok).length;
                showToast(`${successCount}/${lines.length} URLs shortened.`);
                if (successCount > 0) setTimeout(() => fireConfetti(), 300);
            } else {
                setError(data.error || 'Bulk shortening failed.');
            }
        } catch (bulkError) {
            setError(getApiErrorMessage(bulkError));
        } finally {
            setLoading(false);
        }
    };

    const handleCopy = async (text?: string) => {
        const toCopy = text || resultUrl;
        if (!toCopy) return;

        if (await copyText(toCopy)) {
            if (!text) setCopied(true);
            showToast('Copied to clipboard!');
            if (!text) setTimeout(() => setCopied(false), 2000);
        } else {
            showToast('Copy failed. Select and copy the URL manually.');
        }
    };

    const handleCopyAllBulk = async () => {
        const urls = bulkResults
            .filter((r) => r.ok && r.shortUrl)
            .map((r) => r.shortUrl)
            .join('\n');
        if (!urls) return;

        if (await copyText(urls)) {
            showToast('All URLs copied!');
        } else {
            showToast('Copy failed. Select and copy the URLs manually.');
        }
    };

    const handleReset = () => {
        setLongUrl('');
        setAlias('');
        setResultUrl('');
        setQrDataUrl('');
        setError('');
        setCopied(false);
        setShowQR(false);
        setShowShare(false);
        setExpiry('');
        setPassword('');
        setShowAdvanced(false);
        setBulkUrls('');
        setBulkResults([]);
        setResultExpiry('');
        setResultProtected(false);
        setMode('single');
        transitionTo('form');
    };

    const shareUrl = encodeURIComponent(resultUrl);
    const shareText = encodeURIComponent('Check out this link!');
    const bulkCount = bulkUrls.split('\n').filter((line) => line.trim()).length;
    const previewAlias = alias || placeholder;
    const activeAdvancedCount = Number(Boolean(expiry)) + Number(Boolean(password));
    const createdCount = historyLinks.length;
    const activeModeLabel = mode === 'single' ? 'Single link' : 'Bulk batch';
    const activeModeIcon = mode === 'single' ? <LinkIcon /> : <RowsIcon />;
    const panelTitle =
        view === 'result'
            ? 'Short link ready'
            : view === 'bulk-result'
              ? 'Batch results'
              : activeModeLabel;

    return (
        <div className="app">
            <header className="topbar">
                <div className="brand-lockup">
                    <div className="brand-mark" aria-hidden="true">
                        <SparkIcon />
                    </div>
                    <div>
                        <div className="logo">
                            {config.appName}
                            <span>.url</span>
                        </div>
                        <p className="brand-subtitle">{config.tagline}</p>
                    </div>
                </div>

                <div className="topbar-actions">
                    <span
                        className="system-pill"
                        data-tooltip="Serverless storage runs on Google Sheets"
                        data-tooltip-position="bottom"
                    >
                        Google Sheets backend
                    </span>
                    <button
                        className="theme-toggle"
                        onClick={toggleTheme}
                        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        data-tooltip={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
                        data-tooltip-position="left"
                        type="button"
                    >
                        {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
                    </button>
                </div>
            </header>

            <main className="workspace" aria-label="URL shortener workspace">
                <section className="workspace-main">
                    <section className={`tool-panel${transitioning ? ' tool-panel--fading' : ''}`}>
                        <div className="panel-header">
                            <div>
                                <span className="panel-kicker">
                                    {activeModeIcon}
                                    {view === 'form' ? activeModeLabel : 'Output'}
                                </span>
                                <h2>{panelTitle}</h2>
                            </div>
                            <span
                                className={`status-chip${loading ? ' status-chip--busy' : ''}`}
                                data-tooltip={
                                    loading
                                        ? 'Request is running'
                                        : 'Ready for your next short link'
                                }
                            >
                                {loading ? 'Working' : 'Ready'}
                            </span>
                        </div>

                        {view === 'form' && (
                            <>
                                <div
                                    className="mode-tabs"
                                    role="tablist"
                                    aria-label="Shortener modes"
                                >
                                    <button
                                        className={`mode-tab${mode === 'single' ? ' mode-tab--active' : ''}`}
                                        onClick={() => selectMode('single')}
                                        type="button"
                                        role="tab"
                                        aria-selected={mode === 'single'}
                                        data-tooltip="Shorten a single URL"
                                    >
                                        <LinkIcon />
                                        Single
                                    </button>
                                    <button
                                        className={`mode-tab${mode === 'bulk' ? ' mode-tab--active' : ''}`}
                                        onClick={() => selectMode('bulk')}
                                        type="button"
                                        role="tab"
                                        aria-selected={mode === 'bulk'}
                                        data-tooltip="Shorten multiple URLs"
                                    >
                                        <RowsIcon />
                                        Bulk
                                    </button>
                                </div>

                                {mode === 'single' ? (
                                    <form
                                        className="command-form"
                                        onSubmit={handleSubmit}
                                        noValidate
                                    >
                                        <div className="form-grid">
                                            <div className="form-group form-group--wide">
                                                <label htmlFor="long-url">Destination URL</label>
                                                <input
                                                    ref={urlInputRef}
                                                    id="long-url"
                                                    className={`form-input${shakeField === 'url' ? ' shake' : ''}`}
                                                    type="url"
                                                    placeholder="https://example.com/your-long-url"
                                                    value={longUrl}
                                                    onChange={(event) => {
                                                        setLongUrl(event.target.value);
                                                        setError('');
                                                    }}
                                                    onPaste={handlePaste}
                                                    aria-invalid={!!error}
                                                    aria-describedby={
                                                        error ? 'form-error' : undefined
                                                    }
                                                    autoFocus
                                                    autoComplete="url"
                                                    title="Paste the destination URL to shorten."
                                                />
                                            </div>

                                            <div className="form-group form-group--wide">
                                                <label htmlFor="alias">Custom Alias</label>
                                                <div className="alias-row">
                                                    <span className="alias-prefix">
                                                        {config.baseDisplay}
                                                    </span>
                                                    <input
                                                        id="alias"
                                                        className="form-input"
                                                        type="text"
                                                        placeholder={placeholder}
                                                        value={alias}
                                                        onChange={(event) => {
                                                            setAlias(
                                                                sanitizeAliasInput(
                                                                    event.target.value,
                                                                ),
                                                            );
                                                            setError('');
                                                        }}
                                                        maxLength={MAX_ALIAS_LENGTH}
                                                        autoComplete="off"
                                                        inputMode="text"
                                                        title="Optional custom alias. Leave empty to use the generated alias."
                                                    />
                                                    <button
                                                        type="button"
                                                        className="icon-btn icon-btn--dice"
                                                        onClick={() => {
                                                            setAlias(generateAlias(aliasLength));
                                                            setError('');
                                                        }}
                                                        aria-label="Generate random alias"
                                                        data-tooltip="Generate random alias"
                                                        data-tooltip-position="left"
                                                    >
                                                        <DiceIcon />
                                                    </button>
                                                </div>
                                                <div className="alias-controls">
                                                    <label
                                                        htmlFor="alias-len"
                                                        className="alias-len-label"
                                                    >
                                                        Length <strong>{aliasLength}</strong>
                                                    </label>
                                                    <input
                                                        id="alias-len"
                                                        type="range"
                                                        className="alias-slider"
                                                        min={4}
                                                        max={MAX_ALIAS_LENGTH}
                                                        value={aliasLength}
                                                        onChange={(event) =>
                                                            setAliasLength(
                                                                Number(event.target.value),
                                                            )
                                                        }
                                                        title="Choose the generated alias length."
                                                    />
                                                    <span className="char-counter">
                                                        {alias.length}/{MAX_ALIAS_LENGTH}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        <button
                                            type="button"
                                            className="advanced-toggle"
                                            onClick={() => setShowAdvanced((value) => !value)}
                                            aria-expanded={showAdvanced}
                                            aria-controls="advanced-panel"
                                            data-tooltip="Show expiration and password options"
                                        >
                                            <ChevronIcon open={showAdvanced} />
                                            Advanced
                                            {activeAdvancedCount > 0 && (
                                                <span className="advanced-badge">
                                                    {activeAdvancedCount} active
                                                </span>
                                            )}
                                        </button>

                                        {showAdvanced && (
                                            <div className="advanced-panel" id="advanced-panel">
                                                <div className="form-grid">
                                                    <div className="form-group">
                                                        <label htmlFor="expiry">Expiration</label>
                                                        <input
                                                            id="expiry"
                                                            className="form-input"
                                                            type="datetime-local"
                                                            value={expiry}
                                                            onChange={(event) =>
                                                                setExpiry(event.target.value)
                                                            }
                                                            min={getMinExpiryDatetimeLocal()}
                                                            title="Optional expiration time. Stored in UTC."
                                                        />
                                                        {expiry && (
                                                            <div className="field-actions">
                                                                <span className="field-preview">
                                                                    {formatExpiry(
                                                                        toUtcIsoFromDatetimeLocal(
                                                                            expiry,
                                                                        ),
                                                                    )}
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="field-clear"
                                                                    onClick={() => setExpiry('')}
                                                                    data-tooltip="Clear expiration"
                                                                    data-tooltip-position="left"
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>

                                                    <div className="form-group">
                                                        <label htmlFor="link-password">
                                                            Password
                                                        </label>
                                                        <input
                                                            id="link-password"
                                                            className="form-input"
                                                            type="password"
                                                            placeholder="Enter a password"
                                                            value={password}
                                                            onChange={(event) =>
                                                                setPassword(event.target.value)
                                                            }
                                                            autoComplete="new-password"
                                                            maxLength={MAX_PASSWORD_LENGTH}
                                                            title="Optional password required before redirecting."
                                                        />
                                                        {password && (
                                                            <div className="field-actions">
                                                                <span className="field-preview">
                                                                    {password.length} characters
                                                                </span>
                                                                <button
                                                                    type="button"
                                                                    className="field-clear"
                                                                    onClick={() => setPassword('')}
                                                                    data-tooltip="Clear password"
                                                                    data-tooltip-position="left"
                                                                >
                                                                    Clear
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="honeypot" aria-hidden="true" tabIndex={-1}>
                                            <input
                                                type="text"
                                                name="website"
                                                value={honeypot}
                                                onChange={(event) =>
                                                    setHoneypot(event.target.value)
                                                }
                                                tabIndex={-1}
                                                autoComplete="off"
                                            />
                                        </div>

                                        {error && (
                                            <p className="error-msg" id="form-error">
                                                {error}
                                            </p>
                                        )}

                                        {loading && <RequestProgress progress={requestProgress} />}

                                        <button
                                            className="btn btn-primary"
                                            type="submit"
                                            disabled={loading}
                                            data-tooltip="Create a short URL"
                                        >
                                            {loading ? (
                                                <>
                                                    <span className="spinner" />
                                                    Shortening...
                                                </>
                                            ) : (
                                                'Shorten URL'
                                            )}
                                        </button>
                                    </form>
                                ) : (
                                    <form
                                        className="command-form"
                                        onSubmit={handleBulkSubmit}
                                        noValidate
                                    >
                                        <div className="form-group">
                                            <label htmlFor="bulk-urls">
                                                Paste URLs ({config.maxBulkUrls} max)
                                            </label>
                                            <textarea
                                                id="bulk-urls"
                                                className={`form-input form-textarea${shakeField === 'bulk' ? ' shake' : ''}`}
                                                placeholder={
                                                    'https://example.com/page-one\nhttps://example.com/page-two\nhttps://example.com/page-three'
                                                }
                                                value={bulkUrls}
                                                onChange={(event) => {
                                                    setBulkUrls(event.target.value);
                                                    setError('');
                                                }}
                                                aria-invalid={!!error}
                                                aria-describedby={error ? 'bulk-error' : undefined}
                                                rows={7}
                                                title={`Paste one URL per line, up to ${config.maxBulkUrls}.`}
                                            />
                                            <span className="char-counter">
                                                {bulkCount}/{config.maxBulkUrls} URLs
                                            </span>
                                        </div>

                                        <div className="honeypot" aria-hidden="true" tabIndex={-1}>
                                            <input
                                                type="text"
                                                name="website"
                                                value={honeypot}
                                                onChange={(event) =>
                                                    setHoneypot(event.target.value)
                                                }
                                                tabIndex={-1}
                                                autoComplete="off"
                                            />
                                        </div>

                                        {error && (
                                            <p className="error-msg" id="bulk-error">
                                                {error}
                                            </p>
                                        )}

                                        {loading && <RequestProgress progress={requestProgress} />}

                                        <button
                                            className="btn btn-primary"
                                            type="submit"
                                            disabled={loading}
                                            data-tooltip="Create short URLs for every valid line"
                                        >
                                            {loading ? (
                                                <>
                                                    <span className="spinner" />
                                                    Shortening...
                                                </>
                                            ) : (
                                                'Shorten All URLs'
                                            )}
                                        </button>
                                    </form>
                                )}
                            </>
                        )}

                        {view === 'result' && (
                            <div className="result-view">
                                <div className="result-card">
                                    <div className="result-card__content">
                                        <span className="result-label">Shortened URL</span>
                                        <a
                                            href={resultUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="result-link"
                                            data-tooltip="Open short URL in a new tab"
                                        >
                                            {resultUrl}
                                        </a>
                                        {(resultExpiry || resultProtected) && (
                                            <div className="result-badges">
                                                {resultExpiry && (
                                                    <span
                                                        className="badge badge-warn"
                                                        data-tooltip="Expiration time"
                                                    >
                                                        <ClockIcon />
                                                        {formatExpiry(resultExpiry)}
                                                    </span>
                                                )}
                                                {resultProtected && (
                                                    <span
                                                        className="badge badge-lock"
                                                        data-tooltip="Password protected"
                                                    >
                                                        <LockIcon />
                                                        Password
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                    <div className="result-actions">
                                        <button
                                            className="icon-btn"
                                            onClick={() => handleCopy()}
                                            aria-label="Copy URL"
                                            type="button"
                                            data-tooltip={copied ? 'Copied!' : 'Copy'}
                                            data-tooltip-position="left"
                                        >
                                            {copied ? <CheckIcon /> : <CopyIcon />}
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={() => setShowQR((value) => !value)}
                                            aria-label="Show QR code"
                                            type="button"
                                            data-tooltip="Toggle QR code"
                                            data-tooltip-position="left"
                                        >
                                            <QRIcon />
                                        </button>
                                        <button
                                            className="icon-btn"
                                            onClick={() => setShowShare((value) => !value)}
                                            aria-label="Share"
                                            type="button"
                                            data-tooltip="Show share options"
                                            data-tooltip-position="left"
                                        >
                                            <ShareIcon />
                                        </button>
                                    </div>
                                </div>

                                {showQR && qrDataUrl && (
                                    <div className="qr-container">
                                        <img
                                            src={qrDataUrl}
                                            alt="QR Code"
                                            width={180}
                                            height={180}
                                        />
                                        <a
                                            href={qrDataUrl}
                                            download="surl-qr.png"
                                            className="btn btn-ghost btn-sm"
                                            data-tooltip="Download QR image"
                                        >
                                            Download QR
                                        </a>
                                    </div>
                                )}

                                {showShare && (
                                    <div className="share-row">
                                        <a
                                            href={`https://twitter.com/intent/tweet?url=${shareUrl}&text=${shareText}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="share-btn share-btn--twitter"
                                            title="Share on X"
                                            data-tooltip="Share on X"
                                        >
                                            X
                                        </a>
                                        <a
                                            href={`https://wa.me/?text=${shareText}%20${shareUrl}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="share-btn share-btn--whatsapp"
                                            title="Share on WhatsApp"
                                            data-tooltip="Share on WhatsApp"
                                        >
                                            WA
                                        </a>
                                        <a
                                            href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="share-btn share-btn--telegram"
                                            title="Share on Telegram"
                                            data-tooltip="Share on Telegram"
                                        >
                                            TG
                                        </a>
                                    </div>
                                )}

                                <button
                                    className="btn btn-success"
                                    onClick={handleReset}
                                    type="button"
                                    data-tooltip="Reset the form"
                                >
                                    Shorten Another
                                </button>
                            </div>
                        )}

                        {view === 'bulk-result' && (
                            <div className="result-view">
                                <div className="result-summary">
                                    <span className="result-label">Batch complete</span>
                                    <strong>
                                        {bulkResults.filter((result) => result.ok).length}/
                                        {bulkResults.length} succeeded
                                    </strong>
                                </div>
                                <div className="bulk-results">
                                    {bulkResults.map((result, index) => (
                                        <div
                                            key={`${result.url}-${index}`}
                                            className={`bulk-item${result.ok ? '' : ' bulk-item--error'}`}
                                        >
                                            <div className="bulk-item__original">{result.url}</div>
                                            {result.ok && result.shortUrl ? (
                                                <div className="bulk-item__short">
                                                    <a
                                                        href={result.shortUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        data-tooltip="Open short URL in a new tab"
                                                    >
                                                        {result.shortUrl}
                                                    </a>
                                                    <button
                                                        className="icon-btn icon-btn--sm"
                                                        onClick={() => handleCopy(result.shortUrl)}
                                                        type="button"
                                                        aria-label="Copy"
                                                        data-tooltip="Copy short URL"
                                                        data-tooltip-position="left"
                                                    >
                                                        <CopyIcon />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="bulk-item__error">
                                                    {result.error || 'Failed'}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                                <div className="bulk-actions">
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleCopyAllBulk}
                                        type="button"
                                        data-tooltip="Copy all successful short URLs"
                                    >
                                        Copy All Short URLs
                                    </button>
                                    <button
                                        className="btn btn-success"
                                        onClick={handleReset}
                                        type="button"
                                        data-tooltip="Start another batch"
                                    >
                                        Shorten More
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                </section>

                <aside className="workspace-side" aria-label="Profile and links">
                    <section className="profile-panel profile-panel--menu">
                        <div className="profile-menu" role="tablist" aria-label="Right panel menu">
                            <button
                                className={`profile-menu__item${rightPanelMenu === 'profile' ? ' profile-menu__item--active' : ''}`}
                                onClick={() => setRightPanelMenu('profile')}
                                type="button"
                                role="tab"
                                aria-selected={rightPanelMenu === 'profile'}
                                aria-controls="profile-panel-body"
                                data-tooltip="View current link profile"
                            >
                                <span>
                                    <SparkIcon />
                                    Profile
                                </span>
                            </button>
                            <button
                                className={`profile-menu__item${rightPanelMenu === 'links' ? ' profile-menu__item--active' : ''}`}
                                onClick={showLinksMenu}
                                type="button"
                                role="tab"
                                aria-disabled={!historyUnlocked}
                                aria-selected={rightPanelMenu === 'links'}
                                aria-controls="history-panel-body"
                                data-tooltip={
                                    !historyUnlocked
                                        ? 'Accept cookies to view My Links'
                                        : 'View saved links'
                                }
                                data-tooltip-position="left"
                            >
                                <span>
                                    <HistoryIcon />
                                    My Links
                                </span>
                                <strong>
                                    {!historyUnlocked
                                        ? 'Locked'
                                        : rightPanelMenu === 'links'
                                          ? 'Open'
                                          : 'View'}
                                </strong>
                            </button>
                        </div>

                        {rightPanelMenu === 'profile' && (
                            <div
                                className="profile-menu__body"
                                id="profile-panel-body"
                                role="tabpanel"
                            >
                                <div
                                    className="preview-link"
                                    aria-label="Current short link preview"
                                    data-tooltip="Preview of the short-link alias"
                                >
                                    <span>{config.baseDisplay}</span>
                                    <strong>{previewAlias}</strong>
                                </div>

                                <div className="metric-grid">
                                    <div className="metric" data-tooltip="Current shortening mode">
                                        <span>Mode</span>
                                        <strong>{activeModeLabel}</strong>
                                    </div>
                                    <div className="metric" data-tooltip="Generated alias length">
                                        <span>Alias</span>
                                        <strong>{aliasLength}</strong>
                                    </div>
                                    <div className="metric" data-tooltip="Active advanced options">
                                        <span>Options</span>
                                        <strong>{activeAdvancedCount}</strong>
                                    </div>
                                    <div className="metric" data-tooltip="Loaded saved-link count">
                                        <span>Saved</span>
                                        <strong>{createdCount}</strong>
                                    </div>
                                </div>

                                <div className="state-list">
                                    <div
                                        className={`state-row${longUrl ? ' state-row--active' : ''}`}
                                        data-tooltip="Destination URL status"
                                    >
                                        <LinkIcon />
                                        <span>Destination</span>
                                        <strong>{longUrl ? 'Set' : 'Empty'}</strong>
                                    </div>
                                    <div
                                        className={`state-row${expiry ? ' state-row--active' : ''}`}
                                        data-tooltip="Expiration setting status"
                                    >
                                        <ClockIcon />
                                        <span>Expiration</span>
                                        <strong>{expiry ? 'Set' : 'Open'}</strong>
                                    </div>
                                    <div
                                        className={`state-row${password ? ' state-row--active' : ''}`}
                                        data-tooltip="Password protection status"
                                    >
                                        <LockIcon />
                                        <span>Password</span>
                                        <strong>{password ? 'Set' : 'Off'}</strong>
                                    </div>
                                </div>
                            </div>
                        )}

                        {rightPanelMenu === 'links' && (
                            <div
                                className="profile-menu__body history-panel__body"
                                id="history-panel-body"
                                role="tabpanel"
                            >
                                {historyLoading && (
                                    <div className="history-loading">
                                        <span className="spinner" />
                                        <p>Loading your links...</p>
                                    </div>
                                )}

                                {historyError && !historyLoading && (
                                    <div className="history-empty">
                                        <p>{historyError}</p>
                                    </div>
                                )}

                                {!historyLoading && !historyError && historyLinks.length > 0 && (
                                    <div className="history-list">
                                        {historyLinks.map((link) => (
                                            <div
                                                key={link.alias}
                                                className={`history-item${link.isExpired ? ' history-item--expired' : ''}`}
                                            >
                                                <div className="history-item__header">
                                                    <a
                                                        href={link.shortUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="history-item__short"
                                                        data-tooltip="Open saved short URL"
                                                    >
                                                        {link.shortUrl}
                                                    </a>
                                                    <button
                                                        className="icon-btn icon-btn--sm"
                                                        onClick={() => handleCopy(link.shortUrl)}
                                                        type="button"
                                                        aria-label="Copy"
                                                        data-tooltip="Copy saved short URL"
                                                        data-tooltip-position="left"
                                                    >
                                                        <CopyIcon />
                                                    </button>
                                                </div>
                                                <div className="history-item__url">{link.url}</div>
                                                <div className="history-item__meta">
                                                    <span>{formatExpiry(link.created)}</span>
                                                    {link.isExpired && (
                                                        <span
                                                            className="badge badge-warn"
                                                            data-tooltip="This link is expired"
                                                        >
                                                            Expired
                                                        </span>
                                                    )}
                                                    {link.expiry && !link.isExpired && (
                                                        <span
                                                            className="badge badge-warn"
                                                            data-tooltip="Expiration date"
                                                        >
                                                            Expires {formatExpiry(link.expiry)}
                                                        </span>
                                                    )}
                                                    {link.isProtected && (
                                                        <span
                                                            className="badge badge-lock"
                                                            data-tooltip="Password protected link"
                                                        >
                                                            Protected
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {!historyLoading && (
                                    <button
                                        className="btn btn-ghost btn-sm"
                                        onClick={fetchHistory}
                                        type="button"
                                        data-tooltip="Refresh saved links"
                                    >
                                        Refresh
                                    </button>
                                )}
                            </div>
                        )}
                    </section>
                </aside>
            </main>

            <footer className="footer">
                <p>
                    Powered by{' '}
                    <a
                        href="https://developers.google.com/apps-script"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-tooltip="Open Google Apps Script docs"
                    >
                        Google Apps Script
                    </a>
                </p>
                <p className="footer-links">
                    <a
                        href="https://github.com/natsumeaoii/surl"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-tooltip="Open GitHub repository"
                    >
                        GitHub
                    </a>
                    <span className="footer-sep">|</span>
                    <a
                        href="https://github.com/natsumeaoii/surl/issues"
                        target="_blank"
                        rel="noopener noreferrer"
                        data-tooltip="Report an issue"
                        data-tooltip-position="left"
                    >
                        Report a Bug
                    </a>
                </p>
            </footer>

            <div className={`toast${toast ? ' visible' : ''}`} role="status" aria-live="polite">
                {toast}
            </div>

            <Suspense fallback={null}>
                <CookieConsent />
            </Suspense>
        </div>
    );
}
