from neo4j_graphrag.retrievers import VectorCypherRetriever
from neo4j_graphrag.generation import GraphRAG
from sentence_transformers import CrossEncoder
import os

# 1. Initialize a Cross-Encoder Reranker
reranker = CrossEncoder('BAAI/bge-reranker-base')
from neo4j import GraphDatabase
from lol import URI, AUTH, embedder
from neo4j_graphrag.generation import RagTemplate

class JobRerankTemplate(RagTemplate):
    # The template must include {context} and {query_text} placeholders
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


driver = GraphDatabase.driver(URI, auth=AUTH)

# 1. The Reranking Cypher Query
# It starts with the vector match (node) and calculates a score 
# based on exact skill intersections and experience alignment.
retrieval_query = """
MATCH (node)-[:REQUIRES_SKILL]->(s:Skill)
OPTIONAL MATCH (node)-[:POSTED_BY]->(c:Company)
WITH node, score, collect(s.name) AS jobSkills, c.name AS companyName
WHERE ANY(skill IN jobSkills WHERE toLower(skill) IN [us IN $user_skills | toLower(us)])
RETURN node.Job_Description AS content, 
       node { .Job_Title, .Annual_Salary_USD, .id, .Job_URL, company: companyName, jobSkills: jobSkills } AS metadata, 
       score
"""


custom_template = JobRerankTemplate()

# 2. Initialize Retriever
retriever = VectorCypherRetriever(
    driver,
    index_name="vectorj-name",
    embedder=embedder,
    retrieval_query=retrieval_query
)

# 3. Initialize GraphRAG with your OpenRouter LLM
# This LLM will take the top candidates and produce the final top 5 justification.
#rag = GraphRAG(retriever=retriever, llm=llm, prompt_template=custom_template)