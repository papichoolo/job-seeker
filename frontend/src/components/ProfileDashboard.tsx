'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SkillCloud } from './SkillCloud';
import { ExperienceSlider } from './ExperienceSlider';
import { UserProfile } from '@/types';
import { Search, User } from 'lucide-react';

interface ProfileDashboardProps {
    profile: UserProfile;
    onProfileChange: (profile: UserProfile) => void;
    onFindMatches: () => void;
    isLoading?: boolean;
}

export function ProfileDashboard({
    profile,
    onProfileChange,
    onFindMatches,
    isLoading = false
}: ProfileDashboardProps) {
    const handleSkillsChange = (skills: string[]) => {
        onProfileChange({ ...profile, skills });
    };

    const handleExperienceChange = (experience_years: number) => {
        onProfileChange({ ...profile, experience_years });
    };

    return (
        <Card className="bg-neutral-900/80 border-neutral-800 backdrop-blur-sm">
            <CardHeader className="border-b border-neutral-800 pb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-neutral-800">
                        <User className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <CardTitle className="text-xl text-white">Your Profile</CardTitle>
                        <p className="text-sm text-neutral-400 mt-1">
                            Review and refine your extracted profile
                        </p>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-8">
                {/* Summary */}
                {profile.summary && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                            Summary
                        </h3>
                        <p className="text-neutral-300 text-sm leading-relaxed">
                            {profile.summary}
                        </p>
                    </div>
                )}

                {/* Skills Cloud */}
                <SkillCloud
                    skills={profile.skills}
                    onSkillsChange={handleSkillsChange}
                />

                {/* Experience Slider */}
                <ExperienceSlider
                    years={profile.experience_years}
                    onYearsChange={handleExperienceChange}
                />

                {/* Location */}
                {profile.location_pref && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                            Location Preference
                        </h3>
                        <p className="text-white">{profile.location_pref}</p>
                    </div>
                )}

                {/* Find Matches Button */}
                <Button
                    onClick={onFindMatches}
                    disabled={isLoading || profile.skills.length === 0}
                    className="
            w-full py-6 text-lg font-semibold
            bg-white text-neutral-900
            hover:bg-neutral-200
            disabled:opacity-50 disabled:cursor-not-allowed
            transition-all duration-200
          "
                >
                    {isLoading ? (
                        <>
                            <div className="w-5 h-5 border-2 border-neutral-400 border-t-neutral-900 rounded-full animate-spin mr-2" />
                            Finding Matches...
                        </>
                    ) : (
                        <>
                            <Search className="w-5 h-5 mr-2" />
                            Find Matches
                        </>
                    )}
                </Button>
            </CardContent>
        </Card>
    );
}
