from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings, loaded from environment variables (or a local .env file)."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "CampusBite API"
    environment: str = "development"
    log_level: str = "INFO"

    database_url: str = "sqlite:///./campusbite.db"

    jwt_secret_key: str = "dev-only-insecure-secret-change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24

    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"

    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    # Optional: any OpenAI-compatible endpoint, e.g. Google Gemini at
    # https://generativelanguage.googleapis.com/v1beta/openai/ . Blank = api.openai.com.
    openai_base_url: str | None = None
    # Generous because "thinking" models (e.g. Gemini) spend part of this budget on hidden reasoning.
    ai_max_output_tokens: int = 2000
    openai_timeout_seconds: float = 30.0
    ai_rate_limit_per_minute: int = 5
    ai_max_orders: int = 50

    reminder_threshold_minutes: int = 15
    reminder_check_interval_seconds: int = 60
    enable_reminder_scheduler: bool = True

    seed_demo_data: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_sqlite(self) -> bool:
        return self.database_url.startswith("sqlite")


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
