#!/usr/bin/env python
"""Download and extract CEW eye-patch dataset for bulk studies."""

from __future__ import annotations

import argparse
import pathlib
import shutil
import subprocess
import sys
import urllib.request


CEW_EYE_PATCHES_URL = (
    "https://drive.google.com/uc?export=download&id=1Z5hZZnkN4VycK-mOOzUX1Zuwty8BEePy"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Download CEW eye patches dataset.")
    parser.add_argument(
        "--output-dir",
        default="datasets",
        help="Directory where CEW archive and extracted files are stored.",
    )
    parser.add_argument(
        "--archive-name",
        default="cew_eye_patches_24x24.rar",
        help="Filename for downloaded archive.",
    )
    parser.add_argument(
        "--extract-dir",
        default="cew_eye_patches_24x24",
        help="Subdirectory where archive is extracted.",
    )
    parser.add_argument(
        "--skip-download",
        action="store_true",
        help="Skip downloading and only run extraction.",
    )
    return parser.parse_args()


def download_file(url: str, destination: pathlib.Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(url) as response, destination.open("wb") as out_file:
        shutil.copyfileobj(response, out_file)


def extract_archive(archive_path: pathlib.Path, destination: pathlib.Path) -> None:
    destination.mkdir(parents=True, exist_ok=True)
    # Use tar because bsdtar on Windows supports .rar in many environments.
    subprocess.run(
        ["tar", "-xf", str(archive_path), "-C", str(destination)],
        check=True,
        text=True,
    )


def main() -> int:
    args = parse_args()
    output_dir = pathlib.Path(args.output_dir)
    archive_path = output_dir / args.archive_name
    extract_dir = output_dir / args.extract_dir

    if not args.skip_download:
        print(f"Downloading CEW archive to: {archive_path}")
        download_file(CEW_EYE_PATCHES_URL, archive_path)
        print("Download complete.")

    if not archive_path.exists():
        print(f"Archive not found: {archive_path}", file=sys.stderr)
        return 1

    print(f"Extracting archive to: {extract_dir}")
    extract_archive(archive_path, extract_dir)
    print("Extraction complete.")
    print(
        "Expected class folders:",
        extract_dir / "dataset_B_Eye_Images" / "openLeftEyes",
        extract_dir / "dataset_B_Eye_Images" / "openRightEyes",
        extract_dir / "dataset_B_Eye_Images" / "closedLeftEyes",
        extract_dir / "dataset_B_Eye_Images" / "closedRightEyes",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
