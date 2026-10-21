import type { Hints } from '@/types';
import { isEndingWithPunctuation, normalizeTokenText } from '@/utils/textUtils';
import { isHintMatched } from '@/utils/transcriptUtils';

export type SubtitleToken = { text: string; start?: number; end?: number; speaker?: string; sep?: string };
export type SubtitleOptions = {
    maxSeconds?: number;
    maxCharacters?: number;
    maxCharactersPerLine?: number;
    maxLines?: number;
    maxCharactersPerSecond?: number;
    minSeconds?: number;
    gapThreshold?: number;
    fillers?: string[];
    hardBreakBefore?: number[];
    hints?: Hints;
    /** Estimate display cues inside a known continuous speech window; input tokens must be untimed. */
    estimatedWindow?: { start: number; end: number };
};
export type SubtitleResult = {
    cues: { start: number; end: number; text: string; tokenIndices: number[] }[];
    omissions: { tokenIndices: number[]; reason: string }[];
    diagnostics: { code: string; tokenIndices: number[]; message: string }[];
};

const length = (text: string) => Array.from(text).length;

/**
 * Builds screen cues without changing spoken-token timing. Limits are hard;
 * impossible words/windows are reported and preserved for editorial review.
 * Sentence punctuation and normalized hints guide boundaries. Untimed text
 * requires an explicit estimated display window and never gains word timings.
 */
