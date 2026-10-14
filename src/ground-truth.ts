import { buildLcsTable, extractLcsMatches } from './utils/lcs';
import { normalizeWord } from './utils/textUtils';

export type AlignmentToken = {
    text: string;
    sep?: string;
    start?: number;
    end?: number;
    timing?: 'source' | 'interpolated';
};
export type Correspondence = {
    kind: 'match' | 'replace' | 'insert' | 'delete' | 'split' | 'merge';
    from: number[];
    to: number[];
    ambiguous: boolean;
};
export type AlignmentDiagnostic = {
    code: string;
    message: string;
    sourceIndices: number[];
    outputIndices: number[];
};
export type GroundTruthAlignment = {
    text: string;
    tokens: AlignmentToken[];
    correspondence: Correspondence[];
    diagnostics: AlignmentDiagnostic[];
};
export type AlignmentOptions = { maxCells?: number; maxWindowTokens?: number; interpolate?: boolean };

const indices = (start: number, end: number): number[] => Array.from({ length: end - start }, (_, i) => start + i);
const hasTiming = (token: AlignmentToken | undefined): token is AlignmentToken & { start: number; end: number } =>
    token !== undefined && Number.isFinite(token.start) && Number.isFinite(token.end) && token.end! > token.start!;

/**
 * Aligns exact surface words and returns every source/output index, including deletions.
 * Large selections must have unique ordered anchors; allocation is bounded by maxCells.
 * Only interpolation inside valid source/neighbor bounds receives estimated timing.
 */
