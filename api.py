"""
FastAPI Application for Job Matching Pipeline
Endpoints:
  - POST /profile: Upload PDF and extract user profile
  - POST /jobs/match: Get top 5 jobs for a user profile
"""

import os
import json
import tempfile
import uuid
from typing import List, Optional, AsyncGenerator
from dotenv import load_dotenv

load_dotenv(override=True)

import pdfplumber
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
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
    api_key=os.getenv("OPENAI_API_KEY"),
)


# In-memory storage for SSE sessions
# In production, use Redis with expiration
SESSION_STORAGE = {}
RESULT_STORAGE = {}  # Stores final parsed JSON results


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
        model="openai/gpt-oss-120b:free",
        messages=[
            {"role": "system", "content": prompt}, 
            {"role": "user", "content": resume_text}
        ],
        extra_body={"reasoning": {"enabled": True}},
        response_format={"type": "json_object"}
    )
    
    return json.loads(response.choices[0].message.content)


def get_top_jobs(user_profile: dict, top_k: int = 20, top_n: int = 10) -> list:
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
    Get top 10 job matches for a user profile.
    
    - **profile**: User profile with skills, experience, and preferences
    
    Returns top 10 jobs ranked by relevance score.
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


# ========== SSE Streaming Endpoints ==========

async def generate_profile_stream(resume_text: str, session_id: str) -> AsyncGenerator[str, None]:
    """Generates SSE events from OpenRouter LLM using async httpx.
    Accumulates content and stores final result in RESULT_STORAGE.
    """
    import httpx
    
    prompt = """
    You are an expert HR parser. Extract the following JSON schema from the resume.
    Do not output markdown code blocks. Just the raw JSON.
    Schema:
    {
      "skills": ["Skill1", "Skill2"],
      "experience_years": int,
      "location_pref": "City",
      "summary": "Brief summary of candidate"
    }
    """

    url = "https://openrouter.ai/api/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": "allenai/olmo-3.1-32b-think",
        "messages": [
            {"role": "system", "content": prompt},
            {"role": "user", "content": resume_text}
        ],
        "stream": True,
        "reasoning": {"enabled": True},
        "structured_format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "skills": {"type": "array", "items": {"type": "string"}},
                    "experience_years": {"type": "integer"},
                    "location_pref": {"type": "string"},
                    "summary": {"type": "string"}
                },
                "required": ["skills", "experience_years", "location_pref", "summary"]
            }
        }
    }
    
    # Accumulate content for final result
    accumulated_content = ""
    
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as response:
                buffer = ""
                async for chunk in response.aiter_text():
                    if chunk:
                        buffer += chunk
                        
                        while True:
                            line_end = buffer.find('\n')
                            if line_end == -1:
                                break
                            
                            line = buffer[:line_end].strip()
                            buffer = buffer[line_end + 1:]
                            
                            # Skip empty lines and SSE comments
                            if not line or line.startswith(':'):
                                continue
                            
                            if line.startswith('data: '):
                                data = line[6:]
                                if data == '[DONE]':
                                    # Store final result and send it
                                    try:
                                        final_json = json.loads(accumulated_content)
                                        RESULT_STORAGE[session_id] = {"status": "complete", "data": final_json}
                                        final_payload = json.dumps({"type": "final", "data": final_json})
                                        yield f"data: {final_payload}\n\n"
                                    except json.JSONDecodeError:
                                        # Store raw content if not valid JSON
                                        RESULT_STORAGE[session_id] = {"status": "complete", "raw": accumulated_content}
                                        final_payload = json.dumps({"type": "final", "raw": accumulated_content})
                                        yield f"data: {final_payload}\n\n"
                                    yield "data: [DONE]\n\n"
                                    return
                                
                                try:
                                    data_obj = json.loads(data)
                                    delta = data_obj.get("choices", [{}])[0].get("delta", {})
                                    
                                    # Check for reasoning/thinking content (try both field names)
                                    reasoning = delta.get("reasoning") or delta.get("reasoning_content")
                                    if reasoning:
                                        payload_out = json.dumps({"type": "thought", "chunk": reasoning})
                                        yield f"data: {payload_out}\n\n"
                                    
                                    # Check for regular content and accumulate
                                    content = delta.get("content")
                                    if content:
                                        accumulated_content += content
                                        payload_out = json.dumps({"type": "content", "chunk": content})
                                        yield f"data: {payload_out}\n\n"
                                        
                                except json.JSONDecodeError:
                                    pass
        
        # If we exit without [DONE], still store what we have
        if accumulated_content:
            try:
                final_json = json.loads(accumulated_content)
                RESULT_STORAGE[session_id] = {"status": "complete", "data": final_json}
                final_payload = json.dumps({"type": "final", "data": final_json})
                yield f"data: {final_payload}\n\n"
            except json.JSONDecodeError:
                RESULT_STORAGE[session_id] = {"status": "complete", "raw": accumulated_content}
        
        yield "data: [DONE]\n\n"

    except Exception as e:
        RESULT_STORAGE[session_id] = {"status": "error", "message": str(e)}
        error_payload = json.dumps({"type": "error", "message": str(e)})
        yield f"data: {error_payload}\n\n"


@app.post("/upload")
async def upload_resume(file: UploadFile = File(...)):
    """
    Step 1: Upload PDF, extract text, and return a Session ID.
    This is fast because it doesn't wait for the LLM.
    """
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        text = extract_text_from_pdf(tmp_path)
        if not text.strip():
            raise HTTPException(status_code=400, detail="Empty PDF")
        
        # Generate a unique session ID
        session_id = str(uuid.uuid4())
        SESSION_STORAGE[session_id] = text
        
        return {"session_id": session_id, "message": "Text extracted. Connect to /stream/{session_id} to process."}

    finally:
        os.unlink(tmp_path)


@app.get("/stream/{session_id}")
async def stream_profile(session_id: str):
    """
    Step 2: Connect via EventSource to watch the LLM think and generate.
    The final JSON result will be stored in RESULT_STORAGE.
    """
    resume_text = SESSION_STORAGE.get(session_id)
    if not resume_text:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Don't delete yet - keep for reference until result is fetched
    # del SESSION_STORAGE[session_id]

    return StreamingResponse(
        generate_profile_stream(resume_text, session_id),
        media_type="text/event-stream"
    )


@app.get("/result/{session_id}")
async def get_result(session_id: str):
    """
    Get the final parsed JSON result after streaming completes.
    This is a fallback if the 'final' SSE event was missed.
    """
    result = RESULT_STORAGE.get(session_id)
    if not result:
        # Check if session exists but result not ready
        if session_id in SESSION_STORAGE:
            return {"status": "pending", "message": "Stream not started or still in progress"}
        raise HTTPException(status_code=404, detail="Result not found")
    
    # Clean up storages
    RESULT_STORAGE.pop(session_id, None)
    SESSION_STORAGE.pop(session_id, None)
    
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)


