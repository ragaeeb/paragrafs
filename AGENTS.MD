# Agent Guide

## High-level overview

`paragrafs` is a small, functional TypeScript library for turning “raw ASR tokens/segments” into readable paragraphs, and for syncing timestamps against a human-edited “ground truth” transcript.

The codebase is intentionally simple and data-oriented: most public API lives in `src/transcript.ts`, and helpers live in `src/utils/*`.

Recent additions include:

- **Auto-hint mining**: generate frequent phrase candidates from `Token[]` or `Segment[]` (`src/utils/hints.ts`).
- **Arabic-first normalization**: consistent normalization is used for both hint creation/matching and hint mining (`normalizeTokenText`).
- **Hard boundary semantics**: `ALWAYS_BREAK` is enforced as a true hard boundary and must never be merged away.

## Mental model: the transcript pipeline

There are two primary flows.

### Segment reconstruction + formatting (tokens → markers → segments → text)

- **Inputs**: `Segment[]` where each segment contains word-level `tokens: Token[]`
- **Markers** (defined in `src/utils/constants.ts`):
    - `SEGMENT_BREAK`: a “soft” break (a potential boundary that formatters may or may not render depending on max-line constraints)
    - `ALWAYS_BREAK`: a “hard” boundary that must be preserved and must force a boundary (cannot be merged away)
- **Typical call chain** (see `markAndCombineSegments` in `src/transcript.ts`):
    - Flatten tokens
    - `markTokensWithDividers(...)` inserts `SEGMENT_BREAK` and `ALWAYS_BREAK`
    - `cleanupIsolatedTokens(...)` removes redundant breaks that would isolate a single token
    - `groupMarkedTokensIntoSegments(...)` chunks marked tokens into `MarkedSegment[]`
    - `mergeShortSegmentsWithPrevious(...)` merges “too short” segments (must respect `ALWAYS_BREAK`)
    - `mapSegmentsIntoFormattedSegments(...)` turns `MarkedSegment[]` into `Segment[]` with `text` containing newline breaks
    - `formatSegmentsToTimestampedTranscript(...)` emits timestamped lines

**Design intent**: markers are inserted on the token stream (not derived from the final text). Downstream formatting should respect marker semantics rather than re-inferring boundaries.

**Key invariant (from recent bugs)**: if `ALWAYS_BREAK` appears before a phrase like "احسن الله اليكم", that phrase must start a new segment/line and must not be merged into the previous segment during later steps.

### Ground-truth alignment (AI tokens + ground truth → corrected tokens)

- **Goal**: replace token texts with ground-truth words while preserving/estimating timings.
- Entry points in `src/transcript.ts`:
    - `updateSegmentWithGroundTruth(...)` keeps unknown tokens flagged
    - `applyGroundTruthToSegment(...)` filters unknown tokens out for production-ready output
- Core algorithm in `src/utils/transcriptUtils.ts`:
    - LCS-based “anchors” + interpolation for inserted/missing words
    - Uses `tokenizeGroundTruth(...)` and `normalizeWord(...)` from `src/utils/textUtils.ts`

## Repository layout
- `src/transcript.ts` exposes the public API for marking tokens, formatting transcripts, and applying ground-truth edits. Expect helper utilities to live close to the functions they support.
- `src/utils/textUtils.ts` and `src/utils/transcriptUtils.ts` house smaller helpers (normalization, timestamp formatting, diff alignment). Add new utilities here instead of scattering helpers across files.
- `src/utils/hints.ts` contains auto-hint generation (n-gram mining, frequency sorting, safe “closed” dedupe).
- `src/utils/constants.ts` defines marker constants (`SEGMENT_BREAK`, `ALWAYS_BREAK`) used across the pipeline.
- `src/types.ts` defines the public data model (`Token`, `Segment`, `MarkedToken`, `MarkedSegment`, and grounded types).
- Tests live next to their subjects (for example `src/transcript.test.ts`, `src/utils/hints.test.ts`). Whenever you add or modify a function in `src/`, update or extend the colocated test file to keep coverage current.
- Build and lint configuration sits at the repo root (`tsdown.config.ts`, `biome.json`, `tsconfig.json`). Keep them in sync with any new entry points or formatting rules you introduce.

