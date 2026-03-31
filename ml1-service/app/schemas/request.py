from typing import Optional

from pydantic import BaseModel, Field, model_validator


class ImageMetadata(BaseModel):
    sequence_number: Optional[int] = None
    capture_timestamp: Optional[int] = None


class ML1PredictRequest(BaseModel):
    image_url: Optional[str] = None
    image_base64: Optional[str] = None
    user_id: Optional[str] = None
    session_id: Optional[str] = None
    image_id: Optional[str] = None
    image_metadata: ImageMetadata = Field(default_factory=ImageMetadata)

    @model_validator(mode="after")
    def validate_image_source(self) -> "ML1PredictRequest":
        if not self.image_url and not self.image_base64:
            raise ValueError("Either image_url or image_base64 must be provided")
        return self
