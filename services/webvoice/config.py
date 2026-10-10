from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 4004
    environment: str = "development"
    log_level: str = "INFO"

    # Orchestrator URL (primary — handles full STT→RAG→LLM→TTS pipeline)
    orchestrator_url: str = "http://localhost:4002"

    class Config:
        env_prefix = "WEBVOICE_"


settings = Settings()
