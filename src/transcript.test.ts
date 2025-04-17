import { describe, expect, it } from 'bun:test';

import {
    estimateSegmentFromToken,
    groupMarkedTokensIntoSegments,
    mapSegmentsIntoFormattedSegments,
    markTokensWithDividers,
    mergeShortSegmentsWithPrevious,
} from './transcript';
import { type MarkedSegment, type MarkedToken, SEGMENT_BREAK } from './types';

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
});
