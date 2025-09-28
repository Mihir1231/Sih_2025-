import streamlit as st
import chromadb
import os
import numpy as np
import httpx
from typing import List, Dict, Any
import json

# --- Page Setup ---
st.set_page_config(
    page_title="College Document RAG Search (Ollama)",
    page_icon="📚",
    layout="wide"
)

# --- CONFIGURATION (Adapted for Ollama) ---
class Config:
    CHROMADB_DIR = "D:/LDRP ITR/backend/chromadb_data"
    ALL_BATCHES_CHROMADB_DIR = os.path.join("chromadb_data", "all_batches")
    STUDENT_CHROMADB_DIR = os.path.join("chromadb_data", "student_visitor")
    OLLAMA_EMBEDDING_MODEL = "embeddinggemma"
    OLLAMA_CHAT_MODEL = "gemma3:4b"
    OLLAMA_BASE_URL = "http://localhost:11434"

config = Config()

# --- CORE LOGIC (Integrated and Switched to Ollama) ---

class EmbeddingManager:
    """Handles text vectorization using a local Ollama model."""
    def __init__(self):
        # Check for Ollama server availability on startup.
        try:
            httpx.get(config.OLLAMA_BASE_URL)
            st.sidebar.success("Connected to Ollama!")
        except httpx.ConnectError:
            st.sidebar.error(f"Ollama not found at `{config.OLLAMA_BASE_URL}`.")
            st.error(f"Failed to connect to Ollama. Please ensure the Ollama server is running and accessible at `{config.OLLAMA_BASE_URL}`.")
            st.stop()

    def generate_embeddings(self, text: str) -> List[float]:
        """Generates embeddings by calling the Ollama API."""
        if not text.strip():
            return []
        try:
            payload = {"model": config.OLLAMA_EMBEDDING_MODEL, "prompt": text}
            response = httpx.post(f"{config.OLLAMA_BASE_URL}/api/embeddings", json=payload, timeout=30.0)
            response.raise_for_status()
            return response.json().get("embedding", [])
        except httpx.RequestError as e:
            st.error(f"Ollama embedding request failed: {e}")
            return []
        except Exception as e:
            st.error(f"An unexpected error occurred during embedding: {e}")
            return []

class ChromaDBManager:
    """Handles connections to the local ChromaDB persistent storage."""
    def __init__(self):
        self._clients = {}

    def get_collection(self, client_key: str, collection_name: str = "documents"):
        """Gets the correct DB collection based on the agent's key."""
        if client_key not in self._clients:
            if client_key == "all_batches":
                db_path = config.ALL_BATCHES_CHROMADB_DIR
            elif client_key == "student_visitor":
                db_path = config.STUDENT_CHROMADB_DIR
            else:
                db_path = os.path.join(config.CHROMADB_DIR, f"batch_{client_key}")

            if not os.path.exists(db_path):
                st.error(f"Database path not found: `{db_path}`. Please ensure your data is in the correct folder.")
                return None
            
            self._clients[client_key] = chromadb.PersistentClient(path=db_path)
        
        client = self._clients[client_key]
        return client.get_or_create_collection(name=collection_name, metadata={"hnsw:space": "cosine"})

# --- Streamlit Caching for Performance ---
@st.cache_resource
def get_managers():
    """Loads and caches the heavy model and DB manager."""
    embedding_manager = EmbeddingManager()
    db_manager = ChromaDBManager()
    return embedding_manager, db_manager

# Initialize managers
embedding_manager, db_manager = get_managers()

# --- Data Lists (for UI dropdowns) ---
ALL_BATCHES = ["2022-2026", "2023-2027", "2024-2028", "2025-2029"]
ALL_BRANCHES = ["ALL", "Computer Engineering", "Information Technology", "Mechanical Engineering", "Electrical & Communication", "Electrical Engineering"]
ALL_SEMESTERS = ["ALL"] + [str(i) for i in range(1, 9)]
DOCUMENT_TYPES = [
    "ALL", "ExamTimetable", "ClassTimeTable", "Circular", "EventInformation", 
    "FeesNotice", "ExamForm", "GeneralNotice", "GeneralInformation", "SeminarInformation"
]

