import os
import hashlib
import re
import time
import random
import logging
from datetime import datetime, timezone
from typing import Optional, List

import httpx
from bs4 import BeautifulSoup
from pydantic import BaseModel
from dotenv import load_dotenv

from neo4j import GraphDatabase
from neo4j_graphrag.embeddings import SentenceTransformerEmbeddings

# Load environment variables
load_dotenv(override=True)

# ---------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------
# Configuration & Schemas
# ---------------------------------------------------------
MAX_JOBS_PER_COMPANY = 15

# DB credentials
URI = os.getenv("URI")
NEO4J_USER = os.getenv("USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("PASSWORD")
AUTH = (NEO4J_USER, NEO4J_PASSWORD)

class JobListing(BaseModel):
    """Normalized job listing schema used during extraction."""
    job_id: str = "" # Generated later as MD5(Job_URL)
    Company_Name: str = "Unknown"
    Job_Title: str
    Department: str = "Not Specified"
    Years_of_Experience: str = "Not Specified"
    Annual_Salary_USD: Optional[int] = None
    Location: str = "India"
    Work_Type: str = "Not Specified"
    Required_Skills: str = ""
    Job_Description: str = ""
    Job_URL: str = ""
    
    # Tracking metadata
    _platform: str = ""
    _scraped_at: str = ""

# Curated skills list to prevent false positives
SKILL_KEYWORDS = {
    # Programming
    "python", "java", "javascript", "typescript", "golang",
    "c++", "c#", "ruby", "php", "swift", "kotlin",
    # Frameworks
    "react", "angular", "vue.js", "next.js", "django", "flask", "fastapi",
    "spring boot", "node.js", "ruby on rails", "laravel", ".net",
    # Data/ML
    "machine learning", "deep learning", "nlp", "computer vision", "tensorflow",
    "pytorch", "scikit-learn", "pandas", "numpy", "apache spark", "hadoop", "kafka",
    "data engineering", "data science", "data analytics", "airflow",
    # Cloud/Infra
    "aws", "azure", "gcp", "docker", "kubernetes",
    "terraform", "ci/cd", "jenkins", "github actions", "microservices",
    # Databases
    "postgresql", "mysql", "mongodb", "redis", "elasticsearch", "dynamodb",
    "cassandra", "snowflake", "bigquery",
    # Tools/Practices
    "git", "agile", "rest api", "graphql", "grpc",
    # Domains
    "fintech", "saas", "b2b", "b2c", "cybersecurity", "gdpr"
}

# ---------------------------------------------------------
# Transformation Helpers
# ---------------------------------------------------------
def clean_html(html_text: str) -> str:
    """Strip HTML tags and normalize whitespace."""
    if not html_text:
        return ""
    soup = BeautifulSoup(html_text, "lxml")
    text = soup.get_text(separator=" ", strip=True)
    return re.sub(r'\s+', ' ', text).strip()

def extract_keywords(text: str) -> List[str]:
    """Extract matching skill keywords using strict word boundaries."""
    if not text:
        return []
    text_lower = text.lower()
    found = []
    # Workaround for phrases (e.g., "react.js", "c++")
    text_lower_clean = re.sub(r'[^\w\s\.\+#-]', ' ', text_lower)
    
    for kw in sorted(SKILL_KEYWORDS):
        # Escape for regex but handle special chars intelligently
        safe_kw = re.escape(kw)
        pattern = r'\b' + safe_kw + r'(?!\w)' # Ensure end boundary holds for things like c++
        # Some manual fixing for chars that don't play well with \b at the end
        if kw.endswith('+') or kw.endswith('#'):
            pattern = r'\b' + safe_kw
            
        if re.search(pattern, text_lower_clean):
            found.append(kw)
    return found

def smart_description(raw_html: str, max_len: int = 1500) -> str:
    """Build a clean JD stripped of standard boilerplates."""
    cleaned = clean_html(raw_html)
    if not cleaned: return ""
    
    # Strip common boilerplate headings
    boilerplate_end_markers = [
        r'about the role', r'what you\'ll do', r'what you will do',
        r'responsibilities', r'the role', r'your role', r'about the job',
        r'job description', r'key responsibilities', r'what we\'re looking for',
        r'role overview', r'position overview'
    ]
    
    trimmed = cleaned
    for marker in boilerplate_end_markers:
        match = re.search(marker, cleaned, re.IGNORECASE)
        if match:
            trimmed = cleaned[match.start():].strip()
            break
            
    # Keep up to max_len
    return trimmed[:max_len]

def extract_work_type(text: str) -> str:
    """Guess work type from text (location + title context typically)."""
    t = text.lower()
    if "remote" in t: return "Remote"
    elif "hybrid" in t: return "Hybrid"
    elif "on-site" in t or "onsite" in t or "office" in t: return "On-site"
    return "Not Specified"

def generate_job_id(url: str) -> str:
    """Generate a stable MD5 hash from the job URL."""
    if not url:
        return f"MISSING_{int(time.time())}"
    return hashlib.md5(url.encode('utf-8')).hexdigest()

# ---------------------------------------------------------
# Extraction Plugins
# ---------------------------------------------------------

BROWSER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-CH-UA": '"Chromium";v="131", "Google Chrome";v="131"',
    "Sec-CH-UA-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
}

