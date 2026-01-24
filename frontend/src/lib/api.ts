// API client for FastAPI backend

import { ProfileResponse, JobMatchResponse, UserProfile } from '@/types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

export async function uploadResume(file: File): Promise<ProfileResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'POST',
        body: formData,
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to upload resume');
    }

    return response.json();
}

export async function matchJobs(profile: UserProfile): Promise<JobMatchResponse> {
    const response = await fetch(`${API_BASE_URL}/jobs/match`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(profile),
    });

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to match jobs');
    }

    return response.json();
}
