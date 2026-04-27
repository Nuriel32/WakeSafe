#!/usr/bin/env python
"""Download ML1 model artifacts.

ML1 ships with the **WakeSafe Eye-State CNN** (`wakesafe-eye-vX.Y.Z`),
trained in this repository under ``training/`` and committed to
``ml1-service/models/``. This script does **not** redownload that model —
it is owned and versioned in-repo.

Two upstream Intel models are still used for face localization:

* ``face-detection-retail-0004`` — face bounding box.
* ``landmarks-regression-retail-0009`` — 5-point landmarks for eye centers.

The legacy public eye classifier ``open-closed-eye-0001`` can optionally
be downloaded as an emergency rollback target via ``--fetch-legacy-eye``.
"""

from __future__ import annotations

import argparse
import hashlib
import pathlib
import sys
import urllib.request

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
DEFAULT_OUT = REPO_ROOT / "ml1-service" / "models"

EYE_ONNX_URL = (
    "https://storage.openvinotoolkit.org/repositories/open_model_zoo/"
    "public/2022.1/open-closed-eye-0001/open_closed_eye.onnx"
)
EYE_ONNX_SHA384 = (
    "2615bce53b55620c629db21b043057600ccc53466f053c0a8277c43577c2db21"
    "e48f330cf9b15213016d17cddb8cba27"
)

INTEL_BASE = (
    "https://storage.openvinotoolkit.org/repositories/open_model_zoo/"
    "2022.1/models_bin/2/{name}/FP32/{name}.{ext}"
)
INTEL_MODELS = (
    "face-detection-retail-0004",
    "landmarks-regression-retail-0009",
)


def download(url: str, dest: pathlib.Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"-> {url}")
    urllib.request.urlretrieve(url, dest)
    print(f"   saved {dest} ({dest.stat().st_size} bytes)")


def sha384(path: pathlib.Path) -> str:
    return hashlib.sha384(path.read_bytes()).hexdigest()


def build_ir(out_dir: pathlib.Path) -> None:
    """Convert the eye classifier ONNX into IR with baked preprocessing.

    Importing OpenVINO is deferred so this script can still run on
    environments where only ``onnxruntime`` is available (in that case the
    IR is not produced and the runtime can fall back to the raw ONNX).
    """
    try:
        import openvino as ov
    except ImportError:
        print("openvino not installed; skipping IR build")
        return

    onnx_path = out_dir / "open_closed_eye.onnx"
    ir_path = out_dir / "open_closed_eye_ir.xml"
    print(f"-> building OpenVINO IR with baked preprocessing -> {ir_path}")
    model = ov.Core().read_model(onnx_path)
    ppp = ov.preprocess.PrePostProcessor(model)
    ppp.input().tensor().set_element_type(ov.Type.f32).set_layout(ov.Layout("NCHW"))
    ppp.input().preprocess().mean([127.0, 127.0, 127.0]).scale([255.0, 255.0, 255.0])
    model = ppp.build()
    ov.save_model(model, str(ir_path))
    print(f"   saved {ir_path}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=str(DEFAULT_OUT))
    parser.add_argument(
        "--fetch-legacy-eye",
        action="store_true",
        help="Also download the legacy open-closed-eye-0001 ONNX as a fallback target.",
    )
    args = parser.parse_args()

    out_dir = pathlib.Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    for name in INTEL_MODELS:
        for ext in ("xml", "bin"):
            target = out_dir / f"{name}.{ext}"
            if target.exists():
                continue
            download(INTEL_BASE.format(name=name, ext=ext), target)

    if args.fetch_legacy_eye:
        eye_path = out_dir / "open_closed_eye.onnx"
        if not eye_path.exists():
            download(EYE_ONNX_URL, eye_path)
        actual = sha384(eye_path)
        if actual != EYE_ONNX_SHA384:
            print(
                f"ERROR: open_closed_eye.onnx checksum mismatch\n"
                f"  expected: {EYE_ONNX_SHA384}\n"
                f"  actual:   {actual}",
                file=sys.stderr,
            )
            return 1
        print(f"   sha384 verified: {actual}")
        build_ir(out_dir)

    primary = out_dir / "wakesafe-eye-v1.0.0.onnx"
    if not primary.exists():
        print(
            "WARNING: wakesafe-eye-v1.0.0.onnx not found in models/.\n"
            "Train and export it with `python -m training.train` and `python -m training.export`."
        )

    print("done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
