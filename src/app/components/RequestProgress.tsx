import type { RequestProgressState } from '../../lib/loadingProgress.ts';

export function RequestProgress({ progress }: { progress: RequestProgressState }) {
    return (
        <div className="request-progress" role="status" aria-live="polite">
            <div className="request-progress__header">
                <span>{progress.label}</span>
                <strong>{progress.percent}%</strong>
            </div>
            <div
                className="request-progress__bar"
                role="progressbar"
                aria-label="Shortener request progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress.percent}
            >
                <span
                    className="request-progress__bar-fill"
                    style={{ width: `${progress.percent}%` }}
                />
            </div>
            <p>{progress.detail}</p>
        </div>
    );
}
