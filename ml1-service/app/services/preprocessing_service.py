from PIL import Image


class PreprocessingService:
    def preprocess(self, image: Image.Image) -> tuple[Image.Image, int]:
        resized = image.resize((224, 224))
        pixels = list(resized.getdata())
        # Deterministic seed from image content for stable placeholders.
        seed = sum((r + g + b) for r, g, b in pixels[::97]) % 10_000
        return resized, seed
