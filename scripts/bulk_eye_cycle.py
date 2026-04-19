#!/usr/bin/env python
"""Bulk ML1 study cycles over labeled eye datasets."""

from __future__ import annotations

import argparse
import json
import pathlib
import random
import statistics
from dataclasses import dataclass
from typing import Iterable

from PIL import Image


@dataclass(frozen=True)
class Sample:
    path: pathlib.Path
    label: str  # open | closed
    mean_luma: float
    std_luma: float


DEFAULT_PARAMS = {
    "no_eyes_mean_low": 55.0,
    "no_eyes_mean_high": 225.0,
    "no_eyes_std_max": 10.0,
    "closed_mean_luma_threshold": 130.0,
    "closed_std_luma_threshold": 55.0,
    "closed_high_mean_luma_threshold": 168.0,
    "closed_high_std_luma_threshold": 52.0,
    "open_std_luma_threshold": 60.0,
    "open_mid_std_luma_threshold": 56.0,
    "open_mid_mean_luma_max": 128.0,
    "partial_band_mean_min": 133.0,
    "partial_band_mean_max": 135.5,
    "partial_band_std_min": 53.5,
    "partial_band_std_max": 56.0,
    "closed_mid_mean_luma_max": 140.0,
    "closed_mid_std_luma_max": 54.5,
    "partial_mean_luma_threshold": 145.0,
    "partial_std_luma_threshold": 60.0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run ML1 bulk study cycles.")
    parser.add_argument(
        "--dataset-root",
        default="datasets/cew_eye_patches_24x24/dataset_B_Eye_Images",
        help="Root directory containing open/closed labeled folders.",
    )
    parser.add_argument(
        "--open-dirs",
        nargs="+",
        default=["openLeftEyes", "openRightEyes"],
        help="Folder names representing open-eye labels.",
    )
    parser.add_argument(
        "--closed-dirs",
        nargs="+",
        default=["closedLeftEyes", "closedRightEyes"],
        help="Folder names representing closed-eye labels.",
    )
    parser.add_argument(
        "--label-source",
        choices=["folder", "filename"],
        default="folder",
        help="How labels are resolved (folder names or filename token).",
    )
    parser.add_argument(
        "--filename-separator",
        default="_",
        help="Separator used when splitting filename into annotation tokens.",
    )
    parser.add_argument(
        "--filename-label-index",
        type=int,
        default=4,
        help="Zero-based token index in filename used as class label.",
    )
    parser.add_argument(
        "--open-values",
        nargs="+",
        default=["1"],
        help="Filename label token values treated as open.",
    )
    parser.add_argument(
        "--closed-values",
        nargs="+",
        default=["0"],
        help="Filename label token values treated as closed.",
    )
    parser.add_argument(
        "--sample-limit-per-class",
        type=int,
        default=0,
        help="Optional per-class limit for faster exploration (0 = all).",
    )
    parser.add_argument(
        "--cycles",
        type=int,
        default=3,
        help="How many tuning cycles to run.",
    )
    parser.add_argument(
        "--random-seed",
        type=int,
        default=42,
        help="Random seed for reproducible sampling.",
    )
    parser.add_argument(
        "--report-json",
        default="datasets/cew_bulk_cycle_report.json",
        help="Where to write report JSON.",
    )
    parser.add_argument(
        "--env-output",
        default="datasets/cew_best_ml1.env",
        help="Where to write best ML1_* env overrides.",
    )
    return parser.parse_args()


def classify(mean_luma: float, std_luma: float, p: dict[str, float]) -> str:
    if (
        (mean_luma <= p["no_eyes_mean_low"] or mean_luma >= p["no_eyes_mean_high"])
        and std_luma <= p["no_eyes_std_max"]
    ):
        return "UNKNOWN"
    if std_luma >= p["open_std_luma_threshold"]:
        return "OPEN"
    if std_luma >= p["open_mid_std_luma_threshold"] and mean_luma <= p["open_mid_mean_luma_max"]:
        return "OPEN"
    if (
        mean_luma >= p["partial_band_mean_min"]
        and mean_luma <= p["partial_band_mean_max"]
        and std_luma >= p["partial_band_std_min"]
        and std_luma <= p["partial_band_std_max"]
    ):
        return "PARTIAL"
    if (
        (mean_luma <= p["closed_mean_luma_threshold"] and std_luma <= p["closed_std_luma_threshold"])
        or (mean_luma <= p["closed_mid_mean_luma_max"] and std_luma <= p["closed_mid_std_luma_max"])
        or (
            mean_luma >= p["closed_high_mean_luma_threshold"]
            and std_luma >= p["closed_high_std_luma_threshold"]
        )
    ):
        return "CLOSED"
    if mean_luma <= p["partial_mean_luma_threshold"] and std_luma <= p["partial_std_luma_threshold"]:
        return "PARTIAL"
    return "OPEN"


def map_binary(pred: str) -> str:
    return "closed" if pred == "CLOSED" else "open"


def score(samples: list[Sample], params: dict[str, float]) -> dict[str, float]:
    counts = {
        ("open", "open"): 0,
        ("open", "closed"): 0,
        ("closed", "open"): 0,
        ("closed", "closed"): 0,
    }
    pred_state_counts = {"OPEN": 0, "CLOSED": 0, "PARTIAL": 0, "UNKNOWN": 0}

    for sample in samples:
        pred = classify(sample.mean_luma, sample.std_luma, params)
        pred_state_counts[pred] += 1
        pred_binary = map_binary(pred)
        counts[(sample.label, pred_binary)] += 1

    open_total = counts[("open", "open")] + counts[("open", "closed")]
    closed_total = counts[("closed", "open")] + counts[("closed", "closed")]
    open_recall = counts[("open", "open")] / max(open_total, 1)
    closed_recall = counts[("closed", "closed")] / max(closed_total, 1)
    balanced_acc = (open_recall + closed_recall) / 2.0
    accuracy = (counts[("open", "open")] + counts[("closed", "closed")]) / max(len(samples), 1)

    return {
        "accuracy": round(accuracy, 6),
        "balanced_accuracy": round(balanced_acc, 6),
        "open_recall": round(open_recall, 6),
        "closed_recall": round(closed_recall, 6),
        "open_as_open": counts[("open", "open")],
        "open_as_closed": counts[("open", "closed")],
        "closed_as_open": counts[("closed", "open")],
        "closed_as_closed": counts[("closed", "closed")],
        "pred_OPEN": pred_state_counts["OPEN"],
        "pred_CLOSED": pred_state_counts["CLOSED"],
        "pred_PARTIAL": pred_state_counts["PARTIAL"],
        "pred_UNKNOWN": pred_state_counts["UNKNOWN"],
    }


def list_images(root: pathlib.Path, folders: Iterable[str]) -> list[pathlib.Path]:
    files: list[pathlib.Path] = []
    for folder in folders:
        folder_path = root / folder
        files.extend(folder_path.glob("*.jpg"))
        files.extend(folder_path.glob("*.png"))
    return sorted(files)


def list_images_recursive(root: pathlib.Path) -> list[pathlib.Path]:
    files = list(root.rglob("*.jpg"))
    files.extend(root.rglob("*.png"))
    return sorted(files)


def label_from_filename(
    file_path: pathlib.Path,
    separator: str,
    label_index: int,
    open_values: set[str],
    closed_values: set[str],
) -> str | None:
    tokens = file_path.stem.split(separator)
    if label_index < 0 or label_index >= len(tokens):
        return None
    value = tokens[label_index]
    if value in open_values:
        return "open"
    if value in closed_values:
        return "closed"
    return None


def load_samples(args: argparse.Namespace) -> list[Sample]:
    # Lazy import to keep script self-contained and avoid global path hacks.
    import sys

    repo_root = pathlib.Path(__file__).resolve().parents[1]
    ml1_path = repo_root / "ml1-service"
    if str(ml1_path) not in sys.path:
        sys.path.insert(0, str(ml1_path))
    from app.services.preprocessing_service import (  # type: ignore[import-not-found]  # pylint: disable=import-error
        PreprocessingService,
    )

    rng = random.Random(args.random_seed)
    root = pathlib.Path(args.dataset_root)
    pre = PreprocessingService()
    samples: list[Sample] = []
    if args.label_source == "folder":
        open_paths = list_images(root, args.open_dirs)
        closed_paths = list_images(root, args.closed_dirs)

        if args.sample_limit_per_class and args.sample_limit_per_class > 0:
            open_paths = rng.sample(open_paths, min(len(open_paths), args.sample_limit_per_class))
            closed_paths = rng.sample(closed_paths, min(len(closed_paths), args.sample_limit_per_class))

        for label, paths in (("open", open_paths), ("closed", closed_paths)):
            for image_path in paths:
                img = Image.open(image_path).convert("RGB")
                _, features = pre.preprocess(img)
                samples.append(
                    Sample(
                        path=image_path,
                        label=label,
                        mean_luma=float(features["eye_band_mean_luma"]),
                        std_luma=float(features["eye_band_std_luma"]),
                    )
                )
        return samples

    open_values = set(args.open_values)
    closed_values = set(args.closed_values)
    open_paths: list[pathlib.Path] = []
    closed_paths: list[pathlib.Path] = []
    for image_path in list_images_recursive(root):
        label = label_from_filename(
            image_path,
            args.filename_separator,
            args.filename_label_index,
            open_values,
            closed_values,
        )
        if label is None:
            continue
        if label == "open":
            open_paths.append(image_path)
        else:
            closed_paths.append(image_path)

    if args.sample_limit_per_class and args.sample_limit_per_class > 0:
        open_paths = rng.sample(open_paths, min(len(open_paths), args.sample_limit_per_class))
        closed_paths = rng.sample(closed_paths, min(len(closed_paths), args.sample_limit_per_class))

    for label, paths in (("open", open_paths), ("closed", closed_paths)):
        for image_path in paths:
            img = Image.open(image_path).convert("RGB")
            _, features = pre.preprocess(img)
            samples.append(
                Sample(
                    path=image_path,
                    label=label,
                    mean_luma=float(features["eye_band_mean_luma"]),
                    std_luma=float(features["eye_band_std_luma"]),
                )
            )
    return samples


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    idx = int(round((pct / 100.0) * (len(ordered) - 1)))
    return float(ordered[max(0, min(idx, len(ordered) - 1))])


def candidate_grid(samples: list[Sample]) -> list[dict[str, float]]:
    open_std = [s.std_luma for s in samples if s.label == "open"]
    open_mean = [s.mean_luma for s in samples if s.label == "open"]
    closed_std = [s.std_luma for s in samples if s.label == "closed"]
    closed_mean = [s.mean_luma for s in samples if s.label == "closed"]

    open_std_cands = sorted(
        {round(percentile(open_std, p), 2) for p in (55, 65, 75, 85, 92)} | {60.0}
    )
    open_mid_std_cands = sorted(
        {round(percentile(open_std, p), 2) for p in (25, 35, 45, 55, 65)} | {56.0}
    )
    open_mid_mean_cands = sorted(
        {round(percentile(open_mean, p), 2) for p in (10, 20, 30, 40, 50)}
    )
    closed_mid_std_cands = sorted(
        {round(percentile(closed_std, p), 2) for p in (55, 60, 65, 70, 75)}
    )
    closed_mid_mean_cands = sorted(
        {round(percentile(closed_mean, p), 2) for p in (60, 65, 70, 75, 80)}
    )

    grid: list[dict[str, float]] = []
    for open_std_val in open_std_cands:
        for open_mid_std in open_mid_std_cands:
            for open_mid_mean in open_mid_mean_cands:
                for closed_mid_std in closed_mid_std_cands:
                    for closed_mid_mean in closed_mid_mean_cands:
                        if open_mid_std > open_std_val:
                            continue
                        params = dict(DEFAULT_PARAMS)
                        params["open_std_luma_threshold"] = open_std_val
                        params["open_mid_std_luma_threshold"] = open_mid_std
                        params["open_mid_mean_luma_max"] = open_mid_mean
                        params["closed_mid_std_luma_max"] = closed_mid_std
                        params["closed_mid_mean_luma_max"] = closed_mid_mean
                        # Keep PARTIAL narrow to avoid collapsing OPEN/CLOSED into PARTIAL.
                        params["partial_band_mean_min"] = max(open_mid_mean + 1.0, 132.0)
                        params["partial_band_mean_max"] = params["partial_band_mean_min"] + 1.5
                        params["partial_band_std_min"] = max(open_mid_std + 0.2, open_std_val - 3.0)
                        params["partial_band_std_max"] = max(
                            params["partial_band_std_min"] + 0.5, open_std_val - 0.1
                        )
                        grid.append(params)
    return grid


def write_env_file(best_params: dict[str, float], path: pathlib.Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        f"ML1_OPEN_STD_LUMA_THRESHOLD={best_params['open_std_luma_threshold']}",
        f"ML1_OPEN_MID_STD_LUMA_THRESHOLD={best_params['open_mid_std_luma_threshold']}",
        f"ML1_OPEN_MID_MEAN_LUMA_MAX={best_params['open_mid_mean_luma_max']}",
        f"ML1_CLOSED_MID_STD_LUMA_MAX={best_params['closed_mid_std_luma_max']}",
        f"ML1_CLOSED_MID_MEAN_LUMA_MAX={best_params['closed_mid_mean_luma_max']}",
        f"ML1_PARTIAL_BAND_MEAN_MIN={best_params['partial_band_mean_min']}",
        f"ML1_PARTIAL_BAND_MEAN_MAX={best_params['partial_band_mean_max']}",
        f"ML1_PARTIAL_BAND_STD_MIN={best_params['partial_band_std_min']}",
        f"ML1_PARTIAL_BAND_STD_MAX={best_params['partial_band_std_max']}",
    ]
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> int:
    args = parse_args()
    samples = load_samples(args)
    if not samples:
        raise SystemExit("No samples loaded. Check dataset path and class folder names.")

    base_score = score(samples, DEFAULT_PARAMS)
    print(f"Loaded {len(samples)} samples.")
    print("Baseline score:", json.dumps(base_score, indent=2))

    best_params = dict(DEFAULT_PARAMS)
    best_score = dict(base_score)
    cycles: list[dict[str, object]] = []

    search_pool = candidate_grid(samples)
    random.Random(args.random_seed).shuffle(search_pool)
    if args.cycles > 0:
        per_cycle = max(1, len(search_pool) // args.cycles)
    else:
        per_cycle = len(search_pool)

    for cycle_idx in range(args.cycles):
        start = cycle_idx * per_cycle
        end = min(len(search_pool), (cycle_idx + 1) * per_cycle)
        segment = search_pool[start:end]
        if not segment:
            break

        local_best_params = best_params
        local_best_score = best_score
        for params in segment:
            cur = score(samples, params)
            better = (
                cur["balanced_accuracy"] > local_best_score["balanced_accuracy"]
                or (
                    cur["balanced_accuracy"] == local_best_score["balanced_accuracy"]
                    and cur["accuracy"] > local_best_score["accuracy"]
                )
            )
            if better:
                local_best_score = cur
                local_best_params = params

        best_params = local_best_params
        best_score = local_best_score
        cycle_report = {
            "cycle": cycle_idx + 1,
            "balanced_accuracy": best_score["balanced_accuracy"],
            "accuracy": best_score["accuracy"],
            "open_recall": best_score["open_recall"],
            "closed_recall": best_score["closed_recall"],
        }
        cycles.append(cycle_report)
        print("Cycle", cycle_idx + 1, "best:", json.dumps(cycle_report))

    report = {
        "dataset_root": args.dataset_root,
        "sample_count": len(samples),
        "open_count": sum(1 for s in samples if s.label == "open"),
        "closed_count": sum(1 for s in samples if s.label == "closed"),
        "feature_stats": {
            "open_mean_luma_avg": round(
                statistics.mean([s.mean_luma for s in samples if s.label == "open"]), 4
            ),
            "closed_mean_luma_avg": round(
                statistics.mean([s.mean_luma for s in samples if s.label == "closed"]), 4
            ),
            "open_std_luma_avg": round(
                statistics.mean([s.std_luma for s in samples if s.label == "open"]), 4
            ),
            "closed_std_luma_avg": round(
                statistics.mean([s.std_luma for s in samples if s.label == "closed"]), 4
            ),
        },
        "baseline": base_score,
        "best": best_score,
        "best_params": best_params,
        "cycles": cycles,
    }

    report_path = pathlib.Path(args.report_json)
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
    write_env_file(best_params, pathlib.Path(args.env_output))

    print(f"Report saved to: {report_path}")
    print(f"Env overrides saved to: {args.env_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
