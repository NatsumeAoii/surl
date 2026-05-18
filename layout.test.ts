import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readText(path: string): string {
    return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('workspace layout structure', () => {
    it('provides reusable tooltips across compact actions and fallback controls', () => {
        const app = readText('./src/App.tsx');
        const css = readText('./src/index.css');
        const consent = readText('./src/CookieConsent.tsx');
        const fallback = readText('./public/404.html');
        const tooltipCount =
            (app.match(/data-tooltip=/g)?.length ?? 0) +
            (consent.match(/data-tooltip=/g)?.length ?? 0);

        expect(css).toContain('[data-tooltip]::after');
        expect(css).toContain('[data-tooltip]:is(:hover, :focus-visible)::after');
        expect(css).toContain("[data-tooltip][data-tooltip-position='bottom']::after");
        expect(css).toContain("[data-tooltip][data-tooltip-position='left']::after");
        expect(css).toContain('--tooltip-delay: 1s;');
        expect(css).toContain('transition-delay: 0s;');
        expect(css).toContain('transition-delay: var(--tooltip-delay);');
        expect(app).toMatch(
            /data-tooltip="Serverless storage runs on Google Sheets"\s+data-tooltip-position="bottom"/,
        );
        expect(app).toContain(
            "data-tooltip={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}",
        );
        expect(app).toMatch(
            /data-tooltip=\{`Switch to \$\{theme === 'dark' \? 'light' : 'dark'\} mode`\}\s+data-tooltip-position="left"/,
        );
        expect(app).toContain('data-tooltip="Shorten a single URL"');
        expect(app).toContain('data-tooltip="Shorten multiple URLs"');
        expect(app).toMatch(/data-tooltip="Generate random alias"\s+data-tooltip-position="left"/);
        expect(app).toContain('data-tooltip="Show expiration and password options"');
        expect(app).toContain('data-tooltip="Create a short URL"');
        expect(app).toContain('data-tooltip="Copy all successful short URLs"');
        expect(app).toContain('data-tooltip="View current link profile"');
        expect(app).toMatch(
            /data-tooltip=\{\s*!historyUnlocked\s+\?\s+'Accept cookies to view My Links'\s+:\s+'View saved links'\s+\}/,
        );
        expect(app).toContain('data-tooltip="Refresh saved links"');
        expect(app).toContain('data-tooltip="Open GitHub repository"');
        expect(app).toMatch(/data-tooltip="Report an issue"\s+data-tooltip-position="left"/);
        expect(consent).toContain('data-tooltip="Allow anonymous usage cookies"');
        expect(consent).toContain('data-tooltip="Keep the banner hidden for now"');
        expect(fallback).toContain('title="Continue to the destination URL"');
        expect(fallback).toContain('title="Submit abuse report"');
        expect(tooltipCount).toBeGreaterThanOrEqual(30);
    });

    it('uses the compact S.url brand and trust-focused subtitle', () => {
        const app = readText('./src/App.tsx');
        const config = readText('./src/config.ts');
        const staticBrandFiles = [
            readText('./index.html'),
            readText('./public/404.html'),
            readText('./public/manifest.json'),
            readText('./public/og-image.svg'),
            readText('./public/favicon.svg'),
        ].join('\n');

        expect(config).toContain("appName: import.meta.env.VITE_APP_NAME || 'S'");
        expect(config).toContain(
            "tagline: import.meta.env.VITE_TAGLINE || 'Serverless, safe, secure, and fast.'",
        );
        expect(app).toContain('<p className="brand-subtitle">{config.tagline}</p>');
        expect(app).not.toContain(
            '<p className="brand-subtitle">Serverless, safe, secure, and fast.</p>',
        );
        expect(app).not.toContain('Serverless link console');
        expect(staticBrandFiles).toContain('S.url');
        expect(staticBrandFiles).not.toContain('NTSM.url');
        expect(staticBrandFiles).not.toContain('>NTSM<');
    });

    it('starts the workspace at the tool deck and leaves project metadata in the footer', () => {
        const app = readText('./src/App.tsx');
        const css = readText('./src/index.css');

        const mainIndex = app.indexOf('className="workspace-main"');
        const sideIndex = app.indexOf('className="workspace-side"');
        const footerIndex = app.indexOf('<footer className="footer">');

        expect(app).toContain('<main className="workspace" aria-label="URL shortener workspace">');
        expect(app).not.toContain('className="workspace-intro"');
        expect(app).not.toContain('workspace-intro__copy');
        expect(app).not.toContain('workspace-intro__status');
        expect(app).not.toContain('Link operations');
        expect(app).not.toContain('Shorten links with control.');
        expect(mainIndex).toBeGreaterThan(-1);
        expect(sideIndex).toBeGreaterThan(mainIndex);
        expect(footerIndex).toBeGreaterThan(sideIndex);
        expect(app).toContain('Powered by');
        expect(app).toContain('Google Apps Script');
        expect(app).toContain('https://github.com/natsumeaoii/surl');
        expect(css).not.toContain('.workspace-intro');
        expect(css).not.toContain('.summary-chip');
    });

    it('keeps history out of primary mode tabs and exposes Profile and My Links as one right-panel menu', () => {
        const app = readText('./src/App.tsx');
        const css = readText('./src/index.css');

        expect(app).not.toContain("selectMode('history')");
        expect(app).not.toContain('className="profile-panel profile-panel--compact history-panel"');
        expect(app).not.toContain('className="profile-panel profile-panel--compact"');
        expect(app).not.toContain('profile-submenu--summary');
        expect(app).not.toContain('profile-submenu--history');
        expect(app).not.toContain('profileOpen');
        expect(app).not.toContain('History locked');
        expect(app).not.toContain('Accept analytics consent to unlock My Links.');
        expect(app).not.toContain('Privacy');
        expect(app).toContain('<aside className="workspace-side" aria-label="Profile and links">');
        expect(app).toContain('className="profile-panel profile-panel--menu"');
        expect(app).toContain('const [rightPanelMenu, setRightPanelMenu] = useState');
        expect(app).toContain('MAX_PASSWORD_LENGTH');
        expect(app).toContain('maxLength={MAX_PASSWORD_LENGTH}');
        expect(app).toContain("rightPanelMenu === 'profile'");
        expect(app).toContain("rightPanelMenu === 'links'");
        expect(app).toContain('className="profile-menu"');
        expect(app).toContain('role="tablist"');
        expect(app).toContain('aria-label="Right panel menu"');
        expect(app).toContain(
            "className={`profile-menu__item${rightPanelMenu === 'profile' ? ' profile-menu__item--active' : ''}`}",
        );
        expect(app).toContain(
            "className={`profile-menu__item${rightPanelMenu === 'links' ? ' profile-menu__item--active' : ''}`}",
        );
        expect(app).toContain('aria-controls="profile-panel-body"');
        expect(app).toContain('id="profile-panel-body"');
        expect(app).toContain('id="history-panel-body"');
        expect(app).toContain('className="profile-menu__body"');
        expect(app).toContain('const historyUnlocked = Boolean(userUid && hasConsent());');
        expect(app).toContain('if (!historyUnlocked) return;');
        expect(app).toContain('const historyRequestId = useRef(0);');
        expect(app).toContain('const requestId = historyRequestId.current + 1;');
        expect(app).toContain('historyRequestId.current = requestId;');
        expect(app).toContain('if (historyRequestId.current !== requestId) return;');
        expect(app).toContain("if (rightPanelMenu !== 'links' && !historyLoading) {");
        expect(app).toContain('aria-disabled={!historyUnlocked}');
        expect(app).not.toMatch(/\sdisabled=\{!historyUnlocked\}/);
        expect(app).toMatch(
            /!historyUnlocked\s+\?\s+'Locked'\s+:\s+rightPanelMenu === 'links'\s+\?\s+'Open'\s+:\s+'View'/,
        );
        expect(css).toContain('.profile-panel--menu');
        expect(css).toContain('.profile-menu');
        expect(css).toContain('.profile-menu__item:focus-visible');
        expect(css).toContain(".profile-menu__item:not([aria-disabled='true']):hover");
        expect(css).toContain(".profile-menu__item[aria-disabled='true']");
        expect(css).toContain('.profile-menu__body');
        expect(css).toContain('.profile-menu__body.history-panel__body');
        expect(css).toContain('max-height: clamp(180px, 42vh, 360px);');
        expect(css).not.toContain('calc(100vh - 320px)');
    });
});
