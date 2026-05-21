const NETWORK_LOOKUP_URL = 'https://ipapi.co/json/';
const NETWORK_LOOKUP_TIMEOUT_MS = 2500;
const MAX_NETWORK_FIELD_LENGTH = 64;
const MAX_IP_LENGTH = 45;

export interface NetworkContext {
    ip?: string;
    country?: string;
    region?: string;
    city?: string;
    tz?: string;
}

export type NetworkParams = NetworkContext & {
    network?: string;
    metadataVersion?: number;
};

export async function getNetworkContext(
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = NETWORK_LOOKUP_TIMEOUT_MS,
    lookupUrl: string = NETWORK_LOOKUP_URL,
): Promise<NetworkContext> {
    if (!lookupUrl) return {};

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));

    try {
        const response = await fetchImpl(lookupUrl, {
            cache: 'no-store',
            signal: controller.signal,
        });
        if (!response.ok) return {};

        const data = (await response.json()) as Record<string, unknown>;
        return compactNetworkContext({
            ip: cleanIp(data.ip),
            country: cleanNetworkField(data.country_name || data.country),
            region: cleanNetworkField(
                data.region || data.region_code || data.city || data.country_name,
            ),
            city: cleanNetworkField(data.city),
            tz: cleanNetworkField(data.timezone),
        });
    } catch {
        return {};
    } finally {
        clearTimeout(timeoutId);
    }
}

export function toNetworkParams(context: NetworkContext): NetworkParams {
    const normalized = compactNetworkContext({
        ip: cleanIp(context.ip),
        country: cleanNetworkField(context.country),
        region: cleanNetworkField(context.region || context.city || context.country),
        city: cleanNetworkField(context.city),
        tz: cleanNetworkField(context.tz),
    });

    if (Object.keys(normalized).length === 0) return {};

    return {
        ...normalized,
        network: JSON.stringify(normalized),
        metadataVersion: 2,
    };
}

export async function getNetworkParams(
    fetchImpl: typeof fetch = fetch,
    timeoutMs: number = NETWORK_LOOKUP_TIMEOUT_MS,
    lookupUrl: string = NETWORK_LOOKUP_URL,
): Promise<NetworkParams> {
    return toNetworkParams(await getNetworkContext(fetchImpl, timeoutMs, lookupUrl));
}

function compactNetworkContext(context: NetworkContext): NetworkContext {
    return Object.fromEntries(
        Object.entries(context).filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
}

function cleanIp(value: unknown): string {
    const ip = cleanNetworkField(value, MAX_IP_LENGTH);
    if (!ip || !/^[a-fA-F0-9:.]+$/.test(ip)) return '';
    return ip;
}

function cleanNetworkField(value: unknown, maxLength: number = MAX_NETWORK_FIELD_LENGTH): string {
    return String(value ?? '')
        .split('')
        .filter(isPrintableCharacter)
        .join('')
        .trim()
        .replace(/^[=+\-@]+/, '')
        .trim()
        .slice(0, maxLength);
}

function isPrintableCharacter(character: string): boolean {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
}
