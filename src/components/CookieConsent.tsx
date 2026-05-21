import { useState, useEffect, useCallback, useRef } from 'react';
import { hasConsent, grantConsent, isDismissed, dismissBanner } from '../lib/fingerprint.ts';
import { ShieldIcon } from './icons.tsx';

export default function CookieConsent() {
    const [visible, setVisible] = useState(false);
    const [fading, setFading] = useState(false);
    const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

    useEffect(() => {
        if (!hasConsent() && !isDismissed()) {
            // Small delay so page renders first
            const id = setTimeout(() => setVisible(true), 800);
            return () => clearTimeout(id);
        }
    }, []);

    useEffect(() => {
        return () => clearTimeout(hideTimer.current);
    }, []);

    const hide = useCallback(() => {
        clearTimeout(hideTimer.current);
        setFading(true);
        hideTimer.current = setTimeout(() => setVisible(false), 300);
    }, []);

    const handleAccept = useCallback(() => {
        grantConsent();
        window.dispatchEvent(new CustomEvent('ntsm:consent'));
        hide();
    }, [hide]);

    const handleDismiss = useCallback(() => {
        dismissBanner();
        hide();
    }, [hide]);

    if (!visible) return null;

    return (
        <div
            className={`cookie-banner${fading ? ' cookie-banner--fading' : ''}`}
            role="dialog"
            aria-label="Cookie consent"
        >
            <div className="cookie-banner__icon">
                <ShieldIcon />
            </div>
            <div className="cookie-banner__text">
                <strong>Anonymous Analytics</strong>
                <p>
                    We use a cookie to track anonymous usage (device type, browser). No personal
                    data is collected.
                </p>
            </div>
            <div className="cookie-banner__actions">
                <button
                    className="btn btn-primary btn-sm"
                    onClick={handleAccept}
                    type="button"
                    data-tooltip="Allow anonymous usage cookies"
                >
                    Accept
                </button>
                <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleDismiss}
                    type="button"
                    data-tooltip="Keep the banner hidden for now"
                >
                    Remind Me Later
                </button>
            </div>
        </div>
    );
}
