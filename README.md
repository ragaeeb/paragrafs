# paragrafs

[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77131919-f79c-4be7-a329-d54199396eae.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77131919-f79c-4be7-a329-d54199396eae)
![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
[![Node.js CI](https://github.com/ragaeeb/paragrafs/actions/workflows/build.yml/badge.svg)](https://github.com/ragaeeb/paragrafs/actions/workflows/build.yml)
![GitHub License](https://img.shields.io/github/license/ragaeeb/paragrafs)
![GitHub Release](https://img.shields.io/github/v/release/ragaeeb/paragrafs)
[![codecov](https://codecov.io/gh/ragaeeb/paragrafs/graph/badge.svg?token=B3IRBVOS3H)](https://codecov.io/gh/ragaeeb/paragrafs)
[![Size](https://deno.bundlejs.com/badge?q=paragrafs@latest&badge=detailed)](https://bundlejs.com/?q=paragrafs%40latest)
![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label&color=blue)
![npm](https://img.shields.io/npm/dm/paragrafs)
![GitHub issues](https://img.shields.io/github/issues/ragaeeb/paragrafs)
![GitHub stars](https://img.shields.io/github/stars/ragaeeb/paragrafs?style=social)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ragaeeb/paragrafs?utm_source=oss&utm_medium=github&utm_campaign=ragaeeb%2Fparagrafs&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

A lightweight TypeScript library designed to reconstruct paragraphs from AI transcriptions. It helps format unstructured text with appropriate paragraph breaks, handles timestamps for transcripts, and optimizes for readability.

## Features

- **Segment reconstruction** – marks filler words, hints, and time gaps to create natural paragraph boundaries and merges overly short segments back into their predecessors.【F:src/transcript.ts†L40-L204】【F:src/transcript.ts†L236-L300】
- **Timestamped formatting** – produces human-friendly transcripts with optional custom formatting callbacks and automatic timestamp rendering.【F:src/transcript.ts†L212-L300】
- **Ground-truth alignment** – synchronises AI generated tokens with human edited text, interpolating timings for missing words and removing unknown tokens when applying the ground truth.【F:src/utils/transcriptUtils.ts†L1-L226】【F:src/transcript.ts†L328-L395】
- **Selection helpers** – exposes utilities to find tokens for string queries or cursor selections, enabling rich text editors to jump to precise timestamps.【F:src/transcript.ts†L424-L493】
- **Hint system (Arabic-first)** – robust multi-word hint matching using normalization (diacritics/punctuation tolerant), plus hard boundary insertion via `ALWAYS_BREAK`.【F:src/utils/textUtils.ts†L59-L156】【F:src/transcript.ts†L40-L121】
- **Auto-hint generation** – mines frequent repeated phrases from `Token[]` or `Segment[]` and returns sorted hint candidates for Arabic-heavy transcripts.【F:src/utils/hints.ts†L303-L379】
- **Utility toolkit** – includes helpers for timestamp formatting, punctuation detection (including Arabic punctuation), ground-truth tokenization, and normalization utilities.【F:src/utils/textUtils.ts†L4-L185】
- **Bun-native toolchain** – powered by the upstream `tsdown` CLI for bundling and Biome for linting, so the same commands run locally and in CI without any custom wrappers.【F:package.json†L7-L41】【F:tsdown.config.ts†L1-L9】【F:biome.json†L1-L16】

## Breaking changes (recent)

- **Hints are normalized by default**: `createHints(...)` now uses Arabic-first normalization for matching and mining. If you relied on exact string matching, update your expectations and/or pass explicit normalization options.【F:src/utils/textUtils.ts†L121-L156】
- **`ALWAYS_BREAK` is a true hard boundary**: segments/lines after an `ALWAYS_BREAK` must not be merged into previous segments.【F:src/transcript.ts†L95-L167】【F:src/transcript.ts†L173-L211】

## Installation

```bash
npm install paragrafs
```

or

```bash
pnpm install paragrafs
```

or

```bash
yarn add paragrafs
```

or

```bash
bun add paragrafs
```

## Usage

### Basic Example

```typescript
import { estimateSegmentFromToken, markAndCombineSegments, mapSegmentsIntoFormattedSegments } from 'paragrafs';

// Example token from transcription
const token = {
    start: 0,
    end: 5,
    text: 'This is a sample text. It should be properly segmented.',
};

// Estimate segment with word-level tokens
const segment = estimateSegmentFromToken(token);

// Combine and format segments
const formattedSegments = mapSegmentsIntoFormattedSegments([segment]);

console.log(formattedSegments[0].text);
// Output: "This is a sample text. It should be properly segmented."
```

### Working with Transcriptions

```typescript
import {
    markAndCombineSegments,
    mapSegmentsIntoFormattedSegments,
    formatSegmentsToTimestampedTranscript,
} from 'paragrafs';

// Example transcription segments
const segments = [
    {
        start: 0,
        end: 6.5,
        text: 'The quick brown fox!',
        tokens: [
            { start: 0, end: 1, text: 'The' },
            { start: 1, end: 2, text: 'quick' },
            { start: 2, end: 3, text: 'brown' },
            { start: 3, end: 6.5, text: 'fox!' },
        ],
    },
    {
        start: 8,
        end: 13,
        text: 'Jumps right over the',
        tokens: [
            { start: 8, end: 9, text: 'Jumps' },
            { start: 9, end: 10, text: 'right' },
            { start: 10, end: 11, text: 'over' },
            { start: 12, end: 13, text: 'the' },
        ],
    },
];

// Options for segment formatting
const options = {
    fillers: ['uh', 'umm', 'hmmm'],
    gapThreshold: 3,
    maxSecondsPerSegment: 12,
    minWordsPerSegment: 3,
};

// Process the segments
const combinedSegments = markAndCombineSegments(segments, options);
const formattedSegments = mapSegmentsIntoFormattedSegments(combinedSegments);

// Get timestamped transcript
const transcript = formatSegmentsToTimestampedTranscript(combinedSegments, 10);

console.log(transcript);
// Output:
// 0:00: The quick brown fox!
// 0:08: Jumps right over the
```

### Aligning AI Tokens to Human-Edited Text

```typescript
import { updateSegmentWithGroundTruth } from 'paragrafs';

const rawSegment = {
    start: 0,
    end: 10,
    text: 'The Buick crown flock jumps right over the crazy dog.',
    tokens: [
        /* AI-generated word timestamps */
    ],
};

const aligned = updateSegmentWithGroundTruth(rawSegment, 'The quick brown fox jumps right over the lazy dog.');
console.log(aligned.tokens);
// Each token now matches the ground-truth words exactly,
// with missing words interpolated where needed.
```

### Auto-generate hint candidates (Arabic-first)

Use this when you have a corpus of tokens/segments and want to discover repeated phrases like "احسن الله اليكم".

```typescript
import { createHints, generateHintsFromTokens, markTokensWithDividers } from 'paragrafs';

const tokens = [
    { start: 0, end: 1, text: 'أَحْسَنَ' },
    { start: 1, end: 2, text: 'الله' },
    { start: 2, end: 3, text: 'إليكم،' },
    // ... repeated in the stream ...
];

const mined = generateHintsFromTokens(tokens, {
    minN: 2,
    maxN: 4,
    minCount: 2,
    dedupe: 'closed',
    normalization: { normalizeAlef: true },
});

// Turn mined phrases into matching hints
const hints = createHints({ normalizeAlef: true }, ...mined.slice(0, 25).map((h) => h.phrase));

const marked = markTokensWithDividers(tokens, { fillers: [], gapThreshold: 999, hints });
```

## Commands

- `bun run build` – compiles the library with the official tsdown pipeline configured in `tsdown.config.ts`.【F:package.json†L33-L41】【F:tsdown.config.ts†L1-L9】
- `bun run lint` – runs Biome’s formatter and linter against the repository root.【F:package.json†L33-L41】【F:biome.json†L1-L16】
- `bun test` – executes the Bun test suite.
- `bun test --coverage` – runs tests with coverage reporting (useful for refactors of segmentation/matching logic).

### Demo app (Svelte + Vite)

This repo includes a minimal static demo app in `demo/` that exercises the major exported functions with configurable JSON/text inputs. It’s intended to be deployed to **`paragrafs.surge.sh`**.

- Live demo: [paragrafs.surge.sh](https://paragrafs.surge.sh)

- **Install**: `bun run demo:install`
- **Dev**: `bun run demo:dev`
- **Build**: `bun run demo:build`
- **Deploy to Surge**: `bun run demo:deploy`

Notes:

- The demo depends on the local package via `file:..`, so `demo:build` runs `bun run build` first to ensure `dist/` exists.
- Deploy target folder is `demo/dist`.

## API Reference

### Transcript builders

- `estimateSegmentFromToken(token: Token): Segment` – splits multi-word tokens into per-word timings so they can participate in downstream processing.【F:src/transcript.ts†L15-L39】
- `markTokensWithDividers(tokens: Token[], options: MarkTokensWithDividersOptions): MarkedToken[]` – inserts divider markers based on fillers, hints, punctuation, and timing gaps.【F:src/transcript.ts†L44-L121】
- `groupMarkedTokensIntoSegments(markedTokens: MarkedToken[], maxSecondsPerSegment: number): MarkedSegment[]` – chunks marked tokens into bounded-length segments.【F:src/transcript.ts†L123-L171】
- `mergeShortSegmentsWithPrevious(segments: MarkedSegment[], minWordsPerSegment: number): MarkedSegment[]` – merges segments that contain fewer than the required word count into their predecessors.【F:src/transcript.ts†L173-L211】
- `cleanupIsolatedTokens(markedTokens: MarkedToken[]): MarkedToken[]` – removes redundant divider markers that would isolate a single token on a line.【F:src/transcript.ts†L314-L326】
- `markAndCombineSegments(segments: Segment[], options): MarkedSegment[]` – convenience pipeline that flattens tokens, marks dividers, groups, and merges short runs in one call.【F:src/transcript.ts†L302-L326】
- `mapSegmentsIntoFormattedSegments(segments: MarkedSegment[], maxSecondsPerLine?: number): Segment[]` – flattens marked segments into readable text while respecting optional line duration caps.【F:src/transcript.ts†L236-L300】
- `formatSegmentsToTimestampedTranscript(segments: MarkedSegment[], maxSecondsPerLine: number, formatTokens?: (buffer: Token) => string): string` – emits newline separated transcript lines with timestamps or a custom formatter.【F:src/transcript.ts†L204-L234】

### Ground-truth alignment

- `updateSegmentWithGroundTruth(segment: Segment, groundTruth: string): GroundedSegment` – applies LCS-based alignment to replace tokens with the ground-truth words while flagging unmatched entries.【F:src/transcript.ts†L328-L359】
- `applyGroundTruthToSegment(segment: Segment, groundTruth: string): Segment` – wraps `updateSegmentWithGroundTruth` and filters unknown tokens for production-ready output.【F:src/transcript.ts†L361-L395】
- `mergeSegments(segments: Segment[], delimiter?: string): Segment` – concatenates sequential segments into one continuous block, preserving timing.【F:src/transcript.ts†L397-L411】
- `splitSegment(segment: Segment, splitTime: number): Segment[]` – divides a segment into two at a specific timestamp.【F:src/transcript.ts†L413-L448】

### Editor helpers

- `getFirstMatchingToken(tokens: Token[], query: string): Token | null` – scans for the first occurrence of a hint sequence produced by `createHints`.【F:src/transcript.ts†L450-L493】
- `getFirstTokenForSelection(segment: Segment, selectionStart: number, selectionEnd: number): Token | null` – maps character selections within `segment.text` back to the corresponding timed token.【F:src/transcript.ts†L495-L546】

### Utility functions

- `createHints(first: ArabicNormalizationOptions | string, ...rest: string[]): Hints` – creates **normalized** hints for robust Arabic matching (diacritics/punctuation tolerant).【F:src/utils/textUtils.ts†L121-L156】
- `formatSecondsToTimestamp(seconds: number): string` – renders numeric durations into `m:ss` or `h:mm:ss` strings.【F:src/utils/textUtils.ts†L14-L33】
- `isEndingWithPunctuation(text: string): boolean` – checks for trailing punctuation, including Arabic variants.【F:src/utils/textUtils.ts†L4-L12】
- `tokenizeGroundTruth(groundTruth: string): string[]` – tokenises human transcripts while attaching punctuation to the preceding word.【F:src/utils/textUtils.ts†L75-L112】
- `normalizeTokenText(text: string, options?: ArabicNormalizationOptions): string` – Arabic-first normalization used by hint matching and hint mining.【F:src/utils/textUtils.ts†L59-L103】

### Auto-hint generation

- `generateHintsFromTokens(tokens: Token[], options?: GenerateHintsOptions): GeneratedHint[]` – mines frequent n-grams from a token stream and returns candidates sorted by count/length.【F:src/utils/hints.ts†L303-L331】
- `generateHintsFromSegments(segments: Segment[], options?: GenerateHintsOptions): GeneratedHint[]` – mines frequent n-grams from segments; by default phrases do not cross segment boundaries.【F:src/utils/hints.ts†L333-L379】

### Types

```typescript
type Token = {
    start: number;
    end: number;
    text: string;
};

type Segment = Token & {
    tokens: Token[];
};

type MarkedToken = Token | typeof SEGMENT_BREAK | typeof ALWAYS_BREAK;

type MarkedSegment = {
    start: number;
    end: number;
    tokens: MarkedToken[];
};

type GroundedToken = Token & { isUnknown?: boolean };

type GroundedSegment = Omit<Segment, 'tokens'> & { tokens: GroundedToken[] };
```

## Use Cases

- **Transcript Formatting**: Convert raw transcriptions into readable text
- **Subtitle Generation**: Create properly formatted subtitles from audio transcriptions
- **Document Reconstruction**: Rebuild properly formatted documents from extracted text

## Contributing

Contributions are welcome! Please make sure your contributions adhere to the coding standards and are accompanied by relevant tests.

To get started:

1. Fork the repository
2. Install dependencies: `bun install` (requires [Bun](https://bun.sh/))
3. Make your changes
4. Run linting: `bun run lint`
5. Build the package: `bun run build`
6. Run tests: `bun test --coverage`
7. Submit a pull request

## License

`paragrafs` is released under the MIT License. See the [LICENSE.MD](./LICENSE.MD) file for more details.

## Author

Ragaeeb Haq

---

Built with TypeScript and Bun. Uses ESM module format.

## Canonical alignment and bounded subtitles

Use the actual `paragrafs/ground-truth` entry point when an editor needs explicit input/output correspondence:

```typescript
import { alignGroundTruth } from 'paragrafs/ground-truth';

const result = alignGroundTruth(
    [{ text: 'hello', start: 1, end: 2 }, { text: 'world', start: 3, end: 4 }],
    'hello corrected world trailing',
);
// result.tokens preserves every reviewed word and exact separators/surface text.
// result.correspondence reports match/replace/insert/delete/split/merge indices.
// result.diagnostics exposes repeated/positional identity and untimed words.
```

Indices are zero-based; application IDs stay outside Paragrafs. New boundary words remain untimed when valid neighboring bounds are absent. Interior interpolation is labelled `interpolated`; use `{ interpolate: false }` to preserve all missing timing. The bounded alignment refuses selections without reliable anchors when its cell/window budget is exceeded. Repeated anchors and positional replacements require review. `syncTokensWithGroundTruth` and the existing segment helpers retain their timed-token compatibility shape, including zero-duration placeholders for new boundary words; canonical editors should use `alignGroundTruth`.

Use `paragrafs/subtitles` for screen cues:

```typescript
import { createHints } from 'paragrafs';
import { buildSubtitleCues } from 'paragrafs/subtitles';

const { cues, omissions, diagnostics } = buildSubtitleCues(tokens, {
    maxSeconds: 6,
    maxCharacters: 84,
    maxCharactersPerLine: 42,
    maxLines: 2,
    maxCharactersPerSecond: 20,
    hints: createHints({ normalizeAlef: true, normalizeHamza: true, normalizeYa: true }, 'أما بعد'),
    hardBreakBefore: [12],
    fillers: ['uh'],
});
```

Each cue includes its original `tokenIndices`. Sentence punctuation, clause punctuation and normalized phrase hints guide readable boundaries; bounded lookahead avoids a full cue followed by a tiny tail. Hard duration, character and line bounds still apply without punctuation. Speaker changes, silence and manual boundaries remain boundaries, including boundaries before an omitted filler. Defaults omit nothing; configured fillers have explicit omission records. Untimed tokens reject generation unless the caller explicitly supplies `estimatedWindow: { start, end }` for the whole text. That mode estimates cue-level display times, not word alignment; callers must split separate speech windows before allocation. Impossible reading windows and source overlaps preserve the words and produce diagnostics that an application must review before publication. Display hold time never changes source-token timing. All times are seconds; corpus consumers convert their milliseconds at the adapter boundary.

The preferred `minSeconds` is a reading target. An isolated whole speech block may be up to 20% shorter when all size/rate caps pass; it emits `short_source_window` and never extends past the next token or permitted silence hold. Other impossible reading windows remain errors for the caller to review. Source timings are never rewritten.

Phrase hints are not mining stopwords: `GenerateHintsOptions.stopwords` excludes all-stopword n-grams from candidate mining only. Applications choose language/domain phrase hints; the library does not hardcode an Islamic/Arabic vocabulary. Normalize mining stopwords with the same options used for tokens.
