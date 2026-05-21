import { useCallback, useEffect, useState } from 'react';
import type { Theme } from '../types.ts';

function getInitialTheme(): Theme {
    try {
        const stored = localStorage.getItem('ntsm-theme');
        if (stored === 'light' || stored === 'dark') return stored;
    } catch {
        // Storage can be blocked in hardened browser contexts.
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function useTheme(): [Theme, () => void] {
    const [theme, setTheme] = useState<Theme>(getInitialTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
        try {
            localStorage.setItem('ntsm-theme', theme);
        } catch {
            // Non-critical preference persistence failure.
        }
    }, [theme]);

    const toggleTheme = useCallback(() => {
        setTheme((currentTheme) => (currentTheme === 'dark' ? 'light' : 'dark'));
    }, []);

    return [theme, toggleTheme];
}
