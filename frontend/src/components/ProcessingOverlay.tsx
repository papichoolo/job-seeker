'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ProcessingStep } from '@/types';
import { Check, Loader2 } from 'lucide-react';

interface ProcessingOverlayProps {
    isOpen: boolean;
}

const PROCESSING_STEPS: ProcessingStep[] = [
    { id: 'extract', label: 'Extracting Text...', status: 'pending' },
    { id: 'analyze', label: 'Analyzing Skills...', status: 'pending' },
    { id: 'build', label: 'Building Profile...', status: 'pending' },
];

export function ProcessingOverlay({ isOpen }: ProcessingOverlayProps) {
    const [steps, setSteps] = useState<ProcessingStep[]>(PROCESSING_STEPS);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        if (!isOpen) {
            setSteps(PROCESSING_STEPS);
            setCurrentStep(0);
            return;
        }

        // Simulate step progression
        const intervals = [500, 1500, 2500];

        intervals.forEach((delay, index) => {
            setTimeout(() => {
                setSteps(prev => prev.map((step, i) => ({
                    ...step,
                    status: i < index ? 'complete' : i === index ? 'active' : 'pending'
                })));
                setCurrentStep(index);
            }, delay);
        });
    }, [isOpen]);

    return (
        <Dialog open={isOpen}>
            <DialogContent className="sm:max-w-md bg-neutral-900 border-neutral-800" showCloseButton={false}>
                <div className="flex flex-col items-center py-8 px-4">
                    {/* Animated orb */}
                    <div className="relative mb-8">
                        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-neutral-600 to-neutral-800 animate-pulse" />
                        <div className="absolute inset-0 w-20 h-20 rounded-full bg-gradient-to-br from-white/20 to-transparent animate-spin-slow"
                            style={{ animationDuration: '3s' }} />
                    </div>

                    {/* Progress steps */}
                    <div className="w-full space-y-4">
                        {steps.map((step, index) => (
                            <div
                                key={step.id}
                                className={`
                  flex items-center gap-3 transition-all duration-500
                  ${step.status === 'pending' ? 'opacity-40' : 'opacity-100'}
                `}
                            >
                                <div className={`
                  w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                  ${step.status === 'complete'
                                        ? 'bg-white'
                                        : step.status === 'active'
                                            ? 'bg-neutral-700'
                                            : 'bg-neutral-800'
                                    }
                `}>
                                    {step.status === 'complete' ? (
                                        <Check className="w-4 h-4 text-neutral-900" />
                                    ) : step.status === 'active' ? (
                                        <Loader2 className="w-4 h-4 text-white animate-spin" />
                                    ) : (
                                        <span className="text-sm text-neutral-500">{index + 1}</span>
                                    )}
                                </div>
                                <span className={`
                  text-sm font-medium transition-colors duration-300
                  ${step.status === 'active' ? 'text-white' : 'text-neutral-400'}
                `}>
                                    {step.label}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
