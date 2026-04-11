from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "WakeSafe ML2 Service"
    service_version: str = "1.0.0"
    log_level: str = "INFO"

    drowsy_closed_ratio_threshold: float = Field(default=0.35, ge=0, le=1)
    sleeping_closed_ratio_threshold: float = Field(default=0.7, ge=0, le=1)
    treat_partial_as_closed: bool = False
    avg_closure_threshold: float = Field(default=1.5, ge=0)
    blink_rate_low_threshold: float = Field(default=6.0, ge=0)
    blink_rate_high_threshold: float = Field(default=30.0, ge=0)

    model_config = SettingsConfigDict(env_prefix="ML2_", extra="ignore")


settings = Settings()
