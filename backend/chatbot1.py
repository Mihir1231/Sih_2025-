import os
import logging
import re
from typing import List, Dict, Optional, Any, Tuple

from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import chromadb
import ollama
# Dependency for translation. Install with: pip install translators
import translators as ts

# --- CONFIGURATION ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Config:
    """Configuration class for the application."""
    CHROMA_BASE_PATH = "D:/LDRP ITR/backend/chromadb_data"
    CHROMA_BASE_PATH_1 = "D:/LDRP ITR/backend/chromadb_data_1"
    ALL_BATCHES_DB_SUBDIR = "all_batches"
    VISITOR_DB_SUBDIR = "student_visitor"
    OLLAMA_EMBEDDING_MODEL = "embeddinggemma"
    OLLAMA_LLM_MODEL = "gemma3:4b"
    # --- ADVANCED RAG SETTINGS ---
    # Fetch a larger number of initial documents for re-ranking
    NUM_RESULTS_TO_FETCH = 10
    # Number of documents to use after re-ranking
    NUM_DOCS_TO_USE = 3

CONFIG = Config()

# --- API SETUP ---
app = FastAPI(
    title="LDRP Multi-Agent RAG API (V4.0 - Advanced RAG)",
    description="Backend with an advanced RAG pipeline including query transformation and re-ranking for maximum accuracy.",
    version="4.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
)

# --- TRANSLATION SERVICE ---
def translate_text(text: str, to_lang: str, from_lang: str = 'auto') -> str:
    if not text or from_lang == to_lang: return text
    try:
        translated = ts.translate_text(text, translator='google', from_language=from_lang, to_language=to_lang)
        logger.info(f"Successfully translated '{text}' ({from_lang}) -> '{translated}' ({to_lang})")
        return translated
    except Exception as e:
        logger.error(f"Translation failed for '{text}' from '{from_lang}' to '{to_lang}': {e}")
        return text

# --- DATABASE MANAGEMENT ---
class ChromaManager:
    _instance, _clients = None, {}
    def __new__(cls):
        if cls._instance is None: cls._instance = super(ChromaManager, cls).__new__(cls)
        return cls._instance
    def get_collection(self, path: str, name: str) -> Optional[chromadb.Collection]:
        try:
            if not os.path.exists(path):
                logger.warning(f"ChromaDB path does not exist: {path}.")
                return None
            if path not in self._clients: self._clients[path] = chromadb.PersistentClient(path=path)
            return self._clients[path].get_or_create_collection(name)
        except Exception as e:
            logger.error(f"Failed to get collection '{name}' at '{path}': {e}")
            return None

db_manager = ChromaManager()

def get_student_collection(batch: str) -> Optional[chromadb.Collection]:
    return db_manager.get_collection(os.path.join(CONFIG.CHROMA_BASE_PATH, f"batch_{batch}"), "documents")
def get_all_batches_collection() -> Optional[chromadb.Collection]:
    return db_manager.get_collection(os.path.join(CONFIG.CHROMA_BASE_PATH, CONFIG.ALL_BATCHES_DB_SUBDIR), "documents")
def get_visitor_collection() -> Optional[chromadb.Collection]:
    return db_manager.get_collection(os.path.join(CONFIG.CHROMA_BASE_PATH_1, CONFIG.VISITOR_DB_SUBDIR), "documents")

# --- SERVICES & ADVANCED RAG PIPELINE ---
class EmbeddingService:
    def generate(self, text: str) -> List[float]:
        try:
            return ollama.embeddings(model=CONFIG.OLLAMA_EMBEDDING_MODEL, prompt=text)["embedding"]
        except Exception as e:
            logger.error(f"Ollama embedding failed: {e}")
            raise HTTPException(status_code=503, detail="Embedding service unavailable.")

