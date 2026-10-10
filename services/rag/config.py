from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8003
    environment: str = "development"
    log_level: str = "INFO"

    # PostgreSQL + pgvector
    database_url: str = "postgresql://postgres:postgres@localhost:5432/voice_saas"
    pgvector_min_score: float = 0.5
    pgvector_default_top_k: int = 5

    # Embedding model
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    embedding_device: str = "cpu"
    embedding_dimension: int = 384

    # Chunking
    chunk_size: int = 512
    chunk_overlap: int = 64

    class Config:
        env_prefix = "RAG_"


settings = Settings()
