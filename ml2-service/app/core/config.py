from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "WakeSafe ML2 Service"
    service_version: str = "1.0.0"
    log_level: str = "INFO"

    drowsy_closed_ratio_threshold: float = Field(default=0.35, ge=0, le=1)
    sleeping_closed_ratio_threshold: float = Field(default=0.7, ge=0, le=1)
    avg_closure_threshold: float = Field(default=1.5, ge=0)
    blink_rate_low_threshold: float = Field(default=6.0, ge=0)
    blink_rate_high_threshold: float = Field(default=30.0, ge=0)
    # PARTIAL frames (half-open eyes, blur, glasses glare) still carry fatigue signal.
    # Keep this below 1.0 so a single PARTIAL frame does not count as fully closed.
    partial_as_closed_weight: float = Field(default=0.55, ge=0, le=1)
    # Require this many frames before drowsy/sleeping can trigger. Prevents a single
    # misclassified CLOSED frame from producing closed_eye_ratio=1.0 and instant sleeping.
    min_frames_for_fatigue: int = Field(default=4, ge=1, le=100)

    model_config = SettingsConfigDict(env_prefix="ML2_", extra="ignore")


settings = Settings()
