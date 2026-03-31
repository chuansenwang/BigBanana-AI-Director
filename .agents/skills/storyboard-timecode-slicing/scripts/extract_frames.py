import argparse
import importlib
import importlib.util
import json
import re
import subprocess
from pathlib import Path
from typing import Any, Dict, List


def load_manifest(path: Path) -> Dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def save_manifest(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def run(command: List[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def run_capture(command: List[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(command, check=True, capture_output=True, text=True)


def append_unique_warning(warnings: List[str], message: str) -> None:
    if message not in warnings:
        warnings.append(message)


def format_seconds_for_filename(seconds: float) -> str:
    return f"{seconds:.3f}".replace(".", "-")


def build_turning_point_candidate(
    timestamp_seconds: float, scene_score: float, clip_duration_seconds: float
) -> Dict[str, float]:
    edge_distance = min(
        timestamp_seconds,
        max(clip_duration_seconds - timestamp_seconds, 0.0),
    )
    return {
        "timestamp_seconds": round(timestamp_seconds, 6),
        "scene_score": round(scene_score, 6),
        "edge_distance": round(edge_distance, 6),
    }


def extract_single_frame(
    ffmpeg_bin: str,
    clip_path: Path,
    output_path: Path,
    *,
    seek_seconds: float | None = None,
    filter_expr: str | None = None,
) -> None:
    command = [ffmpeg_bin, "-y", "-i", str(clip_path)]
    if seek_seconds is not None:
        command.extend(["-ss", f"{max(seek_seconds, 0.0):.6f}"])
    if filter_expr:
        command.extend(["-vf", filter_expr])
    command.extend(["-frames:v", "1", str(output_path)])
    run(command)


def build_middle_seek_points(
    duration_seconds: float, middle_frames: int
) -> List[float]:
    if middle_frames <= 0 or duration_seconds <= 0:
        return []
    return [
        duration_seconds * (index / (middle_frames + 1))
        for index in range(1, middle_frames + 1)
    ]


def select_representative_middle_index(
    seek_points: List[float], duration_seconds: float
) -> int | None:
    if not seek_points:
        return None
    midpoint = duration_seconds / 2.0
    best_index = 0
    best_distance = abs(seek_points[0] - midpoint)
    for index, seek_point in enumerate(seek_points[1:], start=1):
        distance = abs(seek_point - midpoint)
        if distance < best_distance:
            best_index = index
            best_distance = distance
    return best_index


def detect_turning_point_candidates(
    ffmpeg_bin: str,
    clip_path: Path,
    *,
    threshold: float,
    clip_duration_seconds: float,
) -> List[Dict[str, float]]:
    command = [
        ffmpeg_bin,
        "-hide_banner",
        "-i",
        str(clip_path),
        "-vf",
        f"select='gt(scene,{threshold})',metadata=print:file=-,showinfo",
        "-an",
        "-f",
        "null",
        "-",
    ]
    result = run_capture(command)
    combined_output = "\n".join(
        part for part in [result.stdout or "", result.stderr or ""] if part
    )
    current_timestamp: float | None = None
    candidates: List[Dict[str, float]] = []
    for line in combined_output.splitlines():
        timestamp_match = re.search(
            r"^frame:\s*\d+\s+pts:\s*\d+\s+pts_time:([0-9]+(?:\.[0-9]+)?)",
            line.strip(),
        )
        if timestamp_match:
            current_timestamp = float(timestamp_match.group(1))
            continue
        score_match = re.search(r"lavfi\.scene_score=([0-9]+(?:\.[0-9]+)?)", line)
        if score_match and current_timestamp is not None:
            candidates.append(
                build_turning_point_candidate(
                    current_timestamp,
                    float(score_match.group(1)),
                    clip_duration_seconds,
                )
            )
            current_timestamp = None
    return candidates


def apply_turning_point_edge_filter(
    candidates: List[Dict[str, float]],
    *,
    clip_duration_seconds: float,
    edge_margin_seconds: float,
) -> List[Dict[str, float]]:
    if not candidates or clip_duration_seconds <= 0:
        return candidates
    effective_edge_margin = min(
        max(edge_margin_seconds, 0.0), clip_duration_seconds * 0.15
    )
    if effective_edge_margin <= 0:
        return candidates
    filtered = [
        candidate
        for candidate in candidates
        if effective_edge_margin
        <= candidate["timestamp_seconds"]
        <= max(clip_duration_seconds - effective_edge_margin, effective_edge_margin)
    ]
    return filtered or candidates


def select_cluster_representative(
    cluster: List[Dict[str, float]],
) -> Dict[str, float]:
    return max(
        cluster,
        key=lambda candidate: (
            candidate["scene_score"],
            candidate["edge_distance"],
            -candidate["timestamp_seconds"],
        ),
    )


def cluster_turning_point_candidates(
    candidates: List[Dict[str, float]],
    *,
    clip_duration_seconds: float,
    min_gap_seconds: float,
) -> List[Dict[str, float]]:
    if not candidates:
        return []
    effective_gap = 0.0
    if min_gap_seconds > 0:
        effective_gap = min(min_gap_seconds, max(0.12, clip_duration_seconds * 0.22))
    sorted_candidates = sorted(candidates, key=lambda item: item["timestamp_seconds"])
    if effective_gap <= 0:
        return [dict(candidate) for candidate in sorted_candidates]
    clusters: List[List[Dict[str, float]]] = [[sorted_candidates[0]]]
    for candidate in sorted_candidates[1:]:
        previous = clusters[-1][-1]
        if (
            candidate["timestamp_seconds"] - previous["timestamp_seconds"]
            <= effective_gap
        ):
            clusters[-1].append(candidate)
        else:
            clusters.append([candidate])
    return [select_cluster_representative(cluster) for cluster in clusters]


def apply_turning_point_cap(
    candidates: List[Dict[str, float]],
    *,
    clip_duration_seconds: float,
    max_points: int,
    short_clip_max_points: int,
) -> List[Dict[str, float]]:
    if not candidates:
        return []
    effective_max_points = max_points
    if clip_duration_seconds <= 1.5:
        effective_max_points = min(effective_max_points, short_clip_max_points)
    elif clip_duration_seconds <= 3.0:
        effective_max_points = min(effective_max_points, 3)
    if effective_max_points <= 0:
        return sorted(candidates, key=lambda item: item["timestamp_seconds"])
    selected = sorted(
        candidates,
        key=lambda candidate: (
            candidate["scene_score"],
            candidate["edge_distance"],
            -candidate["timestamp_seconds"],
        ),
        reverse=True,
    )[:effective_max_points]
    return sorted(selected, key=lambda item: item["timestamp_seconds"])


def select_turning_point_candidates(
    candidates: List[Dict[str, float]],
    *,
    clip_duration_seconds: float,
    edge_margin_seconds: float,
    min_gap_seconds: float,
    max_points: int,
    short_clip_max_points: int,
) -> List[Dict[str, float]]:
    edge_filtered = apply_turning_point_edge_filter(
        candidates,
        clip_duration_seconds=clip_duration_seconds,
        edge_margin_seconds=edge_margin_seconds,
    )
    clustered = cluster_turning_point_candidates(
        edge_filtered,
        clip_duration_seconds=clip_duration_seconds,
        min_gap_seconds=min_gap_seconds,
    )
    return apply_turning_point_cap(
        clustered,
        clip_duration_seconds=clip_duration_seconds,
        max_points=max_points,
        short_clip_max_points=short_clip_max_points,
    )


def build_turning_points(
    *,
    ffmpeg_bin: str,
    clip_path: Path,
    keyframes_dir: Path,
    base_name: str,
    threshold: float,
    clip_duration_seconds: float,
    min_gap_seconds: float,
    max_points: int,
    edge_margin_seconds: float,
    short_clip_max_points: int,
) -> Dict[str, Any]:
    try:
        raw_candidates = detect_turning_point_candidates(
            ffmpeg_bin,
            clip_path,
            threshold=threshold,
            clip_duration_seconds=clip_duration_seconds,
        )
    except subprocess.CalledProcessError as exc:
        return {
            "enabled": True,
            "available": True,
            "status": "failed",
            "method": "ffmpeg_scene_score",
            "threshold": threshold,
            "min_gap_seconds": min_gap_seconds,
            "max_points": max_points,
            "reason": (exc.stderr or "").strip()
            or "ffmpeg turning-point detection failed",
            "points": [],
        }

    selected_candidates = select_turning_point_candidates(
        raw_candidates,
        clip_duration_seconds=clip_duration_seconds,
        edge_margin_seconds=edge_margin_seconds,
        min_gap_seconds=min_gap_seconds,
        max_points=max_points,
        short_clip_max_points=short_clip_max_points,
    )

    points: List[Dict[str, Any]] = []
    for index, candidate in enumerate(selected_candidates, start=1):
        timestamp = float(candidate["timestamp_seconds"])
        frame_path = (
            keyframes_dir
            / f"{base_name}_turning{index:02d}_t{format_seconds_for_filename(timestamp)}.png"
        )
        try:
            extract_single_frame(
                ffmpeg_bin,
                clip_path,
                frame_path,
                seek_seconds=timestamp,
            )
        except subprocess.CalledProcessError as exc:
            return {
                "enabled": True,
                "available": True,
                "status": "failed",
                "method": "ffmpeg_scene_score",
                "threshold": threshold,
                "min_gap_seconds": min_gap_seconds,
                "max_points": max_points,
                "reason": (exc.stderr or "").strip()
                or "ffmpeg turning-point frame extraction failed",
                "points": points,
            }
        points.append(
            {
                "index": index,
                "timestamp_seconds": round(timestamp, 6),
                "scene_score": candidate["scene_score"],
                "frame_path": str(frame_path.resolve()),
            }
        )

    return {
        "enabled": True,
        "available": True,
        "status": "ok",
        "method": "ffmpeg_scene_score",
        "threshold": threshold,
        "min_gap_seconds": min_gap_seconds,
        "max_points": max_points,
        "point_count": len(points),
        "points": points,
    }


def write_turning_points_summary(manifest_path: Path, manifest: Dict[str, Any]) -> None:
    output_dir = Path(str(manifest["output_dir"]))
    summary_path = output_dir / "keyframes.json"
    payload = {
        "schema_version": "1.0.0",
        "source_manifest_path": str(manifest_path.resolve()),
        "output_dir": str(output_dir.resolve()),
        "shots": [],
    }
    for shot in manifest.get("shots") or []:
        enrichment = shot.get("enrichment")
        if not isinstance(enrichment, dict):
            continue
        turning_points = enrichment.get("turning_points")
        if not isinstance(turning_points, dict):
            continue
        payload["shots"].append(
            {
                "row_index": shot.get("row_index"),
                "shot_number": shot.get("shot_number"),
                "base_name": shot.get("base_name"),
                "clip_path": shot.get("clip_path"),
                "turning_points": turning_points,
            }
        )
    summary_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def build_scenedetect_unavailable(
    detector: str, threshold: float, min_scene_len: int, reason: str
) -> Dict[str, Any]:
    return {
        "enabled": True,
        "available": False,
        "status": "unavailable",
        "detector": detector,
        "threshold": threshold,
        "min_scene_len": min_scene_len,
        "reason": reason,
        "scenes": [],
    }


def maybe_detect_subscenes(
    *,
    ffmpeg_bin: str,
    clip_path: Path,
    frames_dir: Path,
    base_name: str,
    detector: str,
    threshold: float,
    min_scene_len: int,
) -> Dict[str, Any]:
    if importlib.util.find_spec("scenedetect") is None:
        return build_scenedetect_unavailable(
            detector, threshold, min_scene_len, "module_not_installed"
        )

    try:
        scenedetect_module = importlib.import_module("scenedetect")
        detectors_module = importlib.import_module("scenedetect.detectors")
    except ImportError:
        return build_scenedetect_unavailable(
            detector, threshold, min_scene_len, "module_import_failed"
        )

    if detector != "content":
        return {
            "enabled": True,
            "available": True,
            "status": "config_error",
            "detector": detector,
            "threshold": threshold,
            "min_scene_len": min_scene_len,
            "reason": "unsupported_detector",
            "scenes": [],
        }

    try:
        open_video = getattr(scenedetect_module, "open_video")
        scene_manager_class = getattr(scenedetect_module, "SceneManager")
        content_detector_class = getattr(detectors_module, "ContentDetector")

        video = open_video(str(clip_path))
        manager = scene_manager_class()
        manager.add_detector(
            content_detector_class(threshold=threshold, min_scene_len=min_scene_len)
        )
        manager.detect_scenes(video=video, show_progress=False)
        scene_list = manager.get_scene_list(start_in_scene=True)
        scenes: List[Dict[str, Any]] = []
        for index, (start, end) in enumerate(scene_list, start=1):
            start_seconds = float(start.get_seconds())
            end_seconds = float(end.get_seconds())
            duration_seconds = max(end_seconds - start_seconds, 0.0)
            midpoint_seconds = start_seconds + (duration_seconds / 2.0)
            representative_frame_path = (
                frames_dir / f"{base_name}_scene{index:02d}_middle.png"
            )
            extract_single_frame(
                ffmpeg_bin,
                clip_path,
                representative_frame_path,
                seek_seconds=midpoint_seconds,
            )
            scenes.append(
                {
                    "index": index,
                    "start_timecode": str(start),
                    "end_timecode": str(end),
                    "start_seconds": round(start_seconds, 6),
                    "end_seconds": round(end_seconds, 6),
                    "duration_seconds": round(duration_seconds, 6),
                    "representative_frame_path": str(
                        representative_frame_path.resolve()
                    ),
                }
            )
        return {
            "enabled": True,
            "available": True,
            "status": "ok",
            "detector": detector,
            "threshold": threshold,
            "min_scene_len": min_scene_len,
            "scene_count": len(scenes),
            "scenes": scenes,
        }
    except Exception as exc:
        return {
            "enabled": True,
            "available": True,
            "status": "failed",
            "detector": detector,
            "threshold": threshold,
            "min_scene_len": min_scene_len,
            "reason": str(exc),
            "scenes": [],
        }


def recompute_status(manifest: Dict[str, Any]) -> None:
    shots = manifest.get("shots") or []
    if not isinstance(shots, list):
        raise ValueError("manifest shots must be a list")
    ok_rows = sum(1 for shot in shots if shot.get("status") == "ok")
    partial_rows = sum(1 for shot in shots if shot.get("status") == "partial")
    failed_rows = sum(1 for shot in shots if shot.get("status") == "failed")
    manifest["summary"] = {
        "total_rows": len(shots),
        "ok_rows": ok_rows,
        "partial_rows": partial_rows,
        "failed_rows": failed_rows,
    }
    if shots and failed_rows == 0 and partial_rows == 0:
        manifest["status"] = "ok"
    elif ok_rows or partial_rows:
        manifest["status"] = "partial"
    else:
        manifest["status"] = "failed"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--ffmpeg-bin", default="ffmpeg")
    parser.add_argument("--enable-scenedetect", action="store_true")
    parser.add_argument("--enable-turning-points", action="store_true")
    parser.add_argument("--scenedetect-detector", default="content")
    parser.add_argument("--scenedetect-threshold", type=float, default=27.0)
    parser.add_argument("--scenedetect-min-scene-len", type=int, default=15)
    parser.add_argument("--middle-frames", type=int, default=1)
    parser.add_argument("--turning-point-threshold", type=float, default=0.12)
    parser.add_argument("--turning-point-min-gap-seconds", type=float, default=0.35)
    parser.add_argument("--turning-point-max-points", type=int, default=6)
    parser.add_argument("--turning-point-edge-margin-seconds", type=float, default=0.10)
    parser.add_argument("--turning-point-short-clip-max-points", type=int, default=2)
    args = parser.parse_args()

    if args.middle_frames < 0:
        raise ValueError("--middle-frames must be zero or greater")
    if args.turning_point_min_gap_seconds < 0:
        raise ValueError("--turning-point-min-gap-seconds must be zero or greater")
    if args.turning_point_max_points < 0:
        raise ValueError("--turning-point-max-points must be zero or greater")
    if args.turning_point_edge_margin_seconds < 0:
        raise ValueError("--turning-point-edge-margin-seconds must be zero or greater")
    if args.turning_point_short_clip_max_points < 0:
        raise ValueError(
            "--turning-point-short-clip-max-points must be zero or greater"
        )

    manifest_path = Path(args.manifest)
    manifest = load_manifest(manifest_path)
    output_dir = Path(str(manifest["output_dir"]))
    frames_dir = output_dir / "frames"
    keyframes_dir = output_dir / "keyframes"
    frames_dir.mkdir(parents=True, exist_ok=True)
    keyframes_dir.mkdir(parents=True, exist_ok=True)

    manifest_warnings = manifest.get("warnings") or []
    if not isinstance(manifest_warnings, list):
        manifest_warnings = [str(manifest_warnings)]
    manifest["warnings"] = manifest_warnings

    shots = manifest.get("shots") or []
    if not isinstance(shots, list):
        raise ValueError("manifest shots must be a list")

    for shot in shots:
        if shot.get("status") != "ok":
            continue
        clip_path = Path(str(shot["clip_path"]))
        base_name = str(shot["base_name"])
        warnings = shot.get("warnings") or []
        if not isinstance(warnings, list):
            warnings = [str(warnings)]
        first_path = frames_dir / f"{base_name}_first.png"
        middle_path = frames_dir / f"{base_name}_middle.png"
        last_path = frames_dir / f"{base_name}_last.png"
        duration_seconds = shot.get("duration_seconds")
        clip_duration_seconds = 0.0
        if isinstance(duration_seconds, (int, float)) and float(duration_seconds) > 0:
            clip_duration_seconds = float(duration_seconds)
        shot.setdefault("middle_frame_path", None)
        shot.setdefault("middle_frame_paths", [])
        shot.setdefault("enrichment", {})

        required_errors: List[str] = []

        try:
            extract_single_frame(args.ffmpeg_bin, clip_path, first_path)
            shot["first_frame_path"] = str(first_path.resolve())
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            required_errors.append(stderr or "first frame extraction failed")

        middle_seek_points = build_middle_seek_points(
            clip_duration_seconds, args.middle_frames
        )
        middle_frame_paths: List[str] = []
        for middle_index, seek_seconds in enumerate(middle_seek_points, start=1):
            if args.middle_frames == 1:
                current_middle_path = middle_path
            else:
                current_middle_path = (
                    frames_dir / f"{base_name}_middle{middle_index:02d}.png"
                )
            try:
                extract_single_frame(
                    args.ffmpeg_bin,
                    clip_path,
                    current_middle_path,
                    seek_seconds=seek_seconds,
                )
                middle_frame_paths.append(str(current_middle_path.resolve()))
            except subprocess.CalledProcessError:
                append_unique_warning(
                    warnings,
                    "middle frame extraction failed; required outputs preserved when possible",
                )

        representative_middle_index = select_representative_middle_index(
            middle_seek_points, clip_duration_seconds
        )
        representative_middle_path = None
        if representative_middle_index is not None:
            successful_middle_paths = {
                str(Path(path).name): path for path in middle_frame_paths
            }
            if args.middle_frames == 1:
                representative_middle_path = (
                    middle_frame_paths[0] if middle_frame_paths else None
                )
            else:
                representative_name = (
                    f"{base_name}_middle{representative_middle_index + 1:02d}.png"
                )
                representative_middle_path = successful_middle_paths.get(
                    representative_name
                )

        shot["middle_frame_paths"] = middle_frame_paths
        shot["middle_frame_path"] = representative_middle_path

        try:
            extract_single_frame(
                args.ffmpeg_bin,
                clip_path,
                last_path,
                filter_expr="reverse",
            )
            shot["last_frame_path"] = str(last_path.resolve())
        except subprocess.CalledProcessError as exc:
            stderr = (exc.stderr or "").strip()
            required_errors.append(stderr or "last frame extraction failed")

        shot["warnings"] = warnings

        if required_errors:
            shot["status"] = "partial"
            append_unique_warning(
                warnings, "required frame extraction degraded for this shot"
            )
            shot["error_code"] = "ffmpeg_frame_failed"
            shot["error_message"] = " | ".join(required_errors)
            continue

        if args.enable_scenedetect:
            scenedetect_result = maybe_detect_subscenes(
                ffmpeg_bin=args.ffmpeg_bin,
                clip_path=clip_path,
                frames_dir=frames_dir,
                base_name=base_name,
                detector=args.scenedetect_detector,
                threshold=args.scenedetect_threshold,
                min_scene_len=args.scenedetect_min_scene_len,
            )
            enrichment = shot.get("enrichment")
            if not isinstance(enrichment, dict):
                enrichment = {}
            enrichment["scenedetect"] = scenedetect_result
            shot["enrichment"] = enrichment

            if not scenedetect_result.get("available"):
                append_unique_warning(
                    warnings,
                    "scenedetect requested but unavailable; skipped sub-scene enrichment",
                )
                append_unique_warning(
                    manifest_warnings,
                    "scenedetect requested but unavailable; using FFmpeg-only frame extraction",
                )
            elif scenedetect_result.get("status") != "ok":
                append_unique_warning(
                    warnings,
                    "scenedetect enrichment failed; kept default frame outputs",
                )
                append_unique_warning(
                    manifest_warnings,
                    "one or more scenedetect enrichments failed; primary outputs preserved",
                )

        if args.enable_turning_points:
            turning_points_result = build_turning_points(
                ffmpeg_bin=args.ffmpeg_bin,
                clip_path=clip_path,
                keyframes_dir=keyframes_dir,
                base_name=base_name,
                threshold=args.turning_point_threshold,
                clip_duration_seconds=clip_duration_seconds,
                min_gap_seconds=args.turning_point_min_gap_seconds,
                max_points=args.turning_point_max_points,
                edge_margin_seconds=args.turning_point_edge_margin_seconds,
                short_clip_max_points=args.turning_point_short_clip_max_points,
            )
            enrichment = shot.get("enrichment")
            if not isinstance(enrichment, dict):
                enrichment = {}
            enrichment["turning_points"] = turning_points_result
            shot["enrichment"] = enrichment

            if turning_points_result.get("status") != "ok":
                append_unique_warning(
                    warnings,
                    "turning-point enrichment failed; kept default frame outputs",
                )
                append_unique_warning(
                    manifest_warnings,
                    "one or more turning-point enrichments failed; primary outputs preserved",
                )

    recompute_status(manifest)
    save_manifest(manifest_path, manifest)
    if args.enable_turning_points:
        write_turning_points_summary(manifest_path, manifest)
    print(f"UPDATED {manifest_path}")
    print(f"STATUS {manifest['status']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
