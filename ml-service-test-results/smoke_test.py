import json
from datetime import datetime, timezone

import requests


ML1_BASE = "http://127.0.0.1:8001"
ML2_BASE = "http://127.0.0.1:8002"


def assert_keys(payload: dict, keys: list[str], scope: str) -> None:
    missing = [k for k in keys if k not in payload]
    if missing:
        raise AssertionError(f"Missing keys in {scope}: {missing}")


def run() -> dict:
    report: dict = {"executed_at": datetime.now(timezone.utc).isoformat()}

    ml1_health = requests.get(f"{ML1_BASE}/health", timeout=15)
    ml2_health = requests.get(f"{ML2_BASE}/health", timeout=15)
    ml1_health.raise_for_status()
    ml2_health.raise_for_status()
    report["ml1_health"] = ml1_health.json()
    report["ml2_health"] = ml2_health.json()

    ml1_payload = {
        "image_url": "https://images.pexels.com/photos/935743/pexels-photo-935743.jpeg",
        "user_id": "u-smoke",
        "session_id": "s-smoke",
        "image_id": "img-smoke-001",
        "image_metadata": {"sequence_number": 1, "capture_timestamp": 1719876543},
    }
    ml1_resp = requests.post(f"{ML1_BASE}/predict", json=ml1_payload, timeout=30)
    ml1_resp.raise_for_status()
    ml1_data = ml1_resp.json()
    assert_keys(ml1_data, ["image_id", "session_id", "frame_analysis", "status"], "ml1 response")
    assert_keys(
        ml1_data["frame_analysis"],
        ["eye_state", "confidence", "ear", "head_pose", "processing_time_ms", "processed_at"],
        "ml1 frame_analysis",
    )
    assert_keys(ml1_data["frame_analysis"]["head_pose"], ["pitch", "yaw", "roll"], "ml1 head_pose")
    report["ml1_predict"] = ml1_data

    seq = [
        {
            "timestamp": "2026-03-31T20:00:00Z",
            "eye_state": "OPEN",
            "confidence": 0.95,
            "ear": 0.29,
            "head_pose": {"pitch": 1.0, "yaw": -2.1, "roll": 0.2},
        },
        {
            "timestamp": "2026-03-31T20:00:01Z",
            "eye_state": "PARTIAL",
            "confidence": 0.91,
            "ear": 0.21,
            "head_pose": {"pitch": 0.7, "yaw": -1.9, "roll": 0.3},
        },
        {
            "timestamp": "2026-03-31T20:00:02Z",
            "eye_state": "CLOSED",
            "confidence": 0.96,
            "ear": 0.14,
            "head_pose": {"pitch": 0.5, "yaw": -1.6, "roll": 0.1},
        },
        {
            "timestamp": "2026-03-31T20:00:03Z",
            "eye_state": "CLOSED",
            "confidence": 0.97,
            "ear": 0.13,
            "head_pose": {"pitch": 0.3, "yaw": -1.3, "roll": 0.0},
        },
        {
            "timestamp": "2026-03-31T20:00:04Z",
            "eye_state": "OPEN",
            "confidence": 0.93,
            "ear": 0.28,
            "head_pose": {"pitch": 0.8, "yaw": -2.0, "roll": 0.2},
        },
    ]
    ml2_payload = {"user_id": "u-smoke", "session_id": "s-smoke", "sequence": seq}
    ml2_resp = requests.post(f"{ML2_BASE}/analyze", json=ml2_payload, timeout=15)
    ml2_resp.raise_for_status()
    ml2_data = ml2_resp.json()
    assert_keys(
        ml2_data,
        [
            "user_id",
            "session_id",
            "driver_state",
            "fatigued",
            "severity",
            "features",
            "processing_time_ms",
            "processed_at",
        ],
        "ml2 response",
    )
    assert_keys(
        ml2_data["features"],
        ["blink_rate", "avg_eye_closure_time", "max_eye_closure_time", "closed_eye_ratio"],
        "ml2 features",
    )
    report["ml2_analyze"] = ml2_data
    report["status"] = "passed"
    return report


if __name__ == "__main__":
    result = run()
    output_path = "E:/WakeSafe/wakesafe/ml-service-test-results/smoke-test-results.json"
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(result, fh, indent=2)
    print(f"Saved: {output_path}")
