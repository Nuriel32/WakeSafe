"""Dataset utilities for the WakeSafe eye-state classifier.

Primary source is the MRL Eye Dataset, in which the binary
open / closed label is encoded at filename token index 4
(``s0001_00001_0_0_0_0_0_01.png`` => subject ``s0001``, label ``0`` (closed)).

The split is **subject-based** so that no subject appears in both train
and validation/test partitions; this is essential to verify that the
model generalizes to unseen people instead of memorizing identities.
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np
import torch
from torch.utils.data import Dataset


REPO_ROOT = Path(__file__).resolve().parents[1]
MRL_ROOT = REPO_ROOT / "datasets" / "mrlEyes_2018_01" / "mrlEyes_2018_01"


@dataclass(frozen=True)
class Sample:
    path: Path
    label: int  # 0 = closed, 1 = open
    subject: str


def _parse_sample(path: Path) -> Sample | None:
    parts = path.stem.split("_")
    if len(parts) <= 4:
        return None
    label_token = parts[4]
    if label_token not in ("0", "1"):
        return None
    return Sample(path=path, label=int(label_token), subject=parts[0])


def list_mrl_samples(root: Path = MRL_ROOT) -> list[Sample]:
    samples: list[Sample] = []
    for path in root.rglob("*.png"):
        s = _parse_sample(path)
        if s is not None:
            samples.append(s)
    samples.sort(key=lambda s: (s.subject, s.path.name))
    return samples


def subject_split(
    samples: Sequence[Sample],
    val_ratio: float = 0.10,
    test_ratio: float = 0.10,
    seed: int = 42,
) -> tuple[list[Sample], list[Sample], list[Sample]]:
    """Partition samples into train/val/test with **disjoint subjects**."""
    subjects = sorted({s.subject for s in samples})
    rnd = random.Random(seed)
    rnd.shuffle(subjects)
    n = len(subjects)
    n_val = max(1, int(math.ceil(n * val_ratio)))
    n_test = max(1, int(math.ceil(n * test_ratio)))
    val_subj = set(subjects[:n_val])
    test_subj = set(subjects[n_val : n_val + n_test])
    train, val, test = [], [], []
    for s in samples:
        if s.subject in val_subj:
            val.append(s)
        elif s.subject in test_subj:
            test.append(s)
        else:
            train.append(s)
    return train, val, test


def _augment(bgr: np.ndarray, rng: random.Random) -> np.ndarray:
    img = bgr
    if rng.random() < 0.5:
        img = cv2.flip(img, 1)
    if rng.random() < 0.5:
        # brightness and contrast jitter
        alpha = 1.0 + rng.uniform(-0.25, 0.25)
        beta = rng.uniform(-25.0, 25.0)
        img = np.clip(img.astype(np.float32) * alpha + beta, 0, 255).astype(np.uint8)
    if rng.random() < 0.3:
        ksize = rng.choice([3, 5])
        img = cv2.GaussianBlur(img, (ksize, ksize), 0)
    if rng.random() < 0.5:
        # small rotation
        angle = rng.uniform(-12.0, 12.0)
        h, w = img.shape[:2]
        m = cv2.getRotationMatrix2D((w / 2.0, h / 2.0), angle, 1.0)
        img = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
    if rng.random() < 0.3:
        # small translation crop
        h, w = img.shape[:2]
        dx = int(rng.uniform(-0.08, 0.08) * w)
        dy = int(rng.uniform(-0.08, 0.08) * h)
        m = np.float32([[1, 0, dx], [0, 1, dy]])
        img = cv2.warpAffine(img, m, (w, h), borderMode=cv2.BORDER_REPLICATE)
    return img


class EyeStateDataset(Dataset):
    """Loads BGR eye crops resized to ``image_size`` and normalized.

    Normalization matches the original ``open-closed-eye-0001`` contract
    (``(x - 127) / 255``) so that the trained ``.onnx`` is a drop-in
    replacement for the existing ml1-service pipeline.

    On Windows, reading thousands of tiny PNGs per epoch is dominated by
    filesystem latency, so we eagerly decode every sample into a single
    contiguous ``uint8`` tensor at construction time.  ~85k 32x32 BGR
    crops take roughly 250 MB of RAM, which is well within budget.
    """

    def __init__(
        self,
        samples: Sequence[Sample],
        image_size: int = 32,
        augment: bool = False,
        seed: int = 0,
        eager: bool = True,
    ) -> None:
        self._samples = list(samples)
        self._image_size = image_size
        self._augment = augment
        self._rng = random.Random(seed)
        self._eager_cache: np.ndarray | None = None
        self._labels = np.array([s.label for s in self._samples], dtype=np.int64)
        if eager:
            self._eager_cache = self._load_all()

    def _load_all(self) -> np.ndarray:
        n = len(self._samples)
        cache = np.empty((n, self._image_size, self._image_size, 3), dtype=np.uint8)
        for i, sample in enumerate(self._samples):
            bgr = cv2.imread(str(sample.path), cv2.IMREAD_COLOR)
            if bgr is None:
                bgr = np.full((self._image_size, self._image_size, 3), 127, dtype=np.uint8)
            cache[i] = cv2.resize(bgr, (self._image_size, self._image_size))
        return cache

    def __len__(self) -> int:
        return len(self._samples)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor]:
        if self._eager_cache is not None:
            bgr = self._eager_cache[idx].copy()
        else:
            sample = self._samples[idx]
            bgr = cv2.imread(str(sample.path), cv2.IMREAD_COLOR)
            if bgr is None:
                bgr = np.full((self._image_size, self._image_size, 3), 127, dtype=np.uint8)
            bgr = cv2.resize(bgr, (self._image_size, self._image_size))
        if self._augment:
            bgr = _augment(bgr, self._rng)
        arr = bgr.astype(np.float32)
        arr = (arr - 127.0) / 255.0
        arr = np.transpose(arr, (2, 0, 1))  # HWC -> CHW
        return torch.from_numpy(arr), torch.tensor(int(self._labels[idx]), dtype=torch.long)


def class_balance(samples: Sequence[Sample]) -> dict[str, int]:
    closed = sum(1 for s in samples if s.label == 0)
    return {"open": len(samples) - closed, "closed": closed, "total": len(samples)}
