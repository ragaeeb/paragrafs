import { describe, expect, it } from 'bun:test';
import { alignGroundTruth } from './ground-truth';

describe('alignGroundTruth', () => {
    it('should preserve every ground-truth word and report every deleted source index', () => {
        const result = alignGroundTruth(
            [
                { end: 5, start: 4, text: 'hello' },
                { end: 6, start: 5, text: 'extra' },
            ],
            'hello new trailing',
        );
        expect(result.tokens.map((token) => token.text)).toEqual(['hello', 'new', 'trailing']);
        expect(result.correspondence.flatMap((entry) => entry.from)).toEqual([0, 1]);
        expect(result.tokens[2]).toEqual({ text: 'trailing' });
        expect(result.diagnostics.some((entry) => entry.code === 'ambiguous_correspondence')).toBe(true);
        expect(alignGroundTruth([], 'new words').tokens).toEqual([{ text: 'new' }, { text: 'words' }]);
        expect(alignGroundTruth([{ text: 'removed' }], '').correspondence).toEqual([
            { ambiguous: false, from: [0], kind: 'delete', to: [] },
        ]);
    });

    it('should preserve surface diacritics and interpolate only between valid neighbors', () => {
        const result = alignGroundTruth(
            [
                { end: 2, start: 1, text: 'الحمد' },
                { end: 5, start: 4, text: 'العالمين' },
            ],
            'الْحَمْدُ لله رب الْعَالَمِينَ نهاية',
        );
        expect(result.tokens).toEqual([
            { end: 2, start: 1, text: 'الْحَمْدُ', timing: 'source' },
            { end: 3, start: 2, text: 'لله', timing: 'interpolated' },
            { end: 4, start: 3, text: 'رب', timing: 'interpolated' },
            { end: 5, start: 4, text: 'الْعَالَمِينَ', timing: 'source' },
            { text: 'نهاية' },
        ]);
    });

    it('should retain exact whitespace and standalone punctuation surfaces for canonical editing', () => {
        const text = '  الْحَمْدُ \t ،\nلله  ';
        const result = alignGroundTruth([{ text: 'الحمد' }, { text: 'لله' }], text);
        expect(
            result.tokens.map((token, index) => `${token.sep ?? (index === 0 ? '' : ' ')}${token.text}`).join(''),
        ).toBe(text);
        expect(result.tokens.map((token) => token.text.trim())).toEqual(['الْحَمْدُ \t ،', 'لله']);
    });

    it('should report repeated identity and semantic splits/merges without forced endpoint matches', () => {
        const repeated = alignGroundTruth([{ text: 'a' }, { text: 'a' }], 'a');
        expect(repeated.correspondence.find((entry) => entry.kind === 'match')?.ambiguous).toBe(true);
        expect(alignGroundTruth([{ end: 4, start: 2, text: 'icecream' }], 'ice cream').correspondence[0]).toEqual({
            ambiguous: false,
            from: [0],
            kind: 'split',
            to: [0, 1],
        });
        expect(alignGroundTruth([{ text: 'ice' }, { text: 'cream' }], 'icecream').correspondence[0].kind).toBe('merge');
        const changed = alignGroundTruth(
            [{ text: 'wrong' }, { text: 'anchor' }, { text: 'wrong' }],
            'new anchor ending',
        );
        expect(changed.correspondence.map((entry) => entry.kind)).toEqual(['replace', 'match', 'replace']);
    });

    it('should partition large selections by unique anchors and refuse unbounded repeated alignment', () => {
        const source = Array.from({ length: 100 }, (_, index) => ({ text: `word${index}` }));
        expect(
            alignGroundTruth(source, source.map((token) => token.text).join(' '), { maxCells: 100, maxWindowTokens: 5 })
                .tokens.length,
        ).toBe(100);
        expect(() =>
            alignGroundTruth(
                Array.from({ length: 100 }, () => ({ text: 'repeat' })),
                Array.from({ length: 100 }, () => 'repeat').join(' '),
                { maxCells: 100 },
            ),
        ).toThrow('smaller passage');
    });
});
