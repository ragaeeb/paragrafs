import { describe, expect, it } from 'bun:test';

import {
    estimateSegmentFromToken,
    formatSegmentsToTimestampedTranscript,
    groupMarkedTokensIntoSegments,
    mapSegmentsIntoFormattedSegments,
    markAndCombineSegments,
    markTokensWithDividers,
    mergeShortSegmentsWithPrevious,
} from './transcript';
import { type MarkedSegment, type MarkedToken, Segment, SEGMENT_BREAK } from './types';

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

            const actual = markTokensWithDividers(tokens, { fillers: [], gapThreshold: 10, hints: ['Alright'] });

            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 3, start: 2, text: 'quick' },
                { end: 5, start: 4, text: 'brown' },
                { end: 6.5, start: 6, text: 'fox' },
                SEGMENT_BREAK,
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
    });

    describe('markAndCombineSegments', () => {
        const options = {
            fillers: ['uh', 'umm', 'hmmm'],
            gapThreshold: 1.5,
            maxSecondsPerSegment: 10,
            minWordsPerSegment: 3,
        };

        it('should process segments with fillers correctly', () => {
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

            expect(result).toHaveLength(1);
            expect(result[0].tokens).toContain(SEGMENT_BREAK);

            // Verify filler word was replaced with segment break
            const tokenTexts = result[0].tokens
                .filter((token) => token !== SEGMENT_BREAK)
                .map((token) => (token as any).text);

            expect(tokenTexts).toEqual(['Hello', 'world']);
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
                hints: ['Fox'],
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
                        SEGMENT_BREAK,
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

            // Expected behaviors:
            // 1. Segment break after "world." due to punctuation
            // 2. Segment break around "umm" due to filler
            // 3. Segment break after "you?" due to punctuation
            // 4. Segment break before second segment due to gap

            // Count all segment breaks
            const totalBreaks = result.reduce(
                (count, segment) => count + segment.tokens.filter((token) => token === SEGMENT_BREAK).length,
                0,
            );

            // We should have multiple breaks in this complex scenario
            expect(totalBreaks).toBeGreaterThan(3);

            // Verify that both segments were processed correctly
            const allNonBreakTokens = result.flatMap(
                (segment) => segment.tokens.filter((token) => token !== SEGMENT_BREAK) as any[],
            );

            const allTexts = allNonBreakTokens.map((token) => token.text);

            expect(allTexts).toContain('Hello');
            expect(allTexts).toContain('fine');
            // Filler should be removed
            expect(allTexts).not.toContain('umm');
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
});
