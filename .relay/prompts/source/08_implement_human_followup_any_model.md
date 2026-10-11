# 08 - Implement Human-Approved FOLLOWUP.md - Any Model

## Skills

- [incremental-implementation](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/addyosmani__agent-skills/snapshot/skills/incremental-implementation/SKILL.md)
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

- Do not create, modify, or delete tests in this follow-up implementation phase.
- Run only focused existing tests or checks needed to verify approved production changes; do not manually run the entire suite.
- If `FOLLOWUP.md` contains test-authoring work, leave that work for the dedicated model-agnostic `09_write_focused_tests_any_model.md` phase and state the deferral in the handoff.
- Phase `09` exclusively owns the detailed test-authoring contract.

## Prompt

Goal:

- execute the human-approved `FOLLOWUP.md` items end-to-end and stop only when you have a verified result or a concrete blocker.

Success criteria:

- only approved `FOLLOWUP.md` items are implemented,
- each completed item is checked off only after the change and its verification are done,
- the smallest correct changes are made,
- each completed `FOLLOWUP.md` item completes its documentation checkpoint: applicable durable documentation is updated and validated in the same change set, or an evidence-based `Not applicable` decision is reported,
- focused verification is run and reported with fresh evidence,
- any workflow-generated Markdown artifacts created or updated during the workflow remain in the target repo root and are never moved to subdirectories or alternate paths,
- any workflow-generated Markdown artifacts created or updated during the workflow include `Created by`, `Created at`, and `Updated at` metadata with `Updated at` refreshed on every edit,
- scope stays limited to the approved follow-up work,
- verification evidence is reported clearly,
- workflow-generated Markdown artifacts are not staged or committed unless I explicitly ask for that,
- if committing is allowed, each commit strictly corresponds to one approved `FOLLOWUP.md` item and does not mix work from multiple follow-up items,
- if committing is allowed, commits are small, focused, and split into sensible parts rather than one broad commit,
- the final execution flow stages changes, commits them, pushes the branch, and creates a pull request only if the current branch does not already have one,
- no AI review loop is restarted after this phase; the workflow proceeds to the final focused test-writing phase.

Context to read before acting:

- `REVIEW.md`,
- `WALKTHROUGH.md`,
- `FOLLOWUP.md`,
- `FEATURE_SPEC_AND_PLAN.md`, if present,
- current branch diff against `main`.

Execution posture:

- work autonomously: gather context, implement, run the smallest relevant checks, refine, then report,
- understand the context of the current PR before editing,
- read all likely relevant files in parallel before editing when that shortens the loop,
- prefer dedicated repo/search/edit tools over raw shell when available,
- keep progressing until you have a verified result or one of the stop conditions below.

Constraints:

- `FOLLOWUP.md` is the execution contract for this phase,
- `REVIEW.md` and `WALKTHROUGH.md` are reference context only,
- workflow-generated Markdown artifacts belong only in the target repo root using their exact required filenames,
- workflow-generated Markdown artifacts must include `Created by`, `Created at`, and `Updated at` metadata, preserving the creation fields after first write and updating `Updated at` on every edit,
- address all items in `FOLLOWUP.md` and check them off the list,
- only implement items that are explicitly present in `FOLLOWUP.md`,
- before checking off an item, complete the documentation checkpoint specified by that item; if it is missing or ambiguous, stop and ask instead of silently treating documentation as `Not applicable`,
- do not add new follow-up items,
- do not expand scope,
- do not implement optional suggestions unless they are explicitly in `FOLLOWUP.md`,
- follow the approved `FOLLOWUP.md` items exactly,
- no divergence,
- no creativity,
- no architecture changes,
- just execute what is written.

Stop rules:

- implement end-to-end with no interruptions unless one of the following conditions is true,
- stop and ask if there is a conflict in decisions,
- stop and ask if a required decision was never made,
- stop and ask if a `FOLLOWUP.md` item is wrong, stale, ambiguous, conflicts with the current code, or needs a design decision,
- stop and ask if following `FOLLOWUP.md` would create a performance, backwards-compatibility, security, or public-API problem,
- stop and ask if you do not have enough context,
- if a missing credential, external dependency, or environment precondition blocks verification, say exactly what blocked you,
- if any of those happens, stop and ask. Do not assume.
- otherwise do not stop at analysis.

