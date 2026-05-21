import { formatExpiry } from '../../lib/url.ts';
import {
    CheckIcon,
    ClockIcon,
    CopyIcon,
    LockIcon,
    QRIcon,
    ShareIcon,
} from '../../components/icons.tsx';
import type { BulkResult } from '../types.ts';

interface ResultViewProps {
    resultUrl: string;
    resultExpiry: string;
    resultProtected: boolean;
    copied: boolean;
    showQR: boolean;
    qrDataUrl: string;
    showShare: boolean;
    shareUrl: string;
    shareText: string;
    onCopy: () => void;
    onToggleQR: () => void;
    onToggleShare: () => void;
    onReset: () => void;
}

export function ResultView({
    resultUrl,
    resultExpiry,
    resultProtected,
    copied,
    showQR,
    qrDataUrl,
    showShare,
    shareUrl,
    shareText,
    onCopy,
    onToggleQR,
    onToggleShare,
    onReset,
}: ResultViewProps) {
    return (
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
                                <span className="badge badge-warn" data-tooltip="Expiration time">
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
                        onClick={onCopy}
                        aria-label="Copy URL"
                        type="button"
                        data-tooltip={copied ? 'Copied!' : 'Copy'}
                        data-tooltip-position="left"
                    >
                        {copied ? <CheckIcon /> : <CopyIcon />}
                    </button>
                    <button
                        className="icon-btn"
                        onClick={onToggleQR}
                        aria-label="Show QR code"
                        type="button"
                        data-tooltip="Toggle QR code"
                        data-tooltip-position="left"
                    >
                        <QRIcon />
                    </button>
                    <button
                        className="icon-btn"
                        onClick={onToggleShare}
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
                    <img src={qrDataUrl} alt="QR Code" width={180} height={180} />
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
                onClick={onReset}
                type="button"
                data-tooltip="Reset the form"
            >
                Shorten Another
            </button>
        </div>
    );
}

interface BulkResultViewProps {
    bulkResults: BulkResult[];
    onCopy: (text?: string) => void;
    onCopyAllBulk: () => void;
    onReset: () => void;
}

export function BulkResultView({
    bulkResults,
    onCopy,
    onCopyAllBulk,
    onReset,
}: BulkResultViewProps) {
    return (
        <div className="result-view">
            <div className="result-summary">
                <span className="result-label">Batch complete</span>
                <strong>
                    {bulkResults.filter((result) => result.ok).length}/{bulkResults.length}{' '}
                    succeeded
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
                                    onClick={() => onCopy(result.shortUrl)}
                                    type="button"
                                    aria-label="Copy"
                                    data-tooltip="Copy short URL"
                                    data-tooltip-position="left"
                                >
                                    <CopyIcon />
                                </button>
                            </div>
                        ) : (
                            <div className="bulk-item__error">{result.error || 'Failed'}</div>
                        )}
                    </div>
                ))}
            </div>
            <div className="bulk-actions">
                <button
                    className="btn btn-primary"
                    onClick={onCopyAllBulk}
                    type="button"
                    data-tooltip="Copy all successful short URLs"
                >
                    Copy All Short URLs
                </button>
                <button
                    className="btn btn-success"
                    onClick={onReset}
                    type="button"
                    data-tooltip="Start another batch"
                >
                    Shorten More
                </button>
            </div>
        </div>
    );
}
