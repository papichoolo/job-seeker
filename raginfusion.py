"""
RAG Infusion Pipeline - Job Matching with Beautiful Console Output
"""

import json
import os
import pdfplumber
from openai import OpenAI
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text
from rich import box

from rerankretriever import retriever, reranker

# Initialize console and OpenAI client
console = Console()
client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY"),
)


def extract_structured_text(pdf_path: str) -> str:
    """Extract text from PDF file."""
    with pdfplumber.open(pdf_path) as pdf:
        text = ""
        for page in pdf.pages:
            text += page.extract_text() or ""
    return text


def extract_profile(pdf_path: str) -> dict:
    """Extract structured profile from resume PDF using LLM."""
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
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]Extracting text from PDF..."),
        console=console,
        transient=True
    ) as progress:
        progress.add_task("extract", total=None)
        resume_text = extract_structured_text(pdf_path)
    
    console.print("  [green]✓[/green] PDF text extracted successfully")
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]Analyzing profile with AI..."),
        console=console,
        transient=True
    ) as progress:
        progress.add_task("analyze", total=None)
        response = client.chat.completions.create(
            model="mistralai/devstral-2512:free",
            messages=[
                {"role": "system", "content": prompt}, 
                {"role": "user", "content": resume_text}
            ],
            response_format={"type": "json_object"}
        )
        profile = json.loads(response.choices[0].message.content)
    
    console.print("  [green]✓[/green] Profile analysis complete")
    return profile


def search_jobs(user_profile: dict, top_k: int = 20):
    """Search for matching jobs using vector retrieval."""
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]Searching job database..."),
        console=console,
        transient=True
    ) as progress:
        progress.add_task("search", total=None)
        search_result = retriever.search(
            query_text=str(user_profile), 
            top_k=top_k, 
            query_params={
                "user_skills": user_profile.get("skills", []),
                "user_exp": user_profile.get("experience_years", 0)
            }
        )
    
    candidates = search_result.items
    console.print(f"  [green]✓[/green] Found [cyan]{len(candidates)}[/cyan] potential matches")
    return candidates


def rerank_jobs(user_profile: dict, candidates: list) -> list:
    """Rerank candidates using cross-encoder."""
    # Prepare pairs for Cross-Encoder
    pairs = [
        [
            user_profile.get("summary") or str(user_profile.get("skills", [])), 
            f"Title: {(item.metadata or {}).get('Job_Title')} | Desc: {item.content}"
        ] 
        for item in candidates
    ]
    
    with Progress(
        SpinnerColumn(),
        TextColumn("[bold blue]Reranking with AI..."),
        console=console,
        transient=True
    ) as progress:
        progress.add_task("rerank", total=None)
        scores = reranker.predict(pairs)
    
    console.print("  [green]✓[/green] Reranking complete")
    
    # Combine results
    final_results = []
    for score, item in zip(scores, candidates):
        m = item.metadata or {}
        final_results.append({
            "job_id": m.get("id"),
            "company": m.get("company"),
            "title": m.get("Job_Title"),
            "salary": m.get("Annual_Salary_USD"),
            "job_url": m.get("Job_URL"),
            "score": float(score),
            "description": item.content
        })
    
    return sorted(final_results, key=lambda x: x["score"], reverse=True)


def display_profile(profile: dict):
    """Display extracted profile in a panel."""
    skills_text = ", ".join(profile.get("skills", []))
    content = f"""[bold]Skills:[/bold] {skills_text}
[bold]Experience:[/bold] {profile.get('experience_years', 'N/A')} years
[bold]Location:[/bold] {profile.get('location_pref', 'N/A')}"""
    
    if profile.get("summary"):
        content += f"\n[bold]Summary:[/bold] {profile['summary']}"
    
    console.print(Panel(content, title="[bold cyan]👤 User Profile", border_style="cyan"))


def display_results(jobs: list, top_n: int = 5):
    """Display top jobs in a formatted table."""
    table = Table(
        title="🎯 Top Job Matches",
        box=box.ROUNDED,
        header_style="bold magenta",
        title_style="bold white on blue"
    )
    
    table.add_column("#", style="dim", width=3)
    table.add_column("Company", style="white", min_width=15)
    table.add_column("Job Title", style="cyan", min_width=25)
    table.add_column("Salary", justify="right", style="green")
    table.add_column("Score", justify="center", style="yellow")
    
    for i, job in enumerate(jobs[:top_n], 1):
        salary = f"${job['salary']:,}" if job.get('salary') else "N/A"
        score = f"{job['score']:.3f}"
        table.add_row(str(i), job.get('company') or "N/A", job['title'] or "N/A", salary, score)
    
    console.print()
    console.print(table)
    console.print()


def run_pipeline(pdf_path: str):
    """Run the complete job matching pipeline."""
    # Header
    console.print()
    console.print(Panel.fit(
        "[bold white]Job Matching Pipeline[/bold white]\n[dim]Powered by RAG + Reranking[/dim]",
        border_style="blue"
    ))
    console.print()
    
    # Step 1: Extract Profile
    console.print("[bold]📄 Step 1: Resume Analysis[/bold]")
    user_profile = extract_profile(pdf_path)
    console.print()
    display_profile(user_profile)
    console.print()
    
    # Step 2: Search Jobs
    console.print("[bold]🔍 Step 2: Job Search[/bold]")
    candidates = search_jobs(user_profile)
    console.print()
    
    # Step 3: Rerank
    console.print("[bold]🎯 Step 3: AI Reranking[/bold]")
    ranked_jobs = rerank_jobs(user_profile, candidates)
    console.print()
    
    # Step 4: Display Results
    console.print("[bold]✅ Step 4: Results[/bold]")
    display_results(ranked_jobs, top_n=5)
    
    # Footer
    console.print("[dim]Pipeline completed successfully![/dim]")
    console.print()
    
    return ranked_jobs[:5]


if __name__ == "__main__":
    top_5_for_frontend = run_pipeline("Sourav DuttaResume.pdf")
