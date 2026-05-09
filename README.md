# 🎓 GPA Assistant — RAG + LLM Integrated System

**Government Polytechnic Adityapur | Jamshedpur, Jharkhand**

A fully integrated AI chatbot that combines a **Python RAG pipeline** (running on Google Colab) with a **browser-based LLM chatbot** (JavaScript + Gemini API).

---

## 🏗 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser (User)                               │
│                                                                 │
│   index.html ──► chatbot.js (ChatbotUI + RAGEngine)            │
│                       │                                         │
│          ┌────────────┴────────────────────┐                    │
│          │                                 │                    │
│          ▼                                 ▼                    │
│   Python RAG Backend            Client-side localStorage RAG   │
│   (Colab notebook via ngrok)    (admin.html import/export)     │
│          │                                 │                    │
│          └────────────┬────────────────────┘                    │
│                       ▼                                         │
│              Gemini 2.5 Flash (answer generation)               │
└─────────────────────────────────────────────────────────────────┘
```

### Query Routing (Priority Order)
1. **Python RAG Backend** *(best quality)* — Scanned notice images → Gemini VLM extraction → BAAI/bge-m3 embeddings → ChromaDB + BM25 hybrid retrieval → Gemini answer
2. **Client-side RAG** *(localStorage fallback)* — Text manually imported via admin panel → Gemini embeddings → cosine similarity search
3. **Gemini LLM** *(general fallback)* — Direct LLM answer using the built-in system prompt

---

## 📁 Repository Structure

```
gpa_rag/
├── GPA_RAG_LLM_Integrated.ipynb  ← Python backend (run on Google Colab)
├── index.html (or admin.html)    ← Frontend UI (from original LLM repo)
├── chatbot.js                    ← Integrated chatbot engine ← MODIFIED
├── chatbot.css                   ← Chatbot styles
├── app.js                        ← Main website JS (data, UI)
├── style.css                     ← Main website styles
├── admin.html                    ← Admin panel (import/export KB)
├── package.json
└── README.md
```

---

## 🚀 Quick Start

### Step 1 — Run the Python RAG Backend (Google Colab)

1. Open `GPA_RAG_LLM_Integrated.ipynb` in Google Colab
2. Edit **Section 1.3** with your API keys:
   ```python
   GOOGLE_API_KEY  = 'YOUR_GEMINI_API_KEY'
   NGROK_AUTH_TOKEN = 'YOUR_NGROK_TOKEN'  # free at dashboard.ngrok.com
   ```
3. Add scanned notice images (`.jpg`/`.png`) to:
   ```
   Google Drive → MyDrive → RAG → input_docs/
   ```
4. Run **Section 1** (Setup) → **Section 2** (Ingest) → **Section 3** (Start Server)
5. Copy the ngrok URL displayed in the output, e.g.:
   ```
   https://xxxx-xx-xx.ngrok-free.app
   ```

### Step 2 — Connect the Frontend

Open `chatbot.js` and paste the ngrok URL:

```javascript
// Line ~15 in chatbot.js
RAG_BACKEND_URL: 'https://xxxx-xx-xx.ngrok-free.app',
```

### Step 3 — Open the Website

Open `index.html` (or deploy via GitHub Pages). The chatbot will now:
- Route college-related queries → Python RAG backend → rich, cited answers
- Fall back to localStorage RAG (admin-imported data) if backend is offline
- Fall back to Gemini LLM for general questions

---

## 📋 Python Backend — API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/rag/stats` | KB statistics (chunks, documents) |
| `POST` | `/api/rag/query` | Query the RAG system |

### `/api/rag/query`

**Request:**
```json
{ "query": "What is the E-Kalyan scholarship deadline?" }
```

**Response:**
```json
{
  "answer": "The E-Kalyan scholarship deadline for SC/ST/OBC students is March 31, 2026...",
  "sources": [
    {
      "index": 1,
      "reference": "EKalyan-2026-Notice",
      "date": "2026-02-01",
      "subject": "E-Kalyan Scholarship",
      "authority": "Principal, GPA"
    }
  ],
  "chunk_count": 3
}
```

---

## 🛠 Admin Panel (Import / Export)

Open `admin.html` to:
- **Import** knowledge base from a JSON file (for offline/client-side RAG)
- **Export** the current knowledge base as JSON
- **Add** text entries manually (no image required)
- **View** KB statistics

This lets you maintain a client-side fallback even when the Colab notebook is not running.

---

## 🔑 API Keys Required

| Key | Where to get | Used for |
|-----|-------------|----------|
| Google Gemini API | [aistudio.google.com](https://aistudio.google.com) | VLM extraction + embeddings + LLM answers |
| ngrok Auth Token | [dashboard.ngrok.com](https://dashboard.ngrok.com) | Public URL for Colab server |

---

## 📦 Tech Stack

| Layer | Technology |
|-------|-----------|
| Document ingestion | Gemini 2.5 Flash (Vision) |
| Embeddings | BAAI/bge-m3 (HuggingFace) |
| Vector store | ChromaDB (persistent on Drive) |
| Keyword search | BM25 (rank_bm25) |
| Hybrid retrieval | LangChain EnsembleRetriever |
| Answer generation | Gemini 2.5 Flash |
| API server | Flask + Flask-CORS |
| Public tunnel | pyngrok |
| Frontend chatbot | Vanilla JavaScript |
| Hosting | GitHub Pages / any static host |
