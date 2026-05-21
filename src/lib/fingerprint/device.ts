export interface DeviceInfo {
    device: string;
    browser: string;
    os: string;
    lang: string;
    scr: string;
}

export function getDeviceInfo(): DeviceInfo {
    const ua = navigator.userAgent;
    return {
        device: detectDevice(ua),
        browser: detectBrowser(ua),
        os: detectOS(ua),
        lang: (navigator.language || '').slice(0, 10),
        scr: `${window.screen.width}x${window.screen.height}`,
    };
}

function detectDevice(ua: string): string {
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
    if (/mobile|iphone|ipod|android.*mobile|opera mini|iemobile/i.test(ua)) return 'mobile';
    return 'desktop';
}

function detectBrowser(ua: string): string {
    if (/edg\//i.test(ua)) return extract(ua, /edg\/([\d.]+)/i, 'Edge');
    if (/opr\//i.test(ua) || /opera/i.test(ua)) {
        return extract(ua, /(?:opr|opera)\/([\d.]+)/i, 'Opera');
    }
    if (/vivaldi/i.test(ua)) return extract(ua, /vivaldi\/([\d.]+)/i, 'Vivaldi');
    if (/brave/i.test(ua)) return 'Brave';
    if (/yabrowser/i.test(ua)) return extract(ua, /yabrowser\/([\d.]+)/i, 'Yandex');
    if (/samsungbrowser/i.test(ua)) return extract(ua, /samsungbrowser\/([\d.]+)/i, 'Samsung');
    if (/ucbrowser/i.test(ua)) return extract(ua, /ucbrowser\/([\d.]+)/i, 'UC Browser');
    if (/firefox|fxios/i.test(ua)) return extract(ua, /(?:firefox|fxios)\/([\d.]+)/i, 'Firefox');
    if (/crios/i.test(ua)) return extract(ua, /crios\/([\d.]+)/i, 'Chrome');
    if (/chrome/i.test(ua) && !/chromium/i.test(ua)) {
        return extract(ua, /chrome\/([\d.]+)/i, 'Chrome');
    }
    if (/chromium/i.test(ua)) return extract(ua, /chromium\/([\d.]+)/i, 'Chromium');
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) {
        return extract(ua, /version\/([\d.]+)/i, 'Safari');
    }
    if (/trident|msie/i.test(ua)) return 'IE';
    return 'Unknown';
}

function detectOS(ua: string): string {
    if (/windows nt 10/i.test(ua)) return 'Windows 10+';
    if (/windows nt 6\.3/i.test(ua)) return 'Windows 8.1';
    if (/windows nt 6\.2/i.test(ua)) return 'Windows 8';
    if (/windows nt 6\.1/i.test(ua)) return 'Windows 7';
    if (/windows/i.test(ua)) return 'Windows';
    if (/mac os x ([\d_]+)/i.test(ua)) {
        return `macOS ${ua.match(/mac os x ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || ''}`;
    }
    if (/cros/i.test(ua)) return 'Chrome OS';
    if (/iphone|ipad|ipod/i.test(ua)) {
        return `iOS ${ua.match(/os ([\d_]+)/i)?.[1]?.replace(/_/g, '.') || ''}`;
    }
    if (/android ([\d.]+)/i.test(ua)) {
        return `Android ${ua.match(/android ([\d.]+)/i)?.[1] || ''}`;
    }
    if (/linux/i.test(ua)) return 'Linux';
    return 'Unknown';
}

function extract(ua: string, pattern: RegExp, name: string): string {
    const match = ua.match(pattern);
    const version = match?.[1]?.split('.').slice(0, 2).join('.') || '';
    return version ? `${name} ${version}` : name;
}
