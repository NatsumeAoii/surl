import { config } from '../../lib/config.ts';
import { formatExpiry } from '../../lib/url.ts';
import {
    CopyIcon,
    ClockIcon,
    HistoryIcon,
    LinkIcon,
    LockIcon,
    SparkIcon,
} from '../../components/icons.tsx';
import type { HistoryLink, RightPanelMenu } from '../types.ts';

interface RightPanelProps {
    rightPanelMenu: RightPanelMenu;
    setRightPanelMenu: (menu: RightPanelMenu) => void;
    showLinksMenu: () => void;
    historyUnlocked: boolean;
    previewAlias: string;
    activeModeLabel: string;
    aliasLength: number;
    activeAdvancedCount: number;
    createdCount: number;
    longUrl: string;
    expiry: string;
    password: string;
    historyLoading: boolean;
    historyError: string;
    historyLinks: HistoryLink[];
    fetchHistory: () => void;
    handleCopy: (text?: string) => void;
}

export function RightPanel({
    rightPanelMenu,
    setRightPanelMenu,
    showLinksMenu,
    historyUnlocked,
    previewAlias,
    activeModeLabel,
    aliasLength,
    activeAdvancedCount,
    createdCount,
    longUrl,
    expiry,
    password,
    historyLoading,
    historyError,
    historyLinks,
    fetchHistory,
    handleCopy,
}: RightPanelProps) {
    return (
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
                        !historyUnlocked ? 'Accept cookies to view My Links' : 'View saved links'
                    }
                    data-tooltip-position="left"
                >
                    <span>
                        <HistoryIcon />
                        My Links
                    </span>
                    <strong>
                        {!historyUnlocked ? 'Locked' : rightPanelMenu === 'links' ? 'Open' : 'View'}
                    </strong>
                </button>
            </div>

            {rightPanelMenu === 'profile' && (
                <div className="profile-menu__body" id="profile-panel-body" role="tabpanel">
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
    );
}
