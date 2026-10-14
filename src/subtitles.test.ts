import { describe, expect, it } from 'bun:test';
import { buildSubtitleCues } from './subtitles';

describe('buildSubtitleCues', () => {
    it('should enforce punctuation-free duration/readability and preserve omission/manual-boundary provenance', () => {
        const tokens = Array.from({ length: 20 }, (_, index) => ({
            end: index + 0.5,
            speaker: index < 12 ? 'a' : 'b',
            start: index,
            text: index === 3 ? 'uh' : `word${index}`,
        }));
        const result = buildSubtitleCues(tokens, {
            fillers: ['uh'],
            hardBreakBefore: [8],
            maxCharacters: 30,
            maxCharactersPerLine: 15,
            maxCharactersPerSecond: 30,
            maxSeconds: 4,
        });
        expect(
            result.cues.every(
                (cue) =>
                    cue.end - cue.start <= 4 &&
                    cue.text.split('\n').length <= 2 &&
                    cue.text.split('\n').every((line) => Array.from(line).length <= 15),
            ),
        ).toBe(true);
        expect(
            result.cues
                .flatMap((cue) => cue.tokenIndices)
                .concat(result.omissions.flatMap((entry) => entry.tokenIndices))
                .sort((a, b) => a - b),
        ).toEqual(Array.from({ length: 20 }, (_, index) => index));
        expect(result.cues.some((cue) => cue.tokenIndices[0] === 8)).toBe(true);
        expect(result.cues.some((cue) => cue.tokenIndices[0] === 12)).toBe(true);
        expect(result.omissions).toEqual([{ reason: 'Configured filler omission', tokenIndices: [3] }]);
    });

    it('should preserve impossible words for review and refuse to silently drop untimed words', () => {
        const result = buildSubtitleCues([{ end: 10, start: 0, text: 'impossiblylongword' }], {
            maxCharactersPerLine: 10,
            maxSeconds: 2,
        });
        expect(result.cues[0].text).toBe('impossiblylongword');
        expect(result.cues[0].end).toBe(2);
        expect(result.diagnostics[0].code).toBe('impossible_reading_window');
        expect(() => buildSubtitleCues([{ text: 'untimed' }])).toThrow('valid timing');
    });

    it('should carry manual boundaries over omitted fillers and report nested source overlap', () => {
        const result = buildSubtitleCues(
            [
                { end: 1, start: 0, text: 'before' },
                { end: 1.1, start: 1, text: 'uh' },
                { end: 2.2, start: 1.1, text: 'after' },
            ],
            { fillers: ['uh'], hardBreakBefore: [1] },
        );
        expect(result.cues.map((cue) => cue.tokenIndices)).toEqual([[0], [2]]);
        const overlap = buildSubtitleCues([
            { end: 10, start: 0, text: 'long' },
            { end: 2, start: 1, text: 'nested' },
        ]);
        expect(overlap.diagnostics.some((entry) => entry.code === 'source_overlap')).toBe(true);
        expect(overlap.diagnostics.some((entry) => entry.code === 'impossible_reading_window')).toBe(true);
    });
});
