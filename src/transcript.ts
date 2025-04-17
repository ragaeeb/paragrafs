import { formatSecondsToTimestamp, isEndingWithPunctuation } from './textUtils';
import { MarkedSegment, type MarkedToken, type Segment, SEGMENT_BREAK, type Token } from './types';

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

export const formatSegmentsToTimestampedTranscript = (segments: MarkedSegment[], maxSecondsPerLine: number): string => {
    const lines: string[] = [];

    for (const segment of segments) {
        let buffer: Token[] = [];
        let bufferStart: null | number = null;

        const pushBufferAsLine = () => {
            if (buffer.length > 0) {
                const timestamp = formatSecondsToTimestamp(buffer[0].start);
                const text = buffer.map((t) => t.text).join(' ');
                lines.push(`${timestamp}: ${text}`);
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
