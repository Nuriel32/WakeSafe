from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    service_name: str = "WakeSafe ML1 Service"
    service_version: str = "1.0.0"
    log_level: str = "INFO"
    model_provider_name: str = "mobilevitv2-placeholder"
    request_timeout_seconds: float = Field(default=10.0, gt=0)
    # Placeholder tuning knobs for eye-state sensitivity in local/mobile testing.
    closed_std_threshold: float = Field(default=33.0, ge=0)
    closed_grad_y_threshold: float = Field(default=3.2, ge=0)
    closed_grad_x_threshold: float = Field(default=4.2, ge=0)
    closed_mean_luma_threshold: float = Field(default=170.0, ge=0)
    open_std_threshold: float = Field(default=42.0, ge=0)
    open_grad_y_threshold: float = Field(default=4.8, ge=0)
    open_grad_x_threshold: float = Field(default=4.8, ge=0)
    no_eyes_std_threshold: float = Field(default=12.0, ge=0)
    no_eyes_grad_threshold: float = Field(default=1.6, ge=0)
    no_eyes_low_luma_threshold: float = Field(default=55.0, ge=0)
    no_eyes_high_luma_threshold: float = Field(default=220.0, ge=0)

    model_config = SettingsConfigDict(env_prefix="ML1_", extra="ignore")


settings = Settings()
