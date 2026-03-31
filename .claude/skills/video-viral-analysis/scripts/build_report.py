from pathlib import Path
import runpy

runpy.run_path(
    str(
        Path(__file__).resolve().parents[3]
        / ".agents"
        / "skills"
        / "video-viral-analysis"
        / "scripts"
        / "build_report.py"
    ),
    run_name="__main__",
)