def scrape_internshala(category: str = "work-from-home", pages: int = 3) -> List[JobListing]:
    """Scrape job/internship listings from Internshala manually."""
    all_jobs = []
    
    for page in range(1, pages + 1):
        url = f"https://internshala.com/jobs/{category}-jobs/page-{page}"
        logger.info(f"Fetching Internshala page {page}: {url}")
        
        try:
            resp = httpx.get(url, headers=BROWSER_HEADERS, timeout=15, follow_redirects=True)
            resp.raise_for_status()
        except httpx.HTTPError as e:
            logger.error(f"HTTP error on Internshala page {page}: {e}")
            continue
        
        if "cf-challenge" in resp.text.lower() or "cloudflare" in resp.text.lower():
            logger.warning(f"Cloudflare challenge detected on page {page}")
            continue
        
        soup = BeautifulSoup(resp.text, "lxml")
        job_cards = soup.select(".individual_internship, .internship_meta, .individual_job")
        
        if not job_cards:
            job_cards = soup.select("[class*='internship'], [class*='job_listing']")
        
        if not job_cards:
            continue
            
        for card in job_cards:
            try:
                title_el = card.select_one(".job-title-href, .profile a, h3 a, .heading_4_5 a")
                title = title_el.get_text(strip=True) if title_el else "Unknown"
                
                company_el = card.select_one(".company_name a, .company-name, .heading_6")
                company = company_el.get_text(strip=True) if company_el else "Unknown"
                
                loc_el = card.select_one(".locations a, .location_link, #location_names span, [class*='location']")
                location = loc_el.get_text(strip=True) if loc_el else "India"
                
                salary_el = card.select_one(".salary, .stipend, [class*='salary'], [class*='stipend']")
                salary_text = salary_el.get_text(strip=True) if salary_el else ""
                salary_nums = re.findall(r'[\d,]+', salary_text.replace(' ', ''))
                salary = int(salary_nums[0].replace(',', '')) if salary_nums else None
                
                link_el = title_el if title_el and title_el.get("href") else card.select_one("a[href]")
                link = "https://internshala.com" + link_el["href"] if link_el and link_el.get("href", "").startswith("/") else ""
                
                card_text = card.get_text(separator=" ", strip=True)
                skills = extract_keywords(card_text + " " + category)
                
                desc = f"{title} at {company}. Category: {category}"
                if skills:
                    desc = f"[Skills: {', '.join(skills)}] {desc}"
                
                job_url = link or f"https://internshala.com/job/unknown_{hashlib.md5(desc.encode()).hexdigest()}"
                    
                all_jobs.append(JobListing(
                    job_id=generate_job_id(job_url),
                    Company_Name=company,
                    Job_Title=title,
                    Department="Not Specified",
                    Location=location,
                    Work_Type=extract_work_type(location + " " + category),
                    Annual_Salary_USD=salary,
                    Required_Skills=", ".join(skills) if skills else "",
                    Job_Description=desc[:500],
                    Job_URL=job_url,
                    _platform="Internshala",
                    _scraped_at=datetime.now(timezone.utc).isoformat()
                ))
            except Exception as e:
                continue
        
        time.sleep(random.uniform(1.5, 3.0))
        
        # Internshala restriction to keep it from taking literally forever, but fetching 2 pages per hit
        if len(all_jobs) >= MAX_JOBS_PER_COMPANY * pages * 2:
            break
            
    return all_jobs

def scrape_greenhouse(company_id: str, company_name: str) -> List[JobListing]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{company_id}/jobs?content=true"
    jobs = []
    try:
        resp = httpx.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for j in data.get("jobs", [])[:MAX_JOBS_PER_COMPANY]:
            loc = j.get("location", {}).get("name", "India") if isinstance(j.get("location"), dict) else "India"
            depts = j.get("departments", [])
            dept = depts[0].get("name", "Not Specified") if depts else "Not Specified"
            
            raw_content = j.get("content", "")
            desc = smart_description(raw_content)
            skills = extract_keywords(desc)
            job_url = j.get("absolute_url", "")
            
            jobs.append(JobListing(
                job_id=generate_job_id(job_url),
                Company_Name=company_name,
                Job_Title=j.get("title", "Unknown"),
                Department=dept,
                Location=loc,
                Work_Type=extract_work_type(f"{loc} {j.get('title','')}"),
                Required_Skills=", ".join(skills),
                Job_Description=desc,
                Job_URL=job_url,
                _platform="Greenhouse",
                _scraped_at=datetime.now(timezone.utc).isoformat()
            ))
    except Exception as e:
        logger.error(f"Greenhouse error for {company_name}: {e}")
    return jobs

