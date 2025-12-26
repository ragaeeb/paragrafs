import type { GeneratedHint, GenerateHintsOptions, Segment, Token } from '@/types';

import { normalizeTokenText } from './textUtils';

type CandidateStats = {
    count: number;
    firstOccurrenceIndex: number;
    // Tracking occurrences is needed for safe closed-dedupe; we cap and refuse to dedupe if truncated.
    occurrenceIndices: number[];
    occurrencesTruncated: boolean;
    surfaceCounts: Map<string, number>;
};

type InternalOptions = Required<Pick<GenerateHintsOptions, 'dedupe' | 'maxN' | 'minCount' | 'minN' | 'topK'>> & {
    normalization: Required<NonNullable<GenerateHintsOptions['normalization']>>;
    stopwords: string[];
};

const DEFAULT_NORMALIZATION: Required<NonNullable<GenerateHintsOptions['normalization']>> = {
    normalizeAlef: true,
    normalizeHamza: false,
    normalizeYa: true,
    removeTatweel: true,
};

const DEFAULTS: Required<Pick<GenerateHintsOptions, 'dedupe' | 'maxN' | 'minCount' | 'minN'>> = {
    dedupe: 'closed',
    maxN: 6,
    minCount: 2,
    minN: 2,
};

const OCCURRENCE_CAP_FOR_DEDUPE = 5000;
const SURFACE_VARIANTS_CAP = 5;

const makeKey = (normalizedWords: string[]): string => JSON.stringify(normalizedWords);

const parseKey = (key: string): string[] => JSON.parse(key) as string[];

const isAllStopwords = (words: string[], stopwords: string[]) => {
    if (stopwords.length === 0) {
        return false;
    }
    return words.every((w) => stopwords.includes(w));
};

const pickTopSurfaces = (surfaceCounts: Map<string, number>, max = 3): string[] => {
    return Array.from(surfaceCounts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, max)
        .map(([surface]) => surface);
};

const addSurfaceVariant = (stats: CandidateStats, surface: string) => {
    const current = stats.surfaceCounts.get(surface);
    if (current !== undefined) {
        stats.surfaceCounts.set(surface, current + 1);
        return;
    }

    // Keep surfaceCounts bounded to avoid unbounded growth from punctuation variance.
    if (stats.surfaceCounts.size >= SURFACE_VARIANTS_CAP) {
        // If full, replace the lowest-frequency entry only if this one is likely to be common.
        // We don't know that yet, so just ignore new variants when full.
        return;
    }

    stats.surfaceCounts.set(surface, 1);
};

const recordOccurrence = (stats: CandidateStats, index: number) => {
    if (stats.occurrenceIndices.length < OCCURRENCE_CAP_FOR_DEDUPE) {
        stats.occurrenceIndices.push(index);
    } else {
        stats.occurrencesTruncated = true;
    }
};

const canClosedDedupe = (stats: CandidateStats) => !stats.occurrencesTruncated;

const arrayToSet = (items: number[]) => new Set(items);

const setEquals = (a: Set<number>, b: Set<number>) => a.size === b.size && Array.from(a).every((item) => b.has(item));

const getKeyLength = (key: string, cache: Map<string, number>): number => {
    const existing = cache.get(key);
    if (existing !== undefined) {
        return existing;
    }
    const len = parseKey(key).length;
    cache.set(key, len);
    return len;
};

const getSortedCandidatesForDedupe = (
    candidates: Map<string, CandidateStats>,
    keyLengthCache: Map<string, number>,
): [string, CandidateStats][] => {
    return Array.from(candidates.entries()).sort((a, b) => {
        const lenA = getKeyLength(a[0], keyLengthCache);
        const lenB = getKeyLength(b[0], keyLengthCache);
        return lenB - lenA || b[1].count - a[1].count;
    });
};

const derivedStartSetForOffset = (longStarts: Set<number>, offset: number): Set<number> => {
    const derived = new Set<number>();
    for (const start of longStarts) {
        derived.add(start + offset);
    }
    return derived;
};

