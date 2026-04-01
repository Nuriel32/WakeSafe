from PIL import Image


class PreprocessingService:
    def preprocess(self, image: Image.Image) -> tuple[Image.Image, dict]:
        resized = image.resize((224, 224))
        pixels = list(resized.getdata())
        # Deterministic seed from image content for stable placeholders.
        seed = sum((r + g + b) for r, g, b in pixels[::97]) % 10_000

        # Eye band heuristic (upper-middle strip) to make placeholder less random.
        eye_band = resized.crop((44, 62, 180, 126))
        eye_pixels = list(eye_band.getdata())
        luminance = [0.299 * r + 0.587 * g + 0.114 * b for r, g, b in eye_pixels]
        mean_luma = sum(luminance) / max(len(luminance), 1)
        variance = sum((value - mean_luma) ** 2 for value in luminance) / max(len(luminance), 1)
        std_luma = variance**0.5

        return resized, {
            "seed": seed,
            "eye_band_mean_luma": round(mean_luma, 4),
            "eye_band_std_luma": round(std_luma, 4),
        }