## Public API + exports

- `src/transcript.ts` is the main API surface. Prefer adding/adjusting exported functions here.
- Keep `src/index.ts` aligned with the intended public surface (re-exports).
- When behavior changes affect output formatting, update both tests and README examples.

Auto-hints are exported from `src/index.ts`:

- `generateHintsFromTokens(tokens, options?)`
- `generateHintsFromSegments(segments, options?)`

## Tooling workflow
- Run `bun run build` before committing. It executes the upstream `tsdown` CLI using `tsdown.config.ts` to generate optimized ESM output plus type declarations.
- Run `bun run lint` to format and lint via Biome. Let Biome rewrite files instead of running custom formatters, and avoid bypassing its rules.
- Run `bun test` to execute the Bun-powered test suite. Add focused tests for any new behaviour you introduce.
- Run `bun test --coverage` when changing core logic to ensure coverage stays high (CI/codecov expects strong coverage).
- Run `bun update --latest` whenever dependencies need refreshing so `bun.lock` stays in sync with `package.json`.

## Coding conventions
- Follow the existing JSDoc style: document every exported function and describe non-trivial parameters or return values.
- Prefer pure, data-oriented helpers over classes. Functions should accept and return plain objects that match the types in `src/transcript.ts`.
- Use the `@/` path alias for imports originating from `src/` and avoid relative paths that climb out of the source tree.
- Keep indentation at four spaces and rely on Biome for spacing/quoting decisions. Do not reintroduce Prettier or ESLint configs.
- Avoid committing generated artifacts (`dist/`, coverage output, etc.). Only the TypeScript source, configs, and documentation should change in PRs.

## Normalization guidance (Arabic-first)

- `normalizeWord(...)` is the baseline (strip diacritics + trim punctuation/symbols).
- `normalizeTokenText(...)` adds Arabic-specific normalization (alef/ya/hamza/tatweel options).
- **Rule**: any feature that compares phrases (hints, mining, matching) should compare the **normalized** form and carry the original surface form only for display.

## Testing guidance (what to assert)

- Prefer **behavioral assertions** (exact tokens/markers and exact output text) over snapshotting large objects.
- When changing segmentation:
    - Add tests that cover both “formatted segments” (`mapSegmentsIntoFormattedSegments`) and “timestamped transcript output” (`formatSegmentsToTimestampedTranscript`).
    - Include cases for both markers:
        - `SEGMENT_BREAK` (soft) should be sensitive to `maxSecondsPerLine` / punctuation rules.
        - `ALWAYS_BREAK` (hard) should force boundaries regardless of duration thresholds.
- Avoid leaving `.only` in committed tests.

## Common pitfalls / invariants

- **`ALWAYS_BREAK` must be a hard boundary**:
    - It should force a new line in formatting.
    - It should prevent downstream “combine/merge” steps from absorbing the post-break phrase back into previous segments.
- `cleanupIsolatedTokens(...)` may remove redundant `SEGMENT_BREAK`s, but it should not erase the meaning of `ALWAYS_BREAK`.
- Keep time math monotonic: tokens should remain ordered and start/end should not go backwards.
- Punctuation detection (including Arabic punctuation) is centralized in `isEndingWithPunctuation(...)`—update it there rather than scattering checks.
- For hint mining/matching, avoid re-normalizing inside tight loops; precompute normalized token text once per scan (see `markTokensWithDividers`).

## Where to add new code

- If it’s part of the end-user API: add it to `src/transcript.ts` and re-export via `src/index.ts` as needed.
- If it’s a small reusable helper:
    - `src/utils/textUtils.ts` for string/token formatting and parsing utilities
    - `src/utils/transcriptUtils.ts` for alignment/diff logic
    - `src/utils/hints.ts` for hint mining (sequence discovery from tokens/segments)
- Add/extend tests in the colocated test file (`src/transcript.test.ts` or relevant `src/utils/*.test.ts`).
