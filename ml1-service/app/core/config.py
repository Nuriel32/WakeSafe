from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "WakeSafe ML1 Service"
    service_version: str = "1.0.0"
    log_level: str = "INFO"
    model_provider_name: str = "mobilevitv2-placeholder"
    request_timeout_seconds: float = Field(default=10.0, gt=0)

    model_config = SettingsConfigDict(env_prefix="ML1_", extra="ignore")


settings = Settings()
