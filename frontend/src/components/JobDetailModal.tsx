'use client';

import { useState, useEffect, useRef } from 'react';
import { JobMatch, UserProfile } from '@/types';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
    DialogClose,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    DollarSign,
    Building2,
    ExternalLink,
    Brain,
    X,
    Loader2,
} from 'lucide-react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface JobDetailModalProps {
    job: JobMatch | null;
    onClose: () => void;
    minScore: number;
    maxScore: number;
    profile?: UserProfile | null;
}

export function JobDetailModal({ job, onClose, minScore, maxScore, profile }: JobDetailModalProps) {
    const [explanation, setExplanation] = useState('');
    const [isExplaining, setIsExplaining] = useState(false);
    const [explainError, setExplainError] = useState<string | null>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Fetch explanation when modal opens with a job + profile
    useEffect(() => {
        if (!job || !profile) {
            setExplanation('');
            setIsExplaining(false);
            setExplainError(null);
            return;
        }

        // Start the SSE stream
        const controller = new AbortController();
        abortRef.current = controller;
        setExplanation('');
        setIsExplaining(true);
        setExplainError(null);

        (async () => {
            try {
                const res = await fetch(`${API_BASE_URL}/jobs/explain`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ profile, job }),
                    signal: controller.signal,
                });

                if (!res.ok || !res.body) {
                    setExplainError('Failed to get explanation');
                    setIsExplaining(false);
                    return;
                }

                const reader = res.body.getReader();
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
                            setIsExplaining(false);
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            if (parsed.type === 'content') {
                                setExplanation(prev => prev + parsed.chunk);
                            } else if (parsed.type === 'final') {
                                setExplanation(parsed.text);
                                setIsExplaining(false);
                            } else if (parsed.type === 'error') {
                                setExplainError(parsed.message);
                                setIsExplaining(false);
                            }
                            // We intentionally skip 'thought' type — no need to show reasoning here
                        } catch {
                            // skip malformed JSON
                        }
                    }
                }

                setIsExplaining(false);
            } catch (err) {
                if ((err as Error).name !== 'AbortError') {
                    setExplainError('Connection failed');
                    setIsExplaining(false);
                }
            }
        })();

        return () => {
            controller.abort();
        };
    }, [job, profile]);

    if (!job) return null;

    // Same normalization as JobCard
    const range = maxScore - minScore;
    const normalized = range > 0 ? (job.score - minScore) / range : 0.5;
    const scorePercentage = Math.round(60 + normalized * 39);

    const getScoreColor = (percentage: number) => {
        if (percentage >= 85) return 'text-green-400 border-green-400/30 bg-green-400/10';
        if (percentage >= 70) return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
        return 'text-neutral-400 border-neutral-600 bg-neutral-800';
    };

    return (
        <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-2xl bg-neutral-900 border-neutral-800 p-0 overflow-hidden max-h-[85vh] flex flex-col">
                {/* Header */}
                <div className="px-6 pt-6 pb-4 border-b border-neutral-800">
                    <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <DialogHeader className="text-left">
                                <DialogTitle className="text-2xl font-bold text-white leading-tight">
                                    {job.title || 'Untitled Position'}
                                </DialogTitle>
                                {job.company && (
                                    <DialogDescription className="flex items-center gap-2 mt-2 text-neutral-300 text-base">
                                        <Building2 className="w-4 h-4 text-neutral-400 shrink-0" />
                                        {job.company}
                                    </DialogDescription>
                                )}
                            </DialogHeader>
                        </div>

                        {/* Match Score */}
                        <div className={`
                            relative w-16 h-16 rounded-full flex items-center justify-center shrink-0
                            border-2 ${getScoreColor(scorePercentage)}
                        `}>
                            <span className="text-xl font-bold">{scorePercentage}%</span>
                        </div>
                    </div>

                    {/* Quick stats row */}
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                        {job.salary && (
                            <Badge variant="outline" className="bg-green-400/10 border-green-400/30 text-green-400 gap-1.5 py-1 px-3">
                                <DollarSign className="w-3.5 h-3.5" />
                                ${job.salary.toLocaleString()}/yr
                            </Badge>
                        )}
                        {job.job_id && (
                            <Badge variant="outline" className="bg-neutral-800 border-neutral-700 text-neutral-400 py-1 px-3">
                                ID: {job.job_id}
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-6">
                    {/* Job Skills */}
                    {job.job_skills && job.job_skills.length > 0 && (
                        <div>
                            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
                                Required Skills
                            </h3>
                            <div className="flex flex-wrap gap-2">
                                {job.job_skills.map((skill) => (
                                    <span
                                        key={skill}
                                        className="px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm"
                                    >
                                        {skill}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Full Description */}
                    {job.description && (
                        <div>
                            <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider mb-3">
                                Job Description
                            </h3>
                            <p className="text-neutral-200 leading-relaxed whitespace-pre-wrap">
                                {job.description}
                            </p>
                        </div>
                    )}

                    {/* Why This Was Recommended — Live AI Explanation */}
                    <div className="rounded-lg border border-neutral-700/50 bg-neutral-800/40 p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="p-1.5 rounded-md bg-purple-500/10">
                                <Brain className="w-4 h-4 text-purple-400" />
                            </div>
                            <h3 className="text-sm font-medium text-neutral-300">
                                Why This Was Recommended to You
                            </h3>
                            {isExplaining && (
                                <Loader2 className="w-3.5 h-3.5 text-purple-400 animate-spin ml-auto" />
                            )}
                        </div>
                        <div className="text-sm leading-relaxed">
                            {explainError ? (
                                <p className="text-red-400">{explainError}</p>
                            ) : explanation ? (
                                <p className="text-neutral-200">{explanation}</p>
                            ) : isExplaining ? (
                                <p className="text-neutral-500 italic">Analyzing match...</p>
                            ) : !profile ? (
                                <p className="text-neutral-500 italic">
                                    Profile not available — explanation requires your profile data.
                                </p>
                            ) : (
                                <p className="text-neutral-500 italic">Waiting...</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <DialogFooter className="px-6 py-4 border-t border-neutral-800 bg-neutral-900/80 sm:justify-between">
                    <DialogClose asChild>
                        <Button
                            variant="ghost"
                            className="text-neutral-400 hover:text-white hover:bg-neutral-800"
                        >
                            <X className="w-4 h-4 mr-2" />
                            Close
                        </Button>
                    </DialogClose>
                    {job.job_url ? (
                        <Button
                            asChild
                            className="bg-white text-black hover:bg-neutral-200 font-medium"
                        >
                            <a href={job.job_url} target="_blank" rel="noopener noreferrer">
                                <ExternalLink className="w-4 h-4 mr-2" />
                                Apply Now
                            </a>
                        </Button>
                    ) : (
                        <Button disabled className="bg-neutral-700 text-neutral-400 cursor-not-allowed font-medium">
                            <ExternalLink className="w-4 h-4 mr-2" />
                            No Link Available
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