def scrape_lever(company_slug: str, company_name: str) -> List[JobListing]:
    url = f"https://api.lever.co/v0/postings/{company_slug}?mode=json"
    jobs = []
    try:
        resp = httpx.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for j in data[:MAX_JOBS_PER_COMPANY]:
            cat = j.get("categories", {})
            loc = cat.get("location", "India")
            
            raw_desc = (j.get("description", "") or "") + " " + (j.get("descriptionPlain", "") or "")
            for lst in j.get("lists", []):
                raw_desc += " " + clean_html(lst.get("content", ""))
                
            desc = smart_description(raw_desc)
            skills = extract_keywords(desc)
            job_url = j.get("hostedUrl", "")
            
            jobs.append(JobListing(
                job_id=generate_job_id(job_url),
                Company_Name=company_name,
                Job_Title=j.get("text", "Unknown"),
                Department=cat.get("department", cat.get("team", "Not Specified")),
                Location=loc,
                Work_Type=extract_work_type(f"{loc} {cat.get('commitment','') } {j.get('text','')}"),
                Required_Skills=", ".join(skills),
                Job_Description=desc,
                Job_URL=job_url,
                _platform="Lever",
                _scraped_at=datetime.now(timezone.utc).isoformat()
            ))
    except Exception as e:
        logger.error(f"Lever error for {company_name}: {e}")
    return jobs

def scrape_ashby(company_slug: str, company_name: str) -> List[JobListing]:
    url = f"https://api.ashbyhq.com/posting-api/job-board/{company_slug}"
    jobs = []
    try:
        resp = httpx.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        for j in data.get("jobs", [])[:MAX_JOBS_PER_COMPANY]:
            loc = j.get("location", "Not Specified")
            raw_desc = j.get("descriptionHtml", "") or j.get("descriptionPlain", "")
            desc = smart_description(raw_desc)
            skills = extract_keywords(desc)
            job_url = f"https://jobs.ashbyhq.com/{company_slug}/{j.get('id', '')}"
            
            jobs.append(JobListing(
                job_id=generate_job_id(job_url),
                Company_Name=company_name,
                Job_Title=j.get("title", "Unknown"),
                Department=j.get("departmentName", "Not Specified"),
                Location=loc,
                Work_Type="Remote" if j.get("isRemote") else extract_work_type(loc),
                Required_Skills=", ".join(skills),
                Job_Description=desc,
                Job_URL=job_url,
                _platform="Ashby",
                _scraped_at=datetime.now(timezone.utc).isoformat()
            ))
    except Exception as e:
        logger.error(f"Ashby error for {company_name}: {e}")
    return jobs

# ---------------------------------------------------------
# Load Stage (Neo4j)
# ---------------------------------------------------------
def prune_stale_jobs(tx):
    """Delete jobs that haven't been seen in the last 7 days."""
    query = """
    MATCH (j:Job)
    WHERE j.last_seen_at < datetime() - duration('P7D')
    DETACH DELETE j
    RETURN count(j) as deleted_count
    """
    result = tx.run(query)
    record = result.single()
    return record["deleted_count"] if record else 0

def create_nodes_and_relationships(tx, job: JobListing, embedding: List[float]):
    """Idempotently upsert Job node and relationships."""
    query = """
    MERGE (j:Job {id: $job_id})
    ON CREATE SET 
        j.created_at = datetime(),
        j.updated_at = datetime(),
        j.last_seen_at = datetime(),
        j.Job_Title = $title,
        j.Job_Description = $description,
        j.Years_of_Experience = $exp,
        j.Annual_Salary_USD = $salary,
        j.Job_URL = $job_url,
        j.embedding = $embedding,
        j.platform = $platform
    ON MATCH SET 
        j.updated_at = CASE 
            WHEN j.Job_Title <> $title OR j.Job_Description <> $description THEN datetime() 
            ELSE j.updated_at 
        END,
        j.last_seen_at = datetime(),
        j.Job_Title = $title,
        j.Job_Description = $description,
        j.embedding = $embedding
    
    MERGE (c:Company {name: $company_name})
    MERGE (j)-[:POSTED_BY]->(c)

    MERGE (d:Department {name: $dept})
    MERGE (j)-[:BELONGS_TO_DEPARTMENT]->(d)
    
    MERGE (l:Location {name: $loc})
    MERGE (j)-[:LOCATED_IN]->(l)
    
    MERGE (w:WorkType {name: $work_type})
    MERGE (j)-[:HAS_WORK_TYPE]->(w)
    
    WITH j
    UNWIND $skills AS skill_name
    MERGE (s:Skill {name: trim(skill_name)})
    MERGE (j)-[:REQUIRES_SKILL]->(s)
    """
    
    # Process skills list
    raw_skills = job.Required_Skills
    if not raw_skills or raw_skills.lower() in ['nan', 'none', '', 'not specified']:
        skills_list = []
    else:
        skills_list = [s.strip() for s in raw_skills.split(',') if s.strip()]

    tx.run(
        query, 
        job_id=job.job_id,
        title=job.Job_Title,
        description=job.Job_Description or "",
        exp=job.Years_of_Experience,
        salary=job.Annual_Salary_USD,
        job_url=job.Job_URL,
        platform=job._platform,
        dept=job.Department,
        company_name=job.Company_Name,
        loc=job.Location,
        work_type=job.Work_Type,
        embedding=embedding,
        skills=skills_list
    )

