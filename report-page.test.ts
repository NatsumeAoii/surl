import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const redirectHtml = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');
const reportHtml = readFileSync(resolve(process.cwd(), 'public/report.html'), 'utf8');

describe('report page', () => {
    it('moves report handling to a dedicated static page', () => {
        expect(redirectHtml).toContain("BASE_PATH + 'report.html?'");
        expect(redirectHtml).toContain('openReportPage');
        expect(reportHtml).toContain('<title>Report Link - S.url</title>');
        expect(reportHtml).toContain('<meta name="robots" content="noindex,nofollow" />');
        expect(reportHtml).toContain('var REQUEST_TIMEOUT_MS = 30000;');
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
        expect(reportHtml).toContain('https://ipapi.co/json/');
        expect(reportHtml).toContain('function getNetworkContext()');
        expect(reportHtml).toContain('reason: getSelectedReason()');
        expect(reportHtml).toContain('description: getDescription()');
        expect(reportHtml).toContain('destination: getSafeDestination()');
        expect(reportHtml).toContain('Object.assign({}, networkContext');
        expect(reportHtml).toContain('networkContext.network = JSON.stringify(networkContext);');
        expect(reportHtml).toContain('networkContext.metadataVersion = 2;');
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
