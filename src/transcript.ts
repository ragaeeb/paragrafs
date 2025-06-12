import type {
    GroundedSegment,
    MarkedSegment,
    MarkedToken,
    MarkTokensWithDividersOptions,
    Segment,
    Token,
} from './types';

import { ALWAYS_BREAK, SEGMENT_BREAK } from './utils/constants';
import { createHints, formatSecondsToTimestamp, isEndingWithPunctuation } from './utils/textUtils';
import { isHintMatched, syncTokensWithGroundTruth } from './utils/transcriptUtils';

/**
 * Estimates a segment with word-level tokens from a single token with multi-word text.
 * Splits the text by whitespace and calculates approximate timing for each word.
 *
 * @param {Token} param0 - The source token containing text with multiple words
 * @param {number} param0.end - End time of the token in seconds
 * @param {number} param0.start - Start time of the token in seconds
 * @param {string} param0.text - The multi-word text content
 * @returns {Segment} A segment with the original text and estimated word-level tokens
 */
export const estimateSegmentFromToken = ({ end, start, text }: Token): Segment => {
    const words = text.split(/\s+/);
    const totalTokens = words.length;
    const segmentDuration = end - start;
    const tokenDuration = segmentDuration / totalTokens;

    const tokens = words.map((word, i) => ({
        end: start + (i + 1) * tokenDuration,
        start: start + i * tokenDuration,
        text: word,
    }));

    return { end, start, text, tokens };
};

/**
 * Marks tokens with segment dividers based on various criteria including:
 * - Filler words (uh, umm, etc.)
 * - Explicit multi-word hints
 * - Significant time gaps between tokens
 * - Punctuation at the end of tokens
 *
 * @param {Token[]} tokens - Array of tokens to process
 * @param {Object} options - Configuration options
 * @param {string[]} [options.fillers] - Optional array of filler words to mark as segment breaks
 * @param {number} options.gapThreshold - Minimum time gap (in seconds) to consider a segment break
 * @param {Hints} [options.hints] - Hints created with the createHints() function to indicate when to insert a new segment break.
 * @returns {MarkedToken[]} Tokens with segment break markers inserted
 */
export const markTokensWithDividers = (
    tokens: Token[],
    { fillers = [], gapThreshold, hints }: MarkTokensWithDividersOptions,
): MarkedToken[] => {
    const marked: MarkedToken[] = [];
    let prevEnd: null | number = null;

    for (let idx = 0; idx < tokens.length; idx++) {
        const token = tokens[idx];

        // Filler words always break
        if (fillers.includes(token.text)) {
            marked.push(SEGMENT_BREAK);
            continue;
        }

        if (hints && isHintMatched(tokens, hints, idx)) {
            marked.push(ALWAYS_BREAK);
        }

        // Large time gap triggers a break
        if (prevEnd !== null && token.start - prevEnd > gapThreshold) {
            marked.push(SEGMENT_BREAK);
        }

        // Push the token itself
        marked.push(token);

        // Punctuation at end triggers a break
        if (isEndingWithPunctuation(token.text)) {
            marked.push(SEGMENT_BREAK);
        }

        prevEnd = token.end;
    }

    return marked;
};

/**
 * Groups marked tokens into segments based on maximum segment duration.
 * Creates segments from tokens, splitting when the duration exceeds the specified maximum.
 *
 * @param {MarkedToken[]} markedTokens - Array of tokens with segment break markers
 * @param {number} maxSecondsPerSegment - Maximum duration (in seconds) for a segment
 * @returns {MarkedSegment[]} Array of marked segments
 */
export const groupMarkedTokensIntoSegments = (
    markedTokens: MarkedToken[],
    maxSecondsPerSegment: number,
): MarkedSegment[] => {
    const segments: MarkedSegment[] = [];
    let currentSegment: MarkedToken[] = [];
    let segmentStart: null | number = null;
    let segmentEnd: null | number = null;

    for (let i = 0; i < markedTokens.length; i++) {
        const token = markedTokens[i];

        if (token !== SEGMENT_BREAK && token !== ALWAYS_BREAK) {
            if (segmentStart === null) {
                segmentStart = token.start;
            }

            segmentEnd = token.end;
        }

        currentSegment.push(token);

        const duration = segmentStart !== null && segmentEnd !== null ? segmentEnd - segmentStart : 0;
        const nextIsDivider = markedTokens[i + 1] === SEGMENT_BREAK || markedTokens[i + 1] === ALWAYS_BREAK;

        if (duration > maxSecondsPerSegment && nextIsDivider) {
            segments.push({ end: segmentEnd!, start: segmentStart!, tokens: currentSegment });
            currentSegment = [];
            segmentStart = null;
            segmentEnd = null;
        }
    }

    if (currentSegment.length > 0 && segmentStart !== null && segmentEnd !== null) {
        segments.push({ end: segmentEnd, start: segmentStart, tokens: currentSegment });
    }

    return segments;
};

