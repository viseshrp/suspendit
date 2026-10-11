# SuspendIt Relay workflow

`workflows/selected-tabs.yaml` runs the pinned coding prompts with Codex,
Claude Opus, and Antigravity. `workflow-source.json` records the upstream
commit and hashes; the copies in `prompts/source/` retain their original text.

Required handoff files must exist and contain nonempty UTF-8 text before the
next agent starts. Each report output uses a `label` selector for its
`Created by` metadata. For example, `Created by: Claude Opus 5.5` produces the
value `Claude Opus 5.5` and retains the complete report with its SHA-256 hash
for inspection through Relay's artifact API. An `exists` output returns only
a boolean and does not retain an ignored report.

Planning and fix-verification checkpoints also require
each canonical verdict in `## Verdict` to be `Yes`. Missing, duplicate,
negative, or malformed verdicts fail the command and block downstream nodes.
Fenced examples cannot supply a verdict or satisfy a checkpoint.
For example, `- Ready for implementation: Yes` passes that named check;
`- Ready for implementation: No` blocks it. Correct the upstream artifact
before rerunning a failed checkpoint.

Owner decisions raised by the code review and the canonical human walkthrough
and test review remain `human_wait` nodes. Passing machine checks does not
supply those decisions. Workflow Markdown artifacts remain in the repository
root and are locally excluded from Git.

Relay snapshots each workflow at launch. Changes to this configuration apply
to newly launched runs; active runs keep their original checkpoints.
