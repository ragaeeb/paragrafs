import type { Hints, Token } from '@/types';

/**
 * Determines whether any hint phrase in `hints` matches the sequence of tokens
 * starting at the given index.
 *
 * Looks up candidate word arrays under the key `tokens[index].text` in the `hints` map,
 * then for each candidate phrase checks if every word matches the corresponding
 * token in `tokens` at successive positions.
 *
 * @param tokens
 *   The full array of `Token` objects being scanned.
 * @param hints
 *   A `Hints` map (from first word to arrays of word arrays), as produced by `createHints`.
 * @param index
 *   The position in `tokens` at which to try matching each hint phrase.
 * @returns
 *   `true` if at least one hint phrase completely matches the tokens starting at `index`;
 *   otherwise `false`.
 *
 * @example
 * ```ts
 * const tokens: Token[] = [
 *   { start: 0, end: 1, text: 'jump' },
 *   { start: 1, end: 2, text: 'over' },
 *   { start: 2, end: 3, text: 'the' },
 *   { start: 3, end: 4, text: 'moon' },
 * ];
 * const hints = createHints('jump over', 'the moon');
 *
 * isHintMatched(tokens, hints, 0);
 * // → true  (matches ['jump','over'])
 *
 * isHintMatched(tokens, hints, 2);
 * // → true  (matches ['the','moon'])
 *
 * isHintMatched(tokens, hints, 1);
 * // → false (no hint starts with 'over')
 * ```
 */
export const isHintMatched = (tokens: Token[], hints: Hints, index: number) => {
    const token = tokens[index];
    const candidates = hints[token.text];

    if (candidates) {
        for (const words of candidates) {
            const len = words.length;

            if (index + len <= tokens.length) {
                let match = true;

                for (let k = 0; k < len; k++) {
                    if (tokens[index + k].text !== words[k]) {
                        match = false;
                        break;
                    }
                }
                if (match) {
                    return true;
                }
            }
        }
    }

    return false;
};

/**
 * Generates interpolated tokens with evenly spaced timestamps for missing words.
 *
 * The function assumes a gap between two tokens and fills it with estimated tokens
 * for the ground truth words that were not matched. The time range is divided evenly
 * among the words.
 *
 * @param startTime - Start time of the gap
 * @param endTime - End time of the gap
 * @param words - List of ground truth words to interpolate into this range
 * @returns Array of synthetic `Token` objects with estimated timings
 */
export const interpolateMissingWords = (startTime: number, endTime: number, words: string[]): Token[] => {
    const wordCount = words.length;
    if (wordCount === 0 || endTime <= startTime) {
        return [];
    }

    // place a single word in the middle of the interval
    const interval = wordCount === 1 ? (endTime - startTime) / 2 : (endTime - startTime) / (wordCount + 1);
    const positions = wordCount === 1 ? [interval] : Array.from({ length: wordCount }, (_, i) => interval * (i + 1));

    return words.map((word, index) => {
        const start = startTime + positions[index];
        return {
            end: start + interval,
            start,
            text: word,
        };
    });
};
