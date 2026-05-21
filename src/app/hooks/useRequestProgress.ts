import { useEffect, useState } from 'react';
import { getRequestProgress, type RequestProgressState } from '../../lib/loadingProgress.ts';

export function useRequestProgress(loading: boolean, timeoutMs: number): RequestProgressState {
    const [requestProgress, setRequestProgress] = useState<RequestProgressState>(() =>
        getRequestProgress(0, timeoutMs),
    );

    useEffect(() => {
        if (!loading) {
            const resetTimer = window.setTimeout(() => {
                setRequestProgress(getRequestProgress(0, timeoutMs));
            }, 0);
            return () => window.clearTimeout(resetTimer);
        }

        const startedAt = Date.now();
        const startTimer = window.setTimeout(() => {
            setRequestProgress(getRequestProgress(0, timeoutMs));
        }, 0);
        const interval = window.setInterval(() => {
            setRequestProgress(getRequestProgress(Date.now() - startedAt, timeoutMs));
        }, 350);

        return () => {
            window.clearTimeout(startTimer);
            window.clearInterval(interval);
        };
    }, [loading, timeoutMs]);

    return requestProgress;
}
