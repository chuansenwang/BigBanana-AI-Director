import argparse
import csv
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, List, Tuple


REQUIRED_COLUMNS = {"shot_number", "start_time", "end_time"}
STATUS_VALUES = {"ok", "partial", "failed"}


def fail(message: str) -> int:
    print(message, file=sys.stderr)
    return 1


def load_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def normalize_header(value: str) -> str:
    raw = (value or "").strip().lower()
    aliases = {
        "shot": "shot_number",
        "shot_id": "shot_number",
        "镜头号": "shot_number",
        "镜头": "shot_number",
        "start": "start_time",
        "开始": "start_time",
        "开始时间": "start_time",
        "end": "end_time",
        "结束": "end_time",
        "结束时间": "end_time",
    }
    return aliases.get(raw, raw)


def parse_csv_sheet(path: Path) -> List[Dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        if reader.fieldnames is None:
            raise ValueError("CSV header is missing")
        fieldnames = [normalize_header(name) for name in reader.fieldnames]
        rows = []
        for raw_row in reader:
            row = {}
            for original, normalized in zip(reader.fieldnames, fieldnames):
                row[normalized] = (raw_row.get(original) or "").strip()
            rows.append(row)
        return rows


def parse_markdown_sheet(path: Path) -> List[Dict[str, str]]:
    lines = [line.rstrip() for line in load_text(path).splitlines() if line.strip()]
    table_lines = [line for line in lines if "|" in line]
    if len(table_lines) < 2:
        raise ValueError("Markdown table is missing or incomplete")

    def split_row(line: str) -> List[str]:
        stripped = line.strip().strip("|")
        return [cell.strip() for cell in stripped.split("|")]

    headers = [normalize_header(item) for item in split_row(table_lines[0])]
    data_lines = table_lines[2:]
    rows = []
    for line in data_lines:
        cells = split_row(line)
        if len(cells) < len(headers):
            cells.extend([""] * (len(headers) - len(cells)))
        row = {header: cells[index] for index, header in enumerate(headers)}
        rows.append(row)
    return rows


def load_rows(path: Path) -> Tuple[str, List[Dict[str, str]]]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return "csv", parse_csv_sheet(path)
    if suffix in {".md", ".markdown"}:
        return "markdown", parse_markdown_sheet(path)
    raise ValueError(f"Unsupported sheet type: {path.suffix}")


def parse_timecode(raw: str) -> float:
    value = (raw or "").strip()
    if not value:
        raise ValueError("timecode is empty")
    if ":" not in value:
        return float(value)
    parts = value.split(":")
    if len(parts) == 2:
        hours = 0
        minutes = int(parts[0])
        seconds = float(parts[1])
    elif len(parts) == 3:
        hours = int(parts[0])
        minutes = int(parts[1])
        seconds = float(parts[2])
    else:
        raise ValueError(f"Unsupported timecode syntax: {raw}")
    return hours * 3600 + minutes * 60 + seconds


def format_filename_time(raw: str) -> str:
    value = raw.strip().replace(":", "-").replace(".", "-")
    return value


def normalize_shot_number(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        raise ValueError("shot_number is empty")
    if text.isdigit():
        return f"S{int(text):03d}"
    safe = sanitize_fragment(text)
    return f"S_{safe}"


def sanitize_fragment(value: str) -> str:
    illegal = '<>:"/\\|?*'
    sanitized = "".join("_" if ch in illegal else ch for ch in value.strip())
    sanitized = sanitized.strip(" .")
    sanitized = sanitized.replace(" ", "-")
    return sanitized or "unnamed"


def ensure_bins(ffmpeg_bin: str, ffprobe_bin: str) -> None:
    if shutil.which(ffmpeg_bin) is None:
        raise RuntimeError(f"ffmpeg not found on PATH: {ffmpeg_bin}")
    if shutil.which(ffprobe_bin) is None:
        raise RuntimeError(f"ffprobe not found on PATH: {ffprobe_bin}")


def probe_duration(ffprobe_bin: str, video_path: Path) -> float:
    command = [
        ffprobe_bin,
        "-v",
        "error",
        "-show_entries",
        "format=duration",
        "-of",
        "json",
        str(video_path),
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=True)
    payload = json.loads(result.stdout or "{}")
    duration = (payload.get("format") or {}).get("duration")
    if duration is None:
        raise RuntimeError("Unable to read source duration with ffprobe")
    return float(duration)


def run_ffmpeg(command: List[str]) -> None:
    subprocess.run(command, check=True, capture_output=True, text=True)


def build_manifest(
    video_path: Path,
    sheet_path: Path,
    sheet_format: str,
    output_dir: Path,
    clip_mode: str,
    source_duration: float,
    warnings: List[str],
    shots: List[Dict[str, object]],
) -> Dict[str, object]:
    ok_rows = sum(1 for shot in shots if shot["status"] == "ok")
    partial_rows = sum(1 for shot in shots if shot["status"] == "partial")
    failed_rows = sum(1 for shot in shots if shot["status"] == "failed")
    if shots and failed_rows == 0 and partial_rows == 0:
        status = "ok"
    elif ok_rows or partial_rows:
        status = "partial"
    else:
        status = "failed"
    return {
        "schema_version": "1.0.0",
        "status": status,
        "warnings": warnings,
        "inputs": {
            "video_path": str(video_path.resolve()),
            "sheet_path": str(sheet_path.resolve()),
            "sheet_format": sheet_format,
            "source_duration_seconds": round(source_duration, 6),
        },
        "output_dir": str(output_dir.resolve()),
        "clip_mode": clip_mode,
        "summary": {
            "total_rows": len(shots),
            "ok_rows": ok_rows,
            "partial_rows": partial_rows,
            "failed_rows": failed_rows,
        },
        "shots": shots,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", required=True)
    parser.add_argument("--sheet", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--mode", choices=["accurate", "fast-copy"], default="accurate")
    parser.add_argument("--ffmpeg-bin", default="ffmpeg")
    parser.add_argument("--ffprobe-bin", default="ffprobe")
    args = parser.parse_args()

    video_path = Path(args.video)
    sheet_path = Path(args.sheet)
    output_dir = Path(args.output_dir)
    clips_dir = output_dir / "clips"
    output_dir.mkdir(parents=True, exist_ok=True)
    clips_dir.mkdir(parents=True, exist_ok=True)

    if not video_path.is_file():
        return fail(f"Source video not found: {video_path}")
    if not sheet_path.is_file():
        return fail(f"Sheet not found: {sheet_path}")

    try:
        ensure_bins(args.ffmpeg_bin, args.ffprobe_bin)
        sheet_format, rows = load_rows(sheet_path)
        source_duration = probe_duration(args.ffprobe_bin, video_path)
    except Exception as exc:
        return fail(str(exc))

    if not rows:
        return fail("No rows found in sheet")

    if not REQUIRED_COLUMNS.issubset(rows[0].keys()):
        missing = sorted(REQUIRED_COLUMNS.difference(rows[0].keys()))
        return fail(f"Missing required columns: {', '.join(missing)}")

    warnings: List[str] = []
    seen_names = set()
    shots: List[Dict[str, object]] = []

    for index, row in enumerate(rows, start=1):
        shot_number = (row.get("shot_number") or "").strip()
        start_time = (row.get("start_time") or "").strip()
        end_time = (row.get("end_time") or "").strip()
        shot: Dict[str, object] = {
            "row_index": index,
            "shot_number": shot_number,
            "start_time": start_time,
            "end_time": end_time,
            "base_name": None,
            "status": "failed",
            "clip_path": None,
            "first_frame_path": None,
            "middle_frame_path": None,
            "middle_frame_paths": [],
            "last_frame_path": None,
            "duration_seconds": None,
            "warnings": [],
            "error_code": None,
            "error_message": None,
            "enrichment": {},
            "source_row": row,
        }
        try:
            start_seconds = parse_timecode(start_time)
            end_seconds = parse_timecode(end_time)
            if end_seconds <= start_seconds:
                raise ValueError("end_time must be greater than start_time")
            if start_seconds < 0:
                raise ValueError("start_time must be non-negative")
            if end_seconds > source_duration:
                raise ValueError("end_time exceeds source duration")

            base_name = f"{normalize_shot_number(shot_number)}_{format_filename_time(start_time)}_{format_filename_time(end_time)}"
            if base_name in seen_names:
                raise RuntimeError(
                    f"Normalized filename collision detected: {base_name}"
                )
            seen_names.add(base_name)
            clip_path = clips_dir / f"{base_name}.mp4"

            if args.mode == "accurate":
                command = [
                    args.ffmpeg_bin,
                    "-y",
                    "-i",
                    str(video_path),
                    "-ss",
                    start_time,
                    "-to",
                    end_time,
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a?",
                    "-c:v",
                    "libx264",
                    "-crf",
                    "18",
                    "-preset",
                    "medium",
                    "-c:a",
                    "aac",
                    "-b:a",
                    "192k",
                    "-movflags",
                    "+faststart",
                    str(clip_path),
                ]
            else:
                command = [
                    args.ffmpeg_bin,
                    "-y",
                    "-ss",
                    start_time,
                    "-to",
                    end_time,
                    "-i",
                    str(video_path),
                    "-map",
                    "0:v:0",
                    "-map",
                    "0:a?",
                    "-c",
                    "copy",
                    str(clip_path),
                ]

            run_ffmpeg(command)
            shot.update(
                {
                    "base_name": base_name,
                    "status": "ok",
                    "clip_path": str(clip_path.resolve()),
                    "duration_seconds": round(end_seconds - start_seconds, 6),
                }
            )
        except RuntimeError as exc:
            if "collision" in str(exc).lower():
                return fail(str(exc))
            shot["error_code"] = "runtime_error"
            shot["error_message"] = str(exc)
        except subprocess.CalledProcessError as exc:
            shot["error_code"] = "ffmpeg_clip_failed"
            stderr = (exc.stderr or "").strip()
            shot["error_message"] = stderr or "ffmpeg clip generation failed"
        except Exception as exc:
            shot["error_code"] = "row_validation_failed"
            shot["error_message"] = str(exc)
        shots.append(shot)

    manifest = build_manifest(
        video_path=video_path,
        sheet_path=sheet_path,
        sheet_format=sheet_format,
        output_dir=output_dir,
        clip_mode=args.mode,
        source_duration=source_duration,
        warnings=warnings,
        shots=shots,
    )
    manifest_path = output_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"WROTE {manifest_path}")
    print(f"STATUS {manifest['status']}")
    return 0 if manifest["status"] in STATUS_VALUES else 1


if __name__ == "__main__":
    raise SystemExit(main())
