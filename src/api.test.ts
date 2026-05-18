import { describe, expect, it, vi } from 'vitest';
import { ApiError, callScript } from './api.ts';

describe('callScript', () => {
    it('sends action parameters as a CORS-compatible GET request', async () => {
        const fetchImpl = vi.fn(
            async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
        );

        const data = await callScript<{ ok: boolean }>(
            'https://script.example/exec',
            'write',
            { name: 'abc', url: 'https://example.com' },
            { fetchImpl },
        );

        expect(data).toEqual({ ok: true });
        const [requestUrl, requestInit] = fetchImpl.mock.calls[0] as unknown as [
            string,
            {
                method?: string;
                redirect?: string;
                cache?: string;
                body?: unknown;
                headers?: unknown;
            },
        ];
        const url = new URL(String(requestUrl));

        expect(url.origin + url.pathname).toBe('https://script.example/exec');
        expect(Object.fromEntries(url.searchParams.entries())).toEqual({
            action: 'write',
            name: 'abc',
            url: 'https://example.com',
        });
        expect(requestInit).toMatchObject({
            method: 'GET',
            redirect: 'follow',
            cache: 'no-store',
        });
        expect(requestInit).not.toHaveProperty('body');
        expect(requestInit).not.toHaveProperty('headers');
    });

    it('maps HTTP and invalid JSON responses to stable user-safe errors', async () => {
        const httpFetch = vi.fn(async () => new Response('nope', { status: 503 }));
        await expect(
            callScript('https://script.example/exec', 'history', {}, { fetchImpl: httpFetch }),
        ).rejects.toMatchObject({
            code: 'HTTP_ERROR',
            userMessage: 'The shortener service is unavailable. Try again shortly.',
        });

        const jsonFetch = vi.fn(async () => new Response('not json', { status: 200 }));
        await expect(
            callScript('https://script.example/exec', 'history', {}, { fetchImpl: jsonFetch }),
        ).rejects.toMatchObject({
            code: 'BAD_JSON',
            userMessage: 'The shortener service returned an unreadable response.',
        });
    });

    it('normalizes aborts to a timeout error', async () => {
        const fetchImpl = vi.fn(async () => {
            throw new DOMException('The operation was aborted.', 'AbortError');
        });

        await expect(
            callScript('https://script.example/exec', 'preview', {}, { fetchImpl }),
        ).rejects.toBeInstanceOf(ApiError);
        await expect(
            callScript('https://script.example/exec', 'preview', {}, { fetchImpl }),
        ).rejects.toMatchObject({
            code: 'REQUEST_TIMEOUT',
            userMessage: 'The shortener service took too long to respond.',
        });
    });

    it('rejects requests that are too large for query-string transport', async () => {
        await expect(
            callScript(
                'https://script.example/exec',
                'bulk',
                { urls: 'https://example.com/'.repeat(700) },
                { fetchImpl: vi.fn() },
            ),
        ).rejects.toMatchObject({
            code: 'REQUEST_TOO_LARGE',
            userMessage: 'Request is too large. Try fewer or shorter URLs.',
        });
    });
});
