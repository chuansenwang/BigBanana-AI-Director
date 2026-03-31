import argparse
import json
import sys
from pathlib import Path


REQUIRED_FIELDS = [
    "schema_version",
    "status",
    "warnings",
    "inputs_used",
    "confidence",
    "source",
    "t0_t1_t2_t3",
    "story_breakdown",
    "segments",
    "transcript_info",
    "raw_limits",
]


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--schema", required=True)
    parser.add_argument("--input", required=True)
    args = parser.parse_args()

    schema = load_json(Path(args.schema))
    data = load_json(Path(args.input))

    missing = [field for field in REQUIRED_FIELDS if field not in data]
    if missing:
        print("Missing required fields:", ", ".join(missing))
        return 1

    allowed_status_values = schema.get(
        "allowed_status_values", ["ok", "partial", "failed"]
    )
    if data["status"] not in allowed_status_values:
        print(f"Invalid status: {data['status']}")
        return 1

    if not isinstance(data["warnings"], list):
        print("warnings must be a list")
        return 1

    confidence = data.get("confidence", {})
    if (
        not isinstance(confidence, dict)
        or "level" not in confidence
        or "basis" not in confidence
    ):
        print("confidence must contain level and basis")
        return 1

    if confidence["level"] not in {"high", "medium", "low"}:
        print("confidence.level must be high, medium, or low")
        return 1

    print("VALID")
    return 0


if __name__ == "__main__":
    sys.exit(main())
