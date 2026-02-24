'use client';

import { useEffect, useRef } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Loader2, Brain, FileJson } from 'lucide-react';

interface ProcessingOverlayProps {
    isOpen: boolean;
    thinkingText?: string;
    contentText?: string;
    status?: 'uploading' | 'processing' | 'complete' | 'error';
}

export function ProcessingOverlay({
    isOpen,
    thinkingText = '',
    contentText = '',
    status = 'processing'
}: ProcessingOverlayProps) {
    // Refs for auto-scroll
    const thinkingRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);

    // Auto-scroll when content updates
    useEffect(() => {
        if (thinkingRef.current) {
            thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
        }
    }, [thinkingText]);

    useEffect(() => {
        if (contentRef.current) {
            contentRef.current.scrollTop = contentRef.current.scrollHeight;
        }
    }, [contentText]);

    const getStatusLabel = () => {
        switch (status) {
            case 'uploading': return 'Uploading Resume...';
            case 'processing': return 'AI is analyzing your resume...';
            case 'complete': return 'Analysis Complete!';
            case 'error': return 'Error occurred';
            default: return 'Processing...';
        }
    };

    return (
        <Dialog open={isOpen}>
            <DialogContent
                className="sm:max-w-4xl bg-neutral-900 border-neutral-800 p-0 overflow-hidden"
                showCloseButton={false}
            >
                {/* Header */}
                <div className="px-6 py-4 border-b border-neutral-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 flex items-center justify-center">
                                <Loader2 className={`w-5 h-5 text-white ${status === 'processing' ? 'animate-spin' : ''}`} />
                            </div>
                            {status === 'processing' && (
                                <div className="absolute inset-0 w-10 h-10 rounded-full bg-white/10 animate-ping" />
                            )}
                        </div>
                        <div>
                            <h2 className="text-lg font-semibold text-white">{getStatusLabel()}</h2>
                            <p className="text-sm text-neutral-400">Real-time AI processing</p>
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded text-xs font-medium uppercase tracking-wider ${status === 'processing' ? 'bg-blue-600/30 text-blue-300 animate-pulse' :
                        status === 'complete' ? 'bg-green-600/30 text-green-300' :
                            status === 'error' ? 'bg-red-600/30 text-red-300' :
                                'bg-neutral-700 text-neutral-300'
                        }`}>
                        {status}
                    </span>
                </div>

                {/* Two-panel content */}
                <div className="grid grid-cols-2 gap-0 h-[400px]">
                    {/* Left Panel: Thinking/Reasoning */}
                    <div className="border-r border-neutral-800 flex flex-col">
                        <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
                            <Brain className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-medium text-neutral-300">AI Reasoning</span>
                        </div>
                        <div
                            ref={thinkingRef}
                            className="flex-1 min-h-0 p-4 overflow-y-auto bg-neutral-950 font-mono text-xs leading-relaxed"
                        >
                            {thinkingText ? (
                                <pre className="whitespace-pre-wrap text-green-400/80">{thinkingText}</pre>
                            ) : (
                                <span className="text-neutral-600 italic">
                                    {status === 'uploading' ? 'Waiting for upload...' : 'Thinking...'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Right Panel: Content/JSON */}
                    <div className="flex flex-col">
                        <div className="px-4 py-3 border-b border-neutral-800 flex items-center gap-2">
                            <FileJson className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-neutral-300">Extracted Profile</span>
                        </div>
                        <div
                            ref={contentRef}
                            className="flex-1 min-h-0 p-4 overflow-y-auto bg-neutral-900/50 font-mono text-xs leading-relaxed"
                        >
                            {contentText ? (
                                <pre className="whitespace-pre-wrap text-blue-300">{contentText}</pre>
                            ) : (
                                <span className="text-neutral-600 italic">
                                    {status === 'uploading' ? 'Waiting for upload...' : 'Generating profile...'}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-3 border-t border-neutral-800 bg-neutral-900/50">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-neutral-500">
                            Powered by AI • Real-time streaming
                        </span>
                        {status === 'processing' && (
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                <span className="text-xs text-neutral-400">Live</span>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
