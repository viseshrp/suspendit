# 05 - Opus Verifies Review Fixes

## Skills

- [code-review-and-quality](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/addyosmani__agent-skills/snapshot/skills/code-review-and-quality/SKILL.md)
- [code-simplification](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/addyosmani__agent-skills/snapshot/skills/code-simplification/SKILL.md)
- [source-driven-development](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/addyosmani__agent-skills/snapshot/skills/source-driven-development/SKILL.md)
- [verification-before-completion](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/obra__Superpowers/snapshot/skills/verification-before-completion/SKILL.md)
- [receiving-code-review](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/obra__Superpowers/snapshot/skills/receiving-code-review/SKILL.md)
- [no-ai-slop](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/petergyang__no-ai-slop/snapshot/skills/no-ai-slop/SKILL.md), including its required [eval.md](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/petergyang__no-ai-slop/snapshot/skills/no-ai-slop/eval.md)

## Skill Handling Rule

Use only this prompt's explicitly linked skills.

Fetch and read each linked skill and required companion completely from its GitHub URL before use. Follow the linked procedures directly; do not depend on local skill repositories, installed slash commands, or earlier prompt text.

The prompt is the contract. The locked task artifact is the contract for execution. Skills are supporting procedures only.

If a skill conflicts with this prompt, this prompt wins.

If a conflict is material, stop and ask instead of silently choosing.

Do not use any skill to expand scope, add architecture changes, add tests, add unrelated refactors, or override my explicit instructions.

`no-ai-slop` is mandatory for every Markdown document this phase creates or revises. Treat it as the ultimate writing guide and final authority for prose and presentation after satisfying this prompt's factual, technical, structural, and output requirements. If another skill or instruction conflicts only on writing style, `no-ai-slop` wins; this prompt and locked task artifacts still control scope, meaning, required structure, artifact names, constraints, and evidence.

Apply `no-ai-slop` while drafting and run its `eval.md` self-check before saving each Markdown artifact or sending the final response. If its `SKILL.md` or `eval.md` cannot be read and applied, stop before creating or revising Markdown and report the blocker. Ignore its draft-request, detection-mode, and mandatory `What changed` workflow unless this prompt explicitly asks for them.


## Engineering Contract

Apply this contract during planning, execution, review, and review fixes.

### Plan adherence

- If there is a plan, and only when a plan is provided by me explicitly, follow the plan exactly.
- No divergence.
- No creativity.
- No architecture changes.
- Just execute what is written.
- If the plan, code reality, or user request conflicts with another instruction, stop and ask.
- If you have questions, cannot make a decision, do not have enough context, or hit conflicts, DO NOT MAKE ASSUMPTIONS. STOP. ASK. GET CONFIRMATION. THEN PROCEED.

### Scope control

- Do not change, refactor, or reorganize unrelated code unless absolutely necessary.
- Put suggestions to improve surrounding code in a separate “Not Doing / Suggestions” section; do not implement them.
- Ignore DevOps, packaging, building, and test-related work unless otherwise specified in the plan or prompt.
- Keep UI changes within UI code unless the plan explicitly requires changes elsewhere.
- Match existing style guidelines.
- Do not write the changelog.

### Performance and complexity

- No time-based waiting hacks.
- No hacky retry loops.
- Check algorithmic time and space complexity.
- Use the best solution after weighing options.
- Do not choose brute-force methods or quadratic operations unless the plan explicitly justifies them and the data size makes them safe.
- Write readable code.
- Prefer readable code over overcomplicated performance or time-complexity optimizations.
- If a change I request reduces performance, stop and tell me before implementing it.
- Explain performance concerns in enough detail for a junior developer to understand.

### Dependencies, frameworks, and documentation grounding

- No third-party libraries without explicit approval.
- If a third-party library is approved, verify library/framework usage against the correct documentation; ground 100% of usage in those docs.
- Always ground development work involving libraries 100% in documentation with zero assumptions.
- If documentation is poor and the library is open source, find its source code, clone it in a temporary folder, and read it thoroughly to supplement the documentation.
- Ensure usage follows the latest APIs.
- Flag outdated APIs.
- Check that library/framework usage is necessary and justified.

