import time
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI, Header, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST

from config import settings

logger = structlog.get_logger()

SEARCH_REQUESTS = Counter(
    "rag_search_requests_total",
    "Total search requests",
    ["status", "tenant_id"],
)
SEARCH_DURATION = Histogram(
    "rag_search_duration_seconds",
    "Search query processing time",
    buckets=[0.05, 0.1, 0.25, 0.5, 1, 2, 5],
)
EMBEDDING_DURATION = Histogram(
    "rag_embedding_duration_seconds",
    "Embedding generation time",
    buckets=[0.05, 0.1, 0.25, 0.5, 1, 2],
)
DOCUMENTS_INDEXED = Counter(
    "rag_documents_indexed_total",
    "Total documents indexed",
    ["tenant_id", "source_type"],
)
VECTOR_COUNT = Gauge(
    "rag_vector_count",
    "Total vectors in the index",
    ["tenant_id"],
)
MODEL_LOADED = Gauge("rag_model_loaded", "Whether the embedding model is loaded")

embedding_model = None
db_pool = None


def get_db_connection():
    import psycopg2
    return psycopg2.connect(settings.database_url)


def init_vector_extension():
    conn = get_db_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("CREATE EXTENSION IF NOT EXISTS vector")
            cur.execute("""
                CREATE TABLE IF NOT EXISTS knowledge_vectors (
                    id BIGSERIAL PRIMARY KEY,
                    tenant_id VARCHAR(64) NOT NULL,
                    chunk_text TEXT NOT NULL,
                    source VARCHAR(512) NOT NULL DEFAULT '',
                    metadata JSONB DEFAULT '{}',
                    embedding vector(%d),
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            """ % settings.embedding_dimension)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_tenant
                ON knowledge_vectors (tenant_id)
            """)
            cur.execute("""
                CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_embedding
                ON knowledge_vectors
                USING ivfflat (embedding vector_cosine_ops)
                WITH (lists = 100)
            """)
        conn.commit()
        logger.info("vector_extension_initialized")
    finally:
        conn.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    global embedding_model

    logger.info("loading_embedding_model", model=settings.embedding_model)
    try:
        from sentence_transformers import SentenceTransformer
        embedding_model = SentenceTransformer(
            settings.embedding_model,
            device=settings.embedding_device,
        )
        MODEL_LOADED.set(1)
        logger.info("embedding_model_loaded")
    except Exception as e:
        logger.error("embedding_model_load_failed", error=str(e))
        MODEL_LOADED.set(0)

    try:
        init_vector_extension()
    except Exception as e:
        logger.warn("vector_init_skipped", error=str(e))

    yield

    embedding_model = None
    MODEL_LOADED.set(0)
    logger.info("rag_service_shutdown")


app = FastAPI(
    title="Voice SaaS — RAG Service",
    version="1.0.0",
    lifespan=lifespan,
)


class SearchResult(BaseModel):
    text: str
    source: str
    score: float
    metadata: dict = {}


class SearchResponse(BaseModel):
    results: list[SearchResult]
    processing_time: float


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    model_name: str
    device: str
    vector_count: int
    version: str = "1.0.0"


@app.get("/health", response_model=HealthResponse)
async def health():
    loaded = embedding_model is not None
    vcount = 0
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM knowledge_vectors")
            vcount = cur.fetchone()[0]
        conn.close()
    except Exception:
        pass

    return HealthResponse(
        status="healthy" if loaded else "degraded",
        model_loaded=loaded,
        model_name=settings.embedding_model,
        device=settings.embedding_device,
        vector_count=vcount,
    )


@app.get("/metrics")
async def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/search", response_model=SearchResponse)
async def search(
    query: str = Field(..., min_length=1, max_length=2000),
    top_k: int = Query(default=5, ge=1, le=50),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    log = logger.bind(
        tenant_id=x_tenant_id,
        request_id=x_request_id,
        query_length=len(query),
        top_k=top_k,
    )

    start_time = time.time()
    log.info("search_start")

    try:
        embed_start = time.time()
        query_vector = embedding_model.encode(query, normalize_embeddings=True)
        EMBEDDING_DURATION.observe(time.time() - embed_start)

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                vector_str = "[" + ",".join(f"{v:.8f}" for v in query_vector) + "]"
                cur.execute("""
                    SELECT chunk_text, source, metadata,
                           1 - (embedding <=> %s::vector) AS score
                    FROM knowledge_vectors
                    WHERE tenant_id = %s
                      AND 1 - (embedding <=> %s::vector) >= %s
                    ORDER BY score DESC
                    LIMIT %s
                """, (vector_str, x_tenant_id, vector_str, settings.pgvector_min_score, top_k))

                rows = cur.fetchall()
        finally:
            conn.close()

        results = [
            SearchResult(
                text=row[0],
                source=row[1],
                score=round(row[3], 4),
                metadata=row[2] or {},
            )
            for row in rows
        ]

        processing_time = round(time.time() - start_time, 3)

        SEARCH_REQUESTS.labels(status="success", tenant_id=x_tenant_id).inc()
        SEARCH_DURATION.observe(processing_time)

        log.info("search_complete", results_count=len(results), processing_time=processing_time)

        return SearchResponse(results=results, processing_time=processing_time)

    except Exception as e:
        processing_time = round(time.time() - start_time, 3)
        SEARCH_REQUESTS.labels(status="error", tenant_id=x_tenant_id).inc()
        log.error("search_failed", error=str(e), processing_time=processing_time)
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@app.post("/index")
async def index_document(
    text: str = Field(..., description="Document text to index"),
    source: str = Field("", description="Source identifier"),
    metadata: dict = Field(default={}),
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
    x_request_id: str | None = Header(None, alias="X-Request-ID"),
):
    if embedding_model is None:
        raise HTTPException(status_code=503, detail="Embedding model not loaded")

    log = logger.bind(
        tenant_id=x_tenant_id,
        request_id=x_request_id,
        text_length=len(text),
        source=source,
    )

    start_time = time.time()
    log.info("index_start")

    try:
        chunks = []
        words = text.split()
        chunk_size = settings.chunk_size
        overlap = settings.chunk_overlap

        for i in range(0, len(words), chunk_size - overlap):
            chunk = " ".join(words[i:i + chunk_size])
            if chunk.strip():
                chunks.append(chunk)

        if not chunks:
            chunks = [text]

        logger.info("chunks_created", chunk_count=len(chunks))

        embed_start = time.time()
        embeddings = embedding_model.encode(chunks, normalize_embeddings=True)
        EMBEDDING_DURATION.observe(time.time() - embed_start)

        conn = get_db_connection()
        try:
            with conn.cursor() as cur:
                for chunk_text, embedding in zip(chunks, embeddings):
                    vector_str = "[" + ",".join(f"{v:.8f}" for v in embedding) + "]"
                    cur.execute("""
                        INSERT INTO knowledge_vectors (tenant_id, chunk_text, source, metadata, embedding)
                        VALUES (%s, %s, %s, %s, %s::vector)
                    """, (x_tenant_id, chunk_text, source, metadata, vector_str))
            conn.commit()
        finally:
            conn.close()

        processing_time = round(time.time() - start_time, 3)

        DOCUMENTS_INDEXED.labels(tenant_id=x_tenant_id, source_type=source or "api").inc(len(chunks))
        VECTOR_COUNT.labels(tenant_id=x_tenant_id).set(
            _get_vector_count(x_tenant_id)
        )

        log.info("index_complete", chunks_indexed=len(chunks), processing_time=processing_time)

        return {
            "status": "success",
            "chunks_indexed": len(chunks),
            "processing_time": processing_time,
        }

    except Exception as e:
        log.error("index_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")


@app.get("/count")
async def vector_count(
    x_tenant_id: str = Header(..., alias="X-Tenant-ID"),
):
    count = _get_vector_count(x_tenant_id)
    return {"tenant_id": x_tenant_id, "vector_count": count}


def _get_vector_count(tenant_id: str) -> int:
    try:
        conn = get_db_connection()
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM knowledge_vectors WHERE tenant_id = %s", (tenant_id,))
            return cur.fetchone()[0]
    except Exception:
        return 0
    finally:
        conn.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.environment == "development",
        log_level=settings.log_level.lower(),
    )
