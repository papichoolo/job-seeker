"""
Lazy-initialized retriever and reranker.

All heavy objects (CrossEncoder model, Neo4j driver, VectorCypherRetriever)
are created on first access, NOT at import time. This allows uvicorn to bind
the port immediately on Render before the model download completes.
"""

from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.generation import GraphRAG, RagTemplate
import os

# ---------------------------------------------------------------------------
# Lazy singletons – populated on first access via get_*() helpers
# ---------------------------------------------------------------------------
_reranker = None
_retriever = None
_driver = None


def get_reranker():
    """Lazily load the CrossEncoder reranker model."""
    global _reranker
    if _reranker is None:
        from sentence_transformers import CrossEncoder
        _reranker = CrossEncoder('cross-encoder/ms-marco-TinyBERT-L2-v2')
    return _reranker


def get_driver():
    """Lazily create the Neo4j driver."""
    global _driver
    if _driver is None:
        from neo4j import GraphDatabase
        URI = os.getenv("URI")
        AUTH = (os.getenv("USERNAME"), os.getenv("PASSWORD"))
        _driver = GraphDatabase.driver(URI, auth=AUTH)
    return _driver


def get_retriever():
    """Lazily build the VectorCypherRetriever."""
    global _retriever
    if _retriever is None:
        from openroutercustom import OpenRouterEmbeddings
        embedder = OpenRouterEmbeddings()

        retrieval_query = """
MATCH (node)-[:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (node)-[:POSTED_BY]->(c:Company)
WITH node, score, collect(s.name) AS jobSkills, c.name AS companyName
WHERE ANY(skill IN jobSkills WHERE toLower(skill) IN [us IN $user_skills | toLower(us)])
RETURN node.Job_Description AS content, 
       node { .Job_Title, .Annual_Salary_USD, .id, .Job_URL, company: companyName, jobSkills: jobSkills } AS metadata, 
       score
"""
        _retriever = VectorCypherRetriever(
            get_driver(),
            index_name="vectorj-name",
            embedder=embedder,
            retrieval_query=retrieval_query
        )
    return _retriever


# ---------------------------------------------------------------------------
# Backward-compatible module-level names used by api.py
# These are property-like proxies so `from rerankretriever import retriever, reranker`
# still works, but the actual objects are created lazily.
# ---------------------------------------------------------------------------

class _LazyProxy:
    """Proxy that defers object creation until first attribute access or call."""
    def __init__(self, factory):
        object.__setattr__(self, '_factory', factory)
        object.__setattr__(self, '_obj', None)

    def _resolve(self):
        obj = object.__getattribute__(self, '_obj')
        if obj is None:
            factory = object.__getattribute__(self, '_factory')
            obj = factory()
            object.__setattr__(self, '_obj', obj)
        return obj

    def __getattr__(self, name):
        return getattr(self._resolve(), name)

    def __call__(self, *args, **kwargs):
        return self._resolve()(*args, **kwargs)


# These will be imported by api.py as `retriever` and `reranker`
retriever = _LazyProxy(get_retriever)
reranker = _LazyProxy(get_reranker)


# ---------------------------------------------------------------------------
# RAG Template (lightweight, no lazy-load needed)
# ---------------------------------------------------------------------------

class JobRerankTemplate(RagTemplate):
    template = """
    You are a precision job-matching engine. 
    Return ONLY a valid JSON array of objects. Do not include markdown code blocks.
    
    Context from Knowledge Graph:
    {context}
    
    User Request:
    {query_text}
    
    JSON Schema:
    {{
      "job_id": "string",
      "title": "string",
      "salary": number,
      "match_score": number,
      "matched_skills": ["string"],
      "justification": "string"
    }}
    """