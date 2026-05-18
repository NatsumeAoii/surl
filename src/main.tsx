import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const root = document.getElementById('root');

if (!root) {
    throw new Error('Root element #root was not found.');
}

createRoot(root).render(
    <StrictMode>
        <App />
    </StrictMode>,
);

function clearDevelopmentServiceWorker(): void {
    navigator.serviceWorker
        .getRegistrations()
        .then((registrations) =>
            Promise.all(
                registrations.map((registration) => {
                    const scope = new URL(registration.scope);
                    if (
                        scope.origin === window.location.origin &&
                        scope.pathname === import.meta.env.BASE_URL
                    ) {
                        return registration.unregister();
                    }
                    return Promise.resolve(false);
                }),
            ),
        )
        .catch(() => {
            // Development service-worker cleanup is best-effort and must not block startup.
        });

    if ('caches' in window) {
        window.caches
            .keys()
            .then((keys) =>
                Promise.all(
                    keys
                        .filter((key) => key.startsWith('ntsm-url-'))
                        .map((key) => window.caches.delete(key)),
                ),
            )
            .catch(() => {
                // Cache cleanup is best-effort and safe to skip when unavailable or denied.
            });
    }
}

if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
        const baseUrl = import.meta.env.BASE_URL;
        navigator.serviceWorker.register(`${baseUrl}sw.js`, { scope: baseUrl }).catch(() => {
            // Offline support is optional; registration failures should not break the app.
        });
    });
} else if ('serviceWorker' in navigator) {
    window.addEventListener('load', clearDevelopmentServiceWorker);
}
