from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


_DEFAULT_MODELS_DIR = Path(__file__).resolve().parents[2] / "models"


class Settings(BaseSettings):
    """Configuration for the ML1 (frame-level eye state) service.

    The service runs a real CNN classifier (open-closed-eye-0001) backed by
    detector + landmark models. Heuristic logic is no longer the source of
    truth and exists only as an optional last-resort fallback.
    """

    service_name: str = "WakeSafe ML1 Service"
    service_version: str = "2.0.0"
    log_level: str = "INFO"
    request_timeout_seconds: float = Field(default=10.0, gt=0)

    # ---- Model artifacts (OpenVINO IR / ONNX) ----
    models_dir: Path = Field(default=_DEFAULT_MODELS_DIR)

    # Face detector (OpenVINO IR). Inputs: 1x3x300x300 BGR.
    face_detector_xml: str = Field(default="face-detection-retail-0004.xml")
    face_detector_min_confidence: float = Field(default=0.5, ge=0, le=1)

    # 5-point landmark regressor (OpenVINO IR). Inputs: 1x3x48x48 BGR.
    landmarks_xml: str = Field(default="landmarks-regression-retail-0009.xml")

    # Eye state classifier (OpenVINO IR with baked preprocessing).
    # Defaults point to ``wakesafe-eye-vX.Y.Z`` — a custom CNN trained in
    # this repo on a subject-held-out split of the MRL Eye Dataset (see
    # ``training/MODEL_CARD.md``). Use the legacy ``open_closed_eye_ir.xml``
    # only as an emergency rollback target.
    eye_classifier_xml: str = Field(default="wakesafe-eye-v1.0.0.xml")
    eye_classifier_onnx: str = Field(default="wakesafe-eye-v1.0.0.onnx")

    # Output index for the "open" class. ``WakeSafeEyeNet`` is trained with
    # labels {0=closed, 1=open}, so open=1 (matches the empirically-verified
    # mapping of ``open-closed-eye-0001`` as well).
    eye_classifier_open_index: int = Field(default=1, ge=0, le=1)

    # ---- Model identity ----
    model_version: str = Field(default="wakesafe-eye-v1.0.0")
    model_checksum_sha384: str = Field(
        default=(
            "927c44a3e8a860749ec5a06cc4bcae3d44b007112b1d8c529226163fecb764c3"
            "e206385624b1bb59f3d08f9eda34c2e8"
        )
    )
    runtime: Literal["openvino", "onnxruntime"] = Field(default="openvino")
    device: str = Field(default="CPU")

    # ---- Decision thresholds ----
    # Eye crop size as a multiple of inter-eye distance. A whole-eye region
    # (~1.0 of inter-eye distance) gives the classifier enough context.
    eye_crop_scale: float = Field(default=1.0, gt=0)

    # Probability bands for OPEN / PARTIAL / CLOSED.
    partial_low: float = Field(default=0.4, ge=0, le=1)
    partial_high: float = Field(default=0.6, ge=0, le=1)

    # Confidence below which we report UNKNOWN even when patches are present.
    confidence_threshold: float = Field(default=0.55, ge=0, le=1)

    # ---- Fallbacks / safety ----
    # If the detector or landmarks fail we report UNKNOWN; this flag is kept
    # only for emergency operational rollback and must remain false in prod.
    enable_heuristic_fallback: bool = Field(default=False)

    model_config = SettingsConfigDict(env_prefix="ML1_", extra="ignore")

    def model_path(self, filename: str) -> Path:
        return self.models_dir / filename


settings = Settings()
