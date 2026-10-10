from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8001
    environment: str = "development"
    log_level: str = "INFO"

    # Whisper config
    whisper_model: str = "base"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    # Redis (optional, for caching)
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_prefix = "STT_"


settings = Settings()
