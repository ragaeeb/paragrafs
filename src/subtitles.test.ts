import { describe, expect, it } from 'bun:test';
import { buildSubtitleCues } from './subtitles';
import { createHints } from './utils/textUtils';

describe('buildSubtitleCues', () => {
    it('should prefer readable sentences and normalized phrase starts without isolating short clause tails', () => {
        const timed = (text: string, seconds = 0.5) =>
            text.split(' ').map((word, index) => ({
                end: (index + 1) * seconds,
                start: index * seconds,
                text: word,
            }));
        expect(buildSubtitleCues(timed('A complete sentence. Next sentence.')).cues.map((cue) => cue.text)).toEqual([
            'A complete sentence.',
            'Next sentence.',
        ]);
        expect(
            buildSubtitleCues(timed('الكلام قبل السؤال أَحْسَنَ الله إليكم'), {
                hints: createHints('احسن الله اليكم'),
            }).cues.map((cue) => cue.tokenIndices),
        ).toEqual([
            [0, 1, 2],
            [3, 4, 5],
        ]);
        const clause = buildSubtitleCues(
            timed('So the brother was, one of the questions is, the first person who has said there is no Qiyas,', 0.3),
            { maxCharactersPerSecond: 28 },
        );
        expect(clause.cues.map((cue) => cue.text.replaceAll('\n', ' '))).toEqual([
            'So the brother was, one of the questions is,',
            'the first person who has said there is no Qiyas,',
        ]);
        expect(clause.diagnostics).toEqual([]);
    });

    it('should estimate translated cue windows explicitly and preserve silence in timed source cues', () => {
        const translation = buildSubtitleCues(
            'A complete sentence. Next sentence.'.split(' ').map((text) => ({ text })),
            { estimatedWindow: { end: 14, start: 10 } },
        );
        expect(translation.cues.map((cue) => cue.text)).toEqual(['A complete sentence.', 'Next sentence.']);
        expect(translation.cues[0].start).toBe(10);
        expect(translation.cues.at(-1)!.end).toBe(14);
        expect(translation.cues[0].end).toBe(translation.cues[1].start);
        expect(translation.diagnostics).toEqual([]);
        const source = buildSubtitleCues([
            { end: 0.3, start: 0, text: 'Yes.' },
            { end: 6.5, start: 5, text: 'Later.' },
        ]);
        expect(source.cues[0].end).toBe(1);
        expect(source.cues[1].start).toBe(5);
        const short = buildSubtitleCues([
            { end: 0.161, start: 0, text: 'One' },
            { end: 2.4, start: 0.983, text: 'wing.' },
        ]);
        expect(short.diagnostics.map((entry) => entry.code)).toEqual(['short_source_window']);
        expect(short.cues[0].end).toBeCloseTo(0.961);
        expect(short.cues[1].start).toBe(0.983);
        const brief = buildSubtitleCues([{ end: 0.04, start: 0, text: 'If' }]);
        expect(brief.cues[0].end).toBeCloseTo(0.84);
        expect(brief.diagnostics.map((entry) => entry.code)).toEqual(['short_source_window']);
        const brokenClause = buildSubtitleCues(
            [
                { end: 0.85, start: 0, text: 'First' },
                { end: 1.75, start: 0.9, text: 'later' },
            ],
            { maxCharacters: 10 },
        );
        expect(brokenClause.diagnostics.map((entry) => entry.code)).toEqual(['impossible_reading_window']);
        const tooFast = buildSubtitleCues([{ end: 0.04, start: 0, text: 'A'.repeat(40) }], {
            maxCharactersPerLine: 50,
        });
        expect(tooFast.diagnostics.map((entry) => entry.code)).toEqual(['impossible_reading_window']);
    });

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