class AdvancedRAGPipeline:
    def __init__(self, embedding_service: EmbeddingService):
        self.embedding_service = embedding_service

    def transform_query(self, question: str) -> str:
        """Uses an LLM to rephrase the user's question for better retrieval."""
        try:
            response = ollama.chat(
                model=CONFIG.OLLAMA_LLM_MODEL,
                messages=[
                    {"role": "system", "content": "You are a query optimization assistant. Your task is to rephrase the user's question to be more effective for a vector database search. Focus on keywords and clarity. Respond only with the rephrased question."},
                    {"role": "user", "content": f"Rephrase this question: '{question}'"}
                ]
            )
            transformed_query = response['message']['content'].strip()
            logger.info(f"Transformed query: '{question}' -> '{transformed_query}'")
            return transformed_query
        except Exception as e:
            logger.error(f"Query transformation failed: {e}. Using original query.")
            return question
            
    def rerank_documents(self, question: str, documents: List[str], metadatas: List[Dict]) -> Tuple[List[str], List[Dict]]:
        """Uses an LLM to re-rank retrieved documents for relevance."""
        if not documents:
            return [], []
        
        try:
            prompt_content = f"Question: \"{question}\"\n\nHere are the retrieved document chunks:\n\n"
            for i, doc in enumerate(documents):
                prompt_content += f"--- Document {i + 1} ---\n{doc}\n\n"
            prompt_content += f"Which of these documents are most relevant to the question? Please list the top {CONFIG.NUM_DOCS_TO_USE} document numbers, separated by commas (e.g., '3, 1, 5')."

            response = ollama.chat(
                model=CONFIG.OLLAMA_LLM_MODEL,
                messages=[
                    {"role": "system", "content": f"You are a relevance ranking assistant. Your task is to select the top {CONFIG.NUM_DOCS_TO_USE} most relevant documents for the given question. Respond only with a comma-separated list of numbers."},
                    {"role": "user", "content": prompt_content}
                ]
            )
            
            ranked_indices_str = response['message']['content'].strip()
            ranked_indices = [int(i.strip()) - 1 for i in ranked_indices_str.split(',') if i.strip().isdigit()]
            
            reranked_docs = [documents[i] for i in ranked_indices if 0 <= i < len(documents)]
            reranked_metas = [metadatas[i] for i in ranked_indices if 0 <= i < len(metadatas)]
            
            logger.info(f"Re-ranked document indices: {ranked_indices}")
            return reranked_docs, reranked_metas
        except Exception as e:
            logger.error(f"Re-ranking failed: {e}. Using top N results without re-ranking.")
            return documents[:CONFIG.NUM_DOCS_TO_USE], metadatas[:CONFIG.NUM_DOCS_TO_USE]

    def generate_response(self, context: str, prompt: str) -> Dict[str, str]:
        """Generates a final answer based on the refined context."""
        system_prompt = (
            "You are a highly intelligent and factual AI assistant for LDRP-ITR College. Your primary goal is to provide detailed, accurate, and helpful answers based ONLY on the provided context. The user's original question may have been in another language and translated to English.\n\n"
            "Follow this process:\n"
            "1. **Analyze the Question:** Deeply understand the user's intent from the question.\n"
            "2. **Synthesize the Context:** Read through all the provided context documents. Identify the key pieces of information that are directly relevant to the user's question.\n"
            "3. **Construct a Thought Process:** In your mind, formulate a step-by-step plan to answer the question using the synthesized information. Critically evaluate if the context is sufficient. If the context is contradictory or insufficient, you MUST state that.\n"
            "4. **Generate the Answer:** Based on your thought process, write a comprehensive, detailed, and polite answer. Begin your response directly with the answer itself. Do not mention the context or your thought process in the final output. If the answer is not found in the context, your ONLY response must be: 'I'm sorry, but the provided documents do not contain the information needed to answer your question.'"
        )
        try:
            user_message = (f"**Context:**\n---\n{context}\n---\n\n**Question:** {prompt}")
            response = ollama.chat(
                model=CONFIG.OLLAMA_LLM_MODEL,
                messages=[ {"role": "system", "content": system_prompt}, {"role": "user", "content": user_message} ]
            )
            return {"answer": response['message']['content'].strip()}
        except Exception as e:
            logger.error(f"Ollama chat completion failed: {e}")
            raise HTTPException(status_code=503, detail="Language model service unavailable.")

# --- DEPENDENCY INJECTION ---
def get_embedding_service(): return EmbeddingService()
def get_rag_pipeline(embedding_service: EmbeddingService = Depends(get_embedding_service)): return AdvancedRAGPipeline(embedding_service)

# --- API MODELS ---
class StudentQueryRequest(BaseModel):
    batch: str; branch: str; semester: str; doc_type: str; question: str; target_language: str
class VisitorQueryRequest(BaseModel):
    question: str; target_language: str
class QueryResponse(BaseModel):
    answer: str; sources: List[str]

