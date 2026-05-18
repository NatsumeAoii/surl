import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const redirectHtml = readFileSync(resolve(process.cwd(), 'public/404.html'), 'utf8');

describe('redirect destination preview loading state', () => {
  it('renders a sandbox preview loading state before the destination resolves', () => {
    expect(redirectHtml).toContain('id="browser-preview-loading"');
    expect(redirectHtml).toContain('browser-preview--loading');
    expect(redirectHtml).toContain('Loading secure destination preview...');
    expect(redirectHtml).toContain('Preparing sandboxed preview...');
    expect(redirectHtml).toContain('Preview is still loading');
    expect(redirectHtml).toContain('This site may block embedded previews.');
    expect(redirectHtml).toContain('showDestinationPreviewLoading');
  });

  it('keeps preview execution sandboxed while supporting common embed providers', () => {
    expect(redirectHtml).toContain('sandbox="allow-scripts allow-presentation"');
    expect(redirectHtml).not.toContain('sandbox="allow-scripts allow-same-origin');
    expect(redirectHtml).not.toContain('sandbox="allow-same-origin');
    expect(redirectHtml).toContain('createEmbeddablePreviewUrl');
    expect(redirectHtml).toContain('youtube-nocookie.com/embed/');
    expect(redirectHtml).toContain('music.youtube.com');
    expect(redirectHtml).toContain('player.vimeo.com/video/');
    expect(redirectHtml).toContain('open.spotify.com/embed/');
  });

  it('shows the full original destination URL in the summary card', () => {
    expect(redirectHtml).toContain('Destination URL');
    expect(redirectHtml).toContain('function updateDestinationSummary(value)');
    expect(redirectHtml).toContain("$('preview-domain').textContent = value;");
    expect(redirectHtml).toContain('Host: ');
    expect(redirectHtml).toContain('Loading full destination...');
    expect(redirectHtml).not.toContain("$('preview-domain').textContent = data.domain || slug;");
  });

  it('opens resolved destinations in a new tab instead of replacing the preview page', () => {
    expect(redirectHtml).toContain('<a');
    expect(redirectHtml).toContain('id="btn-proceed"');
    expect(redirectHtml).toContain('target="_blank"');
    expect(redirectHtml).toContain('rel="noopener noreferrer"');
    expect(redirectHtml).toContain('function setOpenDestinationHref(value)');
    expect(redirectHtml).toContain("$('btn-proceed').href = value;");
    expect(redirectHtml).toContain('function prepareDestinationTab()');
    expect(redirectHtml).toContain("window.open('', '_blank')");
    expect(redirectHtml).toContain('destinationWindow.opener = null;');
    expect(redirectHtml).toContain('currentDestinationUrl = value;');
    expect(redirectHtml).toContain('function openResolvedDestination(url, destinationWindow)');
    expect(redirectHtml).toContain('destinationWindow.location.replace(url);');
    expect(redirectHtml).toContain("fail('New tab blocked'");
    expect(redirectHtml).not.toContain('window.open(currentDestinationUrl');
    expect(redirectHtml).not.toContain('location.href = currentDestinationUrl');
    expect(redirectHtml).not.toContain("showState('s-loading');\n          return api('read'");
    expect(redirectHtml).not.toContain('location.replace(data.url)');
  });
});