const isSubphraseRemovableAtOffset = (
    candidates: Map<string, CandidateStats>,
    longStats: CandidateStats,
    longWords: string[],
    offset: number,
    subLen: number,
): string | null => {
    const subKey = makeKey(longWords.slice(offset, offset + subLen));
    const subStats = candidates.get(subKey);
    if (!subStats) {
        return null;
    }
    if (subStats.count !== longStats.count) {
        return null;
    }

    const longStarts = arrayToSet(longStats.occurrenceIndices);
    const derived = derivedStartSetForOffset(longStarts, offset);
    const subStarts = arrayToSet(subStats.occurrenceIndices);

    return setEquals(derived, subStarts) ? subKey : null;
};

const applyClosedDedupSafe = (candidates: Map<string, CandidateStats>): Set<string> => {
    const removable = new Set<string>();
    const keyLengthCache = new Map<string, number>();
    const sorted = getSortedCandidatesForDedupe(candidates, keyLengthCache);

    for (const [longKey, longStats] of sorted) {
        if (!canClosedDedupe(longStats)) {
            continue;
        }

        const longWords = parseKey(longKey);
        const longLen = longWords.length;

        for (let subLen = 2; subLen < longLen; subLen++) {
            for (let offset = 0; offset + subLen <= longLen; offset++) {
                const subKey = isSubphraseRemovableAtOffset(candidates, longStats, longWords, offset, subLen);
                if (subKey) {
                    removable.add(subKey);
                }
            }
        }
    }

    return removable;
};

const resolveOptions = (options?: GenerateHintsOptions): InternalOptions => {
    return {
        dedupe: options?.dedupe ?? DEFAULTS.dedupe,
        maxN: options?.maxN ?? DEFAULTS.maxN,
        minCount: options?.minCount ?? DEFAULTS.minCount,
        minN: options?.minN ?? DEFAULTS.minN,
        normalization: { ...DEFAULT_NORMALIZATION, ...(options?.normalization ?? {}) },
        stopwords: options?.stopwords ?? [],
        topK: options?.topK ?? Number.POSITIVE_INFINITY,
    };
};

const normalizeTokenStream = (tokens: Token[], options: InternalOptions) =>
    tokens.map((t) => normalizeTokenText(t.text, options.normalization));

const countNgrams = (normalizedTokens: string[], options: InternalOptions): Map<string, number> => {
    const counts = new Map<string, number>();

    for (let i = 0; i < normalizedTokens.length; i++) {
        for (let n = options.minN; n <= options.maxN; n++) {
            if (i + n > normalizedTokens.length) {
                break;
            }
            const slice = normalizedTokens.slice(i, i + n);
            if (slice.some((s) => !s)) {
                continue;
            }
            if (isAllStopwords(slice, options.stopwords)) {
                continue;
            }
            const key = makeKey(slice);
            counts.set(key, (counts.get(key) ?? 0) + 1);
        }
    }

    return counts;
};

const selectCandidateKeys = (counts: Map<string, number>, minCount: number): Set<string> => {
    const candidateKeys = new Set<string>();
    for (const [key, count] of counts) {
        if (count >= minCount) {
            candidateKeys.add(key);
        }
    }
    return candidateKeys;
};

const initCandidateStats = (counts: Map<string, number>, candidateKeys: Set<string>): Map<string, CandidateStats> => {
    const candidates = new Map<string, CandidateStats>();
    for (const key of candidateKeys) {
        candidates.set(key, {
            count: counts.get(key)!,
            firstOccurrenceIndex: Number.POSITIVE_INFINITY,
            occurrenceIndices: [],
            occurrencesTruncated: false,
            surfaceCounts: new Map(),
        });
    }
    return candidates;
};

const collectCandidateStats = (
    tokens: Token[],
    normalizedTokens: string[],
    options: InternalOptions,
    candidateKeys: Set<string>,
    counts: Map<string, number>,
): Map<string, CandidateStats> => {
    const candidates = initCandidateStats(counts, candidateKeys);

    const collectAt = (startIndex: number, n: number) => {
        const slice = normalizedTokens.slice(startIndex, startIndex + n);
        if (slice.some((s) => !s)) {
            return;
        }

        const key = makeKey(slice);
        if (!candidateKeys.has(key)) {
            return;
        }

        const stats = candidates.get(key)!;

        stats.firstOccurrenceIndex = Math.min(stats.firstOccurrenceIndex, startIndex);
        recordOccurrence(stats, startIndex);

        const surface = tokens
            .slice(startIndex, startIndex + n)
            .map((t) => t.text)
            .join(' ');
        addSurfaceVariant(stats, surface);
    };

    for (let i = 0; i < normalizedTokens.length; i++) {
        for (let n = options.minN; n <= options.maxN; n++) {
            if (i + n > normalizedTokens.length) {
                break;
            }
            collectAt(i, n);
        }
    }

    return candidates;
};