# --- SHARED QUERY LOGIC ---
def execute_advanced_rag_query(
    collection: chromadb.Collection,
    original_question: str,
    rag_pipeline: AdvancedRAGPipeline,
    embedding_service: EmbeddingService,
    lang_code: str,
    filters: Optional[Dict] = None
) -> QueryResponse:
    
    # 1. Query Transformation
    transformed_question = rag_pipeline.transform_query(original_question)
    
    # 2. Retrieval
    query_embedding = embedding_service.generate(transformed_question)
    results = collection.query(query_embeddings=[query_embedding], n_results=CONFIG.NUM_RESULTS_TO_FETCH, where=filters)

    if not results or not results.get('documents') or not results['documents'][0]:
        answer = "I could not find any documents matching your query."
        translated_answer = translate_text(answer, to_lang=lang_code, from_lang='en')
        return QueryResponse(answer=translated_answer, sources=[])

    retrieved_docs, retrieved_metadatas = results['documents'][0], results['metadatas'][0]

    # 3. Re-ranking
    reranked_docs, reranked_metas = rag_pipeline.rerank_documents(original_question, retrieved_docs, retrieved_metadatas)

    if not reranked_docs:
        answer = "I found some documents but could not determine which were most relevant to your question."
        translated_answer = translate_text(answer, to_lang=lang_code, from_lang='en')
        return QueryResponse(answer=translated_answer, sources=[])
    
    context = "\n\n---\n\n".join(reranked_docs)
    sources = sorted(list(set(meta.get('filename', 'Unknown Source') for meta in reranked_metas)))
    
    # 4. Generation
    response_dict = rag_pipeline.generate_response(context, original_question)
    response_dict['answer'] = translate_text(response_dict['answer'], to_lang=lang_code, from_lang='en')
    
    return QueryResponse(answer=response_dict['answer'], sources=sources)


# --- API ENDPOINTS ---
@app.post("/student_query", response_model=QueryResponse)
def handle_student_query(
    request: StudentQueryRequest,
    rag_pipeline: AdvancedRAGPipeline = Depends(get_rag_pipeline),
    embedding_service: EmbeddingService = Depends(get_embedding_service)
):
    lang_code = request.target_language.split('-')[0]
    question_in_english = translate_text(request.question, to_lang='en', from_lang=lang_code)
    
    try:
        collection: Optional[chromadb.Collection] = None
        filter_conditions = []

        if request.batch == "ALL":
            collection = get_all_batches_collection()
            if request.branch != "ALL": filter_conditions.append({'branch': {'$eq': request.branch}})
            if request.semester != "ALL": filter_conditions.append({'semester': {'$eq': request.semester}})
        else:
            collection = get_student_collection(request.batch)
            filter_conditions.append({"branch": {"$eq": request.branch}})
            filter_conditions.append({"semester": {"$eq": request.semester}})

        if request.doc_type != "ALL": filter_conditions.append({'document_type': {'$eq': request.doc_type}})
        filters = {"$and": filter_conditions} if filter_conditions else None
        
        if not collection: raise HTTPException(status_code=404, detail="Database collection could not be found.")
        
        return execute_advanced_rag_query(collection, question_in_english, rag_pipeline, embedding_service, lang_code, filters)

    except Exception as e:
        logger.error(f"Error in student query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@app.post("/rag_query", response_model=QueryResponse)
def handle_rag_query(
    request: VisitorQueryRequest,
    rag_pipeline: AdvancedRAGPipeline = Depends(get_rag_pipeline),
    embedding_service: EmbeddingService = Depends(get_embedding_service)
):
    lang_code = request.target_language.split('-')[0]
    question_in_english = translate_text(request.question, to_lang='en', from_lang=lang_code)
    
    try:
        collection = get_visitor_collection()
        if not collection: raise HTTPException(status_code=404, detail="Visitor document collection not found.")
        return execute_advanced_rag_query(collection, question_in_english, rag_pipeline, embedding_service, lang_code)
    except Exception as e:
        logger.error(f"Error in visitor RAG query: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="An internal server error occurred.")

@app.get("/health")
def health_check():
    try:
        ollama.list(); ollama_status = "ok"
    except Exception:
        ollama_status = "error"
    return {"status": "ok", "dependencies": {"ollama": ollama_status}}

# --- MAIN ---
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)