/**
 * Merges segments with fewer than the specified minimum words into the previous segment.
 * This helps avoid very short segments that might break the flow of text.
 *
 * @param {MarkedSegment[]} segments - Array of marked segments to process
 * @param {number} minWordsPerSegment - Minimum number of words required for a segment to stand alone
 * @returns {MarkedSegment[]} Array of merged segments
 */
export const mergeShortSegmentsWithPrevious = (
    segments: MarkedSegment[],
    minWordsPerSegment: number,
): MarkedSegment[] => {
    const result: MarkedSegment[] = [];

    for (const segment of segments) {
        const wordTokens = segment.tokens.filter((t) => t !== SEGMENT_BREAK && t !== ALWAYS_BREAK);

        if (wordTokens.length < minWordsPerSegment && result.length > 0) {
            const prev = result[result.length - 1];
            prev.tokens.push(...segment.tokens);
            prev.end = segment.end;
        } else {
            result.push({ ...segment });
        }
    }

    return result;
};

/**
 * Formats segments into a timestamped transcript with timestamps at the beginning of each line.
 * Lines are split based on segment breaks and maximum line duration.
 *
 * @param {MarkedSegment[]} segments - Array of marked segments to format
 * @param {number} maxSecondsPerLine - Maximum duration (in seconds) for a single line
 * @returns {string} Formatted transcript with timestamps
 */
export const formatSegmentsToTimestampedTranscript = (
    segments: MarkedSegment[],
    maxSecondsPerLine: number,
    formatTokens?: (buffer: Token) => string,
): string => {
    const lines: string[] = [];

    for (const segment of segments) {
        let buffer: Token[] = [];
        let bufferStart: null | number = null;

        const pushBufferAsLine = () => {
            if (buffer.length > 0) {
                const text = buffer.map((t) => t.text).join(' ');

                lines.push(
                    formatTokens
                        ? formatTokens({ end: buffer.at(-1)!.end, start: buffer[0].start, text })
                        : `${formatSecondsToTimestamp(buffer[0].start)}: ${text}`,
                );

                buffer = [];
                bufferStart = null;
            }
        };

        for (let i = 0; i < segment.tokens.length; i++) {
            const token = segment.tokens[i];

            if (token === ALWAYS_BREAK) {
                pushBufferAsLine();
            } else if (token === SEGMENT_BREAK) {
                const bufferEnd = buffer.length > 0 ? buffer[buffer.length - 1].end : null;
                const duration = bufferStart !== null && bufferEnd !== null ? bufferEnd - bufferStart : 0;

                if (
                    duration >= maxSecondsPerLine &&
                    buffer.length > 0 &&
                    isEndingWithPunctuation(buffer[buffer.length - 1].text)
                ) {
                    pushBufferAsLine();
                }
            } else {
                if (bufferStart === null) {
                    bufferStart = token.start;
                }

                buffer.push(token);
            }
        }

        pushBufferAsLine();
    }

    return lines.join('\n');
};

/**
 * Maps marked segments into formatted segments with clean text representation.
 * Combines the tokens into properly formatted text, respecting segment breaks
 * and optional maximum line duration.
 *
 * @param {MarkedSegment[]} segments - Array of marked segments to format
 * @param {number} [maxSecondsPerLine] - Optional maximum duration (in seconds) for a single line
 * @returns {Segment[]} Array of formatted segments with clean text
 */
export const mapSegmentsIntoFormattedSegments = (segments: MarkedSegment[], maxSecondsPerLine?: number): Segment[] => {
    return segments.map((segment) => {
        const textParts: string[] = [];
        const flattenedTokens: Token[] = [];
        let buffer: Token[] = [];
        let bufferStart: null | number = null;

        const pushBufferAsLine = () => {
            if (buffer.length > 0) {
                textParts.push(buffer.map((t) => t.text).join(' '));
                buffer = [];
                bufferStart = null;
            }
        };

        for (const token of segment.tokens) {
            if (token === ALWAYS_BREAK) {
                pushBufferAsLine();
            } else if (token === SEGMENT_BREAK) {
                if (!maxSecondsPerLine) {
                    pushBufferAsLine();
                } else {
                    const bufferEnd = buffer.length > 0 ? buffer[buffer.length - 1].end : null;
                    const duration = bufferStart !== null && bufferEnd !== null ? bufferEnd - bufferStart : 0;
                    if (duration > maxSecondsPerLine) {
                        pushBufferAsLine();
                    }
                }
            } else {
                if (bufferStart === null) {
                    bufferStart = token.start;
                }

                buffer.push(token);
                flattenedTokens.push(token);
            }
        }

        pushBufferAsLine();

        return {
            end: segment.end,
            start: segment.start,
            text: textParts.join('\n'),
            tokens: flattenedTokens,
        };
    });
};

