from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    host: str = "0.0.0.0"
    port: int = 8002
    environment: str = "development"
    log_level: str = "INFO"

    # IndicF5 (GPU primary)
    indicf5_enabled: bool = False
    indicf5_device: str = "cuda"
    indicf5_model: str = "ai4bharat/IndicF5-7B"
    indicf5_prompts_dir: str = "/app/prompts"
    indicf5_max_audio_length: int = 30

    # Piper (CPU fallback)
    piper_model: str = "en_US-lessac-medium"
    piper_data_dir: str = "/app/models"
    default_speaker_id: int = 0
    default_sample_rate: int = 22050

    # Redis (optional, for cache)
    redis_url: str = "redis://localhost:6379"

    class Config:
        env_prefix = "TTS_"


settings = Settings()
