from dataclasses import dataclass

from PIL import Image

from app.core.config import settings


@dataclass(frozen=True)
class ModelProvider:
    name: str

    def infer(self, image: Image.Image, feature_seed: int) -> dict:
        """
        Deterministic placeholder for future MobileViT-v2 integration.
        """
        eye_states = ["OPEN", "PARTIAL", "CLOSED", "UNKNOWN"]
        eye_state = eye_states[feature_seed % len(eye_states)]

        base_confidence = 0.55 + ((feature_seed % 35) / 100)
        confidence = min(max(base_confidence, 0.0), 1.0)

        ear_lookup = {
            "OPEN": 0.30,
            "PARTIAL": 0.22,
            "CLOSED": 0.14,
            "UNKNOWN": None,
        }
        ear = ear_lookup[eye_state]

        return {
            "eye_state": eye_state,
            "confidence": round(confidence, 4),
            "ear": ear,
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
