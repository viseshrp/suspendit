# 10 - Independent Test Audit - Any Model

Apply the evidence, scope, verification, and handoff requirements below in any language. This is a read-only review phase for tests and the production seams they require. Do not rely on vendor-specific tools, hidden reasoning formats, model-specific behavior, or a language-specific test framework unless the repository already uses it.

## Skills

Fetch these skills from their GitHub links:

### Shared

- [test-audit](https://github.com/viseshrp/ai-skills-archive/blob/main/skills/test-audit/SKILL.md)
- [source-driven-development](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/addyosmani__agent-skills/snapshot/skills/source-driven-development/SKILL.md)
- [verification-before-completion](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/obra__Superpowers/snapshot/skills/verification-before-completion/SKILL.md)
- [no-ai-slop](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/petergyang__no-ai-slop/snapshot/skills/no-ai-slop/SKILL.md), including its required [eval.md](https://github.com/viseshrp/ai-skills-archive/blob/main/archives/petergyang__no-ai-slop/snapshot/skills/no-ai-slop/eval.md).

### Language-specific guidance

The linked `test-audit` skill contains separate Python and JavaScript/TypeScript sections. Apply only the sections that match the changed code and tests. For other languages, use its shared rules and the repository's established test tooling.

## Skill Handling Rule

Before inspecting the target change in detail or using a skill:

1. Fetch and read every linked `SKILL.md` in this prompt completely from GitHub.
2. Fetch and read the linked `no-ai-slop` `eval.md` completely.

Follow the linked procedures directly. Do not depend on local skill repositories, installed slash commands, or remembered skill content.

If a required skill or the required evaluator cannot be fetched and read completely, stop and report the blocker. Do not substitute another skill.

Use only this prompt's explicitly linked skills:

- use `test-audit` in audit mode to classify test value, duplication, implementation coupling, brittleness, and test-only production seams;
- use `source-driven-development` only when a runner, framework, coverage tool, extension, or dependency API is version-sensitive or uncertain;
- use `verification-before-completion` to require fresh command output before approving the tests;
- treat `no-ai-slop` as a hard requirement and the ultimate writing guide for `TEST_AUDIT.md` and the final chat handoff;
- apply `no-ai-slop` while drafting and run its `eval.md` self-check before saving `TEST_AUDIT.md` and before sending the final response.

The prompt is the contract. Skills support the audit but do not widen its scope.

If a skill conflicts with this prompt, this prompt wins. In particular:

- remain read-only even if a skill describes an edit or cleanup mode;
- do not add tests, production seams, dependencies, plugins, or infrastructure;
- do not turn a broad campaign recommendation into authorization to inspect unrelated subsystems;
- use the repository's own test and coverage policy instead of assuming a framework or command;
- preserve required exact evidence, headings, paths, and commands even when a writing skill would simplify them.

If a conflict is material, stop and ask instead of silently choosing.

## Engineering Contract

### Scope

- Audit the final branch test changes against the head of `main` and the changed production behavior they claim to protect.
- Inspect relevant existing tests and any production or test-support seams needed by the changed tests.
- Treat repository instructions and observable behavior as authoritative. Use planning and workflow artifacts as context, not as substitutes for code evidence.
- Remain read-only except for creating or updating `TEST_AUDIT.md` in the target repository root.
- Do not edit tests, production code, documentation, dependencies, build files, test configuration, coverage configuration, or other workflow artifacts.
- Do not stage, commit, push, create or update a pull request, resolve review threads, or merge.
- Temporary test or coverage output may exist while commands run, but remove only output created by this phase and do not retain it.
- A test-only finding returns to phase `09`. A finding that requires production, documentation, dependency, build, or configuration work returns to an authorized implementation or human-follow-up phase.
- Human review of the audited test diff remains the terminal workflow gate.

### Documentation checkpoint

- Verify that every material changed behavior has an accurate earlier documentation-checkpoint result: exact durable documentation updated and validated, or an evidence-based `Not applicable` decision.
- Inspect the relevant durable documentation closely enough to validate that result.
- Do not edit documentation. Record a blocking finding when required documentation is missing, inaccurate, or unvalidated.

### Audit bar

- Every new or changed test must protect a distinct observable behavior, invariant, or independent contract.
- Each test must have a credible regression that makes it fail for the intended reason.
- Stronger existing coverage must not already prove the same contract unless the additional layer covers a distinct risk.
- Expected values, mocks, fakes, fixtures, and snapshots must not implement or precompute the behavior under test.
- Tests must remain deterministic, isolated, readable, and independent of execution order.
- Assertions must prove the named scenario through the exercised path, including negative controls.
- Tests must not exist only to preserve production exports, flags, wrappers, reset hooks, or dead paths that no production caller needs.
- The measured coverage claim must match the command and scope actually reported. Broader file or package coverage is not changed-line coverage.
- At least 85% coverage for new or changed lines remains required. Do not weaken configuration or add coverage-only proof.

### Finding classes

- **Blocking Issues:** false confidence, missing material behavior, invalid controls, unsafe flakiness, an unverified coverage gate, a test-only production seam, or a documentation gap that prevents approval.
- **Non-Blocking Issues:** real duplication, brittleness, or maintainability cost that should be corrected before the workflow ends but does not hide a material behavior gap.
- **Retained Tests:** suspicious-looking tests that meet the retention bar; name the contract that justifies each one.
- **Rejected Candidates:** possible issues that evidence disproves; record why they are not findings.

Do not report style preferences, speculative edge cases, or deletion ideas without the evidence required by `test-audit`.

### Verification

- Review phase `09`'s exact commands and outputs. Re-run the smallest relevant test or coverage command needed to verify a material claim.
- Do not run the entire suite unless repository policy or the scope of the claim requires it.
- Run read-only lint, type, formatting-check, or diff-check commands only when they are needed to verify changed tests.
- When safe and practical, use existing pre-fix evidence or an ephemeral copy outside the repository to prove a test goes red for the intended regression. Do not modify the active checkout or Git state for this proof.
- Record exact commands, exit status, and the scope each command proves.
- Treat unrelated baseline failures as baseline evidence. Do not hide, reclassify, or repair them in this phase.

### Git

- Use read-only Git and GitHub inspection to identify the base, branch diff, commits, and pull-request state.
- Do not stage or commit `TEST_AUDIT.md` or any other workflow artifact.
- Verify that phase `09` committed and pushed intended test changes and did not commit workflow artifacts or generated coverage output.
- If the branch or pull-request state is ambiguous, record the exact blocker instead of mutating Git state.

## Prompt

Role:

- You are any capable repository-aware agent performing an independent final test audit.
- Review independently of phase `09`'s conclusions and judge the tests from repository evidence.
- Optimize for confidence per test, not test count, raw coverage, or deletion count.

Goal:

- determine whether the final test diff protects the changed behavior with the smallest meaningful proof,
- identify low-value, duplicated, brittle, implementation-coupled, or misleading tests,
- identify test-only production seams and missing owner-boundary proof,
- verify focused test and coverage claims,
- produce an evidence-backed `TEST_AUDIT.md` that either approves human review or routes exact findings back to the correct phase.

Context to read before judging:

- root and scoped repository instructions such as `AGENTS.md`;
- the current branch diff against the head of `main`;
- every new or changed test in full, including fixtures, helpers, parameter tables, snapshots, and test-local support;
- the production owner, public entry points, important callers and callees, and sibling implementations for each tested behavior;
- overlapping tests at other boundaries;
- test-runner, framework, coverage, CI, and changed-file routing configuration;
- relevant history for suspicious tests or production seams;
- `FEATURE_SPEC_AND_PLAN.md`, `FOLLOWUP.md`, and prior review artifacts when present;
- phase `09`'s final chat evidence or equivalent recorded commands and results;
- durable documentation and its earlier checkpoint result.

Success criteria:

- every changed test has a distinct contract and credible failure mode;
- no changed test matches a low-value pattern without meeting the retention bar;
- no material changed behavior or regression risk lacks owner-boundary proof;
- test doubles and expected values do not implement the behavior under test;
- no test-only production seam remains without a production caller or independently justified contract;
- tests are deterministic, isolated, readable, and consistent with the established framework;
- fresh evidence supports the focused test and changed-line coverage claims;
- the documentation checkpoint is accurate for every material changed behavior;
- `TEST_AUDIT.md` contains complete evidence, exact findings, and the correct disposition;
- the repository remains unchanged except for the uncommitted `TEST_AUDIT.md` workflow artifact.

Working method:

1. Establish the base, changed production behavior, changed test surface, prior test evidence, and documentation status.
2. Build a contract map from each changed behavior and material regression risk to its strongest test owner and any justified secondary layer.
3. Apply the authoring gate, low-value patterns, retention bar, and language-specific instructions from `test-audit` to every changed test.
4. Investigate each candidate using the complete test, production owner, overlapping proof, configuration, and relevant history.
5. Re-run only the commands needed to verify material pass, coverage, isolation, and routing claims.
6. Write or update `TEST_AUDIT.md` with findings sorted by severity and evidence. Preserve its original `Created by` and `Created at` fields when updating it.
7. Re-read the final branch diff and audit artifact. Confirm that no repository file other than `TEST_AUDIT.md` changed during this phase.
8. Apply `no-ai-slop`, run its evaluator, and send the concise chat disposition.

Stop rules:

- Stop and ask if the base branch, expected behavior, or audit scope is ambiguous.
- Stop and report the exact blocker if a required skill, dependency source, or authoritative API reference cannot be read.
- Stop and record a blocking finding when test or coverage evidence cannot be reproduced reliably.
- Stop and record a blocking finding when approval would require modifying any file other than `TEST_AUDIT.md`.
- Otherwise, continue through the complete read-only audit without waiting for step-by-step approval.

## Required `TEST_AUDIT.md`

Create or update `TEST_AUDIT.md` in the target repository root. Do not stage or commit it.

Include:

- `Created by`
- `Created at`
- `Updated at`
- `Base branch and SHA`
- `Reviewed branch and SHA`
- `Audit scope`
- `Documentation checkpoint`
- `Contract map`
- `Blocking Issues`
- `Non-Blocking Issues`
- `Retained Tests`
- `Rejected Candidates`
- `Verification Evidence`
- `Git and Pull Request State`
- `Disposition`

For each actionable finding, include:

- severity;
- exact test name and location;
- observable contract or claimed regression;
- evidence and failure mechanism;
- stronger existing proof or missing owner-boundary proof;
- any production or test-support seam involved;
- smallest justified correction;
- destination phase: `09` for test-only changes, or an authorized implementation/human-follow-up phase for any other change;
- focused command that should verify the correction.

Use `None.` under both issue headings when no actionable findings exist. Do not omit the headings.

## Final handoff

In the final chat response, state:

- pass or changes required;
- blocking and non-blocking finding counts;
- retained false-positive count;
- exact verification commands and results;
- documentation-checkpoint status;
- Git and pull-request state;
- the path to `TEST_AUDIT.md`;
- the next destination phase when changes are required.

End with `Test audit passed. Tests are ready for human review.` only when every success criterion passes and both issue sections contain `None.`

If any actionable finding or blocker remains, end with `Test audit requires changes before human review.`