/**
 * Convenience function that processes segments through all steps:
 * marking tokens with dividers, grouping into segments, and merging short segments.
 *
 * @param {Segment[]} segments - Array of input segments to process
 * @param {Object} options - Configuration options
 * @param {string[]} options.fillers - Array of filler words to mark as segment breaks
 * @param {number} options.gapThreshold - Minimum time gap (in seconds) to consider a segment break
 * @param {number} options.maxSecondsPerSegment - Maximum duration (in seconds) for a segment
 * @param {number} options.minWordsPerSegment - Minimum number of words required for a segment to stand alone
 * @returns {MarkedSegment[]} Array of processed and marked segments
 */
export const markAndCombineSegments = (
    segments: Segment[],
    options: MarkTokensWithDividersOptions & {
        maxSecondsPerSegment: number;
        minWordsPerSegment: number;
    },
) => {
    const tokens = segments.flatMap((segment) => segment.tokens!);
    let markedTokens = markTokensWithDividers(tokens, {
        fillers: options.fillers,
        gapThreshold: options.gapThreshold,
        ...(options.hints && { hints: options.hints }),
    });
    markedTokens = cleanupIsolatedTokens(markedTokens);
    const markedSegments = groupMarkedTokensIntoSegments(markedTokens, options.maxSecondsPerSegment);
    const combinedSegments = mergeShortSegmentsWithPrevious(markedSegments, options.minWordsPerSegment);

    return combinedSegments;
};

/**
 * Cleans up marked tokens by removing unnecessary segment breaks that would
 * cause individual tokens to appear on their own lines.
 *
 * @param {MarkedToken[]} markedTokens - The array of marked tokens to clean up
 * @returns {MarkedToken[]} A new array with unnecessary breaks removed
 */
export const cleanupIsolatedTokens = (markedTokens: MarkedToken[]): MarkedToken[] => {
    const result: MarkedToken[] = [];

    for (let i = 0; i < markedTokens.length; i++) {
        const current = markedTokens[i];
        const next = markedTokens[i + 1];
        const future = markedTokens[i + 2];

        if (current === SEGMENT_BREAK && (next === ALWAYS_BREAK || next === SEGMENT_BREAK)) {
            // skip current break since we're placing a break anyways
        } else if (current === SEGMENT_BREAK && (future === SEGMENT_BREAK || future === ALWAYS_BREAK || !future)) {
            // skip current break since we don't want to put a word by itself
        } else if (current === SEGMENT_BREAK && result.at(-1) === SEGMENT_BREAK) {
            // skip duplicate break
        } else {
            result.push(current);
        }
    }

    return result;
};

/**
 * Aligns AI-generated tokens to a ground truth human-edited segment text.
 *
 * Uses Longest Common Subsequence (LCS) to identify anchor matches between
 * tokenized output and ground truth. Where no matches exist, it interpolates
 * timestamped tokens for unmatched words.
 *
 * @param segment - A `Segment` object with ground truth `text` and AI-generated `tokens`
 * @param groundTruth - The ground truth text to apply to the segment's text and its tokens.
 * @returns A new `GroundedSegment` with the `tokens` adjusted to match the ground truth `text`
 * along with any unmatched tokens flagged.
 */
export const updateSegmentWithGroundTruth = (segment: Segment, groundTruth: string): GroundedSegment => {
    return {
        end: segment.end,
        start: segment.start,
        text: groundTruth,
        tokens: syncTokensWithGroundTruth(segment.tokens, groundTruth),
    };
};

/**
 * Produces a segment with the ground truth replacing the text and its respective tokens.
 * @param segment The segment to replace the ground truth with.
 * @param groundTruth The human verified transcription of the segment.
 * @returns A segment with the ground truth applies to the segment text and its tokens.
 */
export const applyGroundTruthToSegment = (segment: Segment, groundTruth: string): Segment => {
    const result = updateSegmentWithGroundTruth(segment, groundTruth);
    return { ...result, tokens: result.tokens.filter((t) => !t.isUnknown) };
};

/**
 * Merges multiple segments into a single segment.
 *
 * @param segments - Array of segments to merge into one
 * @param delimiter - Optional string to join segment texts (defaults to space)
 * @returns A single merged segment containing all tokens
 */
export const mergeSegments = (segments: Segment[], delimiter = ' '): Segment => {
    const text = segments.map((segment) => segment.text).join(delimiter);
    const tokens = segments.flatMap((segment) => segment.tokens);

    return { end: segments.at(-1)!.end, start: segments[0].start, text, tokens };
};

