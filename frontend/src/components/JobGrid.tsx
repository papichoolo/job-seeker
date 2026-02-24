'use client';

import { useState, useMemo } from 'react';
import { JobMatch, UserProfile } from '@/types';
import { JobCard } from './JobCard';
import { JobDetailModal } from './JobDetailModal';
import { EmptyState } from './EmptyState';
import { Loader2, Sparkles } from 'lucide-react';

interface JobGridProps {
    jobs: JobMatch[];
    isLoading?: boolean;
    profile?: UserProfile | null;
}

export function JobGrid({ jobs, isLoading = false, profile = null }: JobGridProps) {
    const [selectedJob, setSelectedJob] = useState<JobMatch | null>(null);

    // Calculate min/max scores for relative scoring
    const { minScore, maxScore } = useMemo(() => {
        if (jobs.length === 0) return { minScore: 0, maxScore: 1 };
        const scores = jobs.map(j => j.score);
        return {
            minScore: Math.min(...scores),
            maxScore: Math.max(...scores),
        };
    }, [jobs]);

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-16">
                <Loader2 className="w-12 h-12 text-white animate-spin mb-4" />
                <p className="text-neutral-400">Finding your perfect matches...</p>
            </div>
        );
    }

    if (jobs.length === 0) {
        return <EmptyState />;
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2 rounded-full bg-neutral-800">
                    <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                    <h2 className="text-xl font-semibold text-white">
                        Top Matches
                    </h2>
                    <p className="text-sm text-neutral-400">
                        {jobs.length} job{jobs.length !== 1 ? 's' : ''} found based on your profile
                    </p>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {jobs.map((job, index) => (
                    <JobCard
                        key={job.job_id || index}
                        job={job}
                        rank={index + 1}
                        minScore={minScore}
                        maxScore={maxScore}
                        onClick={() => setSelectedJob(job)}
                    />
                ))}
            </div>

            {/* Job Detail Modal */}
            <JobDetailModal
                job={selectedJob}
                onClose={() => setSelectedJob(null)}
                minScore={minScore}
                maxScore={maxScore}
                profile={profile}
            />
        </div>
    );
}
