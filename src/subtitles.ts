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
 * Untimed words block a valid track instead of being silently omitted.
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
    const result: SubtitleResult = { cues: [], diagnostics: [], omissions: [] };
    const boundaries = new Set(hardBreakBefore);
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
                !Number.isFinite(token.start) ||
                !Number.isFinite(token.end) ||
                token.start! < 0 ||
                token.end! <= token.start!
            ) {
                throw new Error(`Token ${index} has no valid timing; review or align it before subtitle generation`);
            }
            if (kept.length && token.start! < tokens[kept.at(-1)!].start!) {
                throw new Error(`Token ${index} is out of time order`);
            }
            if (deferredBoundary) {
                boundaries.add(index);
                deferredBoundary = false;
            }
            if (kept.length && token.start! < tokens[kept.at(-1)!].end!) {
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
    const positions = new Map(kept.map((index, position) => [index, position]));
    let buffer: number[] = [];
    const flush = () => {
        if (!buffer.length) {
            return;
        }
        const lines = linesFor(buffer);
        const first = tokens[buffer[0]];
        const spokenEnd = buffer.reduce((end, index) => Math.max(end, tokens[index].end!), first.start!);
        const characters = length(lines.join('\n'));
        const required = Math.max(minSeconds, characters / maxCharactersPerSecond, spokenEnd - first.start!);
        const lastPosition = positions.get(buffer.at(-1)!)!;
        const next = lastPosition + 1 < kept.length ? tokens[kept[lastPosition + 1]] : undefined;
        const end = Math.min(
            first.start! + maxSeconds,
            next?.start ?? first.start! + maxSeconds,
            first.start! + required,
        );
        if (
            end <= first.start! ||
            spokenEnd - first.start! > maxSeconds ||
            lines.length > maxLines ||
            lines.some((line) => length(line) > maxCharactersPerLine) ||
            characters > maxCharacters ||
            end - first.start! + 1e-9 < required
        ) {
            result.diagnostics.push({
                code: 'impossible_reading_window',
                message: 'Cue exceeds a hard duration/readability limit; source text and timing need review',
                tokenIndices: [...buffer],
            });
        }
        result.cues.push({
            end: Math.max(end, first.start!),
            start: first.start!,
            text: lines.join('\n'),
            tokenIndices: buffer,
        });
        buffer = [];
    };
    for (const index of kept) {
        const token = tokens[index];
        const previous = buffer.length ? tokens[buffer.at(-1)!] : undefined;
        const candidate = [...buffer, index];
        const lines = linesFor(candidate);
        if (
            buffer.length &&
            (boundaries.has(index) ||
                token.speaker !== previous?.speaker ||
                token.start! - previous!.end! > gapThreshold ||
                candidate.reduce((end, item) => Math.max(end, tokens[item].end!), token.end!) -
                    tokens[buffer[0]].start! >
                    maxSeconds ||
                length(lines.join('\n')) > maxCharacters ||
                lines.length > maxLines)
        ) {
            flush();
        }
        buffer.push(index);
    }
    flush();
    return result;
};
