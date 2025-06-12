import { describe, expect, it } from 'bun:test';

import { buildLcsTable, extractLcsMatches } from './lcs';

describe('lcs', () => {
    const original = ['a', 'b', 'c', 'd', 'e', 'f'];
    const ground = ['a', 'x', 'c', 'y', 'e', 'z', 'f'];

    const lcsTable: number[][] = buildLcsTable(['a', 'b', 'c', 'd', 'e', 'f'], ['a', 'x', 'c', 'y', 'e', 'z', 'f']);

    describe('buildLcsTable', () => {
        it('buildLcsTable should correctly calculate the length of the LCS', () => {
            // The length of the LCS is the value in the bottom-right cell.
            // The LCS is "acef", so the length should be 4.
            expect(lcsTable[original.length][ground.length]).toBe(4);
        });
    });

    describe('extractLcsMatches', () => {
        it('extractLcsMatches should find the correct index pairs', () => {
            const matches = extractLcsMatches(lcsTable, original, ground);
            const expectedMatches = new Map([
                [0, 0], // a -> a
                [2, 2], // c -> c
                [4, 4], // e -> e
                [5, 6], // f -> f
            ]);

            // Convert map to a sorted array for stable comparison
            const sortedActual = Array.from(matches.entries()).sort();
            const sortedExpected = Array.from(expectedMatches.entries()).sort();

            expect(sortedActual).toEqual(sortedExpected);
        });

        it('extractLcsMatches should handle sequences with no common elements', () => {
            const a = ['a', 'b', 'c'];
            const b = ['d', 'e', 'f'];
            const table = buildLcsTable(a, b);
            const matches = extractLcsMatches(table, a, b);
            expect(matches.size).toBe(0);
        });

        it('extractLcsMatches should handle identical sequences', () => {
            const a = ['a', 'b', 'c'];
            const table = buildLcsTable(a, a);
            const matches = extractLcsMatches(table, a, a);
            const expected = new Map([
                [0, 0],
                [1, 1],
                [2, 2],
            ]);
            expect([...matches.entries()].sort()).toEqual([...expected.entries()].sort());
        });
    });
});
