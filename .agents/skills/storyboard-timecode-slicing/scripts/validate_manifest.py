import argparse
import json
import sys
from pathlib import Path


REQUIRED_TOP_LEVEL = {
    "schema_version",
    "status",
    "warnings",
    "inputs",
    "output_dir",
    "clip_mode",
    "summary",
    "shots",
}

REQUIRED_INPUT_FIELDS = {
    "video_path",
    "sheet_path",
    "sheet_format",
    "source_duration_seconds",
}

REQUIRED_SUMMARY_FIELDS = {
    "total_rows",
    "ok_rows",
    "partial_rows",
    "failed_rows",
}

REQUIRED_SHOT_FIELDS = {
    "row_index",
    "shot_number",
    "start_time",
    "end_time",
    "base_name",
    "status",
    "clip_path",
    "first_frame_path",
    "last_frame_path",
    "duration_seconds",
    "warnings",
    "error_code",
    "error_message",
    "source_row",
}


def validate_optional_file(path_value: object, label: str) -> str | None:
    if path_value in (None, ""):
        return None
    path = Path(str(path_value))
    if not path.exists():
        return f"{label} missing on disk: {path}"
    return None


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    payload = json.loads(Path(args.input).read_text(encoding="utf-8"))
    missing = sorted(REQUIRED_TOP_LEVEL.difference(payload.keys()))
    if missing:
        print(f"Missing top-level fields: {', '.join(missing)}")
        return 1

    if payload["status"] not in {"ok", "partial", "failed"}:
        print(f"Invalid run status: {payload['status']}")
        return 1

    if not isinstance(payload["warnings"], list):
        print("warnings must be a list")
        return 1

    inputs = payload["inputs"]
    if not isinstance(inputs, dict):
        print("inputs must be an object")
        return 1
    missing_inputs = sorted(REQUIRED_INPUT_FIELDS.difference(inputs.keys()))
    if missing_inputs:
        print(f"Missing input fields: {', '.join(missing_inputs)}")
        return 1

    summary = payload["summary"]
    if not isinstance(summary, dict):
        print("summary must be an object")
        return 1
    missing_summary = sorted(REQUIRED_SUMMARY_FIELDS.difference(summary.keys()))
    if missing_summary:
        print(f"Missing summary fields: {', '.join(missing_summary)}")
        return 1

    shots = payload["shots"]
    if not isinstance(shots, list):
        print("shots must be a list")
        return 1

    for index, shot in enumerate(shots, start=1):
        missing_shot = sorted(REQUIRED_SHOT_FIELDS.difference(shot.keys()))
        if missing_shot:
            print(f"Shot {index} missing fields: {', '.join(missing_shot)}")
            return 1
        if shot["status"] not in {"ok", "partial", "failed"}:
            print(f"Shot {index} has invalid status: {shot['status']}")
            return 1
        if shot["clip_path"]:
            clip_path = Path(shot["clip_path"])
            if not clip_path.exists():
                print(f"Shot {index} clip path missing on disk: {clip_path}")
                return 1
        optional_middle_error = validate_optional_file(
            shot.get("middle_frame_path"), f"Shot {index} middle frame"
        )
        if optional_middle_error:
            print(optional_middle_error)
            return 1
        middle_frame_paths = shot.get("middle_frame_paths")
        if middle_frame_paths not in (None, ""):
            if not isinstance(middle_frame_paths, list):
                print(f"Shot {index} middle_frame_paths must be a list when present")
                return 1
            for middle_index, middle_path in enumerate(middle_frame_paths, start=1):
                middle_error = validate_optional_file(
                    middle_path, f"Shot {index} middle frame {middle_index}"
                )
                if middle_error:
                    print(middle_error)
                    return 1
            middle_frame_path = shot.get("middle_frame_path")
            if middle_frame_path and middle_frame_path not in middle_frame_paths:
                print(
                    f"Shot {index} representative middle_frame_path must be included in middle_frame_paths"
                )
                return 1
        enrichment = shot.get("enrichment")
        if enrichment is not None and not isinstance(enrichment, dict):
            print(f"Shot {index} enrichment must be an object when present")
            return 1
        if isinstance(enrichment, dict):
            scenedetect = enrichment.get("scenedetect")
            turning_points = enrichment.get("turning_points")
            if scenedetect is not None and not isinstance(scenedetect, dict):
                print(f"Shot {index} scenedetect enrichment must be an object")
                return 1
            if turning_points is not None and not isinstance(turning_points, dict):
                print(f"Shot {index} turning_points enrichment must be an object")
                return 1
            if isinstance(scenedetect, dict):
                scenes = scenedetect.get("scenes")
                if scenes is not None and not isinstance(scenes, list):
                    print(f"Shot {index} scenedetect scenes must be a list")
                    return 1
                if isinstance(scenes, list):
                    for scene_index, scene in enumerate(scenes, start=1):
                        if not isinstance(scene, dict):
                            print(
                                f"Shot {index} scenedetect scene {scene_index} must be an object"
                            )
                            return 1
                        frame_error = validate_optional_file(
                            scene.get("representative_frame_path"),
                            f"Shot {index} scenedetect representative frame {scene_index}",
                        )
                        if frame_error:
                            print(frame_error)
                            return 1
            if isinstance(turning_points, dict):
                points = turning_points.get("points")
                if points is not None and not isinstance(points, list):
                    print(f"Shot {index} turning_points points must be a list")
                    return 1
                if isinstance(points, list):
                    for point_index, point in enumerate(points, start=1):
                        if not isinstance(point, dict):
                            print(
                                f"Shot {index} turning_points point {point_index} must be an object"
                            )
                            return 1
                        frame_error = validate_optional_file(
                            point.get("frame_path"),
                            f"Shot {index} turning_points frame {point_index}",
                        )
                        if frame_error:
                            print(frame_error)
                            return 1
        if shot["status"] == "ok":
            for key in ["clip_path", "first_frame_path", "last_frame_path"]:
                if not shot[key]:
                    print(
                        f"Shot {index} missing required artifact for ok status: {key}"
                    )
                    return 1
                artifact_path = Path(shot[key])
                if not artifact_path.exists():
                    print(f"Shot {index} artifact missing on disk: {artifact_path}")
                    return 1
        if shot["status"] == "partial":
            if not shot["clip_path"]:
                print(f"Shot {index} partial status requires clip_path")
                return 1
        if shot["status"] == "failed" and not (
            shot["error_code"] or shot["error_message"]
        ):
            print(f"Shot {index} failed status requires an error_code or error_message")
            return 1

    print("VALID")
    return 0


if __name__ == "__main__":
    sys.exit(main())