Execution rules:

- before completion, check the full diff of this implementation pass against the Engineering Contract and approved scope,
- inspect all changes made by this follow-up pass for possible regressions, including indirect effects on existing callers, behavior, compatibility, and error paths. Fix regressions within the approved `FOLLOWUP.md` items; stop and ask if a fix would exceed them,
- inspect the changes made by this pass for added or changed meta content wherever it appears, including in comments, docstrings, durable documentation, or user-facing text: descriptions of the branch, task, implementation process, or the fact that a change was made instead of the resulting code or behavior. Remove or rewrite it within the approved scope,
- read likely relevant files in parallel before editing when practical,
- prefer dedicated repo/file/edit/search tools over raw shell when available,
- carry through context gathering, implementation, focused verification, and refinement without waiting for step-by-step approval unless blocked,
- work in small increments,
- if committing is allowed, each commit must map to exactly one approved `FOLLOWUP.md` item,
- if committing is allowed, commit often in small focused increments,
- do not bundle multiple follow-up items, partial work for unrelated items, or unrelated cleanup into the same commit,
- split large commits into sensible smaller focused parts,
- use detailed commit messages and descriptions,
- do not make unrelated refactors,
- do not create, modify, or delete tests in this phase; defer test-authoring items in `FOLLOWUP.md` to `09_write_focused_tests_any_model.md` and report the deferral in the handoff,
- run focused verification relevant to the approved follow-up items,
- run linter and smoke test if any on every commit, unless command execution is unavailable or explicitly disallowed,
- if a command fails, paste the exact error/log back. Never paraphrase logs.
- before marking each approved item complete, update and validate the exact durable documentation in the same change set, or report the item's evidence-based `Not applicable` decision,
- do not substitute code comments, commit messages, or workflow artifacts for durable documentation,
- do not write the changelog,
- after verification, stage the intended files with `git add`,
- do not stage or commit workflow-generated Markdown artifacts by default, including `DRAFT_PLAN.md`, `INITIAL_OPUS_PLANNING_PROMPT.md`, `FEATURE_SPEC_AND_PLAN.md`, `EXECUTION_PROMPT.md`, `PLAN_CRITIQUE.md`, `OPUS_PLAN_REVISION_REQUEST.md`, `PLAN_REVISION_SUMMARY.md`, `PLAN_REVISION_VERIFICATION.md`, `REVIEW.md`, `WALKTHROUGH.md`, `REVIEW_FIX_PROMPT.md`, `REVIEW_FIX_VERIFICATION.md`, `FOLLOWUP.md`, and `TEST_AUDIT.md`, unless I explicitly ask for them to be committed,
- create focused commit(s) with detailed messages,
- push the current branch after committing,
- check whether the current branch already has a pull request before creating one,
- create a pull request if and only if the current branch does not already have one,
- if unsure how to check whether the current branch already has a pull request, use GitHub CLI (`gh`) to determine that,
- do not create a duplicate pull request for the same branch,
- do not create a new AI review prompt,
- do not run another AI review in this phase,
- keep interim narration minimal and save the full report for the final response unless blocked.

After this phase, I will run `09_write_focused_tests_any_model.md` with any capable repository-aware model. That phase may change test files only and must not create another prompt or workflow artifact. I will then run `10_test_audit_any_model.md` with any capable repository-aware agent before I review the audited test diff myself.

## Required final response

```markdown
# Human Follow-Up Implementation Summary

## What Changed

## Files Changed

## FOLLOWUP.md Items Completed

## Verification Evidence

## Documentation Checkpoints

## Commits Created

## Push Status

## Pull Request

## Not Done / Blocked

## Suggestions Not Implemented Because Out Of Scope

## Remaining Manual Review Notes
```

In `## Commits Created`, list each commit together with the exact `FOLLOWUP.md` item it corresponds to.

In `## Documentation Checkpoints`, list each completed `FOLLOWUP.md` item's documentation status, the exact durable documentation and validation evidence when applicable, or the evidence-based `Not applicable` rationale.

Do not claim completion without fresh verification evidence.
