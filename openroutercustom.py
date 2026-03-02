from typing import List, Optional, Any
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from neo4j_graphrag.llm import LLMInterface, LLMResponse

class OpenRouterLLM(LLMInterface):
    def __init__(self, model_name: str, api_key: str, base_url: str = "https://openrouter.ai/api/v1"):
        super().__init__(model_name)
        self.client = ChatOpenAI(
            model=model_name,
            openai_api_key=api_key,
            openai_api_base=base_url,
            temperature=0
        )

    def _prepare_messages(self, input_text: str, message_history: Optional[List[dict]] = None, system_instruction: Optional[str] = None):
        messages = []
        # 1. Add System Instruction if provided by the GraphRAG pipeline
        if system_instruction:
            messages.append(SystemMessage(content=system_instruction))
        
        # 2. Add Conversation History
        if message_history:
            for msg in message_history:
                if msg["role"] == "user":
                    messages.append(HumanMessage(content=msg["content"]))
                elif msg["role"] == "assistant":
                    messages.append(AIMessage(content=msg["content"]))
        
        # 3. Add the actual user query
        messages.append(HumanMessage(content=input_text))
        return messages

    def invoke(self, input: str, message_history: Optional[List[dict]] = None, system_instruction: Optional[str] = None) -> LLMResponse:
        messages = self._prepare_messages(input, message_history, system_instruction)
        response = self.client.invoke(messages)
        return LLMResponse(content=str(response.content))

    async def ainvoke(self, input: str, message_history: Optional[List[dict]] = None, system_instruction: Optional[str] = None) -> LLMResponse:
        messages = self._prepare_messages(input, message_history, system_instruction)
        response = await self.client.ainvoke(messages)
        return LLMResponse(content=str(response.content))

from openai import OpenAI
import os

class OpenRouterEmbeddings:
    def __init__(self):
        self.client = OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.environ.get("OPENROUTER_API_KEY")
        )
        self.model = "sentence-transformers/paraphrase-minilm-l6-v2"

    def embed_query(self, text: str) -> List[float]:
        response = self.client.embeddings.create(
            model=self.model,
            input=text,
            encoding_format="float"
        )
        return response.data[0].embedding