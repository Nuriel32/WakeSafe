from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "WakeSafe ML1 Service"
    service_version: str = "1.0.0"
    log_level: str = "INFO"
    model_provider_name: str = "mobilevitv2-placeholder"
    request_timeout_seconds: float = Field(default=10.0, gt=0)
    # Placeholder classifier thresholds (tuned for mobile front camera conditions).
    closed_mean_luma_threshold: float = Field(default=130.0, ge=0)
    closed_std_luma_threshold: float = Field(default=55.0, ge=0)
    closed_high_mean_luma_threshold: float = Field(default=168.0, ge=0)
    closed_high_std_luma_threshold: float = Field(default=52.0, ge=0)
    open_std_luma_threshold: float = Field(default=60.0, ge=0)
    open_mid_std_luma_threshold: float = Field(default=56.0, ge=0)
    open_mid_mean_luma_max: float = Field(default=128.0, ge=0)
    partial_band_mean_min: float = Field(default=133.0, ge=0)
    partial_band_mean_max: float = Field(default=135.5, ge=0)
    partial_band_std_min: float = Field(default=53.5, ge=0)
    partial_band_std_max: float = Field(default=56.0, ge=0)
    closed_mid_mean_luma_max: float = Field(default=140.0, ge=0)
    closed_mid_std_luma_max: float = Field(default=54.5, ge=0)
    partial_mean_luma_threshold: float = Field(default=145.0, ge=0)
    partial_std_luma_threshold: float = Field(default=60.0, ge=0)
    no_eyes_mean_low: float = Field(default=55.0, ge=0)
    no_eyes_mean_high: float = Field(default=225.0, ge=0)
    no_eyes_std_max: float = Field(default=10.0, ge=0)

    model_config = SettingsConfigDict(env_prefix="ML1_", extra="ignore")


settings = Settings()
