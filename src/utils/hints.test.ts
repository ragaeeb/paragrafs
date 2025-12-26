import { describe, expect, it } from 'bun:test';
import type { Segment, Token } from '../types';
import { generateHintsFromSegments, generateHintsFromTokens } from './hints';

describe('hints', () => {
    describe('generateHintsFromTokens', () => {
        it('should mine frequent Arabic sequences using normalization and sort by count', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'احسن' },
                { end: 2, start: 1, text: 'الله' },
                { end: 3, start: 2, text: 'اليكم' },
                { end: 4, start: 3, text: 'شيء' },
                { end: 5, start: 4, text: 'أَحْسَنَ' },
                { end: 6, start: 5, text: 'الله' },
                { end: 7, start: 6, text: 'إليكم،' },
                { end: 8, start: 7, text: 'شيء' },
                { end: 9, start: 8, text: 'احسن' },
                { end: 10, start: 9, text: 'الله' },
                { end: 11, start: 10, text: 'اليكم' },
            ];

            const actual = generateHintsFromTokens(tokens, {
                dedupe: 'closed',
                maxN: 3,
                minCount: 2,
                minN: 2,
                normalization: { normalizeAlef: true },
            });

            expect(actual.length).toBeGreaterThan(0);
            expect(actual[0]).toMatchObject({
                count: 3,
                length: 3,
                normalizedPhrase: 'احسن الله اليكم',
            });
        });

        it('returns [] for empty input', () => {
            expect(generateHintsFromTokens([])).toEqual([]);
        });

        it('returns [] for invalid n-gram parameters', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'hello' },
                { end: 2, start: 1, text: 'world' },
            ];
            expect(generateHintsFromTokens(tokens, { maxN: 2, minN: 3 })).toEqual([]);
            expect(generateHintsFromTokens(tokens, { maxN: 2, minN: 0 })).toEqual([]);
        });

        it('respects minCount and topK', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'احسن' },
                { end: 2, start: 1, text: 'الله' },
                { end: 3, start: 2, text: 'اليكم' },
                { end: 4, start: 3, text: 'احسن' },
                { end: 5, start: 4, text: 'الله' },
                { end: 6, start: 5, text: 'اليكم' },
            ];

            expect(generateHintsFromTokens(tokens, { minCount: 3 })).toEqual([]);

            const got = generateHintsFromTokens(tokens, { maxN: 3, minCount: 2, topK: 1 });
            expect(got.length).toBe(1);
            expect(got[0]).toMatchObject({ count: 2, length: 3, normalizedPhrase: 'احسن الله اليكم' });
        });

        it('filters all-stopword phrases when stopwords are provided', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'و' },
                { end: 2, start: 1, text: 'في' },
                { end: 3, start: 2, text: 'و' },
                { end: 4, start: 3, text: 'في' },
            ];

            const got = generateHintsFromTokens(tokens, {
                maxN: 2,
                minCount: 2,
                minN: 2,
                stopwords: ['و', 'في'],
            });
            expect(got).toEqual([]);
        });

        it('does not remove subphrases unless containment is proven (closed dedupe safety)', () => {
            // Build a stream where AB occurs twice, but only one AB is inside ABA.
            // AB should NOT be removed.
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'A' },
                { end: 2, start: 1, text: 'B' },
                { end: 3, start: 2, text: 'A' },
                { end: 4, start: 3, text: 'B' },
            ];

            const got = generateHintsFromTokens(tokens, {
                dedupe: 'closed',
                maxN: 3,
                minCount: 2,
                minN: 2,
                normalization: {},
            });
            // AB should remain as a valid hint with count=2.
            expect(got.some((h) => h.normalizedPhrase === 'A B' && h.count === 2)).toBeTrue();
        });

        it('removes exact subphrases when containment is proven (closed dedupe)', () => {
            // Stream: "A B C" repeated twice; "A B" appears only as part of "A B C".
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'A' },
                { end: 2, start: 1, text: 'B' },
                { end: 3, start: 2, text: 'C' },
                { end: 4, start: 3, text: 'A' },
                { end: 5, start: 4, text: 'B' },
                { end: 6, start: 5, text: 'C' },
            ];

            const got = generateHintsFromTokens(tokens, {
                dedupe: 'closed',
                maxN: 3,
                minCount: 2,
                minN: 2,
                normalization: {},
            });
            expect(got.some((h) => h.normalizedPhrase === 'A B' && h.count === 2)).toBeFalse();
            expect(got.some((h) => h.normalizedPhrase === 'A B C' && h.count === 2)).toBeTrue();
        });

        it('caps surface variants internally (does not blow up on many surface forms)', () => {
            // Same normalized phrase, many different surface renderings (punctuation variants).
            const tokens: Token[] = [];
            for (let i = 0; i < 10; i++) {
                tokens.push(
                    { end: i * 3 + 1, start: i * 3, text: 'احسن' },
                    { end: i * 3 + 2, start: i * 3 + 1, text: 'الله' },
                    { end: i * 3 + 3, start: i * 3 + 2, text: `اليكم${'!'.repeat(i)}` },
                );
            }

            const got = generateHintsFromTokens(tokens, {
                maxN: 3,
                minCount: 2,
                minN: 3,
                normalization: { normalizeAlef: true },
            });
            const top = got.find((h) => h.normalizedPhrase === 'احسن الله اليكم');
            expect(top).toBeTruthy();
            expect((top!.topSurfaceForms ?? []).length).toBeLessThanOrEqual(3);
        });

        it('handles occurrence truncation by skipping closed-dedupe when there are too many occurrences', () => {
            // Build many repeated bigrams so we exceed the internal occurrence cap used for safe closed-dedupe.
            // This should not throw, and it should still return results.
            const tokens: Token[] = [];
            for (let i = 0; i < 6000; i++) {
                tokens.push(
                    { end: i * 2 + 1, start: i * 2, text: 'A' },
                    { end: i * 2 + 2, start: i * 2 + 1, text: 'B' },
                );
            }

            const got = generateHintsFromTokens(tokens, {
                dedupe: 'closed',
                maxN: 2,
                minCount: 2,
                minN: 2,
                normalization: {},
            });
            expect(got.length).toBeGreaterThan(0);
            expect(got[0]).toMatchObject({ normalizedPhrase: 'A B' });
        });

        it('ignores tokens that normalize to empty strings (punctuation-only)', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'A' },
                { end: 2, start: 1, text: '،' }, // punctuation only -> normalizes to ''
                { end: 3, start: 2, text: 'A' },
                { end: 4, start: 3, text: 'B' },
                { end: 5, start: 4, text: 'A' },
                { end: 6, start: 5, text: 'B' },
            ];

            const got = generateHintsFromTokens(tokens, { maxN: 2, minCount: 2, minN: 2, normalization: {} });
            // Should still mine "A B" from the tail despite punctuation token in the middle.
            expect(got.some((h) => h.normalizedPhrase === 'A B')).toBeTrue();
        });

        it('skips closed-dedupe checks when occurrences are truncated (prevents unsafe removals)', () => {
            const tokens: Token[] = [];
            for (let i = 0; i < 6000; i++) {
                tokens.push(
                    { end: i * 3 + 1, start: i * 3, text: 'A' },
                    { end: i * 3 + 2, start: i * 3 + 1, text: 'B' },
                    { end: i * 3 + 3, start: i * 3 + 2, text: 'C' },
                );
            }

            const got = generateHintsFromTokens(tokens, {
                dedupe: 'closed',
                maxN: 3,
                minCount: 2,
                minN: 2,
                normalization: {},
            });

            // With truncation, we should NOT attempt to remove subphrases (unsafe).
            expect(got.some((h) => h.normalizedPhrase === 'A B')).toBeTrue();
            expect(got.some((h) => h.normalizedPhrase === 'A B C')).toBeTrue();
        });

        it('returns multiple hints and sorts by count (then length)', () => {
            const tokens: Token[] = [
                { end: 1, start: 0, text: 'A' },
                { end: 2, start: 1, text: 'B' },
                { end: 3, start: 2, text: 'C' },
                { end: 4, start: 3, text: 'A' },
                { end: 5, start: 4, text: 'B' },
                { end: 6, start: 5, text: 'D' },
            ];

            const got = generateHintsFromTokens(tokens, {
                dedupe: 'none',
                maxN: 2,
                minCount: 1,
                minN: 2,
                normalization: {},
            });
            expect(got.length).toBeGreaterThan(1);
            // "A B" occurs twice and should be first.
            expect(got[0]).toMatchObject({ count: 2, length: 2, normalizedPhrase: 'A B' });
        });
    });

    describe('generateHintsFromSegments', () => {
        it('does not cross segment boundaries by default', () => {
            const segments: Segment[] = [
                {
                    end: 2,
                    start: 0,
                    text: '',
                    tokens: [
                        { end: 1, start: 0, text: 'A' },
                        { end: 2, start: 1, text: 'B' },
                    ],
                },
                {
                    end: 4,
                    start: 2,
                    text: '',
                    tokens: [
                        { end: 3, start: 2, text: 'C' },
                        { end: 4, start: 3, text: 'D' },
                    ],
                },
            ];

            const got = generateHintsFromSegments(segments, { maxN: 3, minCount: 1, minN: 3, normalization: {} });
            // If segments are respected, "A B C" cannot be generated.
            expect(got.some((h) => h.normalizedPhrase === 'A B C')).toBeFalse();
        });

        it('can cross segment boundaries when boundaryStrategy is none', () => {
            const segments: Segment[] = [
                {
                    end: 2,
                    start: 0,
                    text: '',
                    tokens: [
                        { end: 1, start: 0, text: 'A' },
                        { end: 2, start: 1, text: 'B' },
                    ],
                },
                {
                    end: 4,
                    start: 2,
                    text: '',
                    tokens: [
                        { end: 3, start: 2, text: 'C' },
                        { end: 4, start: 3, text: 'D' },
                    ],
                },
            ];

            const got = generateHintsFromSegments(segments, {
                boundaryStrategy: 'none',
                maxN: 3,
                minCount: 1,
                minN: 3,
                normalization: {},
            });
            expect(got.some((h) => h.normalizedPhrase === 'A B C')).toBeTrue();
        });

        it('merges counts for repeated phrases across segments (segment mode)', () => {
            const segments: Segment[] = [
                {
                    end: 3,
                    start: 0,
                    text: '',
                    tokens: [
                        { end: 1, start: 0, text: 'A' },
                        { end: 2, start: 1, text: 'B' },
                        { end: 3, start: 2, text: 'C' },
                    ],
                },
                {
                    end: 6,
                    start: 3,
                    text: '',
                    tokens: [
                        { end: 4, start: 3, text: 'A' },
                        { end: 5, start: 4, text: 'B' },
                        { end: 6, start: 5, text: 'C' },
                    ],
                },
            ];

            const got = generateHintsFromSegments(segments, { maxN: 3, minCount: 1, minN: 3, normalization: {} });
            const abc = got.find((h) => h.normalizedPhrase === 'A B C');
            expect(abc).toBeTruthy();
            expect(abc!.count).toBe(2);
        });

        it('returns multiple merged hints and sorts them', () => {
            const segments: Segment[] = [
                {
                    end: 4,
                    start: 0,
                    text: '',
                    tokens: [
                        { end: 1, start: 0, text: 'A' },
                        { end: 2, start: 1, text: 'B' },
                        { end: 3, start: 2, text: 'C' },
                        { end: 4, start: 3, text: 'D' },
                    ],
                },
                {
                    end: 8,
                    start: 4,
                    text: '',
                    tokens: [
                        { end: 5, start: 4, text: 'A' },
                        { end: 6, start: 5, text: 'B' },
                        { end: 7, start: 6, text: 'C' },
                        { end: 8, start: 7, text: 'X' },
                    ],
                },
            ];

            const got = generateHintsFromSegments(segments, { maxN: 2, minCount: 1, minN: 2, normalization: {} });
            expect(got.length).toBeGreaterThan(1);
            // "A B" and "B C" occur in both segments -> should rank above one-offs like "C D".
            expect(got[0]!.count).toBeGreaterThanOrEqual(got[1]!.count);
        });
    });
});
