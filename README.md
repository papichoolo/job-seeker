# Job Seeker - AI Powered Job Matcher

A modern job matching platform that uses advanced RAG (Retrieval-Augmented Generation) and LLMs to match your resume with the perfect job opportunities.

## 🚀 Key Features

- **Real-time AI Profile Extraction**: Upload your PDF resume and watch as the AI analyzes it in real-time, showing its "thinking" process and extracting skills, experience, and summaries instantly.
- **Smart Job Matching**: Uses vector search combined with cross-encoder reranking to find the most relevant jobs based on your unique profile.
- **AI Job Explanations**: Stream real-time, personalized explanations of why a specific job is a strong match for your unique profile.
- **Interactive Dashboard**: Refine your extracted profile, adjust experience levels, and modify skills before searching.
- **Sleek UI**: Built with Next.js and Tailwind CSS for a premium, responsive user experience.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, React, Tailwind CSS, Lucide Icons
- **Backend**: FastAPI, Uvicorn, Python
- **AI/ML**: 
  - OpenRouter (DeepSeek/OpenAI) for profile extraction
  - `rerankretriever` for vector search and reranking
  - Server-Sent Events (SSE) for real-time streaming

## 📦 Installation & Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- OpenRouter API Key

### Backend Setup

1. Navigate to the project root:
   ```bash
   cd job-seeker
   ```

2. Create and activate a virtual environment:
   ```bash
   python -m venv venv
   # Windows:
   venv\Scripts\activate
   # Linux/Mac:
   source venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install fastapi uvicorn openai pdfplumber python-dotenv
   # Install other dependencies as required by your specific reranker implementation
   ```

4. Create a `.env` file in the root directory:
   ```env
   OPENAI_API_KEY=your_openrouter_api_key_here
   ```

5. Run the server:
   ```bash
   uvicorn api:app --reload
   ```

### Frontend Setup

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser.

## 🔌 API Endpoints

- `POST /upload`: Upload PDF resume, extract text, and get a `session_id`.
- `GET /stream/{session_id}`: SSE endpoint to stream the LLM's reasoning and profile extraction.
- `GET /result/{session_id}`: Get the final extracted JSON profile.
- `POST /jobs/match`: Get top matching jobs for a profile.
- `POST /jobs/explain`: SSE endpoint to stream an AI explanation of why a job matches a profile.
- `POST /profile`: (Legacy) Direct profile extraction from PDF.

## 🔄 Real-time Streaming Architecture

The application uses real-time streaming to ensure a highly responsive UI:

1. **Profile Extraction**:
   - **Upload**: Client POSTs the PDF to `/upload`. Server extracts text and returns a `session_id`.
   - **Stream**: Client connects to `/stream/{session_id}` via EventSource. The server streams the LLM's reasoning and generated JSON content in real-time.

2. **Job Match Explanations**:
   - Client POSTs the user profile and job details to `/jobs/explain`.
   - The server streams the AI's explanation of the match in real-time using Server-Sent Events (SSE).

## 📄 License

MIT

