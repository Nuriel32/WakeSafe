from dataclasses import dataclass

from PIL import Image

from app.core.config import settings


@dataclass(frozen=True)
class ModelProvider:
    name: str

    def infer(self, image: Image.Image, features: dict) -> dict:
        """
        Deterministic placeholder for future MobileViT-v2 integration.
        """
        feature_seed = int(features.get("seed", 0))
        mean_luma = float(features.get("eye_band_mean_luma", 0.0))
        std_luma = float(features.get("eye_band_std_luma", 0.0))
        vision_status = "ok"
        guidance_message = None

        if (
            (mean_luma <= settings.no_eyes_mean_low or mean_luma >= settings.no_eyes_mean_high)
            and std_luma <= settings.no_eyes_std_max
        ):
            eye_state = "UNKNOWN"
            vision_status = "no_eyes_detected"
            guidance_message = "Eyes are not clearly visible. Center your face and improve front lighting."
        elif std_luma >= settings.open_std_luma_threshold:
            eye_state = "OPEN"
        elif std_luma >= settings.open_mid_std_luma_threshold and mean_luma <= settings.open_mid_mean_luma_max:
            eye_state = "OPEN"
        elif (
            mean_luma >= settings.partial_band_mean_min
            and mean_luma <= settings.partial_band_mean_max
            and std_luma >= settings.partial_band_std_min
            and std_luma <= settings.partial_band_std_max
        ):
            eye_state = "PARTIAL"
        elif (
            (mean_luma <= settings.closed_mean_luma_threshold and std_luma <= settings.closed_std_luma_threshold)
            or (mean_luma <= settings.closed_mid_mean_luma_max and std_luma <= settings.closed_mid_std_luma_max)
            or (mean_luma >= settings.closed_high_mean_luma_threshold and std_luma >= settings.closed_high_std_luma_threshold)
        ):
            eye_state = "CLOSED"
        elif mean_luma <= settings.partial_mean_luma_threshold and std_luma <= settings.partial_std_luma_threshold:
            eye_state = "PARTIAL"
        else:
            eye_state = "OPEN"

        texture_strength = min(std_luma / 40.0, 1.0)
        base_confidence = 0.55 + (texture_strength * 0.35)
        confidence = min(max(base_confidence, 0.0), 1.0)

        ear_lookup = {
            "OPEN": 0.30,
            "PARTIAL": 0.22,
            "CLOSED": 0.12,
            "UNKNOWN": None,
        }
        ear = ear_lookup[eye_state]

        return {
            "eye_state": eye_state,
            "confidence": round(confidence, 4),
            "ear": ear,
            "vision_status": vision_status,
            "guidance_message": guidance_message,
            "head_pose": {
                "pitch": round(((feature_seed % 15) - 7) * 0.9, 3),
                "yaw": round(((feature_seed % 13) - 6) * 1.1, 3),
                "roll": round(((feature_seed % 9) - 4) * 0.8, 3),
            }
            if eye_state != "UNKNOWN"
            else {"pitch": None, "yaw": None, "roll": None},
        }


def load_model_provider() -> ModelProvider:
    return ModelProvider(name=settings.model_provider_name)
