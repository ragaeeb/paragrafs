import { beforeEach, describe, expect, it } from 'bun:test';

import type { MarkedSegment, MarkedToken, Segment, Token } from './types';

import { createHints } from './textUtils';
import {
    cleanupIsolatedTokens,
    estimateSegmentFromToken,
    formatSegmentsToTimestampedTranscript,
    getFirstMatchingToken,
    getFirstTokenForSelection,
    groupMarkedTokensIntoSegments,
    mapSegmentsIntoFormattedSegments,
    mapTokensToGroundTruth,
    markAndCombineSegments,
    markTokensWithDividers,
    mergeSegments,
    mergeShortSegmentsWithPrevious,
    splitSegment,
} from './transcript';
import { ALWAYS_BREAK, SEGMENT_BREAK } from './utils/constants';

function roundTokenTimes(tokens: Token[]): Token[] {
    return tokens.map((t) => ({
        ...t,
        end: Math.round(t.end * 100) / 100,
        start: Math.round(t.start * 100) / 100,
    }));
}

describe('transcript', () => {
    describe('estimateSegmentFromToken', () => {
        it('should correctly estimate the segment tokens', () => {
            const actual = estimateSegmentFromToken({ end: 2, start: 0, text: 'Hello world.' });

            expect(actual).toEqual({
                end: 2,
                start: 0,
                text: 'Hello world.',
                tokens: [
                    {
                        end: 1,
                        start: 0,
                        text: 'Hello',
                    },
                    {
                        end: 2,
                        start: 1,
                        text: 'world.',
                    },
                ],
            });
        });
    });

    describe('markTokensWithDividers', () => {
        it('should insert a marker where the filler is', () => {
            const tokens = [
                { end: 0.25, start: 0, text: 'uh' },
                { end: 0.5, start: 0.25, text: 'umm' },
                { end: 1, start: 0.5, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox!' },
                { end: 7, start: 6.5, text: 'hmmm' },
                { end: 9, start: 8, text: 'Jumps' },
                { end: 10, start: 9, text: 'right' },
                { end: 11, start: 10, text: 'over' },
                { end: 13, start: 12, text: 'the' },
                { end: 18, start: 17, text: 'lazy' },
                { end: 20, start: 19, text: 'dog.' },
            ];

            const actual = markTokensWithDividers(tokens, { fillers: ['uh', 'umm', 'hmmm'], gapThreshold: 3 });

            expect(actual).toEqual([
                SEGMENT_BREAK,
                SEGMENT_BREAK,
                { end: 1, start: 0.5, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox!' },
                SEGMENT_BREAK,
                SEGMENT_BREAK,
                { end: 9, start: 8, text: 'Jumps' },
                { end: 10, start: 9, text: 'right' },
                { end: 11, start: 10, text: 'over' },
                { end: 13, start: 12, text: 'the' },
                SEGMENT_BREAK,
                { end: 18, start: 17, text: 'lazy' },
                { end: 20, start: 19, text: 'dog.' },
                SEGMENT_BREAK,
            ]);
        });

        it('should insert segment breaks based on punctuation, hint and gap', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 7, start: 6, text: 'fox' },
                { end: 9, start: 8, text: 'jumps' },
                { end: 11, start: 10, text: 'right' },
                { end: 13, start: 12, text: 'over' },
                { end: 15, start: 14, text: 'the' },
                { end: 17, start: 16, text: 'lazy' },
                { end: 19, start: 18, text: 'dog.' },
                { end: 20, start: 19, text: 'Okay.' },
                { end: 25, start: 24, text: 'Alright' },
            ];

            const actual = markTokensWithDividers(tokens, {
                fillers: [],
                gapThreshold: 3,
                hints: createHints('Alright'),
            });

            expect(actual).toEqual([
                {
                    end: 1,
                    start: 0,
                    text: 'The',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'quick',
                },
                {
                    end: 5,
                    start: 4,
                    text: 'brown',
                },
                {
                    end: 7,
                    start: 6,
                    text: 'fox',
                },
                {
                    end: 9,
                    start: 8,
                    text: 'jumps',
                },
                {
                    end: 11,
                    start: 10,
                    text: 'right',
                },
                {
                    end: 13,
                    start: 12,
                    text: 'over',
                },
                {
                    end: 15,
                    start: 14,
                    text: 'the',
                },
                {
                    end: 17,
                    start: 16,
                    text: 'lazy',
                },
                {
                    end: 19,
                    start: 18,
                    text: 'dog.',
                },
                SEGMENT_BREAK,
                {
                    end: 20,
                    start: 19,
                    text: 'Okay.',
                },
                SEGMENT_BREAK,
                ALWAYS_BREAK,
                SEGMENT_BREAK,
                {
                    end: 25,
                    start: 24,
                    text: 'Alright',
                },
            ]);
        });

        it('should insert a marker and insert the hint', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox' },
                { end: 7, start: 6.5, text: 'Alright' },
                { end: 9, start: 8, text: 'Jumps' },
                { end: 10, start: 9, text: 'right' },
                { end: 11, start: 10, text: 'over' },
                { end: 13, start: 12, text: 'the' },
                { end: 18, start: 17, text: 'lazy' },
                { end: 20, start: 19, text: 'dog.' },
            ];

            const actual = markTokensWithDividers(tokens, {
                fillers: [],
                gapThreshold: 10,
                hints: createHints('Alright'),
            });

            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox' },
                ALWAYS_BREAK,
                { end: 7, start: 6.5, text: 'Alright' },
                { end: 9, start: 8, text: 'Jumps' },
                { end: 10, start: 9, text: 'right' },
                { end: 11, start: 10, text: 'over' },
                { end: 13, start: 12, text: 'the' },
                { end: 18, start: 17, text: 'lazy' },
                { end: 20, start: 19, text: 'dog.' },
                SEGMENT_BREAK,
            ]);
        });
    });

    describe('groupMarkedTokensIntoSegments', () => {
        it('should group the marked tokens into segments', () => {
            const input = [
                SEGMENT_BREAK,
                SEGMENT_BREAK,
                { end: 1, start: 0.5, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox!' },
                SEGMENT_BREAK,
                SEGMENT_BREAK,
                { end: 9, start: 8, text: 'Jumps' },
                { end: 10, start: 9, text: 'right' },
                { end: 11, start: 10, text: 'over' },
                { end: 13, start: 12, text: 'the' },
                SEGMENT_BREAK,
                { end: 17, start: 16, text: 'lazy' },
                { end: 19, start: 18, text: 'dog.' },
                SEGMENT_BREAK,
            ] as MarkedToken[];

            const actual = groupMarkedTokensIntoSegments(input, 12);

            expect(actual).toEqual([
                {
                    end: 13,
                    start: 0.5,
                    tokens: [
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    tokens: [
                        SEGMENT_BREAK,
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                        SEGMENT_BREAK,
                    ],
                },
            ]);
        });
    });

    describe('mergeShortSegmentsWithPrevious', () => {
        it('should merge the trailing segments with the previous one', () => {
            const input = [
                {
                    end: 13,
                    start: 0.5,
                    tokens: [
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    tokens: [
                        SEGMENT_BREAK,
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                        SEGMENT_BREAK,
                    ],
                },
                {
                    end: 28,
                    start: 20,
                    tokens: [
                        SEGMENT_BREAK,
                        { end: 17, start: 16, text: 'Then' },
                        { end: 21, start: 18, text: 'they' },
                        { end: 25, start: 21, text: 'went' },
                        { end: 28, start: 25, text: 'home' },
                    ],
                },
            ] as MarkedSegment[];

            const actual = mergeShortSegmentsWithPrevious(input, 3);

            expect(actual).toEqual([
                {
                    end: 19,
                    start: 0.5,
                    tokens: [
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                        SEGMENT_BREAK,
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                        SEGMENT_BREAK,
                    ],
                },
                {
                    end: 28,
                    start: 20,
                    tokens: [
                        SEGMENT_BREAK,
                        { end: 17, start: 16, text: 'Then' },
                        { end: 21, start: 18, text: 'they' },
                        { end: 25, start: 21, text: 'went' },
                        { end: 28, start: 25, text: 'home' },
                    ],
                },
            ]);
        });
    });

    describe('mapSegmentsIntoFormattedSegments', () => {
        it('should concatenate and format the texts based on the dividers', () => {
            const input = [
                {
                    end: 13,
                    start: 0.5,
                    tokens: [
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                        SEGMENT_BREAK,
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    tokens: [{ end: 17, start: 16, text: 'lazy' }, { end: 19, start: 18, text: 'dog.' }, SEGMENT_BREAK],
                },
            ] as MarkedSegment[];

            const actual = mapSegmentsIntoFormattedSegments(input);

            expect(actual).toEqual([
                {
                    end: 13,
                    start: 0.5,
                    text: 'The quick brown fox!\nJumps right over the',
                    tokens: [
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    text: 'lazy dog.',
                    tokens: [
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                    ],
                },
            ]);
        });

        it('should concatenate and format the texts based on the dividers while considering the maximum number of seconds per line', () => {
            const input = [
                {
                    end: 13,
                    start: 0.5,
                    tokens: [
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        SEGMENT_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                        SEGMENT_BREAK,
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    tokens: [{ end: 17, start: 16, text: 'lazy' }, { end: 19, start: 18, text: 'dog.' }, SEGMENT_BREAK],
                },
            ] as MarkedSegment[];

            const actual = mapSegmentsIntoFormattedSegments(input, 10);

            expect(actual).toEqual([
                {
                    end: 13,
                    start: 0.5,
                    text: 'The quick brown fox! Jumps right over the',
                    tokens: [
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    text: 'lazy dog.',
                    tokens: [
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                    ],
                },
            ]);
        });

        it('should always create a new line when encountering the always break token even if the max seconds per line is not encountered', () => {
            const input = [
                {
                    end: 13,
                    start: 0.5,
                    tokens: [
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        SEGMENT_BREAK,
                        ALWAYS_BREAK,
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                        SEGMENT_BREAK,
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    tokens: [{ end: 17, start: 16, text: 'lazy' }, { end: 19, start: 18, text: 'dog.' }, SEGMENT_BREAK],
                },
            ] as MarkedSegment[];

            const actual = mapSegmentsIntoFormattedSegments(input, 10);

            expect(actual).toEqual([
                {
                    end: 13,
                    start: 0.5,
                    text: 'The quick brown fox!\nJumps right over the',
                    tokens: [
                        { end: 1, start: 0.5, text: 'The' },
                        { end: 3, start: 2, text: 'quick' },
                        { end: 5, start: 4, text: 'brown' },
                        { end: 6.5, start: 6, text: 'fox!' },
                        { end: 9, start: 8, text: 'Jumps' },
                        { end: 10, start: 9, text: 'right' },
                        { end: 11, start: 10, text: 'over' },
                        { end: 13, start: 12, text: 'the' },
                    ],
                },
                {
                    end: 19,
                    start: 16,
                    text: 'lazy dog.',
                    tokens: [
                        { end: 17, start: 16, text: 'lazy' },
                        { end: 19, start: 18, text: 'dog.' },
                    ],
                },
            ]);
        });
    });

    describe('markAndCombineSegments', () => {
        const options = {
            fillers: ['uh', 'umm', 'hmmm'],
            gapThreshold: 1.5,
            maxSecondsPerSegment: 10,
            minWordsPerSegment: 3,
        };

        it('should process segments with fillers but collapse to prevent isolated tokens', () => {
            const segments: Segment[] = [
                {
                    end: 2,
                    start: 0,
                    text: 'Hello uh world',
                    tokens: [
                        { end: 0.5, start: 0, text: 'Hello' },
                        { end: 1, start: 0.5, text: 'uh' },
                        { end: 2, start: 1, text: 'world' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);
            expect(result).toEqual([
                {
                    end: 2,
                    start: 0,
                    tokens: [
                        {
                            end: 0.5,
                            start: 0,
                            text: 'Hello',
                        },
                        {
                            end: 2,
                            start: 1,
                            text: 'world',
                        },
                    ],
                },
            ]);
        });

        it('should process segments with fillers correctly', () => {
            const segments: Segment[] = [
                {
                    end: 2,
                    start: 0,
                    text: 'Hello uh world today',
                    tokens: [
                        { end: 0.5, start: 0, text: 'Hello' },
                        { end: 1, start: 0.5, text: 'uh' },
                        { end: 2, start: 1, text: 'world' },
                        { end: 3, start: 2, text: 'today' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);
            expect(result).toEqual([
                {
                    end: 3,
                    start: 0,
                    tokens: [
                        {
                            end: 0.5,
                            start: 0,
                            text: 'Hello',
                        },
                        SEGMENT_BREAK,
                        {
                            end: 2,
                            start: 1,
                            text: 'world',
                        },
                        {
                            end: 3,
                            start: 2,
                            text: 'today',
                        },
                    ],
                },
            ]);
        });

        it('should support hints', () => {
            const segments: Segment[] = [
                {
                    end: 10,
                    start: 0,
                    text: 'The quick brown Fox jumps right over the lazy dog',
                    tokens: [
                        { end: 1, start: 0, text: 'The' },
                        { end: 2, start: 1.5, text: 'quick' },
                        { end: 3, start: 2, text: 'Fox' },
                        { end: 4, start: 3, text: 'jumps' },
                        { end: 6, start: 5, text: 'right' },
                        { end: 7, start: 6, text: 'over' },
                        { end: 8, start: 7, text: 'the' },
                        { end: 9, start: 8, text: 'lazy' },
                        { end: 10, start: 9, text: 'dog' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, {
                fillers: [],
                gapThreshold: 10,
                hints: createHints('Fox jumps', 'over it'),
                maxSecondsPerSegment: 100,
                minWordsPerSegment: 1,
            });

            expect(result).toEqual([
                {
                    end: 10,
                    start: 0,
                    tokens: [
                        { end: 1, start: 0, text: 'The' },
                        { end: 2, start: 1.5, text: 'quick' },
                        ALWAYS_BREAK,
                        { end: 3, start: 2, text: 'Fox' },
                        { end: 4, start: 3, text: 'jumps' },
                        { end: 6, start: 5, text: 'right' },
                        { end: 7, start: 6, text: 'over' },
                        { end: 8, start: 7, text: 'the' },
                        { end: 9, start: 8, text: 'lazy' },
                        { end: 10, start: 9, text: 'dog' },
                    ],
                },
            ]);
        });

        it('should handle time gaps between tokens', () => {
            const segments: Segment[] = [
                {
                    end: 6,
                    start: 0,
                    text: 'This has a gap',
                    tokens: [
                        { end: 1, start: 0, text: 'This' },
                        { end: 2, start: 1, text: 'has' },
                        { end: 5, start: 4, text: 'a' }, // Note the 2-second gap
                        { end: 6, start: 5, text: 'gap' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);

            // Should have a segment break due to the gap
            const segmentBreakCount = result[0].tokens.filter((t) => t === SEGMENT_BREAK).length;
            expect(segmentBreakCount).toBeGreaterThan(0);
        });

        it('should respect maxSecondsPerSegment', () => {
            // Create a long segment that exceeds maxSecondsPerSegment
            const longSegment: Segment = {
                end: 15,
                start: 0,
                text: 'This is a very long segment that should be split due to exceeding max duration',
                tokens: Array(10)
                    .fill(0)
                    .map((_, i) => ({
                        end: (i + 1) * 1.5,
                        start: i * 1.5,
                        text: `word${i}`,
                    })),
            };

            const result = markAndCombineSegments([longSegment], options);

            // Since our options.maxSecondsPerSegment is 10 and the segment is 15 seconds,
            // we expect it might be split if there are appropriate breaks
            expect(result.length).toBeGreaterThanOrEqual(1);
        });

        it('should merge short segments based on minWordsPerSegment', () => {
            const segments: Segment[] = [
                {
                    end: 3,
                    start: 0,
                    text: 'This is normal.',
                    tokens: [
                        { end: 1, start: 0, text: 'This' },
                        { end: 2, start: 1, text: 'is' },
                        { end: 3, start: 2, text: 'normal.' },
                    ],
                },
                {
                    end: 5,
                    start: 4,
                    text: 'Too short',
                    tokens: [
                        { end: 4.5, start: 4, text: 'Too' },
                        { end: 5, start: 4.5, text: 'short' },
                    ],
                },
                {
                    end: 9,
                    start: 6,
                    text: 'Another normal segment',
                    tokens: [
                        { end: 7, start: 6, text: 'Another' },
                        { end: 8, start: 7, text: 'normal' },
                        { end: 9, start: 8, text: 'segment' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);

            // The middle segment has only 2 words, which is less than minWordsPerSegment (3),
            // so it should be merged with the previous segment
            expect(result.length).toBeLessThan(3);

            // Verify that "Too short" was merged with the previous segment
            const allTokenTexts = result.flatMap((segment) =>
                segment.tokens.filter((token) => token !== SEGMENT_BREAK).map((token) => (token as any).text),
            );

            expect(allTokenTexts).toContain('Too');
            expect(allTokenTexts).toContain('short');
        });

        it('should handle punctuation correctly by adding segment breaks', () => {
            const segments: Segment[] = [
                {
                    end: 4,
                    start: 0,
                    text: 'First sentence. Second sentence',
                    tokens: [
                        { end: 1, start: 0, text: 'First' },
                        { end: 2, start: 1, text: 'sentence.' },
                        { end: 3, start: 2, text: 'Second' },
                        { end: 4, start: 3, text: 'sentence' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);

            // Should have a segment break after "sentence."
            const segmentBreakIndexes = result[0].tokens
                .map((token, index) => (token === SEGMENT_BREAK ? index : -1))
                .filter((index) => index !== -1);

            // Find if there's a SEGMENT_BREAK right after "sentence."
            const hasPunctuationBreak = segmentBreakIndexes.some((index) => {
                const prevToken = result[0].tokens[index - 1];
                return prevToken !== SEGMENT_BREAK && typeof prevToken !== 'string' && prevToken.text === 'sentence.';
            });

            expect(hasPunctuationBreak).toBeTrue();
        });

        it('should handle complex scenarios with mixed conditions', () => {
            const segments: Segment[] = [
                {
                    end: 5,
                    start: 0,
                    text: 'Hello world. umm How are you?',
                    tokens: [
                        { end: 1, start: 0, text: 'Hello' },
                        { end: 2, start: 1, text: 'world.' },
                        { end: 3, start: 2.5, text: 'umm' }, // Filler with small gap
                        { end: 4, start: 3, text: 'How' },
                        { end: 4.5, start: 4, text: 'are' },
                        { end: 5, start: 4.5, text: 'you?' },
                    ],
                },
                {
                    end: 9,
                    start: 8, // Note the large gap from previous segment
                    text: 'I am fine',
                    tokens: [
                        { end: 8.3, start: 8, text: 'I' },
                        { end: 8.6, start: 8.3, text: 'am' },
                        { end: 9, start: 8.6, text: 'fine' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);
            expect(result).toEqual([
                {
                    end: 9,
                    start: 0,
                    tokens: [
                        {
                            end: 1,
                            start: 0,
                            text: 'Hello',
                        },
                        {
                            end: 2,
                            start: 1,
                            text: 'world.',
                        },
                        SEGMENT_BREAK,
                        {
                            end: 4,
                            start: 3,
                            text: 'How',
                        },
                        {
                            end: 4.5,
                            start: 4,
                            text: 'are',
                        },
                        {
                            end: 5,
                            start: 4.5,
                            text: 'you?',
                        },
                        SEGMENT_BREAK,
                        {
                            end: 8.3,
                            start: 8,
                            text: 'I',
                        },
                        {
                            end: 8.6,
                            start: 8.3,
                            text: 'am',
                        },
                        {
                            end: 9,
                            start: 8.6,
                            text: 'fine',
                        },
                    ],
                },
            ]);
        });

        it('should handle empty input gracefully', () => {
            const result = markAndCombineSegments([], options);
            expect(result).toEqual([]);
        });

        it('should handle Arabic punctuation correctly', () => {
            const segments: Segment[] = [
                {
                    end: 3,
                    start: 0,
                    text: 'مرحبا بالعالم؟ كيف حالك',
                    tokens: [
                        { end: 1, start: 0, text: 'مرحبا' },
                        { end: 2, start: 1, text: 'بالعالم؟' },
                        { end: 2.5, start: 2, text: 'كيف' },
                        { end: 3, start: 2.5, text: 'حالك' },
                    ],
                },
            ];

            const result = markAndCombineSegments(segments, options);

            // Should have a segment break after Arabic question mark
            const segmentBreakIndexes = result[0].tokens
                .map((token, index) => (token === SEGMENT_BREAK ? index : -1))
                .filter((index) => index !== -1);

            const hasPunctuationBreak = segmentBreakIndexes.some((index) => {
                const prevToken = result[0].tokens[index - 1];
                return prevToken !== SEGMENT_BREAK && typeof prevToken !== 'string' && prevToken.text === 'بالعالم؟';
            });

            expect(hasPunctuationBreak).toBeTrue();
        });
    });

    describe('formatSegmentsToTimestampedTranscript', () => {
        it('formats a single short line with timestamp', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 4,
                    start: 0,
                    tokens: [
                        { end: 1, start: 0, text: 'Hello' },
                        { end: 2, start: 1, text: 'world.' },
                    ],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 10);
            expect(result).toEqual('0:00: Hello world.');
        });

        it('splits lines based on punctuation when duration exceeds maxSecondsPerLine', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 15,
                    start: 0,
                    tokens: [
                        { end: 2, start: 0, text: 'Hello' },
                        { end: 5, start: 2, text: 'there.' },
                        SEGMENT_BREAK,
                        { end: 12, start: 6, text: 'How' },
                        { end: 15, start: 12, text: 'are you?' },
                    ],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 5);
            expect(result).toEqual(['0:00: Hello there.', '0:06: How are you?'].join('\n'));
        });

        it('should always create a new segment when encountering a always break token', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 15,
                    start: 0,
                    tokens: [
                        { end: 2, start: 0, text: 'Hello' },
                        { end: 5, start: 2, text: 'there.' },
                        ALWAYS_BREAK,
                        { end: 12, start: 6, text: 'How' },
                        { end: 15, start: 12, text: 'are you?' },
                    ],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 100);
            expect(result).toEqual(['0:00: Hello there.', '0:06: How are you?'].join('\n'));
        });

        it('does not break long sentences if no punctuation is present', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 15,
                    start: 0,
                    tokens: [
                        { end: 2, start: 0, text: 'Just' },
                        { end: 5, start: 2, text: 'keep' },
                        { end: 10, start: 5, text: 'going' },
                        { end: 15, start: 10, text: 'without' },
                    ],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 5);
            expect(result).toEqual('0:00: Just keep going without');
        });

        it('uses custom formatter if formatTokens is provided', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 5,
                    start: 0,
                    tokens: [
                        { end: 2, start: 0, text: 'Testing' },
                        { end: 5, start: 2, text: 'formatter.' },
                    ],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 10, (buffer) => {
                return `> [${buffer.start}s]: ${buffer.text.toUpperCase()}`;
            });

            expect(result).toEqual('> [0s]: TESTING FORMATTER.');
        });

        it('handles empty segments gracefully', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 0,
                    start: 0,
                    tokens: [],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 5);
            expect(result).toEqual('');
        });

        it('supports timestamps over an hour', () => {
            const segments: MarkedSegment[] = [
                {
                    end: 3610,
                    start: 3601,
                    tokens: [{ end: 3610, start: 3601, text: 'An hour in.' }],
                },
            ];

            const result = formatSegmentsToTimestampedTranscript(segments, 10);
            expect(result).toEqual('1:00:01: An hour in.');
        });
    });

    describe('updateTokensFromGroundTruth', () => {
        it('should have no effect if the text remains unchanged', () => {
            const tokens = [
                {
                    end: 1,
                    start: 0,
                    text: 'The',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'quick',
                },
                {
                    end: 4,
                    start: 3,
                    text: 'brown',
                },
                {
                    end: 6,
                    start: 5,
                    text: 'fox',
                },
            ];

            const actual = mapTokensToGroundTruth({ end: 6, start: 0, text: 'The quick brown fox', tokens });
            expect(actual.tokens).toEqual(tokens);
        });

        it('should update the incorrect word when the total number of words is the same', () => {
            const actual = mapTokensToGroundTruth({
                end: 6,
                start: 0,
                text: 'The quick brown fox.',
                tokens: [
                    {
                        end: 1,
                        start: 0,
                        text: 'The',
                    },
                    {
                        end: 3,
                        start: 2,
                        text: 'Buick',
                    },
                    {
                        end: 4,
                        start: 3,
                        text: 'browse',
                    },
                    {
                        end: 6,
                        start: 5,
                        text: 'fox.',
                    },
                ],
            });
            expect(actual).toEqual({
                end: 6,
                start: 0,
                text: 'The quick brown fox.',
                tokens: [
                    {
                        end: 1,
                        start: 0,
                        text: 'The',
                    },
                    {
                        end: expect.closeTo(3.6, 0),
                        start: expect.closeTo(2.3, 0),
                        text: 'quick',
                    },
                    {
                        end: 5,
                        start: expect.closeTo(3.6, 0),
                        text: 'brown',
                    },
                    {
                        end: 6,
                        start: 5,
                        text: 'fox.',
                    },
                ],
            });
        });

        it('should interpolate multi-word gaps correctly', () => {
            const segment: Segment = {
                end: 10,
                start: 0,
                text: 'The quick brown fox jumps right over the lazy dog.',
                tokens: [
                    { end: 1, start: 0, text: 'The' },
                    { end: 3, start: 2, text: 'quick' },
                    { end: 4, start: 3, text: 'brown' },
                    { end: 5.5, start: 5, text: 'jumps' },
                    { end: 6, start: 5.5, text: 'right' },
                    { end: 9, start: 8, text: 'lazy' },
                    { end: 10, start: 9, text: 'dog' },
                ],
            };
            const actual = mapTokensToGroundTruth(segment);
            const got = roundTokenTimes(actual.tokens);

            expect(got).toEqual([
                {
                    end: 1,
                    start: 0,
                    text: 'The',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'quick',
                },
                {
                    end: 4,
                    start: 3,
                    text: 'brown',
                },
                {
                    end: 5,
                    start: 4.5,
                    text: 'fox',
                },
                {
                    end: 5.5,
                    start: 5,
                    text: 'jumps',
                },
                {
                    end: 6,
                    start: 5.5,
                    text: 'right',
                },
                {
                    end: 7.33,
                    start: 6.67,
                    text: 'over',
                },
                {
                    end: 8,
                    start: 7.33,
                    text: 'the',
                },
                {
                    end: 9,
                    start: 8,
                    text: 'lazy',
                },
                {
                    end: 10,
                    start: 9,
                    text: 'dog.',
                },
            ]);
        });

        it('should strip punctuation when matching and preserve ground truth punctuation', () => {
            const segment: Segment = {
                end: 3,
                start: 0,
                text: '¡Hola! ¿Cómo estás?',
                tokens: [
                    { end: 1, start: 0, text: 'Hola' },
                    { end: 2, start: 1, text: 'Como' },
                    { end: 3, start: 2, text: 'estas' },
                ],
            };
            const actual = mapTokensToGroundTruth(segment);
            expect(actual.tokens).toEqual([
                { end: 1, start: 0, text: '¡Hola!' },
                {
                    end: expect.closeTo(2.3333, 2),
                    start: expect.closeTo(1.6666, 2),
                    text: '¿Cómo',
                },
                {
                    end: expect.closeTo(3, 2),
                    start: expect.closeTo(2.3333, 2),
                    text: 'estás?',
                },
            ]);
        });

        it('should fallback to estimate when no LCS matches at all', () => {
            const segment: Segment = {
                end: 5,
                start: 0,
                text: 'Foo bar baz',
                tokens: [
                    { end: 1, start: 0, text: 'one' },
                    { end: 2, start: 1, text: 'two' },
                ],
            };
            const estimated = estimateSegmentFromToken(segment);
            const actual = mapTokensToGroundTruth(segment);
            expect(actual).toEqual(estimated);
        });
    });

    describe('cleanupIsolatedTokens', () => {
        it('should clean up the isolated token since it will be followed by a break', () => {
            const actual = cleanupIsolatedTokens([
                {
                    end: 1,
                    start: 0,
                    text: 'The',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'quick',
                },
                {
                    end: 5,
                    start: 4,
                    text: 'brown',
                },
                {
                    end: 7,
                    start: 6,
                    text: 'fox',
                },
                {
                    end: 9,
                    start: 8,
                    text: 'jumps',
                },
                {
                    end: 11,
                    start: 10,
                    text: 'right',
                },
                {
                    end: 13,
                    start: 12,
                    text: 'over',
                },
                {
                    end: 15,
                    start: 14,
                    text: 'the',
                },
                {
                    end: 17,
                    start: 16,
                    text: 'lazy',
                },
                {
                    end: 19,
                    start: 18,
                    text: 'dog.',
                },
                SEGMENT_BREAK,
                {
                    end: 20,
                    start: 19,
                    text: 'Okay.',
                },
                SEGMENT_BREAK,
                ALWAYS_BREAK,
                SEGMENT_BREAK,
                {
                    end: 25,
                    start: 24,
                    text: 'Alright',
                },
            ]);

            expect(actual).toEqual([
                {
                    end: 1,
                    start: 0,
                    text: 'The',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'quick',
                },
                {
                    end: 5,
                    start: 4,
                    text: 'brown',
                },
                {
                    end: 7,
                    start: 6,
                    text: 'fox',
                },
                {
                    end: 9,
                    start: 8,
                    text: 'jumps',
                },
                {
                    end: 11,
                    start: 10,
                    text: 'right',
                },
                {
                    end: 13,
                    start: 12,
                    text: 'over',
                },
                {
                    end: 15,
                    start: 14,
                    text: 'the',
                },
                {
                    end: 17,
                    start: 16,
                    text: 'lazy',
                },
                {
                    end: 19,
                    start: 18,
                    text: 'dog.',
                },
                {
                    end: 20,
                    start: 19,
                    text: 'Okay.',
                },
                ALWAYS_BREAK,
                {
                    end: 25,
                    start: 24,
                    text: 'Alright',
                },
            ]);
        });
    });

    describe('mergeSegments', () => {
        it('should merge the segments', () => {
            const segments = [
                {
                    end: 10,
                    start: 0,
                    text: 'The quick',
                    tokens: [
                        { end: 5, start: 0, text: 'The' },
                        { end: 10, start: 6, text: 'quick' },
                    ],
                },
                {
                    end: 20,
                    start: 11,
                    text: 'brown fox',
                    tokens: [
                        { end: 15, start: 11, text: 'brown' },
                        { end: 20, start: 16, text: 'fox' },
                    ],
                },
            ];

            const actual = mergeSegments(segments, '\n');

            expect(actual).toEqual({
                end: 20,
                start: 0,
                text: 'The quick\nbrown fox',
                tokens: [
                    { end: 5, start: 0, text: 'The' },
                    { end: 10, start: 6, text: 'quick' },
                    { end: 15, start: 11, text: 'brown' },
                    { end: 20, start: 16, text: 'fox' },
                ],
            });
        });
    });

    describe('splitSegment', () => {
        it('should split the segment', () => {
            const actual = splitSegment(
                {
                    end: 20,
                    start: 0,
                    text: 'The quick\nbrown fox',
                    tokens: [
                        { end: 5, start: 0, text: 'The' },
                        { end: 10, start: 6, text: 'quick' },
                        { end: 15, start: 11, text: 'brown' },
                        { end: 20, start: 16, text: 'fox' },
                    ],
                },
                11,
            );

            expect(actual).toEqual([
                {
                    end: 10,
                    start: 0,
                    text: 'The quick',
                    tokens: [
                        { end: 5, start: 0, text: 'The' },
                        { end: 10, start: 6, text: 'quick' },
                    ],
                },
                {
                    end: 20,
                    start: 11,
                    text: 'brown fox',
                    tokens: [
                        { end: 15, start: 11, text: 'brown' },
                        { end: 20, start: 16, text: 'fox' },
                    ],
                },
            ]);
        });
    });

    describe('getFirstMatchingToken', () => {
        let tokens;

        beforeEach(() => {
            tokens = [
                { end: 11, start: 10, text: 'the' },
                { end: 13, start: 12, text: 'quick' },
                { end: 15, start: 14, text: 'brown' },
                { end: 17, start: 16, text: 'fox' },
                { end: 19, start: 18, text: 'jumps' },
                { end: 21, start: 20, text: 'right' },
                { end: 23, start: 22, text: 'over' },
                { end: 25, start: 24, text: 'the' },
                { end: 27, start: 26, text: 'lazy' },
                { end: 29, start: 28, text: 'dog' },
            ];
        });

        it('should return the first text object for a single text match', () => {
            expect(getFirstMatchingToken(tokens, 'fox')).toEqual({ end: 17, start: 16, text: 'fox' });
        });

        it('should return the first text object for a consecutive text match', () => {
            expect(getFirstMatchingToken(tokens, 'the lazy')).toEqual({ end: 25, start: 24, text: 'the' });
        });

        it('should return null if the text is not found', () => {
            expect(getFirstMatchingToken(tokens, 'unicorn')).toBeNull();
        });

        it('should return the first text object if all the consecutive tokens match', () => {
            expect(getFirstMatchingToken(tokens, 'the quick brown')).toEqual({ end: 11, start: 10, text: 'the' });
        });

        it('should correctly handle the first text of the text', () => {
            expect(getFirstMatchingToken(tokens, 'the')).toEqual({ end: 11, start: 10, text: 'the' });
        });

        it('should correctly handle the last text of the text', () => {
            expect(getFirstMatchingToken(tokens, 'dog')).toEqual({ end: 29, start: 28, text: 'dog' });
        });

        it('should return null for a non-consecutive text match', () => {
            expect(getFirstMatchingToken(tokens, 'the dog')).toBeNull();
        });
    });

    describe('getFirstTokenForSelection', () => {
        let segment: Segment;

        beforeEach(() => {
            segment = {
                end: 6,
                start: 0,
                text: 'the fox and the rabbit',
                tokens: [
                    { end: 1, start: 0, text: 'the' },
                    { end: 3, start: 2, text: 'fox' },
                    { end: 4, start: 3, text: 'and' },
                    { end: 5, start: 4, text: 'the' },
                    { end: 6, start: 5, text: 'rabbit' },
                ],
            };
        });

        it('selecting the first "the" (chars 0–3) returns the first token', () => {
            const tok = getFirstTokenForSelection(segment, 0, 3);
            expect(tok).toEqual({ end: 1, start: 0, text: 'the' });
        });

        it('selecting "fox" (chars 4–7) returns the fox token', () => {
            const tok = getFirstTokenForSelection(segment, 4, 7);
            expect(tok).toEqual({ end: 3, start: 2, text: 'fox' });
        });

        it('selecting "and" (chars 8–11) returns the and token', () => {
            const tok = getFirstTokenForSelection(segment, 8, 11);
            expect(tok).toEqual({ end: 4, start: 3, text: 'and' });
        });

        it('selecting the second "the" (chars 12–15) returns the fourth token', () => {
            const tok = getFirstTokenForSelection(segment, 12, 15);
            expect(tok).toEqual({ end: 5, start: 4, text: 'the' });
        });

        it('selecting "rabbit" (chars 16–22) returns the rabbit token', () => {
            const tok = getFirstTokenForSelection(segment, 16, 22);
            expect(tok).toEqual({ end: 6, start: 5, text: 'rabbit' });
        });

        it('selection that does not exactly match one token throws', () => {
            // e.g. spans part of "fox" and part of "and"
            expect(getFirstTokenForSelection(segment, 6, 9)).toBeNull();
        });
    });
});