def record_etl_run(tx, run_id: str, status: str, inserted_count: int, deleted_count: int, errors: List[str]):
    query = """
    CREATE (e:ETLRun {
        id: $run_id,
        started_at: datetime(),
        status: $status,
        jobs_processed: $inserted_count,
        stale_jobs_deleted: $deleted_count,
        errors: $errors
    })
    """
    tx.run(query, run_id=run_id, status=status, inserted_count=inserted_count, deleted_count=deleted_count, errors=str(errors))

# ---------------------------------------------------------
# Main Execution Flow
# ---------------------------------------------------------
def run_pipeline():
    logger.info("Starting ETL Pipeline")
    run_id = f"RUN_{int(time.time())}"
    errors = []
    
    # 1. EXTRACT
    all_jobs: List[JobListing] = []
    
    logger.info("Extracting from Greenhouse...")
    greenhouse_targets = {"postman": "Postman"}
    for cid, name in greenhouse_targets.items():
        all_jobs.extend(scrape_greenhouse(cid, name))
        
    logger.info("Extracting from Lever...")
    lever_targets = {"meesho": "Meesho"}
    for slug, name in lever_targets.items():
        all_jobs.extend(scrape_lever(slug, name))
        
    logger.info("Extracting from Ashby...")
    ashby_targets = {"notion": "Notion", "ramp": "Ramp"}
    for slug, name in ashby_targets.items():
        all_jobs.extend(scrape_ashby(slug, name))
        
    logger.info("Extracting from Internshala...")
    internshala_categories = [
        "python-development", "web-development", "data-science", 
        "machine-learning", "software-development", "full-stack-development"
    ]
    fetched_internshala = []
    for cat in internshala_categories:
        if len(fetched_internshala) >= 100:
            break
        fetched_internshala.extend(scrape_internshala(cat, pages=1))
        
    all_jobs.extend(fetched_internshala[:100])
        
    logger.info(f"Total jobs extracted: {len(all_jobs)}")
    
    if not all_jobs:
        logger.warning("No jobs extracted. Exiting pipeline.")
        return

    # 2. TRANSFORM & LOAD
    try:
        embedder = SentenceTransformerEmbeddings(model="all-MiniLM-L6-v2")
    except Exception as e:
        logger.error(f"Failed to load sentence transformers: {e}")
        return

    if not URI or not NEO4J_PASSWORD:
        logger.error("Neo4j database credentials (URI, PASSWORD) are missing in environment.")
        return

    logger.info("Connecting to Neo4j database...")
    driver = GraphDatabase.driver(URI, auth=AUTH)
    
    processed_count = 0
    with driver.session() as session:
        for job in all_jobs:
            if not job.Job_Description:
                logger.debug(f"Skipping {job.job_id} due to empty text")
                continue
                
            try:    
                embedding = embedder.embed_query(job.Job_Description)
                session.execute_write(create_nodes_and_relationships, job, embedding)
                processed_count += 1
            except Exception as e:
                err_msg = f"Failed to ingest job {job.job_id}: {e}"
                logger.error(err_msg)
                errors.append(err_msg)
                
            if processed_count % 10 == 0:
                logger.info(f"Ingested {processed_count} jobs...")
                
        # 3. POST-LOAD CLEANUP
        logger.info("Pruning stale jobs...")
        try:
            deleted_count = session.execute_write(prune_stale_jobs)
            logger.info(f"Pruned {deleted_count} stale jobs.")
        except Exception as e:
            logger.error(f"Failed to prune jobs: {e}")
            errors.append(str(e))
            deleted_count = 0

        # Record ETL metrics
        status = "SUCCESS" if not errors else "PARTIAL_SUCCESS"
        session.execute_write(record_etl_run, run_id, status, processed_count, deleted_count, errors)
        
    driver.close()
    logger.info(f"ETL Pipeline complete. Run ID: {run_id}. Processed: {processed_count}.")

if __name__ == "__main__":
    run_pipeline()
