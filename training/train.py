"""Train the WakeSafe eye-state CNN.

Usage::

    python -m training.train --epochs 12 --batch-size 256 --output-dir training/runs/v1
"""

from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import torch
from torch import nn
from torch.utils.data import DataLoader

from training.dataset import (
    EyeStateDataset,
    class_balance,
    list_mrl_samples,
    subject_split,
)
from training.model import WakeSafeEyeNet, num_parameters


REPO_ROOT = Path(__file__).resolve().parents[1]


def _device() -> torch.device:
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


@torch.no_grad()
def evaluate(model: nn.Module, loader: DataLoader, device: torch.device) -> dict[str, float]:
    model.eval()
    total = 0
    correct = 0
    open_total = open_correct = closed_total = closed_correct = 0
    for x, y in loader:
        x = x.to(device, non_blocking=True)
        y = y.to(device, non_blocking=True)
        logits = model(x)
        pred = logits.argmax(dim=1)
        correct += (pred == y).sum().item()
        total += y.size(0)
        open_total += (y == 1).sum().item()
        closed_total += (y == 0).sum().item()
        open_correct += ((pred == 1) & (y == 1)).sum().item()
        closed_correct += ((pred == 0) & (y == 0)).sum().item()
    accuracy = correct / max(total, 1)
    open_recall = open_correct / max(open_total, 1)
    closed_recall = closed_correct / max(closed_total, 1)
    return {
        "samples": total,
        "accuracy": accuracy,
        "balanced_accuracy": (open_recall + closed_recall) / 2.0,
        "open_recall": open_recall,
        "closed_recall": closed_recall,
    }


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser()
    p.add_argument("--epochs", type=int, default=12)
    p.add_argument("--batch-size", type=int, default=256)
    p.add_argument("--lr", type=float, default=3e-3)
    p.add_argument("--weight-decay", type=float, default=1e-4)
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--num-workers", type=int, default=4)
    p.add_argument("--image-size", type=int, default=32)
    p.add_argument("--output-dir", default=str(REPO_ROOT / "training" / "runs" / "v1"))
    return p.parse_args()


def main() -> int:
    args = parse_args()
    torch.manual_seed(args.seed)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    print("collecting MRL samples...")
    samples = list_mrl_samples()
    if not samples:
        raise SystemExit("no MRL samples found; check datasets/mrlEyes_2018_01")

    train_s, val_s, test_s = subject_split(samples, val_ratio=0.1, test_ratio=0.1, seed=args.seed)
    print(f"train: {class_balance(train_s)}")
    print(f"val:   {class_balance(val_s)}")
    print(f"test:  {class_balance(test_s)}")

    train_ds = EyeStateDataset(train_s, image_size=args.image_size, augment=True, seed=args.seed)
    val_ds = EyeStateDataset(val_s, image_size=args.image_size, augment=False)
    test_ds = EyeStateDataset(test_s, image_size=args.image_size, augment=False)

    pin = torch.cuda.is_available()
    train_loader = DataLoader(
        train_ds,
        batch_size=args.batch_size,
        shuffle=True,
        num_workers=args.num_workers,
        pin_memory=pin,
        drop_last=True,
    )
    val_loader = DataLoader(
        val_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=pin,
    )
    test_loader = DataLoader(
        test_ds,
        batch_size=args.batch_size,
        shuffle=False,
        num_workers=args.num_workers,
        pin_memory=pin,
    )

    device = _device()
    print(f"device: {device}")
    model = WakeSafeEyeNet().to(device)
    print(f"model parameters: {num_parameters(model):,}")

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss()

    best_val_acc = 0.0
    best_state = None
    history = []
    for epoch in range(1, args.epochs + 1):
        model.train()
        epoch_loss = 0.0
        seen = 0
        t0 = time.perf_counter()
        for x, y in train_loader:
            x = x.to(device, non_blocking=True)
            y = y.to(device, non_blocking=True)
            optimizer.zero_grad(set_to_none=True)
            logits = model(x)
            loss = criterion(logits, y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * y.size(0)
            seen += y.size(0)
        scheduler.step()
        train_loss = epoch_loss / max(seen, 1)
        val_metrics = evaluate(model, val_loader, device)
        elapsed = time.perf_counter() - t0
        log = {
            "epoch": epoch,
            "train_loss": round(train_loss, 5),
            "val": {k: round(v, 5) for k, v in val_metrics.items()},
            "lr": round(scheduler.get_last_lr()[0], 6),
            "seconds": round(elapsed, 2),
        }
        history.append(log)
        print(json.dumps(log))
        if val_metrics["balanced_accuracy"] > best_val_acc:
            best_val_acc = val_metrics["balanced_accuracy"]
            best_state = {k: v.detach().cpu() for k, v in model.state_dict().items()}

    if best_state is not None:
        model.load_state_dict(best_state)
        torch.save(best_state, out_dir / "best.pt")
        print(f"saved best checkpoint to {out_dir / 'best.pt'} (val balanced_acc={best_val_acc:.4f})")

    test_metrics = evaluate(model, test_loader, device)
    print("test metrics:", json.dumps(test_metrics))

    summary = {
        "args": vars(args),
        "model_parameters": num_parameters(model),
        "splits": {
            "train": class_balance(train_s),
            "val": class_balance(val_s),
            "test": class_balance(test_s),
        },
        "history": history,
        "best_val_balanced_accuracy": round(best_val_acc, 5),
        "test": {k: round(v, 5) for k, v in test_metrics.items()},
    }
    (out_dir / "summary.json").write_text(json.dumps(summary, indent=2), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
