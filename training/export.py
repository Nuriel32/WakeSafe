"""Export the trained PyTorch checkpoint to ONNX (and OpenVINO IR).

The exported ONNX matches the input/output contract expected by
``ml1-service``:

* input  ``input.1`` : ``[1, 3, 32, 32]`` float32 (BGR, already normalized)
* output ``logits``  : ``[1, 2]`` raw logits (the service applies softmax)

The OpenVINO IR additionally bakes the documented mean/scale
preprocessing so the runtime can feed raw uint8 BGR pixels.
"""

from __future__ import annotations

import argparse
import hashlib
from pathlib import Path

import torch

from training.model import WakeSafeEyeNet


REPO_ROOT = Path(__file__).resolve().parents[1]


def _sha384(path: Path) -> str:
    return hashlib.sha384(path.read_bytes()).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--checkpoint", required=True)
    parser.add_argument(
        "--output-onnx",
        default=str(REPO_ROOT / "ml1-service" / "models" / "wakesafe-eye-v1.0.0.onnx"),
    )
    parser.add_argument("--build-ir", action="store_true", help="Also build OpenVINO IR with baked preprocessing.")
    parser.add_argument(
        "--output-ir",
        default=str(REPO_ROOT / "ml1-service" / "models" / "wakesafe-eye-v1.0.0.xml"),
    )
    parser.add_argument("--image-size", type=int, default=32)
    args = parser.parse_args()

    ckpt_path = Path(args.checkpoint)
    state = torch.load(ckpt_path, map_location="cpu")
    model = WakeSafeEyeNet()
    model.load_state_dict(state)
    model.eval()

    onnx_path = Path(args.output_onnx)
    onnx_path.parent.mkdir(parents=True, exist_ok=True)

    dummy = torch.zeros(1, 3, args.image_size, args.image_size, dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        onnx_path,
        input_names=["input.1"],
        output_names=["logits"],
        opset_version=13,
        dynamic_axes={"input.1": {0: "batch"}, "logits": {0: "batch"}},
    )
    print(f"saved ONNX: {onnx_path}")
    print(f"sha384: {_sha384(onnx_path)}")

    if args.build_ir:
        try:
            import openvino as ov
        except ImportError as exc:  # pragma: no cover
            raise SystemExit("openvino not installed; cannot build IR") from exc
        print("building OpenVINO IR with baked preprocessing...")
        m = ov.Core().read_model(onnx_path)
        ppp = ov.preprocess.PrePostProcessor(m)
        ppp.input().tensor().set_element_type(ov.Type.f32).set_layout(ov.Layout("NCHW"))
        ppp.input().preprocess().mean([127.0, 127.0, 127.0]).scale([255.0, 255.0, 255.0])
        m = ppp.build()
        ir_path = Path(args.output_ir)
        ov.save_model(m, str(ir_path))
        print(f"saved IR: {ir_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
