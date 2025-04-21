import { formatSecondsToTimestamp, isEndingWithPunctuation } from './textUtils';
import { MarkedSegment, type MarkedToken, type Segment, SEGMENT_BREAK, type Token } from './types';

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
 * - Line end markers
 * - Significant time gaps between tokens
 * - Punctuation at the end of tokens
 *
 * @param {Token[]} tokens - Array of tokens to process
 * @param {Object} options - Configuration options
 * @param {string[]} [options.fillers] - Optional array of filler words to mark as segment breaks
 * @param {number} options.gapThreshold - Minimum time gap (in seconds) to consider a segment break
 * @param {string[]} [options.lineEndMarkers] - Optional array of markers that indicate end of line
 * @returns {MarkedToken[]} Tokens with segment break markers inserted
 */
export const markTokensWithDividers = (
    tokens: Token[],
    { fillers, gapThreshold, lineEndMarkers }: { fillers?: string[]; gapThreshold: number; lineEndMarkers?: string[] },
): MarkedToken[] => {
    const marked: MarkedToken[] = [];
    let prevEnd: null | number = null;

    for (const token of tokens) {
        if (fillers?.includes(token.text)) {
            marked.push(SEGMENT_BREAK);
            continue;
        }

        if (lineEndMarkers?.includes(token.text)) {
            marked.push(SEGMENT_BREAK);
            continue;
        }

        if (prevEnd !== null && token.start - prevEnd > gapThreshold) {
            marked.push(SEGMENT_BREAK);
        }

        marked.push(token);

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

        if (token !== SEGMENT_BREAK) {
            if (segmentStart === null) segmentStart = token.start;
            segmentEnd = token.end;
        }

        currentSegment.push(token);

        const duration = segmentStart !== null && segmentEnd !== null ? segmentEnd - segmentStart : 0;
        const nextIsDivider = markedTokens[i + 1] === SEGMENT_BREAK;

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
        const wordTokens = segment.tokens.filter((t) => t !== SEGMENT_BREAK);

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

            if (token === SEGMENT_BREAK) {
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
                if (bufferStart === null) bufferStart = token.start;
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
            if (token === SEGMENT_BREAK) {
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
                if (bufferStart === null) bufferStart = token.start;
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
    options: {
        fillers: string[];
        gapThreshold: number;
        maxSecondsPerSegment: number;
        minWordsPerSegment: number;
    },
) => {
    const tokens = segments.flatMap((segment) => segment.tokens!);
    const markedTokens = markTokensWithDividers(tokens, {
        fillers: options.fillers,
        gapThreshold: options.gapThreshold,
    });
    const markedSegments = groupMarkedTokensIntoSegments(markedTokens, options.maxSecondsPerSegment);
    const combinedSegments = mergeShortSegmentsWithPrevious(markedSegments, options.minWordsPerSegment);

    return combinedSegments;
};