export const alignGroundTruth = (
    source: readonly AlignmentToken[],
    text: string,
    { maxCells = 1_000_000, maxWindowTokens = 2_000, interpolate = true }: AlignmentOptions = {},
): GroundTruthAlignment => {
    if (
        !Number.isSafeInteger(maxCells) ||
        maxCells < 1 ||
        !Number.isSafeInteger(maxWindowTokens) ||
        maxWindowTokens < 1
    ) {
        throw new Error('Alignment budgets must be positive safe integers');
    }
    const surfaces: { text: string; sep: string; end: number }[] = [];
    for (const match of text.matchAll(/(\s*)(\S+)/gu)) {
        const end = (match.index ?? 0) + match[0].length;
        const previous = surfaces.at(-1);
        if (previous && /^[\p{P}\p{S}]+$/u.test(match[2])) {
            previous.text += match[1] + match[2];
            previous.end = end;
        } else {
            surfaces.push({ end, sep: match[1], text: match[2] });
        }
    }
    const words = surfaces.map((surface) => surface.text);
    const a = source.map((token) => normalizeWord(token.text).trim().toLocaleLowerCase());
    const b = words.map((word) => normalizeWord(word).trim().toLocaleLowerCase());
    const result: GroundTruthAlignment = { correspondence: [], diagnostics: [], text, tokens: [] };
    const counts = (values: string[]) => {
        const positions = new Map<string, number[]>();
        values.forEach((word, index) => {
            const found = positions.get(word);
            if (found) {
                found.push(index);
            } else {
                positions.set(word, [index]);
            }
        });
        return positions;
    };
    const positionsA = counts(a);
    const positionsB = counts(b);
    let cellsRemaining = maxCells;
    const anchors: [number, number][] = [];

    const findMatches = (aStart: number, aEnd: number, bStart: number, bEnd: number): void => {
        if (aStart === aEnd || bStart === bEnd) {
            return;
        }
        const cells = (aEnd - aStart + 1) * (bEnd - bStart + 1);
        if (cells <= cellsRemaining && aEnd - aStart <= maxWindowTokens && bEnd - bStart <= maxWindowTokens) {
            cellsRemaining -= cells;
            const left = a.slice(aStart, aEnd);
            const right = b.slice(bStart, bEnd);
            for (const [i, j] of extractLcsMatches(buildLcsTable(left, right), left, right)) {
                if (left[i]) {
                    anchors.push([i + aStart, j + bStart]);
                }
            }
            return;
        }
        const unique: [number, number][] = [];
        let last = bStart - 1;
        for (let i = aStart; i < aEnd; i++) {
            const target = positionsB.get(a[i]);
            if (
                a[i] &&
                positionsA.get(a[i])?.length === 1 &&
                target?.length === 1 &&
                target[0] > last &&
                target[0] < bEnd
            ) {
                unique.push([i, target[0]]);
                last = target[0];
            }
        }
        if (unique.length === 0) {
            throw new Error('Alignment budget exceeded without reliable anchors; select a smaller passage');
        }
        let previousA = aStart;
        let previousB = bStart;
        for (const [i, j] of unique) {
            findMatches(previousA, i, previousB, j);
            anchors.push([i, j]);
            previousA = i + 1;
            previousB = j + 1;
        }
        findMatches(previousA, aEnd, previousB, bEnd);
    };
    findMatches(0, source.length, 0, words.length);
    anchors.sort((left, right) => left[0] - right[0]);

    const add = (
        from: number[],
        toWords: string[],
        kind: Correspondence['kind'],
        ambiguous: boolean,
        bounds?: [number, number],
    ) => {
        const to = indices(result.tokens.length, result.tokens.length + toWords.length);
        toWords.forEach((word, index) => {
            const original = from.length === toWords.length ? source[from[index]] : undefined;
            if (original) {
                const { timing: _timing, ...token } = original;
                result.tokens.push({
                    ...token,
                    text: word,
                    ...(hasTiming(original) ? { timing: 'source' as const } : {}),
                });
            } else if (bounds && interpolate && bounds[1] > bounds[0]) {
                const duration = (bounds[1] - bounds[0]) / toWords.length;
                result.tokens.push({
                    end: bounds[0] + (index + 1) * duration,
                    start: bounds[0] + index * duration,
                    text: word,
                    timing: 'interpolated',
                });
            } else {
                result.tokens.push({ text: word });
            }
        });
        result.correspondence.push({ ambiguous, from, kind, to });
        if (ambiguous) {
            result.diagnostics.push({
                code: 'ambiguous_correspondence',
                message: 'Identity requires review; position alone does not establish correspondence',
                outputIndices: to,
                sourceIndices: from,
            });
        }
        if (to.some((index) => !hasTiming(result.tokens[index]))) {
            result.diagnostics.push({
                code: 'untimed_words',
                message: 'No valid bounded timing was available',
                outputIndices: to,
                sourceIndices: from,
            });
        }
    };
    let previousA = -1;
    let previousB = -1;
    for (const [i, j] of [...anchors, [source.length, words.length] as [number, number]]) {
        const from = indices(previousA + 1, i);
        const gapWords = words.slice(previousB + 1, j);
        const concatenatedSource = from.map((index) => a[index].replace(/\s/gu, '')).join('');
        const concatenatedGround = gapWords
            .map((word) => normalizeWord(word).trim().toLocaleLowerCase().replace(/\s/gu, ''))
            .join('');
        if (
            from.length === 1 &&
            gapWords.length > 1 &&
            concatenatedSource &&
            concatenatedSource === concatenatedGround
        ) {
            const token = source[from[0]];
            add(from, gapWords, 'split', false, hasTiming(token) ? [token.start, token.end] : undefined);
        } else if (
            from.length > 1 &&
            gapWords.length === 1 &&
            concatenatedSource &&
            concatenatedSource === concatenatedGround
        ) {
            const first = source[from[0]];
            const last = source[from.at(-1)!];
            add(
                from,
                gapWords,
                'merge',
                false,
                hasTiming(first) && hasTiming(last) ? [first.start, last.end] : undefined,
            );
        } else {
            const shared = Math.min(from.length, gapWords.length);
            for (let k = 0; k < shared; k++) {
                add([from[k]], [gapWords[k]], 'replace', true);
            }
            if (from.length > shared) {
                add(from.slice(shared), [], 'delete', gapWords.length > 0);
            }
            if (gapWords.length > shared) {
                const before = shared > 0 ? source[from[shared - 1]] : source[previousA];
                const after = source[i];
                const bounds =
                    hasTiming(before) && hasTiming(after) && after.start > before.end
                        ? ([before.end, after.start] as [number, number])
                        : undefined;
                add([], gapWords.slice(shared), 'insert', from.length > 0, bounds);
            }
        }
        if (i < source.length) {
            const repeated = (positionsA.get(a[i])?.length ?? 0) > 1 || (positionsB.get(b[j])?.length ?? 0) > 1;
            add([i], [words[j]], 'match', repeated);
        }
        previousA = i;
        previousB = j;
    }
    result.tokens.forEach((token, index) => {
        const separator = surfaces[index].sep;
        if (separator !== (index === 0 ? '' : ' ')) {
            token.sep = separator;
        } else {
            delete token.sep;
        }
    });
    const last = surfaces.at(-1);
    if (last && result.tokens.length) {
        result.tokens.at(-1)!.text += text.slice(last.end);
    }
    return result;
};
