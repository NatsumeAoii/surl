import { describe, expect, it, vi } from 'vitest';
import { ApiError, callScript } from './api.ts';

describe('callScript', () => {
    it('posts action parameters as a simple text request', async () => {
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
        expect(fetchImpl).toHaveBeenCalledWith(
            'https://script.example/exec',
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify({ action: 'write', name: 'abc', url: 'https://example.com' }),
                headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
            }),
        );
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
});