# --- Helper Functions (Local Implementation) ---
def perform_search(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Performs a local search in ChromaDB without an API call."""
    query = payload.get("query")
    batch_key = payload.get("batch")
    
    with st.spinner(f"Searching in `{batch_key}` database with Ollama embeddings..."):
        collection = db_manager.get_collection(client_key=batch_key)
        if collection is None:
            return {"success": False, "results": [], "total_results": 0}

        query_embedding = embedding_manager.generate_embeddings(query)
        if not query_embedding:
            st.error("Could not generate embeddings for the query. Cannot perform search.")
            return {"success": False, "results": [], "total_results": 0}


        # Build the metadata filter
        where_filter = {}
        filters_to_apply = []

        if payload.get("branch") and payload["branch"] != "ALL":
            filters_to_apply.append({"branch": {"$eq": payload["branch"]}})
        
        if payload.get("semester") and payload["semester"] != "ALL":
            # Ensure format matches the one used during upload
            formatted_semester = f"Semester {payload['semester'].strip()}"
            filters_to_apply.append({"semester": {"$eq": formatted_semester}})

        if payload.get("document_type") and payload["document_type"] != "ALL":
            filters_to_apply.append({"document_type": {"$eq": payload["document_type"]}})

        if len(filters_to_apply) > 1:
            where_filter["$and"] = filters_to_apply
        elif len(filters_to_apply) == 1:
            where_filter = filters_to_apply[0]
        
        try:
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=payload.get("limit", 10),
                where=where_filter if where_filter else None,
                include=["metadatas", "documents", "distances"]
            )
            
            formatted_results = []
            if results and results.get('ids')[0]:
                for i in range(len(results['ids'][0])):
                    formatted_results.append({
                        "metadata": results['metadatas'][0][i],
                        "document": results['documents'][0][i],
                        "distance": results['distances'][0][i]
                    })
            
            return {
                "success": True, 
                "results": formatted_results, 
                "total_results": len(formatted_results),
                "query": query
            }
        except Exception as e:
            st.error(f"An error occurred during search: {e}")
            return {"success": False, "results": [], "total_results": 0}


def generate_answer(query: str, context: List[str]) -> str:
    """Generates an answer using a local Ollama model directly."""
    system_prompt = "You are a helpful assistant for a college. Answer the user's query based ONLY on the provided context documents. If the context doesn't contain the answer, state that clearly. Do not use outside knowledge. Be concise and direct."
    
    context_str = "\n\n---\n\n".join(context)
    full_prompt = f"CONTEXT:\n{context_str}\n\nQUERY:\n{query}"

    payload = {
        "model": config.OLLAMA_CHAT_MODEL,
        "prompt": full_prompt,
        "stream": False,
        "options": {
            "temperature": 0.2
        }
    }

    try:
        with st.spinner(f"🧠 Generating answer with Ollama model `{config.OLLAMA_CHAT_MODEL}`..."):
            response = httpx.post(f"{config.OLLAMA_BASE_URL}/api/generate", json=payload, timeout=60.0)
            response.raise_for_status()
            
            data = response.json()
            return data.get("response", "No response content from Ollama.")
    except httpx.RequestError as e:
        st.error(f"Connection error to Ollama API: {e}")
        return "Answer generation failed due to a connection error."
    except Exception as e:
        st.error(f"Failed to generate answer: {e}")
        return "An unexpected error occurred during answer generation."

# --- Main App UI ---
st.title("📚 Intelligent College Document Search (Ollama)")
st.markdown("---")

st.info(
    f"""
    **Note:** This application reads from your local `chromadb_data` folders and uses a local **Ollama** server.
    - **Embedding Model:** `{config.OLLAMA_EMBEDDING_MODEL}`
    - **Chat Model:** `{config.OLLAMA_CHAT_MODEL}`
    - Please ensure your Ollama server is running with these models available (`ollama pull {config.OLLAMA_EMBEDDING_MODEL}`, `ollama pull {config.OLLAMA_CHAT_MODEL}`).
    """
)

# --- Sidebar for Filters ---
with st.sidebar:
    st.header("Search Agent & Filters")
    
    agent_mode = st.radio(
        "**1. Select Search Scope (Agent)**",
        ("Specific Batch", "ALL Batches", "Parents / Visitor"),
        key="agent_mode"
    )

    # Initialize variables
    selected_batch = "N/A"
    selected_branch = "N/A"
    selected_semester = "N/A"
    selected_doc_type = "N/A"


    if agent_mode == "Specific Batch":
        st.markdown("**2. Define Search Criteria**")
        selected_batch = st.selectbox("Batch", ALL_BATCHES)
        selected_branch = st.selectbox("Branch", ALL_BRANCHES)
        selected_semester = st.selectbox("Semester", ALL_SEMESTERS)
        selected_doc_type = st.selectbox("Document Type", DOCUMENT_TYPES)
    
    elif agent_mode == "ALL Batches":
        st.markdown("**2. Define Search Criteria**")
        selected_batch = "all_batches"  # Key for the local DB manager
        selected_branch = st.selectbox("Branch", ALL_BRANCHES)
        selected_semester = st.selectbox("Semester", ALL_SEMESTERS)
        selected_doc_type = st.selectbox("Document Type", DOCUMENT_TYPES)
        
    else:  # Parents / Visitor
        st.markdown("**Parents/Visitor search is active.**")
        st.markdown("This will search through documents specifically uploaded for general queries.")
        selected_batch = "student_visitor"  # Key for the local DB manager
        selected_branch = "ALL"
        selected_semester = "ALL"
        selected_doc_type = "ALL"

# --- Main Content Area ---
query = st.text_area("Enter your question or search query here:", height=100)
search_button = st.button("🔍 Search Documents")

st.markdown("---")

if search_button and query:
    # 1. RETRIEVAL STEP
    search_payload = {
        "query": query,
        "batch": selected_batch,
        "branch": selected_branch,
        "semester": selected_semester,
        "document_type": selected_doc_type,
        "limit": 10
    }
    
    st.subheader("Retrieved Documents")
    search_results = perform_search(search_payload)
    
    if search_results and search_results.get("success"):
        results = search_results.get("results", [])
        total_results = search_results.get("total_results", 0)

        if total_results > 0:
            st.success(f"Found {total_results} relevant document(s).")
            
            # Prepare context for the RAG generation step
            context_for_rag = []

            for i, result in enumerate(results):
                metadata = result.get('metadata', {})
                document_text = result.get('document', '')
                distance = result.get('distance', 0.0)
                context_for_rag.append(document_text)

                with st.expander(f"**{i+1}. {metadata.get('title', 'No Title')}** (Relevance Score: {1-distance:.2f})"):
                    st.markdown(f"**File:** `{metadata.get('filename', 'N/A')}`")
                    st.markdown(f"**Batch:** `{metadata.get('batch', 'N/A')}` | **Branch:** `{metadata.get('branch', 'N/A')}` | **Semester:** `{metadata.get('semester', 'N/A')}`")
                    st.markdown(f"**Document Type:** `{metadata.get('document_type', 'N/A')}`")
                    
                    if metadata.get('document_type') == "SeminarInformation":
                        st.info(f"**Seminar:** {metadata.get('seminar_name', 'N/A')} | **Date:** {metadata.get('seminar_date', 'N/A')} | **Location:** {metadata.get('seminar_location', 'N/A')}")

                    st.text_area(
                        "Document Content Snippet", 
                        value=document_text[:1000] + "..." if len(document_text) > 1000 else document_text, 
                        height=200, 
                        key=f"doc_{i}"
                    )
            
            # 2. GENERATION STEP
            st.markdown("---")
            st.subheader("AI-Generated Answer")
            st.markdown("Based on the retrieved documents, here is a direct answer to your query:")
            
            generated_answer = generate_answer(query, context_for_rag)
            st.markdown(generated_answer)

        else:
            st.warning("No documents found matching your query and filter criteria.")
    else:
        st.error("Search failed. Please check your terminal for error messages.")

elif search_button and not query:
    st.warning("Please enter a query to search.")
