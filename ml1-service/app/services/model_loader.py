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
        grad_y = float(features.get("eye_band_grad_y_mean", 0.0))
        grad_x = float(features.get("eye_band_grad_x_mean", 0.0))
        vision_status = "ok"
        guidance_message = None

        low_detail = (
            std_luma <= settings.no_eyes_std_threshold
            and grad_y <= settings.no_eyes_grad_threshold
            and grad_x <= settings.no_eyes_grad_threshold
        )
        extreme_exposure = (
            (mean_luma <= settings.no_eyes_low_luma_threshold or mean_luma >= settings.no_eyes_high_luma_threshold)
            and std_luma <= settings.open_std_threshold * 0.6
        )

        if low_detail or extreme_exposure:
            eye_state = "UNKNOWN"
            vision_status = "no_eyes_detected"
            guidance_message = "Eyes are not clearly visible. Align your face in the center and improve lighting."
        elif (
            std_luma <= settings.closed_std_threshold
            and grad_y <= settings.closed_grad_y_threshold
            and grad_x <= settings.closed_grad_x_threshold
            and mean_luma <= settings.closed_mean_luma_threshold
        ):
            eye_state = "CLOSED"
        elif (
            std_luma >= settings.open_std_threshold
            and (grad_y >= settings.open_grad_y_threshold or grad_x >= settings.open_grad_x_threshold)
        ):
            eye_state = "OPEN"
        else:
            eye_state = "PARTIAL"

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
