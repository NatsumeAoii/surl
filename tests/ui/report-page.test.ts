import { describe, expect, it } from 'vitest';
import { readProjectFile } from '../support/projectFiles';

const redirectHtml = readProjectFile('public/404.html');
const reportHtml = readProjectFile('public/report.html');
const staticConfig = readProjectFile('public/static-config.js');

describe('report page', () => {
    it('shares static page runtime configuration instead of duplicating API constants', () => {
        const indexHtml = readProjectFile('index.html');
        const deployValidator = readProjectFile('scripts/validate-deploy-artifact.mjs');
        const serviceWorker = readProjectFile('public/sw.js');

        expect(staticConfig).toContain('window.SURL_STATIC_CONFIG');
        expect(staticConfig).toContain('scriptUrl:');
        expect(staticConfig).toContain('networkLookupUrl:');
        expect(indexHtml).toContain('src="/surl/static-config.js"');
        expect(redirectHtml).toContain('src="./static-config.js"');
        expect(reportHtml).toContain('src="./static-config.js"');
        expect(redirectHtml).toContain('var staticConfig = window.SURL_STATIC_CONFIG || {};');
        expect(reportHtml).toContain('var staticConfig = window.SURL_STATIC_CONFIG || {};');
        expect(redirectHtml).not.toContain('var SCRIPT_URL =');
        expect(reportHtml).not.toContain('var API_URL =');
        expect(deployValidator).toContain("'static-config.js'");
        expect(serviceWorker).toContain("'/surl/static-config.js'");
        expect(serviceWorker).toContain("'/surl/report.html'");
        expect(serviceWorker).toContain('function isRuntimeConfig(url)');
        expect(serviceWorker).toContain("url.pathname === '/surl/static-config.js'");
        expect(serviceWorker).toContain('if (isRuntimeConfig(url))');
    });

    it('moves report handling to a dedicated static page', () => {
        expect(redirectHtml).toContain("BASE_PATH + 'report.html?'");
        expect(redirectHtml).toContain('openReportPage');
        expect(reportHtml).toContain('<title>Report Link - S.url</title>');
        expect(reportHtml).toContain('<meta name="robots" content="noindex,nofollow" />');
        expect(reportHtml).toContain(
            'var REQUEST_TIMEOUT_MS = Number(staticConfig.requestTimeoutMs) || 30000;',
        );
        expect(reportHtml).toContain('id="report-form"');
        expect(reportHtml).toContain("'report',");
    });

    it('validates report context and avoids rendering untrusted URL input as HTML', () => {
        expect(reportHtml).toContain('var slugPattern = /^[A-Za-z0-9_-]{1,64}$/;');
        expect(reportHtml).toContain('isSafeHttpUrl(destination)');
        expect(reportHtml).toContain(
            "document.getElementById('destination-url').textContent = destination;",
        );
        expect(reportHtml).not.toContain('innerHTML');
    });

    it('submits reason, description, destination, and network context as separate fields', () => {
        expect(staticConfig).toContain('https://ipapi.co/json/');
        expect(reportHtml).toContain('function getNetworkContext()');
        expect(reportHtml).toContain('var MAX_DETAILS_LENGTH = 360;');
        expect(reportHtml).toContain('maxlength="360"');
        expect(reportHtml).toContain('reason: getSelectedReason()');
        expect(reportHtml).toContain('description: getDescription()');
        expect(reportHtml).toContain('slice(0, MAX_DETAILS_LENGTH)');
        expect(reportHtml).toContain('destination: getSafeDestination()');
        expect(reportHtml).toContain('Object.assign({}, networkContext');
        expect(reportHtml).toContain('networkContext.network = JSON.stringify(networkContext);');
        expect(reportHtml).toContain('networkContext.metadataVersion = 2;');
    });

    it('does not start abort timers before optional static configuration is present', () => {
        const redirectApiStart = redirectHtml.indexOf('function api(action, params)');
        const redirectApiEnd = redirectHtml.indexOf('function isSafeHttpUrl', redirectApiStart);
        const redirectApi = redirectHtml.slice(redirectApiStart, redirectApiEnd);
        const reportNetworkStart = reportHtml.indexOf('function getNetworkContext()');
        const reportNetworkEnd = reportHtml.indexOf(
            'function api(action, payload)',
            reportNetworkStart,
        );
        const reportNetwork = reportHtml.slice(reportNetworkStart, reportNetworkEnd);
        const reportApiStart = reportHtml.indexOf('function api(action, payload)');
        const reportApiEnd = reportHtml.indexOf('function getSelectedReason', reportApiStart);
        const reportApi = reportHtml.slice(reportApiStart, reportApiEnd);

        expect(redirectApi.indexOf('if (!scriptUrl)')).toBeLessThan(
            redirectApi.indexOf('new AbortController()'),
        );
        expect(reportNetwork.indexOf('if (!networkLookupUrl)')).toBeLessThan(
            reportNetwork.indexOf('new AbortController()'),
        );
        expect(reportApi.indexOf('if (!apiUrl)')).toBeLessThan(
            reportApi.indexOf('new AbortController()'),
        );
    });

    it('provides separate navigation for returning to the preview and homepage', () => {
        expect(reportHtml).toContain('id="back-preview-button"');
        expect(reportHtml).toContain('Back to preview');
        expect(reportHtml).toContain('Back homepage');
        expect(reportHtml).toContain('function backToPreviousPage()');
        expect(reportHtml).toContain('window.history.back();');
        expect(reportHtml).toContain("location.href = '/surl/' + encodeURIComponent(slug);");
    });
});
