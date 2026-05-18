export interface RequestProgressStep {
    readonly elapsedRatio: number;
    readonly percent: number;
    readonly label: string;
    readonly detail: string;
}

export interface RequestProgressState {
    readonly percent: number;
    readonly label: string;
    readonly detail: string;
}

const MAX_PENDING_PERCENT = 95;

export const REQUEST_PROGRESS_STEPS: readonly RequestProgressStep[] = [
    {
        elapsedRatio: 0,
        percent: 8,
        label: 'Preparing request',
        detail: 'Validating the link and request options.',
    },
    {
        elapsedRatio: 0.12,
        percent: 24,
        label: 'Checking request metadata',
        detail: 'Collecting safe request context for the shortener.',
    },
    {
        elapsedRatio: 0.28,
        percent: 46,
        label: 'Contacting shortener service',
        detail: 'Waiting for the Google Apps Script endpoint.',
    },
    {
        elapsedRatio: 0.52,
        percent: 72,
        label: 'Updating Google Sheets',
        detail: 'The backend may take a moment to write the row.',
    },
    {
        elapsedRatio: 0.76,
        percent: 88,
        label: 'Finalizing response',
        detail: 'Almost done. Waiting for the confirmed result.',
    },
];

export function getRequestProgress(elapsedMs: number, timeoutMs: number): RequestProgressState {
    const safeTimeoutMs = Math.max(1, timeoutMs);
    const safeElapsedMs = Math.max(0, elapsedMs);
    const elapsedRatio = safeElapsedMs / safeTimeoutMs;
    const activeStep = getActiveStep(elapsedRatio);
    const smoothPercent = Math.round(
        MAX_PENDING_PERCENT * (1 - Math.exp((-safeElapsedMs / safeTimeoutMs) * 2.2)),
    );

    return {
        percent: Math.min(MAX_PENDING_PERCENT, Math.max(activeStep.percent, smoothPercent)),
        label: activeStep.label,
        detail: activeStep.detail,
    };
}

function getActiveStep(elapsedRatio: number): RequestProgressStep {
    let activeStep = REQUEST_PROGRESS_STEPS[0];

    for (const step of REQUEST_PROGRESS_STEPS) {
        if (elapsedRatio < step.elapsedRatio) break;
        activeStep = step;
    }

    return activeStep;
}
