import argparse
import json
from pathlib import Path


def load_json(path: Path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def render_story_block(story_breakdown: dict) -> str:
    lines = []
    opening_hook = story_breakdown.get("opening_hook")
    if opening_hook:
        lines.append(f"- 开场钩子：{opening_hook}")

    beats = story_breakdown.get("beats") or []
    for beat in beats:
        timestamp = beat.get("timestamp", "未知时间")
        note = beat.get("note", "")
        lines.append(f"- {timestamp}：{note}")

    ending = story_breakdown.get("cta_or_resolution")
    if ending:
        lines.append(f"- 收尾/CTA：{ending}")

    return "\n".join(lines) if lines else "- 无可用脚本/分镜解构"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    data = load_json(Path(args.input))
    source = data.get("source", {})
    scores = data.get("t0_t1_t2_t3", {})
    warnings = data.get("warnings") or []

    warnings_block = "\n".join(f"- {item}" for item in warnings) if warnings else "- 无"
    story_block = render_story_block(data.get("story_breakdown") or {})

    content = f"""# 解构详情

## 数据来源
- 来源链接：{data.get("inputs_used", {}).get("source_url") or "未提供"}
- 平台：{source.get("platform") or "未知"}
- 标题：{source.get("title") or "未知"}
- 频道：{source.get("channel") or "未知"}
- 时长：{source.get("duration_seconds") if source.get("duration_seconds") is not None else "未知"}

## 告警与降级说明
{warnings_block}

## 视频爆款因子结构化评估

### T0 决定上限
{(scores.get("t0") or {}).get("summary", "无")}

### T1 硬指标
{(scores.get("t1") or {}).get("summary", "无")}

### T2 软指标
{(scores.get("t2") or {}).get("summary", "无")}

### T3 灵活指标
{(scores.get("t3") or {}).get("summary", "无")}

## 脚本/分镜解构
{story_block}
"""

    Path(args.output).write_text(content, encoding="utf-8")
    print(f"WROTE {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
