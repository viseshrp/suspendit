"""Require the canonical verdict section to approve each requested checkpoint."""

import argparse
from pathlib import Path
import re
import sys

FENCE_PATTERN = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")


def prose_lines(lines: list[str]) -> list[str]:
    """Omit fenced examples, including a quoted '## Verdict' template."""
    visible = []
    fence = ""
    for line in lines:
        match = FENCE_PATTERN.match(line)
        if match:
            marker, remainder = match.groups()
            if not fence:
                fence = marker
            elif marker.startswith(fence) and not remainder.strip():
                fence = ""
        elif not fence:
            visible.append(line)
    return visible


def check_verdict(path: Path, labels: list[str]) -> list[str]:
    """Read '- Ready for implementation: Yes' as an approved named verdict."""
    try:
        lines = prose_lines(path.read_text(encoding="utf-8").splitlines())
    except (OSError, UnicodeError) as error:
        return [f"Cannot read {path}: {error}"]

    # Restrict matching to the verdict, so quoted examples cannot authorize work.
    if lines.count("## Verdict") != 1:
        return ["Expected exactly one '## Verdict' section."]
    start = lines.index("## Verdict") + 1
    end = next(
        (index for index in range(start, len(lines)) if lines[index].startswith("## ")),
        len(lines),
    )
    verdict = lines[start:end]
    failures = []
    for label in labels:
        prefix = f"- {label}: "
        values = [line[len(prefix) :].strip() for line in verdict if line.startswith(prefix)]
        if values != ["Yes"]:
            failures.append(f"{label}: expected one Yes verdict, found {values!r}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("artifact", type=Path)
    parser.add_argument("labels", nargs="+")
    args = parser.parse_args()
    failures = check_verdict(args.artifact, args.labels)
    if failures:
        print("Checkpoint blocked:", *failures, sep="\n", file=sys.stderr)
        return 1
    print(f"Checkpoint approved: {args.artifact}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
