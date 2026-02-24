'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { JobMatch } from '@/types';
import { DollarSign, Building2, TrendingUp } from 'lucide-react';

interface JobCardProps {
    job: JobMatch;
    rank: number;
    minScore: number;
    maxScore: number;
    onClick?: () => void;
}

export function JobCard({ job, rank, minScore, maxScore, onClick }: JobCardProps) {
    // Normalize score to percentage using min-max scaling within result set
    // Maps the score range to 60-99% (top result always close to 99%, worst around 60%)
    const range = maxScore - minScore;
    const normalized = range > 0 ? (job.score - minScore) / range : 0.5;
    const scorePercentage = Math.round(60 + normalized * 39); // Maps to 60-99%

    // Determine score color based on percentage
    const getScoreColor = (percentage: number) => {
        if (percentage >= 85) return 'text-green-400 border-green-400/30 bg-green-400/10';
        if (percentage >= 70) return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
        return 'text-neutral-400 border-neutral-600 bg-neutral-800';
    };

    return (
        <Card
            className="
      group bg-neutral-900/60 border-neutral-800
      hover:bg-neutral-900/80 hover:border-neutral-700
      transition-all duration-300 hover:scale-[1.02]
      backdrop-blur-sm overflow-hidden cursor-pointer
    "
            onClick={onClick}
        >
            <CardContent className="p-6">
                {/* Header with rank and score */}
                <div className="flex items-start justify-between mb-4">
                    <Badge
                        variant="outline"
                        className="bg-neutral-800 border-neutral-700 text-neutral-300"
                    >
                        #{rank}
                    </Badge>

                    {/* Match Score Circle */}
                    <div className={`
            relative w-14 h-14 rounded-full flex items-center justify-center
            border-2 ${getScoreColor(scorePercentage)}
            transition-all duration-300 group-hover:scale-110
          `}>
                        <span className="text-lg font-bold">{scorePercentage}%</span>
                    </div>
                </div>

                {/* Job Title */}
                <h3 className="text-xl font-semibold text-white mb-1 line-clamp-2">
                    {job.title || 'Untitled Position'}
                </h3>

                {/* Company */}
                {job.company && (
                    <div className="flex items-center gap-1.5 mb-3">
                        <Building2 className="w-3.5 h-3.5 text-neutral-400" />
                        <span className="text-sm text-neutral-400">{job.company}</span>
                    </div>
                )}

                {/* Salary Tag */}
                {job.salary && (
                    <div className="flex items-center gap-2 mb-4">
                        <DollarSign className="w-4 h-4 text-green-400" />
                        <span className="text-lg font-medium text-green-400">
                            ${job.salary.toLocaleString()}/yr
                        </span>
                    </div>
                )}

                {/* Skills / Why We Picked This */}
                {job.job_skills && job.job_skills.length > 0 && (
                    <div className="border-t border-neutral-800 pt-4 mt-4">
                        <div className="flex items-center gap-2 mb-2">
                            <TrendingUp className="w-4 h-4 text-neutral-400" />
                            <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider">
                                Why We Picked This
                            </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                            {job.job_skills.slice(0, 5).map((skill) => (
                                <span
                                    key={skill}
                                    className="px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs"
                                >
                                    {skill}
                                </span>
                            ))}
                            {job.job_skills.length > 5 && (
                                <span className="px-2 py-0.5 rounded-full bg-neutral-800/50 text-neutral-500 text-xs">
                                    +{job.job_skills.length - 5} more
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
