import argparse
import csv
import json
from pathlib import Path
from typing import Any, Dict, List


CSV_COLUMNS = [
    "row_index",
    "shot_number",
    "base_name",
    "start_time",
    "end_time",
    "source_status",
    "source_title",
    "source_notes",
    "source_scene",
    "source_speaker",
    "first_frame_path",
    "middle_frame_path",
    "middle_frame_paths_json",
    "last_frame_path",
    "turning_point_frame_paths_json",
    "prompt_language",
    "reconstruction_status",
    "confidence",
    "combined_prompt",
    "first_frame_prompt",
    "middle_frame_prompt",
    "last_frame_prompt",
    "transition_summary",
    "negative_prompt",
    "continuity_notes_json",
    "missing_details_json",
    "reconstruction_warnings_json",
    "source_row_json",
]


def load_json(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_dict(value: Any, label: str) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError(f"{label} must be an object")
    return value


def ensure_list(value: Any, label: str) -> List[Any]:
    if not isinstance(value, list):
        raise ValueError(f"{label} must be a list")
    return value


def json_cell(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False)


def optional_str(value: Any) -> str:
    if value in (None, ""):
        return ""
    return str(value)


def validate_payload(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    for field in ["schema_version", "status", "warnings", "inputs", "summary", "shots"]:
        if field not in payload:
            raise ValueError(f"missing top-level field: {field}")

    shots = ensure_list(payload["shots"], "shots")
    for index, shot in enumerate(shots, start=1):
        ensure_dict(shot, f"shot {index}")
        for field in [
            "row_index",
            "shot_number",
            "base_name",
            "start_time",
            "end_time",
            "source_status",
            "source_warnings",
            "source_error_code",
            "source_error_message",
            "source_row",
            "frame_evidence",
            "reconstruction",
        ]:
            if field not in shot:
                raise ValueError(f"shot {index} missing field: {field}")

        frame_evidence = ensure_dict(
            shot["frame_evidence"], f"shot {index} frame_evidence"
        )
        for field in [
            "first_frame_path",
            "middle_frame_path",
            "middle_frame_paths",
            "last_frame_path",
            "turning_points",
        ]:
            if field not in frame_evidence:
                raise ValueError(f"shot {index} frame_evidence missing field: {field}")

        reconstruction = ensure_dict(
            shot["reconstruction"], f"shot {index} reconstruction"
        )
        for field in [
            "status",
            "confidence",
            "prompt_language",
            "combined_prompt",
            "first_frame_prompt",
            "middle_frame_prompt",
            "last_frame_prompt",
            "transition_summary",
            "negative_prompt",
            "continuity_notes",
            "missing_details",
            "warnings",
        ]:
            if field not in reconstruction:
                raise ValueError(f"shot {index} reconstruction missing field: {field}")

        reconstruction_status = reconstruction.get("status")
        if reconstruction_status not in {
            "pending",
            "ok",
            "partial",
            "skipped",
            "failed",
        }:
            raise ValueError(
                f"shot {index} has invalid reconstruction status: {reconstruction_status}"
            )

        if reconstruction_status == "pending":
            raise ValueError(
                f"shot {index} is still pending; finish reconstruction before CSV export"
            )

        if reconstruction_status in {"ok", "partial"}:
            combined_prompt = reconstruction.get("combined_prompt")
            if not isinstance(combined_prompt, str) or not combined_prompt.strip():
                raise ValueError(
                    f"shot {index} with reconstruction status '{reconstruction_status}' requires a non-empty combined_prompt"
                )
    return shots


def recompute_summary(shots: List[Dict[str, Any]]) -> Dict[str, int]:
    counts = {
        "total_rows": len(shots),
        "analyzable_rows": 0,
        "pending_rows": 0,
        "ok_rows": 0,
        "partial_rows": 0,
        "skipped_rows": 0,
        "failed_rows": 0,
    }
    for shot in shots:
        reconstruction = ensure_dict(shot["reconstruction"], "reconstruction")
        status = reconstruction.get("status")
        if status != "skipped":
            counts["analyzable_rows"] += 1
        if status == "pending":
            counts["pending_rows"] += 1
        elif status == "ok":
            counts["ok_rows"] += 1
        elif status == "partial":
            counts["partial_rows"] += 1
        elif status == "skipped":
            counts["skipped_rows"] += 1
        elif status == "failed":
            counts["failed_rows"] += 1
    return counts


def recompute_status(summary: Dict[str, int]) -> str:
    if summary["pending_rows"] > 0:
        return "pending"
    if (
        summary["ok_rows"] > 0
        and summary["partial_rows"] == 0
        and summary["skipped_rows"] == 0
        and summary["failed_rows"] == 0
    ):
        return "ok"
    if (
        summary["ok_rows"] > 0
        or summary["partial_rows"] > 0
        or summary["skipped_rows"] > 0
    ):
        return "partial"
    return "failed"


def flatten_row(shot: Dict[str, Any]) -> Dict[str, str]:
    frame_evidence = ensure_dict(shot["frame_evidence"], "frame_evidence")
    reconstruction = ensure_dict(shot["reconstruction"], "reconstruction")
    turning_points = ensure_list(frame_evidence["turning_points"], "turning_points")

    turning_point_paths = [
        point.get("frame_path")
        for point in turning_points
        if isinstance(point, dict) and point.get("frame_path") not in (None, "")
    ]

    return {
        "row_index": optional_str(shot.get("row_index")),
        "shot_number": optional_str(shot.get("shot_number")),
        "base_name": optional_str(shot.get("base_name")),
        "start_time": optional_str(shot.get("start_time")),
        "end_time": optional_str(shot.get("end_time")),
        "source_status": optional_str(shot.get("source_status")),
        "source_title": optional_str(shot.get("source_title")),
        "source_notes": optional_str(shot.get("source_notes")),
        "source_scene": optional_str(shot.get("source_scene")),
        "source_speaker": optional_str(shot.get("source_speaker")),
        "first_frame_path": optional_str(frame_evidence.get("first_frame_path")),
        "middle_frame_path": optional_str(frame_evidence.get("middle_frame_path")),
        "middle_frame_paths_json": json_cell(
            frame_evidence.get("middle_frame_paths") or []
        ),
        "last_frame_path": optional_str(frame_evidence.get("last_frame_path")),
        "turning_point_frame_paths_json": json_cell(turning_point_paths),
        "prompt_language": optional_str(reconstruction.get("prompt_language")),
        "reconstruction_status": optional_str(reconstruction.get("status")),
        "confidence": optional_str(reconstruction.get("confidence")),
        "combined_prompt": optional_str(reconstruction.get("combined_prompt")),
        "first_frame_prompt": optional_str(reconstruction.get("first_frame_prompt")),
        "middle_frame_prompt": optional_str(reconstruction.get("middle_frame_prompt")),
        "last_frame_prompt": optional_str(reconstruction.get("last_frame_prompt")),
        "transition_summary": optional_str(reconstruction.get("transition_summary")),
        "negative_prompt": optional_str(reconstruction.get("negative_prompt")),
        "continuity_notes_json": json_cell(
            reconstruction.get("continuity_notes") or []
        ),
        "missing_details_json": json_cell(reconstruction.get("missing_details") or []),
        "reconstruction_warnings_json": json_cell(reconstruction.get("warnings") or []),
        "source_row_json": json_cell(shot.get("source_row") or {}),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    input_path = Path(args.input)
    payload = load_json(input_path)
    shots = validate_payload(payload)
    summary = recompute_summary(shots)
    status = recompute_status(summary)

    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_COLUMNS)
        writer.writeheader()
        for shot in shots:
            writer.writerow(flatten_row(shot))

    print(f"WROTE {output_path}")
    print(f"STATUS {status}")
    print(json.dumps(summary, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
