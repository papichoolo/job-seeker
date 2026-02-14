'use client';

import { useState, useRef, useEffect } from 'react';
import { DropZone } from '@/components/DropZone';
import { ProcessingOverlay } from '@/components/ProcessingOverlay';
import { ProfileDashboard } from '@/components/ProfileDashboard';
import { JobGrid } from '@/components/JobGrid';
import { uploadResumeSSE, matchJobs } from '@/lib/api';
import { UserProfile, JobMatch, AppPhase } from '@/types';
import { ArrowLeft, Briefcase, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function Home() {
  const [phase, setPhase] = useState<AppPhase>('upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [jobs, setJobs] = useState<JobMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  // SSE streaming state
  const [thinkingText, setThinkingText] = useState('');
  const [contentText, setContentText] = useState('');
  const [processingStatus, setProcessingStatus] = useState<'uploading' | 'processing' | 'complete' | 'error'>('processing');
  const cleanupRef = useRef<(() => void) | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);

  const handleFileSelect = async (file: File) => {
    setError(null);
    setIsProcessing(true);
    setThinkingText('');
    setContentText('');
    setProcessingStatus('uploading');

    try {
      setProcessingStatus('processing');

      const cleanup = await uploadResumeSSE(file, {
        onThinking: (chunk) => {
          setThinkingText(prev => prev + chunk);
        },
        onContent: (chunk) => {
          setContentText(prev => prev + chunk);
        },
        onComplete: (profileData) => {
          setProcessingStatus('complete');
          setProfile(profileData);
          // Small delay to show completion state
          setTimeout(() => {
            setIsProcessing(false);
            setPhase('profile');
          }, 500);
        },
        onError: (errorMsg) => {
          setProcessingStatus('error');
          setError(errorMsg);
          setTimeout(() => {
            setIsProcessing(false);
          }, 1000);
        }
      });

      cleanupRef.current = cleanup;
    } catch (err) {
      setProcessingStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to upload resume');
      setTimeout(() => {
        setIsProcessing(false);
      }, 1000);
    }
  };

  const handleFindMatches = async () => {
    if (!profile) return;

    setError(null);
    setIsSearching(true);

    try {
      const response = await matchJobs(profile);
      if (response.success) {
        setJobs(response.jobs);
        setPhase('results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find matches');
    } finally {
      setIsSearching(false);
    }
  };

  const handleBack = () => {
    if (phase === 'results') {
      setPhase('profile');
      setJobs([]);
    } else if (phase === 'profile') {
      setPhase('upload');
      setProfile(null);
    }
  };

  const handleStartOver = () => {
    setPhase('upload');
    setProfile(null);
    setJobs([]);
    setError(null);
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-neutral-900 via-neutral-950 to-black -z-10" />

      <div className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Header */}
        <header className="mb-12">
          <div className="flex items-center justify-between mb-8">
            {phase !== 'upload' && (
              <Button
                variant="ghost"
                onClick={handleBack}
                className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            )}
            {phase !== 'upload' && (
              <Button
                variant="ghost"
                onClick={handleStartOver}
                className="text-neutral-400 hover:text-white hover:bg-neutral-800"
              >
                Start Over
              </Button>
            )}
          </div>

          <div className="text-center">
            <div className="flex items-center justify-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-white/10 backdrop-blur-sm">
                <Briefcase className="w-8 h-8" />
              </div>
            </div>
            <h1 className="text-4xl font-bold tracking-tight mb-2">
              Job Seeker
            </h1>
            <p className="text-neutral-400 text-lg">
              {phase === 'upload' && 'Upload your resume to find your perfect job match'}
              {phase === 'profile' && 'Review and refine your profile'}
              {phase === 'results' && 'Jobs matched to your skills'}
            </p>
          </div>
        </header>

        {/* Phase indicator */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {['upload', 'profile', 'results'].map((step, index) => (
            <div key={step} className="flex items-center">
              <div className={`
                w-3 h-3 rounded-full transition-all duration-300
                ${phase === step ? 'bg-white scale-125' :
                  ['upload', 'profile', 'results'].indexOf(phase) > index
                    ? 'bg-neutral-500' : 'bg-neutral-700'}
              `} />
              {index < 2 && (
                <div className={`
                  w-16 h-0.5 mx-2 transition-colors duration-300
                  ${['upload', 'profile', 'results'].indexOf(phase) > index
                    ? 'bg-neutral-500' : 'bg-neutral-800'}
                `} />
              )}
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-8 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-center">
            {error}
          </div>
        )}

        {/* Phase content */}
        <div className="transition-all duration-500 ease-out">
          {phase === 'upload' && (
            <div className="max-w-xl mx-auto">
              <DropZone
                onFileSelect={handleFileSelect}
                isDisabled={isProcessing}
              />
            </div>
          )}

          {phase === 'profile' && profile && (
            <div className="max-w-xl mx-auto">
              <ProfileDashboard
                profile={profile}
                onProfileChange={setProfile}
                onFindMatches={handleFindMatches}
                isLoading={isSearching}
              />
            </div>
          )}

          {phase === 'results' && (
            <JobGrid jobs={jobs} isLoading={isSearching} />
          )}
        </div>

        {/* Processing overlay */}
        <ProcessingOverlay
          isOpen={isProcessing}
          thinkingText={thinkingText}
          contentText={contentText}
          status={processingStatus}
        />
      </div>
    </main>
  );
}
