import type { GroundedToken, Hints, Token } from '@/types';

import { alignGroundTruth } from '../ground-truth';
import { tokenizeGroundTruth } from './textUtils';

/**
 * Determines whether any hint phrase in `hints` matches the sequence of normalized token texts
 * starting at the given index.
 *
 * Looks up candidate word arrays under the key `normalizedTokens[index]` in the `hints` map,
 * then for each candidate phrase checks if every word matches the corresponding
 * normalized token text at successive positions.
 *
 * @param normalizedTokens
 *   The full array of normalized token text strings being scanned.
 * @param hints
 *   A `Hints` map (from first word to arrays of word arrays), as produced by `createHints`.
 * @param index
 *   The position in `normalizedTokens` at which to try matching each hint phrase.
 * @returns
 *   `true` if at least one hint phrase completely matches the normalized token text starting at `index`;
 *   otherwise `false`.
 *
 * @example
 * ```ts
 * const normalizedTokens = ['jump', 'over', 'the', 'moon'];
 * const hints = createHints({ normalizeAlef: false, normalizeYa: false, normalizeHamza: false, removeTatweel: false }, 'jump over', 'the moon');
 *
 * isHintMatched(normalizedTokens, hints, 0);
 * // → true  (matches ['jump','over'])
 *
 * isHintMatched(normalizedTokens, hints, 2);
 * // → true  (matches ['the','moon'])
 *
 * isHintMatched(normalizedTokens, hints, 1);
 * // → false (no hint starts with 'over')
 * ```
 */
const isHintSequenceMatchedAtIndex = (normalizedTokens: string[], words: string[], index: number): boolean => {
    if (index + words.length > normalizedTokens.length) {
        return false;
    }

    for (let k = 0; k < words.length; k++) {
        if (normalizedTokens[index + k] !== words[k]) {
            return false;
        }
    }

    return true;
};

export const isHintMatched = (normalizedTokens: string[], hints: Hints, index: number) => {
    const key = normalizedTokens[index];
    const candidates = hints.map[key];

    if (!candidates) {
        return false;
    }

    for (const words of candidates) {
        if (isHintSequenceMatchedAtIndex(normalizedTokens, words, index)) {
            return true;
        }
    }

    return false;
};

/**
 * Compatibility adapter for timed-token callers. Newly inserted boundary words use
 * zero-duration placeholders; canonical editors should use alignGroundTruth for
 * explicit optional timing, correspondence and ambiguity diagnostics.
 */
export const syncTokensWithGroundTruth = (tokens: Token[], groundTruth: string): GroundedToken[] => {
    const alignment = alignGroundTruth(tokens, tokenizeGroundTruth(groundTruth).join(' '));
    const result: GroundedToken[] = [];
    let lastEnd = tokens[0]?.start ?? 0;
    for (const operation of alignment.correspondence) {
        if (operation.kind === 'delete') {
            for (const index of operation.from) {
                result.push({ ...tokens[index], isUnknown: true });
            }
            continue;
        }
        for (const index of operation.to) {
            const { timing: _timing, ...token } = alignment.tokens[index];
            const start = token.start ?? lastEnd;
            const end = token.end ?? start;
            const originalIndex =
                operation.from.length === operation.to.length ? operation.from[index - operation.to[0]] : undefined;
            result.push(
                originalIndex === undefined
                    ? { ...token, end, start }
                    : ({ ...tokens[originalIndex], ...token } as GroundedToken),
            );
            lastEnd = end;
        }
    }
    return result;
};
