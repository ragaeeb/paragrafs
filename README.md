# paragrafs

[![wakatime](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77131919-f79c-4be7-a329-d54199396eae.svg)](https://wakatime.com/badge/user/a0b906ce-b8e7-4463-8bce-383238df6d4b/project/77131919-f79c-4be7-a329-d54199396eae)
![Bun](https://img.shields.io/badge/Bun-%23000000.svg?style=for-the-badge&logo=bun&logoColor=white)
[![Node.js CI](https://github.com/ragaeeb/paragrafs/actions/workflows/build.yml/badge.svg)](https://github.com/ragaeeb/paragrafs/actions/workflows/build.yml)
![GitHub License](https://img.shields.io/github/license/ragaeeb/paragrafs)
![GitHub Release](https://img.shields.io/github/v/release/ragaeeb/paragrafs)
[![codecov](https://codecov.io/gh/ragaeeb/paragrafs/graph/badge.svg?token=B3IRBVOS3H)](https://codecov.io/gh/ragaeeb/paragrafs)
[![Size](https://deno.bundlejs.com/badge?q=paragrafs@1.2.0&badge=detailed)](https://bundlejs.com/?q=paragrafs%401.2.0)
![typescript](https://badgen.net/badge/icon/typescript?icon=typescript&label&color=blue)
![npm](https://img.shields.io/npm/dm/paragrafs)
![GitHub issues](https://img.shields.io/github/issues/ragaeeb/paragrafs)
![GitHub stars](https://img.shields.io/github/stars/ragaeeb/paragrafs?style=social)
![CodeRabbit Pull Request Reviews](https://img.shields.io/coderabbit/prs/github/ragaeeb/paragrafs?utm_source=oss&utm_medium=github&utm_campaign=ragaeeb%2Fparagrafs&labelColor=171717&color=FF570A&link=https%3A%2F%2Fcoderabbit.ai&label=CodeRabbit+Reviews)

A lightweight TypeScript library designed to reconstruct paragraphs from OCRed inputs and transcriptions. It helps format unstructured text with appropriate paragraph breaks, handles timestamps for transcripts, and optimizes for readability.

## Features

- **Segment Recognition**: Intelligently groups text into logical paragraphs
- **Filler Removal**: Identifies and removes common speech fillers (uh, umm, etc.)
- **Gap Detection**: Detects significant pauses to identify paragraph breaks
- **Timestamp Formatting**: Converts seconds to readable timestamps (HH:MM:SS)
- **Punctuation Awareness**: Uses punctuation to identify natural segment breaks
- **Customizable Parameters**: Configure minimum words per segment, max segment length, etc.
- **Arabic Support**: Handles Arabic question marks and other non-Latin punctuation
- **Transcript Formatting**: Converts raw token streams into readable text with appropriate line breaks
- **Ground-Truth Token Mapping**: Aligns AI-generated word timestamps to human-edited transcript text using an LCS-based algorithm with intelligent interpolation

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

// Example token from OCR or transcription
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
import { mapTokensToGroundTruth } from 'paragrafs';

const rawSegment = {
    start: 0,
    end: 10,
    text: 'The quick brown fox jumps right over the lazy dog.',
    tokens: [
        /* AI-generated word timestamps */
    ],
};

const aligned = mapTokensToGroundTruth(rawSegment);
console.log(aligned.tokens);
// Each token now matches the ground-truth words exactly,
// with missing words interpolated where needed.
```

## API Reference

### Core Functions

#### `estimateSegmentFromToken(token: Token): Segment`

Splits a single token into word-level tokens and estimates timing for each word.

#### `markTokensWithDividers(tokens: Token[], options): MarkedToken[]`

Marks tokens with segment breaks based on fillers, gaps, and punctuation.

#### `groupMarkedTokensIntoSegments(markedTokens: MarkedToken[], maxSecondsPerSegment: number): MarkedSegment[]`

Groups marked tokens into logical segments based on maximum segment length.

#### `mergeShortSegmentsWithPrevious(segments: MarkedSegment[], minWordsPerSegment: number): MarkedSegment[]`

Merges segments with too few words into the previous segment.

#### `mapSegmentsIntoFormattedSegments(segments: MarkedSegment[], maxSecondsPerLine?: number): Segment[]`

Converts marked segments into clean, formatted segments with proper text representation.

#### `formatSegmentsToTimestampedTranscript(segments: MarkedSegment[], maxSecondsPerLine: number): string`

Formats segments into a human-readable transcript with timestamps.

#### `markAndCombineSegments(segments: Segment[], options): MarkedSegment[]`

Combined utility that processes segments through all the necessary steps.

#### `mapTokensToGroundTruth(segment: Segment): Segment`

Synchronizes AI-generated word timestamps with the human-edited transcript (`segment.text`):

- Uses a longest-common-subsequence (LCS) to find matching words and preserve their original timing.
- Evenly interpolates timestamps for runs of missing words (only when two or more are missing).
- Falls back to `estimateSegmentFromToken` if no matches are found.

### Types

```typescript
type Token = {
    start: number; // Start time in seconds
    end: number; // End time in seconds
    text: string; // The transcribed text
};

type Segment = Token & {
    tokens?: Token[]; // Word-by-word breakdown with timings
};

type MarkedToken = 'SEGMENT_BREAK' | Token;

type MarkedSegment = {
    start: number;
    end: number;
    tokens: MarkedToken[];
};
```

### Utility Functions

#### `isEndingWithPunctuation(text: string): boolean`

Checks if the text ends with punctuation (including Arabic punctuation).

#### `formatSecondsToTimestamp(seconds: number): string`

Formats seconds into a human-readable timestamp (H:MM:SS).

## Use Cases

- **OCR Post-Processing**: Clean up scanned text by properly reconstructing paragraphs
- **Transcript Formatting**: Convert raw transcriptions into readable text
- **Subtitle Generation**: Create properly formatted subtitles from audio transcriptions
- **Document Reconstruction**: Rebuild properly formatted documents from extracted text

## Contributing

Contributions are welcome! Please make sure your contributions adhere to the coding standards and are accompanied by relevant tests.

To get started:

1. Fork the repository
2. Install dependencies: `bun install` (requires [Bun](https://bun.sh/))
3. Make your changes
4. Run tests: `bun test`
5. Submit a pull request

## License

`paragrafs` is released under the MIT License. See the [LICENSE.MD](./LICENSE.MD) file for more details.

## Author

Ragaeeb Haq

---

Built with TypeScript and Bun. Uses ESM module format.
