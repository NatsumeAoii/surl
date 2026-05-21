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
import { callScript } from '../lib/api.ts';
import { config } from '../lib/config.ts';
import { getUID, hasConsent, getNetworkParams } from '../lib/fingerprint.ts';
import { generateQRCodeDataURL } from '../lib/qrcode.ts';
import { fireConfetti } from '../lib/confetti.ts';
import { RequestProgress } from './components/RequestProgress.tsx';
import { BulkResultView, ResultView } from './components/ResultViews.tsx';
import { RightPanel } from './components/RightPanel.tsx';
import { useRequestProgress } from './hooks/useRequestProgress.ts';
import { useTheme } from './hooks/useTheme.ts';
import {
    copyText,
    generateAlias,
    getAnalyticsParams,
    getApiErrorMessage,
    hasNetworkPayload,
} from './helpers.ts';
import type { AppView, BulkResult, HistoryLink, LinkMode, RightPanelMenu } from './types.ts';
import {
    SunIcon,
    MoonIcon,
    ChevronIcon,
    DiceIcon,
    LinkIcon,
    RowsIcon,
    SparkIcon,
} from '../components/icons.tsx';
import {
    MAX_ALIAS_LENGTH,
    MAX_PASSWORD_LENGTH,
    formatExpiry,
    getMinExpiryDatetimeLocal,
    normalizeShortUrl,
    sanitizeAliasInput,
    toUtcIsoFromDatetimeLocal,
    validateTargetUrl,
} from '../lib/url.ts';

const CookieConsent = lazy(() => import('../components/CookieConsent.tsx'));

export default function App() {
    const [theme, toggleTheme] = useTheme();

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

    const [mode, setMode] = useState<LinkMode>('single');
    const [honeypot, setHoneypot] = useState('');

    const [resultExpiry, setResultExpiry] = useState('');
    const [resultProtected, setResultProtected] = useState(false);

    const [userUid, setUserUid] = useState<string | null>(getUID);
    const [historyLinks, setHistoryLinks] = useState<HistoryLink[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState('');
    const [rightPanelMenu, setRightPanelMenu] = useState<RightPanelMenu>('profile');

    const [view, setView] = useState<AppView>('form');
    const [transitioning, setTransitioning] = useState(false);
    const requestProgress = useRequestProgress(loading, config.requestTimeoutMs);

    const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const shakeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const transitionTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const pasteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const confettiTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const urlInputRef = useRef<HTMLInputElement>(null);
    const historyRequestId = useRef(0);
    const loadingRef = useRef(false);
    const historyUnlocked = Boolean(userUid && hasConsent());

    const setLoadingState = useCallback((isLoading: boolean) => {
        loadingRef.current = isLoading;
        setLoading(isLoading);
    }, []);

    useEffect(() => {
        return () => {
            clearTimeout(toastTimer.current);
            clearTimeout(shakeTimer.current);
            clearTimeout(transitionTimer.current);
            clearTimeout(pasteTimer.current);
            clearTimeout(copiedTimer.current);
            clearTimeout(confettiTimer.current);
        };
    }, []);

    useEffect(() => {
        const onConsent = () => setUserUid(getUID());
        window.addEventListener('ntsm:consent', onConsent);
        return () => window.removeEventListener('ntsm:consent', onConsent);
    }, []);

    const showToast = useCallback((msg: string) => {
        setToast(msg);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 2500);
    }, []);

    const triggerShake = useCallback((field: string) => {
        clearTimeout(shakeTimer.current);
        setShakeField(field);
        shakeTimer.current = setTimeout(() => setShakeField(''), 500);
    }, []);

    const transitionTo = useCallback((target: AppView) => {
        clearTimeout(transitionTimer.current);
        setTransitioning(true);
        transitionTimer.current = setTimeout(() => {
            setView(target);
            setTransitioning(false);
        }, 200);
    }, []);

    const scheduleConfetti = useCallback(() => {
        clearTimeout(confettiTimer.current);
        confettiTimer.current = setTimeout(() => fireConfetti(), 300);
    }, []);

    const handlePaste = useCallback(
        (_e: ClipboardEvent<HTMLInputElement>) => {
            clearTimeout(pasteTimer.current);
            pasteTimer.current = setTimeout(() => {
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

    const selectMode = (nextMode: LinkMode) => {
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
        if (loadingRef.current) return;

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
        setLoadingState(true);

        try {
            const networkParams = await getNetworkParams(
                fetch,
                config.networkTimeoutMs,
                config.networkLookupUrl,
            );
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
                if (!data.reused) scheduleConfetti();
            } else {
                setError(data.error || 'Failed to create short URL.');
                triggerShake('url');
            }
        } catch (submitError) {
            setError(getApiErrorMessage(submitError));
        } finally {
            setLoadingState(false);
        }
    };

    const handleBulkSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (loadingRef.current) return;

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

        setLoadingState(true);

        try {
            const networkParams = await getNetworkParams(
                fetch,
                config.networkTimeoutMs,
                config.networkLookupUrl,
            );
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
                if (successCount > 0) scheduleConfetti();
            } else {
                setError(data.error || 'Bulk shortening failed.');
            }
        } catch (bulkError) {
            setError(getApiErrorMessage(bulkError));
        } finally {
            setLoadingState(false);
        }
    };

    const handleCopy = async (text?: string) => {
        const toCopy = text || resultUrl;
        if (!toCopy) return;

        if (await copyText(toCopy)) {
            if (!text) setCopied(true);
            showToast('Copied to clipboard!');
            if (!text) {
                clearTimeout(copiedTimer.current);
                copiedTimer.current = setTimeout(() => setCopied(false), 2000);
            }
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
                            <ResultView
                                resultUrl={resultUrl}
                                resultExpiry={resultExpiry}
                                resultProtected={resultProtected}
                                copied={copied}
                                showQR={showQR}
                                qrDataUrl={qrDataUrl}
                                showShare={showShare}
                                shareUrl={shareUrl}
                                shareText={shareText}
                                onCopy={() => handleCopy()}
                                onToggleQR={() => setShowQR((value) => !value)}
                                onToggleShare={() => setShowShare((value) => !value)}
                                onReset={handleReset}
                            />
                        )}

                        {view === 'bulk-result' && (
                            <BulkResultView
                                bulkResults={bulkResults}
                                onCopy={handleCopy}
                                onCopyAllBulk={handleCopyAllBulk}
                                onReset={handleReset}
                            />
                        )}
                    </section>
                </section>

                <aside className="workspace-side" aria-label="Profile and links">
                    <RightPanel
                        rightPanelMenu={rightPanelMenu}
                        setRightPanelMenu={setRightPanelMenu}
                        showLinksMenu={showLinksMenu}
                        historyUnlocked={historyUnlocked}
                        previewAlias={previewAlias}
                        activeModeLabel={activeModeLabel}
                        aliasLength={aliasLength}
                        activeAdvancedCount={activeAdvancedCount}
                        createdCount={createdCount}
                        longUrl={longUrl}
                        expiry={expiry}
                        password={password}
                        historyLoading={historyLoading}
                        historyError={historyError}
                        historyLinks={historyLinks}
                        fetchHistory={fetchHistory}
                        handleCopy={handleCopy}
                    />
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