### Public APIs and exceptions

- Backwards compatibility is top priority.
- Changes in user-facing APIs must be backwards compatible, unless the app version is unreleased.
- If a third-party library is used in a public-facing API, the user should never see library/framework-specific exceptions raised.
- Use custom errors/exception classes instead. Reuse existing classes in the codebase or create custom ones if needed.
- Do not chain exceptions when doing so would expose implementation/library details to users.
- If logging is used and available, log the trace with the logger for debugging.
- If changes touch public APIs or add new public APIs, ensure they are user-friendly, intuitive, blend well with the existing public API set, and have appropriate names.

### Code quality and maintainability

- Use the target language and its standard library idiomatically.
- Reuse existing code wherever possible.
- Keep code DRY.
- Follow separation of concerns.
- Follow the single responsibility principle.
- Use proper imports.
- Do not load files as blobs and execute the code within another block of code.
- Use assert statements only in test files, never in production code.
- Surface all assumptions.
- If changes reinvent or duplicate something already in the source code, stop and flag it.
- Do not hardcode numbers, versions, or other constants. Reuse existing constants, or create new constants in the right places and reuse them appropriately.

### Types

- When adding types, use correct ones.
- Keep type declarations and annotations proportionate and readable. Do not use deeply nested, repetitive, or unnecessarily complex annotations that crowd code or obscure intent; prefer the simplest accurate type or a well-named type alias when that is clearer.
- Do not use filler types.
- Do not use overly generic types just to satisfy a checker.
- Do not use type-ignore comments to pass CI temporarily.
- Do not use `typing.Cast` or other casts merely to satisfy type checkers.

### Python

Apply this subsection only when the target repository uses Python.

The following typing coverage is a hard requirement:

- Every parameter, including `*args` and `**kwargs`, and return value of an added or changed function or method must have an explicit, accurate type hint. Treat `self` and `cls` as implicit; do not annotate them solely for this requirement.
- Every added or changed class variable, class attribute, instance attribute, and module-level mutable or optional state must have an explicit, accurate type hint. A trivial immutable module constant may remain inferred unless the configured type checker needs an annotation.
- Declare instance-attribute types at class scope where feasible; do not add `self.attribute: Type` annotations inside a method merely to satisfy this requirement.
- Do not type annotate local variables inside function or method bodies. Rely on inference; add a local annotation only to resolve a real configured type-checker error.
- Keep required annotations simple and accurate. Do not add advanced type constructs or type-only refactors unless the configured type checker requires them.

### Comments and documentation

- Document every added or changed string transformation with concrete examples showing representative input and expected output.
- Always add brief, detailed comments where they help readers understand the code with little effort.
- Comments must help readers understand the code with little effort.
- Comments must address the code itself, not be meta commentary about the task.
- Cleaning up stale comments is encouraged.
- Ensure every non-obvious change has an explanatory comment.
- Avoid bloated comment blocks. Include enough detail for junior engineers to understand easily.
- Always update related documentation.
- Find the correct docs folder by tracing GitHub Actions workflows, Makefiles, or other docs-build configuration.
- Append to the appropriate sections, or create new ones if required.
- Do not write the changelog.

### Documentation checkpoint

- Complete a documentation checkpoint at every planning, implementation, review, verification, and handoff stage.
- Before a checkpoint can pass, identify the user-, operator-, API-, configuration-, or developer-facing documentation affected by the planned or changed behavior.
- Require the exact durable documentation files/sections, their in-change-set update, and applicable docs build, link check, rendering check, or focused validation; if no durable documentation change is needed, require an evidence-based `Not applicable` decision.
- Code comments, commit messages, and workflow artifacts do not substitute for durable documentation. Do not write the changelog unless explicitly requested.

### Cross-platform behavior

- All changes must be strictly cross-platform and must work on both Linux and Windows.
- Mac is not a concern.

### Git and verification

