'use client';

import { Slider } from '@/components/ui/slider';

interface ExperienceSliderProps {
    years: number;
    onYearsChange: (years: number) => void;
}

export function ExperienceSlider({ years, onYearsChange }: ExperienceSliderProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-neutral-400 uppercase tracking-wider">
                    Experience
                </h3>
                <span className="text-2xl font-bold text-white tabular-nums">
                    {years} <span className="text-sm font-normal text-neutral-400">years</span>
                </span>
            </div>

            <Slider
                value={[years]}
                onValueChange={(value) => onYearsChange(value[0])}
                min={0}
                max={30}
                step={1}
                className="py-4"
            />

            <div className="flex justify-between text-xs text-neutral-500">
                <span>Entry Level</span>
                <span>Senior</span>
                <span>Expert</span>
            </div>
        </div>
    );
}
