"""WakeSafe Eye-State CNN.

A small 5-block convolutional classifier designed specifically as a
drop-in replacement for the ``open-closed-eye-0001`` ONNX consumed by
``ml1-service``: input ``1x3x32x32`` BGR (already mean/scale normalized
by the caller), output 2 logits softmaxed externally.

This is a custom architecture authored for WakeSafe; weights are
trained from scratch on subject-split MRL Eye Dataset (and any
WakeSafe captures supplied via ``--extra-data``).
"""

from __future__ import annotations

import torch
from torch import nn


def _conv_block(in_ch: int, out_ch: int) -> nn.Sequential:
    return nn.Sequential(
        nn.Conv2d(in_ch, out_ch, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(out_ch),
        nn.ReLU(inplace=True),
    )


class WakeSafeEyeNet(nn.Module):
    """Custom small CNN for binary eye-state classification."""

    def __init__(self, num_classes: int = 2, base_channels: int = 16) -> None:
        super().__init__()
        c1, c2, c3, c4 = (
            base_channels,
            base_channels * 2,
            base_channels * 4,
            base_channels * 8,
        )
        self.features = nn.Sequential(
            _conv_block(3, c1),
            _conv_block(c1, c1),
            nn.MaxPool2d(2),  # 32 -> 16
            _conv_block(c1, c2),
            _conv_block(c2, c2),
            nn.MaxPool2d(2),  # 16 -> 8
            _conv_block(c2, c3),
            _conv_block(c3, c3),
            nn.MaxPool2d(2),  # 8 -> 4
            _conv_block(c3, c4),
        )
        self.pool = nn.AdaptiveAvgPool2d(1)
        self.classifier = nn.Sequential(
            nn.Flatten(),
            nn.Dropout(p=0.2),
            nn.Linear(c4, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        x = self.features(x)
        x = self.pool(x)
        return self.classifier(x)


def num_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
