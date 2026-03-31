import base64
import io
from typing import Optional

import requests
from PIL import Image

from app.core.config import settings


def _decode_base64_image(image_base64: str) -> bytes:
    payload = image_base64
    if "," in image_base64 and image_base64.startswith("data:"):
        payload = image_base64.split(",", maxsplit=1)[1]
    try:
        return base64.b64decode(payload, validate=True)
    except Exception as exc:  # pragma: no cover - fallback safety
        raise ValueError("Invalid image_base64 payload") from exc


def _download_image(image_url: str) -> bytes:
    try:
        response = requests.get(image_url, timeout=settings.request_timeout_seconds)
        response.raise_for_status()
        return response.content
    except requests.RequestException as exc:
        raise ValueError("Unable to fetch image_url") from exc


def load_image(image_url: Optional[str] = None, image_base64: Optional[str] = None) -> Image.Image:
    if image_base64:
        raw = _decode_base64_image(image_base64)
    elif image_url:
        raw = _download_image(image_url)
    else:
        raise ValueError("No image source provided")

    try:
        image = Image.open(io.BytesIO(raw)).convert("RGB")
        image.load()
        return image
    except Exception as exc:
        raise ValueError("Image cannot be decoded/processed") from exc