export const buildSubtitleCues = (
    tokens: readonly SubtitleToken[],
    {
        maxSeconds = 6,
        maxCharacters = 84,
        maxCharactersPerLine = 42,
        maxLines = 2,
        maxCharactersPerSecond = 20,
        minSeconds = 1,
        gapThreshold = 0.8,
        fillers = [],
        hardBreakBefore = [],
        hints,
        estimatedWindow,
    }: SubtitleOptions = {},
): SubtitleResult => {
    for (const [name, value] of Object.entries({
        maxCharacters,
        maxCharactersPerLine,
        maxCharactersPerSecond,
        maxLines,
        maxSeconds,
        minSeconds,
    })) {
        if (!Number.isFinite(value) || value <= 0) {
            throw new Error(`${name} must be positive and finite`);
        }
    }
    if (minSeconds > maxSeconds || !Number.isInteger(maxLines) || !Number.isFinite(gapThreshold) || gapThreshold < 0) {
        throw new Error('Invalid subtitle duration/line/gap limits');
    }
    if (hardBreakBefore.some((index) => !Number.isSafeInteger(index) || index < 0 || index >= tokens.length)) {
        throw new Error('Manual subtitle boundaries must reference an input token');
    }
    if (
        estimatedWindow &&
        (!Number.isFinite(estimatedWindow.start) ||
            !Number.isFinite(estimatedWindow.end) ||
            estimatedWindow.start < 0 ||
            estimatedWindow.end <= estimatedWindow.start ||
            tokens.some((token) => token.start !== undefined || token.end !== undefined))
    ) {
        throw new Error('Estimated display windows require untimed text and a valid start/end');
    }
    const result: SubtitleResult = { cues: [], diagnostics: [], omissions: [] };
    const boundaries = new Set(hardBreakBefore);
    if (hints) {
        const normalized = tokens.map((token) => normalizeTokenText(token.text, hints.normalization));
        normalized.forEach((_, index) => {
            if (isHintMatched(normalized, hints, index)) {
                boundaries.add(index);
            }
        });
    }
    const omitted = new Set(fillers);
    const kept: number[] = [];
    let deferredBoundary = false;
    tokens.forEach((token, index) => {
        if (boundaries.has(index)) {
            deferredBoundary = true;
        }
        if (omitted.has(token.text)) {
            result.omissions.push({ reason: 'Configured filler omission', tokenIndices: [index] });
        } else {
            if (
                !estimatedWindow &&
                (!Number.isFinite(token.start) ||
                    !Number.isFinite(token.end) ||
                    token.start! < 0 ||
                    token.end! <= token.start!)
            ) {
                throw new Error(`Token ${index} has no valid timing; review or align it before subtitle generation`);
            }
            if (!estimatedWindow && kept.length && token.start! < tokens[kept.at(-1)!].start!) {
                throw new Error(`Token ${index} is out of time order`);
            }
            if (deferredBoundary) {
                boundaries.add(index);
                deferredBoundary = false;
            }
            if (!estimatedWindow && kept.length && token.start! < tokens[kept.at(-1)!].end!) {
                result.diagnostics.push({
                    code: 'source_overlap',
                    message: 'Source tokens overlap; review display timing without rewriting spoken evidence',
                    tokenIndices: [kept.at(-1)!, index],
                });
            }
            kept.push(index);
        }
    });
    const linesFor = (indices: number[]) => {
        const lines: string[] = [];
        for (const index of indices) {
            const token = tokens[index];
            const separator = lines.length ? (token.sep ?? ' ') : '';
            const previous = lines.at(-1);
            if (previous !== undefined && length(previous + separator + token.text) <= maxCharactersPerLine) {
                lines[lines.length - 1] = previous + separator + token.text;
            } else {
                lines.push(token.text);
            }
        }
        return lines;
    };
    const offsets = [0];
    for (let position = 0; position < kept.length; position++) {
        const separator = position + 1 < kept.length ? (tokens[kept[position + 1]].sep ?? ' ') : '';
        offsets.push(offsets.at(-1)! + length(tokens[kept[position]].text) + length(separator));
    }
    const startAt = (position: number): number =>
        estimatedWindow
            ? estimatedWindow.start +
              ((estimatedWindow.end - estimatedWindow.start) * offsets[position]) / offsets.at(-1)!
            : tokens[kept[position]].start!;
    const cueFor = (from: number, to: number) => {
        const indices = kept.slice(from, to + 1);
        const lines = linesFor(indices);
        const start = startAt(from);
        const spokenEnd = estimatedWindow
            ? startAt(to + 1)
            : indices.reduce((end, index) => Math.max(end, tokens[index].end!), start);
        const characters = length(lines.join('\n'));
        const required = Math.max(minSeconds, characters / maxCharactersPerSecond, spokenEnd - start);
        const end = estimatedWindow
            ? spokenEnd
            : Math.min(
                  start + maxSeconds,
                  to + 1 < kept.length ? startAt(to + 1) : Infinity,
                  spokenEnd + gapThreshold,
                  start + required,
              );
        const withinCaps =
            spokenEnd - start <= maxSeconds &&
            lines.length <= maxLines &&
            lines.every((line) => length(line) <= maxCharactersPerLine) &&
            characters <= maxCharacters;
        return {
            cue: { end: Math.max(start, end), start, text: lines.join('\n'), tokenIndices: indices },
            readable: withinCaps && end - start + 1e-9 >= required,
            readingSeconds: characters / maxCharactersPerSecond,
            withinCaps,
        };
    };
    const isNaturallyShort = (
        candidate: ReturnType<typeof cueFor>,
        first: number,
        last: number,
        from: number,
        until: number,
    ) =>
        !estimatedWindow &&
        first === from &&
        last + 1 === until &&
        candidate.withinCaps &&
        candidate.cue.end - candidate.cue.start + 1e-9 >= minSeconds * 0.8 &&
        candidate.cue.end - candidate.cue.start >= candidate.readingSeconds;
    // Compare only candidates within the hard caps. Looking ahead avoids a
    // greedy full screen followed by an unreadable one-word tail.
    const flush = (from: number, until: number) => {
        const costs = new Map<number, number>([[until, 0]]);
        const cuts = new Map<number, number>();
        for (let first = until - 1; first >= from; first--) {
            let sentencePenalty = 0;
            for (let last = first; last < until; last++) {
                if (last > first && isEndingWithPunctuation(tokens[kept[last - 1]].text)) {
                    sentencePenalty += 3;
                }
                const candidate = cueFor(first, last);
                if (!candidate.withinCaps && last > first) {
                    break;
                }
                const boundaryPenalty =
                    last + 1 === until || isEndingWithPunctuation(tokens[kept[last]].text)
                        ? 0
                        : /[,،;:]$/.test(tokens[kept[last]].text)
                          ? 0.25
                          : 1;
                const cost =
                    1 +
                    sentencePenalty +
                    boundaryPenalty +
                    (0.01 * minSeconds) / Math.max(minSeconds, candidate.cue.end - candidate.cue.start) +
                    (candidate.readable || isNaturallyShort(candidate, first, last, from, until) ? 0 : 1000) +
                    costs.get(last + 1)!;
                if (cost <= (costs.get(first) ?? Infinity)) {
                    costs.set(first, cost);
                    cuts.set(first, last);
                }
            }
        }
        for (let first = from; first < until; ) {
            const last = cuts.get(first)!;
            const candidate = cueFor(first, last);
            if (!candidate.readable) {
                const naturallyShort = isNaturallyShort(candidate, first, last, from, until);
                result.diagnostics.push({
                    code: naturallyShort ? 'short_source_window' : 'impossible_reading_window',
                    message: naturallyShort
                        ? 'Isolated source utterance has a naturally brief display window within 20% of the preferred minimum dwell'
                        : 'Cue exceeds a hard duration/readability limit; source text and timing need review',
                    tokenIndices: candidate.cue.tokenIndices,
                });
            }
            result.cues.push(candidate.cue);
            first = last + 1;
        }
    };
    let from = 0;
    for (let position = 1; position <= kept.length; position++) {
        const token = tokens[kept[position]];
        const previous = tokens[kept[position - 1]];
        if (
            position === kept.length ||
            boundaries.has(kept[position]) ||
            token.speaker !== previous.speaker ||
            (!estimatedWindow && token.start! - previous.end! > gapThreshold)
        ) {
            flush(from, position);
            from = position;
        }
    }
    return result;
};
