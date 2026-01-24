"""
FastAPI Application for Job Matching Pipeline
Endpoints:
  - POST /profile: Upload PDF and extract user profile
  - POST /jobs/match: Get top 5 jobs for a user profile
"""

import os
import json
import tempfile
from typing import List, Optional

import pdfplumber
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

from rerankretriever import retriever, reranker

# Initialize app and client
app = FastAPI(
    title="Job Matcher API",
    description="AI-powered job matching using RAG and reranking",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)


# ========== Pydantic Models ==========

class UserProfile(BaseModel):
    skills: List[str]
    experience_years: int
    location_pref: Optional[str] = None
    summary: Optional[str] = None


class ProfileResponse(BaseModel):
    success: bool
    profile: UserProfile


class JobMatch(BaseModel):
    job_id: Optional[str]
    title: Optional[str]
    salary: Optional[int]
    score: float
    description: Optional[str]


class JobMatchResponse(BaseModel):
    success: bool
    jobs: List[JobMatch]


# ========== Helper Functions ==========

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF file."""
    with pdfplumber.open(pdf_path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text


def extract_profile_from_text(resume_text: str) -> dict:
    """Extract structured profile from resume text using LLM."""
    prompt = """
    Extract JSON from resume.
    Schema:
    {
      "skills": ["Skill1", "Skill2"],
      "experience_years": int,
      "location_pref": "City",
      "summary": "Brief summary of candidate"
    }
    """
    
    response = client.chat.completions.create(
        model="mistralai/devstral-2512:free",
        messages=[
            {"role": "system", "content": prompt}, 
            {"role": "user", "content": resume_text}
        ],
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


def get_top_jobs(user_profile: dict, top_k: int = 20, top_n: int = 5) -> list:
    """Search and rerank jobs for a user profile."""
    # Search with vector retrieval
    search_result = retriever.search(
        query_text=str(user_profile), 
        top_k=top_k, 
        query_params={
            "user_skills": user_profile.get("skills", []),
            "user_exp": user_profile.get("experience_years", 0)
        }
    )
    
    candidates = search_result.items
    
    if not candidates:
        return []
    
    # Prepare pairs for reranking
    pairs = [
        [
            user_profile.get("summary") or str(user_profile.get("skills", [])), 
            f"Title: {(item.metadata or {}).get('Job_Title')} | Desc: {item.content}"
        ] 
        for item in candidates
    ]
    
    # Rerank with cross-encoder
    scores = reranker.predict(pairs)
    
    # Combine and sort results
    final_results = []
    for score, item in zip(scores, candidates):
        m = item.metadata or {}
        final_results.append({
            "job_id": m.get("id"),
            "title": m.get("Job_Title"),
            "salary": m.get("Annual_Salary_USD"),
            "score": float(score),
            "description": item.content
        })
    
    return sorted(final_results, key=lambda x: x["score"], reverse=True)[:top_n]


# ========== API Endpoints ==========

@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Job Matcher API is running"}


@app.post("/profile", response_model=ProfileResponse)
async def upload_profile(file: UploadFile = File(...)):
    """
    Upload a PDF resume and extract user profile.
    
    - **file**: PDF file containing the resume
    
    Returns extracted profile with skills, experience, location preference, and summary.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")
    
    try:
        # Save uploaded file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Extract text and profile
        resume_text = extract_text_from_pdf(tmp_path)
        
        if not resume_text.strip():
            raise HTTPException(status_code=400, detail="Could not extract text from PDF")
        
        profile_data = extract_profile_from_text(resume_text)
        
        # Clean up temp file
        os.unlink(tmp_path)
        
        return ProfileResponse(
            success=True,
            profile=UserProfile(**profile_data)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@app.post("/jobs/match", response_model=JobMatchResponse)
async def match_jobs(profile: UserProfile):
    """
    Get top 5 job matches for a user profile.
    
    - **profile**: User profile with skills, experience, and preferences
    
    Returns top 5 jobs ranked by relevance score.
    """
    try:
        profile_dict = profile.model_dump()
        top_jobs = get_top_jobs(profile_dict)
        
        return JobMatchResponse(
            success=True,
            jobs=[JobMatch(**job) for job in top_jobs]
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error matching jobs: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
