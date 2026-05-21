export function formatLocalDatetime(date: Date): string {
    if (Number.isNaN(date.getTime())) return '';
    const year = date.getFullYear();
    const month = pad2(date.getMonth() + 1);
    const day = pad2(date.getDate());
    const hours = pad2(date.getHours());
    const minutes = pad2(date.getMinutes());
    return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export function getMinExpiryDatetimeLocal(now = new Date()): string {
    return formatLocalDatetime(new Date(now.getTime() + 30 * 60 * 1000));
}

export function toUtcIsoFromDatetimeLocal(value: string): string {
    if (!value) return '';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

export function formatExpiry(iso: string): string {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';

    return new Intl.DateTimeFormat(getLocale(), {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
    }).format(date);
}

function getLocale(): string {
    if (typeof navigator !== 'undefined' && navigator.language) return navigator.language;
    return 'en-US';
}

function pad2(value: number): string {
    return String(value).padStart(2, '0');
}
