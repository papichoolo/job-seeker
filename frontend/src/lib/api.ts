// API client for FastAPI backend

import { ProfileResponse, JobMatchResponse, UserProfile, SSECallbacks } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function uploadResume(file: File): Promise<ProfileResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to upload resume');
    }

    return response.json();
}

export async function matchJobs(profile: UserProfile): Promise<JobMatchResponse> {
    const response = await fetch(`${API_BASE_URL}/jobs/match`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to match jobs');
    }

    return response.json();
}

/**
 * SSE-based resume upload with real-time streaming.
 * Uploads file, then opens EventSource to stream LLM output.
 * @returns cleanup function to close the EventSource
 */
export async function uploadResumeSSE(file: File, callbacks: SSECallbacks): Promise<() => void> {
    const formData = new FormData();
    formData.append('file', file);

    // Step 1: Upload file and get session ID
    const uploadResponse = await fetch(`${API_BASE_URL}/upload`, {
        method: 'POST',
        body: formData,
    });

    if (!uploadResponse.ok) {
        const error = await uploadResponse.json();
        throw new Error(error.detail || 'Failed to upload resume');
    }

    const { session_id } = await uploadResponse.json();

    // Step 2: Open SSE stream using fetch + ReadableStream (more robust than EventSource through proxies)
    const abortController = new AbortController();

    (async () => {
        try {
            const streamResponse = await fetch(`${API_BASE_URL}/stream/${session_id}`, {
                signal: abortController.signal,
                headers: {
                    'Accept': 'text/event-stream',
                },
            });

            if (!streamResponse.ok || !streamResponse.body) {
                callbacks.onError('Failed to connect to stream');
                return;
            }

            const reader = streamResponse.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { value, done } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed || !trimmed.startsWith('data: ')) continue;

                    const data = trimmed.slice(6);
                    if (data === '[DONE]') {
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);

                        if (parsed.type === 'thought') {
                            callbacks.onThinking?.(parsed.chunk);
                        } else if (parsed.type === 'content') {
                            callbacks.onContent?.(parsed.chunk);
                        } else if (parsed.type === 'final') {
                            const finalData = parsed.data || parsed.raw;
                            if (typeof finalData === 'object') {
                                callbacks.onComplete(finalData as UserProfile);
                            } else {
                                try {
                                    callbacks.onComplete(JSON.parse(finalData) as UserProfile);
                                } catch {
                                    callbacks.onError('Invalid profile data received');
                                }
                            }
                        } else if (parsed.type === 'error') {
                            callbacks.onError(parsed.message);
                        }
                    } catch (err) {
                        console.error('SSE parse error:', err);
                    }
                }
            }
        } catch (err) {
            if ((err as Error).name !== 'AbortError') {
                callbacks.onError('Connection lost during processing');
            }
        }
    })();

    // Return cleanup function
    return () => abortController.abort();
}

