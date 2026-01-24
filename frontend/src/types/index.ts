// TypeScript interfaces matching FastAPI Pydantic models

export interface UserProfile {
    skills: string[];
    experience_years: number;
    location_pref?: string | null;
    summary?: string | null;
}

export interface ProfileResponse {
    success: boolean;
    profile: UserProfile;
}

export interface JobMatch {
    job_id: string | null;
    title: string | null;
    salary: number | null;
    score: number;
    description: string | null;
}

export interface JobMatchResponse {
    success: boolean;
    jobs: JobMatch[];
}

// App state types
export type AppPhase = 'upload' | 'profile' | 'results';

export interface ProcessingStep {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'complete';
}
