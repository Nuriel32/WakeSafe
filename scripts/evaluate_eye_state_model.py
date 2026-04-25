#!/usr/bin/env python
"""Evaluate the new ML1 eye-state pipeline on labeled datasets.

Examples
--------

Evaluate on the user's labeled session photos::

    python scripts/evaluate_eye_state_model.py --dataset session

Evaluate on a sample of MRL Eye Dataset (eye crops, label encoded in
filename token index 4)::

    python scripts/evaluate_eye_state_model.py --dataset mrl --sample 600

Evaluate on the CEW face dataset (full faces, labeled by folder)::

    python scripts/evaluate_eye_state_model.py --dataset cew --sample 600
"""

from __future__ import annotations

import argparse
import json
import pathlib
import random
import sys
from typing import Iterable

REPO_ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "ml1-service"))

import cv2  # noqa: E402

from app.schemas.request import ML1PredictRequest  # noqa: E402
from app.services.inference_service import FrameInferenceService  # noqa: E402
from app.services.model_loader import load_model_provider  # noqa: E402


SESSION_DIR = (
    REPO_ROOT
    / "server"
    / "uploads"
    / "drivers"
    / "69d41f526698a9067d6a5291"
    / "sessions"
    / "69eb8cf77ed1a1b84956dc02"
    / "photos"
    / "before-ai"
)

SESSION_LABELS = {
    "photo_000002_1777044737186_96e8cf81.jpg": "CLOSED",
    "photo_000003_1777044742194_7f34e905.jpg": "OPEN",
    "photo_000004_1777044747166_6f715e48.jpg": "CLOSED",
    "photo_000005_1777044752135_8d76c6c1.jpg": "CLOSED",
    "photo_000006_1777044757212_44e69ed9.jpg": "CLOSED",
    "photo_000007_1777044762198_8e7c176f.jpg": "CLOSED",
}


def _binary(label: str) -> str:
    return "open" if label.upper() == "OPEN" else "closed"


def _labeled_session() -> Iterable[tuple[pathlib.Path, str]]:
    for name, label in SESSION_LABELS.items():
        yield SESSION_DIR / name, label


def _labeled_mrl(sample: int, seed: int) -> Iterable[tuple[pathlib.Path, str]]:
    root = REPO_ROOT / "datasets" / "mrlEyes_2018_01" / "mrlEyes_2018_01"
    files = [
        p
        for p in root.rglob("*.png")
        if len(p.stem.split("_")) > 4 and p.stem.split("_")[4] in ("0", "1")
    ]
    random.Random(seed).shuffle(files)
    for f in files[:sample]:
        label = "OPEN" if f.stem.split("_")[4] == "1" else "CLOSED"
        yield f, label


def _labeled_cew(sample: int, seed: int) -> Iterable[tuple[pathlib.Path, str]]:
    root = REPO_ROOT / "datasets" / "cew_faces_100x100" / "dataset_B_FacialImages"
    rnd = random.Random(seed)
    open_paths = list((root / "OpenFace").glob("*.jpg"))
    closed_paths = list((root / "ClosedFace").glob("*.jpg"))
    open_pick = rnd.sample(open_paths, min(sample // 2, len(open_paths)))
    closed_pick = rnd.sample(closed_paths, min(sample // 2, len(closed_paths)))
    for label, group in (("OPEN", open_pick), ("CLOSED", closed_pick)):
        for f in group:
            yield f, label


def _score(records: list[dict]) -> dict:
    if not records:
        return {"samples": 0}
    counts = {("open", "open"): 0, ("open", "closed"): 0, ("closed", "open"): 0, ("closed", "closed"): 0}
    skipped = 0
    for r in records:
        if r["pred"] == "UNKNOWN":
            skipped += 1
            continue
        gold = _binary(r["label"])
        pred = _binary(r["pred"])
        counts[(gold, pred)] += 1
    n = sum(counts.values())
    open_total = counts[("open", "open")] + counts[("open", "closed")]
    closed_total = counts[("closed", "open")] + counts[("closed", "closed")]
    open_recall = counts[("open", "open")] / max(open_total, 1)
    closed_recall = counts[("closed", "closed")] / max(closed_total, 1)
    accuracy = (counts[("open", "open")] + counts[("closed", "closed")]) / max(n, 1)
    return {
        "samples": n,
        "skipped_unknown": skipped,
        "accuracy": round(accuracy, 4),
        "balanced_accuracy": round((open_recall + closed_recall) / 2, 4),
        "open_recall": round(open_recall, 4),
        "closed_recall": round(closed_recall, 4),
        "confusion": {f"{g}->{p}": c for (g, p), c in counts.items()},
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dataset", choices=("session", "mrl", "cew"), default="session"
    )
    parser.add_argument("--sample", type=int, default=600)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--report-json", default=None)
    parser.add_argument(
        "--bypass-detector",
        action="store_true",
        help="Treat each input as a pre-cropped eye patch (skip face/landmark stages).",
    )
    args = parser.parse_args()

    if args.dataset == "session":
        items = list(_labeled_session())
    elif args.dataset == "mrl":
        items = list(_labeled_mrl(args.sample, args.seed))
    else:
        items = list(_labeled_cew(args.sample, args.seed))

    records: list[dict] = []
    if args.bypass_detector:
        provider = load_model_provider()
        model_version = provider.model_version
        for path, label in items:
            patch = cv2.imread(str(path))
            if patch is None:
                records.append({"file": path.name, "label": label, "pred": "ERROR", "error": "cv2_read_failed"})
                continue
            probs = provider.classify_eye(patch)
            pred = "OPEN" if probs.p_open >= probs.p_closed else "CLOSED"
            records.append(
                {
                    "file": path.name,
                    "label": label,
                    "pred": pred,
                    "p_open": round(probs.p_open, 4),
                    "p_closed": round(probs.p_closed, 4),
                    "confidence": round(max(probs.p_open, probs.p_closed), 4),
                    "eyes_used": 1,
                }
            )
    else:
        svc = FrameInferenceService()
        model_version = svc._model_provider.model_version  # noqa: SLF001 - eval helper
        for path, label in items:
            try:
                r = svc.predict(
                    ML1PredictRequest(image_url=str(path), image_id=path.name, session_id="eval")
                )
            except Exception as exc:  # pragma: no cover - eval-only safety
                records.append({"file": str(path), "label": label, "pred": "ERROR", "error": str(exc)})
                continue
            fa = r.frame_analysis
            records.append(
                {
                    "file": path.name,
                    "label": label,
                    "pred": fa.eye_state if fa else "ERROR",
                    "p_open": fa.p_open if fa else None,
                    "p_closed": fa.p_closed if fa else None,
                    "confidence": fa.confidence if fa else None,
                    "eyes_used": fa.eyes_used if fa else None,
                }
            )

    metrics = _score(records)
    report = {
        "dataset": args.dataset,
        "sample_request": args.sample,
        "bypass_detector": args.bypass_detector,
        "metrics": metrics,
        "model_version": model_version,
    }
    print(json.dumps(report, indent=2))
    if args.dataset == "session":
        print(json.dumps(records, indent=2))
    if args.report_json:
        out = pathlib.Path(args.report_json)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps({"summary": report, "records": records}, indent=2),
            encoding="utf-8",
        )
        print(f"report saved to {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