/**
 * Splits a segment at a specific time point into exactly two segments.
 *
 * This function does the opposite of mergeSegments, taking a single segment
 * and dividing it into two segments at the specified split time.
 *
 * @param segment - The segment to split
 * @param splitTime - The time (in seconds) at which to split the segment
 * @returns An array containing exactly two segments
 */
export const splitSegment = (segment: Segment, splitTime: number): Segment[] => {
    const firstTokens = segment.tokens.filter((token) => token.start < splitTime);
    const secondTokens = segment.tokens.filter((token) => token.start >= splitTime);

    const firstText = firstTokens.map((token) => token.text).join(' ');
    const secondText = secondTokens.map((token) => token.text).join(' ');

    return [
        {
            end: firstTokens.at(-1)!.end,
            start: segment.start,
            text: firstText,
            tokens: firstTokens,
        },
        {
            end: segment.end,
            start: secondTokens[0].start,
            text: secondText,
            tokens: secondTokens,
        },
    ];
};

/**
 * Searches through an array of tokens and returns the first one whose text sequence
 * matches the given query string.
 *
 * This function will split the `query` into one or more hint phrases (via `createHints`),
 * then scan `tokens` in order, returning the first token at which any hint sequence
 * fully matches the subsequent tokens.
 *
 * @param tokens
 *   An ordered array of `Token` objects to search.
 * @param query
 *   A string containing one or more words to match.  If you pass multiple words
 *   (e.g. `"hello world"`), it will only match if `"hello"` at position `i` is
 *   immediately followed by `"world"` at position `i+1`.
 * @returns
 *   The first `Token` in the array where the hint sequence matches, or `null`
 *   if no matching sequence is found.
 *
 * @example
 * ```ts
 * const tokens: Token[] = [
 *   { start: 0, end: 1, text: 'the' },
 *   { start: 1, end: 2, text: 'quick' },
 *   { start: 2, end: 3, text: 'brown' },
 *   { start: 3, end: 4, text: 'fox' },
 * ];
 *
 * getFirstMatchingToken(tokens, 'quick brown');
 * // → { start: 1, end: 2, text: 'quick' }
 *
 * getFirstMatchingToken(tokens, 'lazy dog');
 * // → null
 * ```
 */
export const getFirstMatchingToken = (tokens: Token[], query: string): null | Token => {
    const hints = createHints(query);

    for (let i = 0; i < tokens.length; i++) {
        if (isHintMatched(tokens, hints, i)) {
            return tokens[i];
        }
    }

    return null;
};

/**
 * Finds and returns the first token in a segment whose character‐range fully contains
 * the given [selectionStart, selectionEnd) range.
 *
 * This is useful when you have a selection in the raw `segment.text` (for example, from
 * an <input>’s `selectionStart` and `selectionEnd`) and you want to map that back to the
 * corresponding timed `Token`.
 *
 * @param segment  The Segment object containing the full `text` and an ordered list of `tokens`.
 * @param selectionStart
 *   The zero‐based index into `segment.text` where the selection begins (inclusive).
 * @param selectionEnd
 *   The zero‐based index into `segment.text` where the selection ends (exclusive).
 * @returns
 *   The first `Token` whose span in `segment.text` covers the entire selection range or `null` if it is not found.
 *
 * @example
 * ```ts
 * const segment: Segment = {
 *   text: 'the fox and the rabbit',
 *   start: 0,
 *   end: 6,
 *   tokens: [
 *     { start: 0, end: 1, text: 'the' },
 *     { start: 2, end: 3, text: 'fox' },
 *     { start: 3, end: 4, text: 'and' },
 *     { start: 4, end: 5, text: 'the' },
 *     { start: 5, end: 6, text: 'rabbit' },
 *   ],
 * };
 *
 * // Suppose the user selected the second "the" in an <input>,
 * // which corresponds to characters 12–15 (exclusive end):
 * const tok = getFirstTokenForSelection(segment, 12, 15);
 * // tok === { start: 4, end: 5, text: 'the' }
 * ```
 */
export const getFirstTokenForSelection = (
    segment: Segment,
    selectionStart: number,
    selectionEnd: number, // exclusive
): null | Token => {
    const { text, tokens } = segment;

    // Keep track of where we last matched, so duplicate words
    // resolve to the correct occurrence.
    let searchPos = 0;

    for (const token of tokens) {
        // Find the next occurrence of this token in the text
        const charStart = text.indexOf(token.text, searchPos);

        if (charStart === -1) {
            continue; // mismatch guard
        }

        const charEnd = charStart + token.text.length; // exclusive

        // Advance past this token (plus one for the space separator)
        searchPos = charEnd + 1;

        // Because selectionEnd is exclusive, we can test containment simply:
        if (selectionStart >= charStart && selectionEnd <= charEnd) {
            return token;
        }
    }

    return null;
};
