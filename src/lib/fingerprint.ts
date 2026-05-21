import { getUID, hasConsent } from './fingerprint/consent.ts';
import { getDeviceInfo, type DeviceInfo } from './fingerprint/device.ts';

export {
    dismissBanner,
    generateUID,
    getUID,
    grantConsent,
    hasConsent,
    isDismissed,
    setUID,
} from './fingerprint/consent.ts';
export { getDeviceInfo, type DeviceInfo } from './fingerprint/device.ts';
export {
    getNetworkContext,
    getNetworkParams,
    toNetworkParams,
    type NetworkContext,
    type NetworkParams,
} from './fingerprint/network.ts';

export function appendAnalytics(endpoint: string): string {
    const info: DeviceInfo = getDeviceInfo();
    let params =
        endpoint +
        `&device=${encodeURIComponent(info.device)}` +
        `&browser=${encodeURIComponent(info.browser)}` +
        `&os=${encodeURIComponent(info.os)}` +
        `&lang=${encodeURIComponent(info.lang)}` +
        `&scr=${encodeURIComponent(info.scr)}`;

    if (hasConsent()) {
        const uid = getUID();
        if (uid) params += `&uid=${encodeURIComponent(uid)}`;
        if (document.referrer) {
            try {
                params += `&ref=${encodeURIComponent(new URL(document.referrer).hostname)}`;
            } catch {
                // Ignore malformed referrer values.
            }
        }
    }

    return params;
}
