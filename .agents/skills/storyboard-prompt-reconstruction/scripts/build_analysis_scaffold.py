import argparse
import json
from pathlib import Path
from typing import Any, Dict, List


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def normalize_list(value: Any) -> List[Any]:
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def optional_str(value: Any) -> str | None:
    if value in (None, ""):
        return None
    return str(value)


REQUIRED_SHOT_FIELDS = {
    "row_index",
    "shot_number",
    "base_name",
    "start_time",
    "end_time",
    "status",
    "source_row",
}


def validate_manifest_shot(shot: Dict[str, Any], index: int) -> None:
    missing_fields = sorted(
        field for field in REQUIRED_SHOT_FIELDS if field not in shot
    )
    if missing_fields:
        raise ValueError(
            f"shot {index} missing required fields: {', '.join(missing_fields)}"
        )


def extract_turning_points(
    shot: Dict[str, Any], include_turning_points: bool
) -> List[Dict[str, Any]]:
    if not include_turning_points:
        return []
    enrichment = shot.get("enrichment")
    if not isinstance(enrichment, dict):
        return []
    turning_points = enrichment.get("turning_points")
    if not isinstance(turning_points, dict):
        return []
    points = turning_points.get("points")
    if not isinstance(points, list):
        return []

    normalized_points: List[Dict[str, Any]] = []
    for point in points:
        if not isinstance(point, dict):
            continue
        normalized_points.append(
            {
                "index": point.get("index"),
                "timestamp_seconds": point.get("timestamp_seconds"),
                "frame_path": optional_str(point.get("frame_path")),
            }
        )
    return normalized_points


def build_shot_record(
    shot: Dict[str, Any], prompt_language: str, include_turning_points: bool
) -> Dict[str, Any]:
    first_frame_path = optional_str(shot.get("first_frame_path"))
    middle_frame_path = optional_str(shot.get("middle_frame_path"))
    middle_frame_paths = [
        str(path)
        for path in normalize_list(shot.get("middle_frame_paths"))
        if path not in (None, "")
    ]
    last_frame_path = optional_str(shot.get("last_frame_path"))
    turning_points = extract_turning_points(shot, include_turning_points)

    analyzable = any(
        [
            first_frame_path,
            middle_frame_path,
            bool(middle_frame_paths),
            last_frame_path,
            bool(turning_points),
        ]
    )

    source_row_raw = shot.get("source_row")
    source_row: Dict[str, Any] = (
        source_row_raw if isinstance(source_row_raw, dict) else {}
    )

    return {
        "row_index": shot.get("row_index"),
        "shot_number": shot.get("shot_number"),
        "base_name": shot.get("base_name"),
        "start_time": shot.get("start_time"),
        "end_time": shot.get("end_time"),
        "source_status": shot.get("status"),
        "source_warnings": normalize_list(shot.get("warnings")),
        "source_error_code": optional_str(shot.get("error_code")),
        "source_error_message": optional_str(shot.get("error_message")),
        "source_title": optional_str(source_row.get("title")),
        "source_notes": optional_str(source_row.get("notes")),
        "source_scene": optional_str(source_row.get("scene")),
        "source_speaker": optional_str(source_row.get("speaker")),
        "source_row": source_row,
        "frame_evidence": {
            "first_frame_path": first_frame_path,
            "middle_frame_path": middle_frame_path,
            "middle_frame_paths": middle_frame_paths,
            "last_frame_path": last_frame_path,
            "turning_points": turning_points,
        },
        "reconstruction": {
            "status": "pending" if analyzable else "skipped",
            "confidence": None,
            "prompt_language": prompt_language,
            "combined_prompt": "",
            "first_frame_prompt": "",
            "middle_frame_prompt": "",
            "last_frame_prompt": "",
            "transition_summary": "",
            "negative_prompt": "",
            "continuity_notes": [],
            "missing_details": [],
            "warnings": [],
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--language", choices=["en", "zh"], default="en")
    parser.add_argument("--include-turning-points", action="store_true")
    args = parser.parse_args()

    manifest_path = Path(args.manifest)
    manifest = load_json(manifest_path)

    shots = manifest.get("shots")
    if not isinstance(shots, list):
        raise ValueError("manifest shots must be a list")

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    prompt_shots: List[Dict[str, Any]] = []
    for index, shot in enumerate(shots, start=1):
        if not isinstance(shot, dict):
            raise ValueError(f"shot {index} must be an object")
        validate_manifest_shot(shot, index)
        prompt_shots.append(
            build_shot_record(shot, args.language, args.include_turning_points)
        )

    analyzable_rows = sum(
        1
        for shot in prompt_shots
        if shot.get("reconstruction", {}).get("status") == "pending"
    )
    skipped_rows = sum(
        1
        for shot in prompt_shots
        if shot.get("reconstruction", {}).get("status") == "skipped"
    )

    payload = {
        "schema_version": "1.0.0",
        "status": "pending" if analyzable_rows > 0 else "failed",
        "warnings": [],
        "inputs": {
            "manifest_path": str(manifest_path.resolve()),
            "source_output_dir": manifest.get("output_dir"),
            "prompt_language": args.language,
            "include_turning_points": bool(args.include_turning_points),
        },
        "summary": {
            "total_rows": len(prompt_shots),
            "analyzable_rows": analyzable_rows,
            "pending_rows": analyzable_rows,
            "ok_rows": 0,
            "partial_rows": 0,
            "skipped_rows": skipped_rows,
            "failed_rows": 0,
        },
        "shots": prompt_shots,
    }

    write_json(output_path, payload)
    print(f"WROTE {output_path}")
    print(f"STATUS {payload['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