- Commit often in small increments when committing is allowed.
- Split large commits into sensible parts.
- Add detailed commit messages.
- Explain the work in commit descriptions with as much detail as needed; no length limit.
- Do not claim work is complete without fresh verification evidence.
- Run linter and smoke test if any on every commit, unless the prompt explicitly forbids command execution.
- If a command fails, paste the exact error/log back. Never paraphrase logs.

### Tests

- Do not create, modify, or delete tests in this review-fix verification phase.
- Run only focused existing tests or checks needed to verify the fixes; do not manually run the entire suite.
- Verify test-related fixes against the accepted `REVIEW.md` finding and focused evidence; do not introduce a new test policy here.
- Defer new test authoring and the detailed test contract to the dedicated model-agnostic `09_write_focused_tests_any_model.md` phase.

## Prompt

Role:

- You are Claude Opus verifying review fixes after the review-fix model updated the branch.
- Read before answering. Do not speculate about files or code you have not inspected.

Task:

- verify whether the review-fix model satisfied all previously raised concerns, including the previously raised review findings,
- verify that every material changed behavior still has a completed documentation checkpoint,
- decide whether the code is ready for final review-artifact refresh or needs another fix pass.

Artifact location rule:

- all workflow-generated Markdown artifacts for this workflow must live in the target repo root using the exact required filenames,
- do not normalize them into subdirectories or alternate paths,
- all workflow-generated Markdown artifacts must include `Created by`, `Created at`, and `Updated at` metadata, preserving creation fields and refreshing `Updated at` on edits,
- treat any artifact-path drift as a workflow failure to call out explicitly.

Treat all valid findings from both `Blocking Issues` and `Non-Blocking Issues` as required for this verification pass.

Context to review:

- original `REVIEW.md`,
- original `WALKTHROUGH.md`,
- `REVIEW_FIX_PROMPT.md`, if present,
- the review-fix model's summary, if present,
- current branch diff against `main`,
- `FEATURE_SPEC_AND_PLAN.md`, if present.

Success criteria:

- each prior finding is checked against the actual changed code,
- the status of each finding is explicit and evidence-based,
- each documentation-checkpoint result is checked against the actual branch, including the durable documentation and validation evidence or the `Not applicable` rationale,
- any newly introduced issue is surfaced instead of hidden inside a pass verdict.

Constraints:

- do not modify code,
- do not assume a finding is fixed because the review-fix model said it was fixed,
- check actual code and actual diff.

For each prior review finding:

- identify the original finding,
- inspect the actual changed code,
- classify as `Resolved`, `Partially Resolved`, `Not Resolved`, or `Invalid Finding`,
- explain evidence from code,
- identify any new issues introduced by the fix.

For each material changed behavior, verify that its documentation checkpoint is complete. Treat missing, inaccurate, or unvalidated required durable documentation as unresolved.

## Required output: `REVIEW_FIX_VERIFICATION.md`

Create `REVIEW_FIX_VERIFICATION.md` in the target repo root.

Use this structure:

```markdown
# Review Fix Verification

## Verdict
- All valid blocking and non-blocking review findings resolved: Yes/No
- Documentation checkpoints complete: Yes/No
- Ready to finalize review/walkthrough docs: Yes/No

## Finding-by-Finding Verification

| Original Finding | Status | Evidence | Remaining Action |
|---|---|---|---|

## Documentation Checkpoint Verification

## New Issues Introduced

## Remaining Blocking Issues

## Remaining Non-Blocking Issues

## Required Next Action
```

If anything remains unresolved:

- do not create `REVIEW_FIX_PROMPT.md` in this phase,
- state explicitly that the workflow must return to `04_opus_review_branch.md`,
- state that `04` is the only phase that should author `REVIEW_FIX_PROMPT.md`,
- if `REVIEW_FIX_PROMPT.md` was missing, weak, or failed to retain needed fix instructions, report the upstream review/request failure; do not compensate here.

If all valid findings from both `Blocking Issues` and `Non-Blocking Issues` are resolved and every documentation checkpoint is complete, say the code is ready for final `REVIEW.md` / `WALKTHROUGH.md` refresh.