const buildResults = (
    candidates: Map<string, CandidateStats>,
    removable: Set<string>,
    topK: number,
): GeneratedHint[] => {
    const results: GeneratedHint[] = [];

    for (const [key, stats] of candidates) {
        if (removable.has(key)) {
            continue;
        }

        const normalizedWords = parseKey(key);
        const normalizedPhrase = normalizedWords.join(' ');
        const surfaces = pickTopSurfaces(stats.surfaceCounts, 3);
        const phrase = surfaces[0] ?? normalizedPhrase;

        results.push({
            count: stats.count,
            firstOccurrenceIndex: Number.isFinite(stats.firstOccurrenceIndex) ? stats.firstOccurrenceIndex : undefined,
            length: normalizedWords.length,
            normalizedPhrase,
            phrase,
            topSurfaceForms: surfaces.length > 0 ? surfaces : undefined,
        });
    }

    results.sort(
        (a, b) => b.count - a.count || b.length - a.length || a.normalizedPhrase.localeCompare(b.normalizedPhrase),
    );

    return results.slice(0, Math.max(0, topK));
};

/**
 * Mine frequent n-grams from a token stream and return hint candidates sorted by frequency.
 *
 * This is Arabic-first: mining is performed on normalized token text.
 * The returned `phrase` is the most common surface form observed for that normalized phrase.
 *
 * Breaking-change note: defaults favor Arabic ASR robustness (alef/ya normalization + tatweel stripping).
 */
export const generateHintsFromTokens = (tokens: Token[], options?: GenerateHintsOptions): GeneratedHint[] => {
    const resolved = resolveOptions(options);
    if (tokens.length === 0) {
        return [];
    }
    if (resolved.minN < 1 || resolved.maxN < resolved.minN) {
        return [];
    }

    const normalizedTokens = normalizeTokenStream(tokens, resolved);
    const counts = countNgrams(normalizedTokens, resolved);
    const candidateKeys = selectCandidateKeys(counts, resolved.minCount);

    if (candidateKeys.size === 0) {
        return [];
    }

    const candidates = collectCandidateStats(tokens, normalizedTokens, resolved, candidateKeys, counts);
    const removable = resolved.dedupe === 'closed' ? applyClosedDedupSafe(candidates) : new Set<string>();
    return buildResults(candidates, removable, resolved.topK);
};

/**
 * Mine frequent n-grams from segments.
 *
 * If `boundaryStrategy` is `'segment'` (default), phrases cannot cross segment boundaries.
 */
export const generateHintsFromSegments = (segments: Segment[], options?: GenerateHintsOptions): GeneratedHint[] => {
    const boundary = options?.boundaryStrategy ?? 'segment';

    if (boundary === 'none') {
        return generateHintsFromTokens(
            segments.flatMap((s) => s.tokens),
            options,
        );
    }

    const mergeInto = (combined: Map<string, GeneratedHint>, hint: GeneratedHint) => {
        const existing = combined.get(hint.normalizedPhrase);
        if (!existing) {
            combined.set(hint.normalizedPhrase, { ...hint });
            return;
        }
        existing.count += hint.count;
        existing.length = Math.max(existing.length, hint.length);
        existing.topSurfaceForms = Array.from(
            new Set([...(existing.topSurfaceForms ?? []), ...(hint.topSurfaceForms ?? [])]),
        ).slice(0, 3);
        if (hint.firstOccurrenceIndex !== undefined) {
            existing.firstOccurrenceIndex =
                existing.firstOccurrenceIndex === undefined
                    ? hint.firstOccurrenceIndex
                    : Math.min(existing.firstOccurrenceIndex, hint.firstOccurrenceIndex);
        }
    };

    // Segment boundary strategy: mine per-segment and merge by normalizedPhrase.
    const combined = new Map<string, GeneratedHint>();
    for (const segment of segments) {
        const mined = generateHintsFromTokens(segment.tokens, options);
        for (const hint of mined) {
            mergeInto(combined, hint);
        }
    }

    return Array.from(combined.values()).sort(
        (a, b) => b.count - a.count || b.length - a.length || a.normalizedPhrase.localeCompare(b.normalizedPhrase),
    );
};
