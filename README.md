TODO:
1. Frontend Refining
2. Realtime Updates for Profile Generation with WebSockets/LLM thinking output.

How to Implement Step 2:
This request requires shifting from a synchronous "Wait for the whole PDF to process" model to an asynchronous **Streaming** model.

Since you are building a frontend (Next.js) and want "realtime updates" of the LLM thinking/generation, the industry standard is **Server-Sent Events (SSE)**. Webhooks are typically for server-to-server notifications (too slow for "realtime thinking"), and gRPC is complex for browser clients.

Here is the robust architecture using **FastAPI StreamingResponse** with **OpenRouter**.

### The Architecture: 2-Step Flow

1. **POST `/upload**`: Client uploads the PDF. Server extracts text and returns a `session_id`.
2. **GET `/stream/{session_id}**`: Client opens an SSE connection. Server streams the LLM "thinking" and "generation" chunks instantly.

### 1. The Backend (FastAPI + SSE)

This code handles the PDF upload and then streams the OpenAI compatible chunks (including reasoning tokens for "Thinking" models like DeepSeek-R1).

```python
import os
import json
import asyncio
import pdfplumber
import tempfile
import uuid
from typing import AsyncGenerator
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# In-memory storage for demo purposes. 
# In production, use Redis (e.g., redis.set(session_id, text, ex=300))
SESSION_STORAGE = {}

client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)

def extract_text_from_pdf(pdf_path: str) -> str:
    """Extract text from PDF file."""
    with pdfplumber.open(pdf_path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text

async def generate_profile_stream(resume_text: str) -> AsyncGenerator[str, None]:
    """Generates SSE events from OpenRouter LLM."""
    
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

    try:
        # Enable streaming on the SDK
        stream = client.chat.completions.create(
            model="deepseek/deepseek-r1", # Example "Thinking" model
            messages=[
                {"role": "system", "content": prompt}, 
                {"role": "user", "content": resume_text}
            ],
            stream=True, # <--- CRITICAL
            temperature=0.1
        )

        for chunk in stream:
            # Handle "Thinking" content (Reasoning) if the model supports it
            # OpenRouter often passes reasoning in 'reasoning_content' or just delta content
            content = chunk.choices[0].delta.content or ""
            
            # Check for reasoning field (specific to some models like DeepSeek)
            reasoning = getattr(chunk.choices[0].delta, 'reasoning_content', "")
            
            # 1. Stream Reasoning (Thinking)
            if reasoning:
                payload = json.dumps({"type": "thought", "chunk": reasoning})
                yield f"data: {payload}\n\n"

            # 2. Stream Actual Content
            if content:
                payload = json.dumps({"type": "content", "chunk": content})
                yield f"data: {payload}\n\n"
        
        # End of stream signal
        yield "data: [DONE]\n\n"

    except Exception as e:
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
    """
    resume_text = SESSION_STORAGE.get(session_id)
    if not resume_text:
        raise HTTPException(status_code=404, detail="Session not found or expired")

    # Clean up storage (optional, depends on if you want re-runs)
    del SESSION_STORAGE[session_id]

    return StreamingResponse(
        generate_profile_stream(resume_text),
        media_type="text/event-stream"
    )

```

---

### 2. The Frontend Consumption (Next.js)

You cannot use a standard `await fetch()` for this because you need to read the chunks as they arrive. Use the native `EventSource` API.

```tsx
// src/components/RealtimeProfile.tsx
'use client';
import { useState } from 'react';

export default function RealtimeProfile() {
  const [logs, setLogs] = useState<string>(""); // For "Thinking" logs
  const [jsonOutput, setJsonOutput] = useState<string>(""); // For final JSON
  const [status, setStatus] = useState("idle");

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.[0]) return;
    const file = e.target.files[0];
    setStatus("uploading");

    // 1. Upload the File
    const formData = new FormData();
    formData.append("file", file);

    const uploadRes = await fetch("http://localhost:8000/upload", {
      method: "POST",
      body: formData,
    });
    const { session_id } = await uploadRes.json();

    // 2. Open the Stream
    setStatus("processing");
    const eventSource = new EventSource(`http://localhost:8000/stream/${session_id}`);

    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        setStatus("complete");
        return;
      }

      const parsed = JSON.parse(event.data);

      if (parsed.type === "thought") {
        // Update thinking logs (realtime reasoning)
        setLogs((prev) => prev + parsed.chunk);
      } else if (parsed.type === "content") {
        // Update the JSON string being built
        setJsonOutput((prev) => prev + parsed.chunk);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      setStatus("error");
    };
  };

  return (
    <div className="p-4 grid grid-cols-2 gap-4">
      {/* Upload */}
      <div className="col-span-2">
        <input type="file" accept=".pdf" onChange={handleUpload} />
        <p>Status: {status}</p>
      </div>

      {/* Left Panel: The Brain (Thinking) */}
      <div className="bg-gray-900 text-green-400 p-4 rounded font-mono text-sm h-96 overflow-auto">
        <h3 className="text-white border-b border-gray-700 mb-2">LLM Thinking Process...</h3>
        <whitespace-pre-wrap>{logs}</whitespace-pre-wrap>
      </div>

      {/* Right Panel: The Output (JSON) */}
      <div className="bg-gray-100 p-4 rounded h-96 overflow-auto">
        <h3 className="border-b border-gray-300 mb-2">Structured Profile</h3>
        <pre className="text-sm">{jsonOutput}</pre>
      </div>
    </div>
  );
}

```
