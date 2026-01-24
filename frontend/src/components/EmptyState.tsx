'use client';

import { SearchX, Lightbulb } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface EmptyStateProps {
    message?: string;
}

export function EmptyState({ message = 'No matching jobs found' }: EmptyStateProps) {
    return (
        <Card className="bg-neutral-900/50 border-neutral-800">
            <CardContent className="flex flex-col items-center justify-center py-16 px-8 text-center">
                <div className="mb-6 p-4 rounded-full bg-neutral-800">
                    <SearchX className="w-12 h-12 text-neutral-500" />
                </div>

                <h3 className="text-xl font-semibold text-white mb-2">
                    {message}
                </h3>

                <p className="text-neutral-400 mb-6 max-w-md">
                    We couldn&apos;t find jobs that match your current profile criteria.
                </p>

                <div className="bg-neutral-800/50 rounded-lg p-4 max-w-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="w-4 h-4 text-yellow-400" />
                        <span className="text-sm font-medium text-yellow-400">Suggestions</span>
                    </div>
                    <ul className="text-sm text-neutral-300 space-y-1 text-left">
                        <li>• Try adding more skills to your profile</li>
                        <li>• Adjust your experience level</li>
                        <li>• Remove specific skill requirements</li>
                    </ul>
                </div>
            </CardContent>
        </Card>
    );
}
