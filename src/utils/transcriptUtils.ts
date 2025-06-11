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

type ConfidenceToken = Token & {
    confidence?: number;
};

/**
 * Normalizes Arabic text by removing diacritics for comparison.
 */
const normalizeDiacritics = (text: string): string => {
    return text.replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
};

/**
 * Normalizes text for comparison (removes diacritics and converts to lowercase).
 */
const normalizeForComparison = (text: string): string => {
    return normalizeDiacritics(text).toLowerCase();
};

export const syncTokensWithGroundTruth = (tokens: Token[], groundTruth: string): ConfidenceToken[] => {
    if (tokens.length === 0) {
        return [];
    }

    const groundTruthWords = groundTruth.trim().split(/\s+/);
    if (groundTruthWords.length === 0) {
        return tokens.map((t) => ({ ...t, confidence: 0.5 }));
    }

    // Step 1: Find all potential matches between tokens and ground truth words.
    const tokenMatches: (null | number)[] = new Array(tokens.length).fill(null);
    const groundTruthUsed: boolean[] = new Array(groundTruthWords.length).fill(false);

    for (let i = 0; i < tokens.length; i++) {
        const normalizedToken = normalizeForComparison(tokens[i].text);
        for (let j = 0; j < groundTruthWords.length; j++) {
            if (!groundTruthUsed[j] && normalizedToken === normalizeForComparison(groundTruthWords[j])) {
                tokenMatches[i] = j;
                groundTruthUsed[j] = true;
                break;
            }
        }
    }

    // Step 2: Force the first and last tokens to match the ground truth.
    if (tokenMatches[0] !== 0) {
        if (tokenMatches[0] !== null) {
            groundTruthUsed[tokenMatches[0]] = false;
        }
        tokenMatches[0] = 0;
        groundTruthUsed[0] = true;
    }
    if (tokens.length > 1) {
        const last = tokens.length - 1;
        if (tokenMatches[last] !== groundTruthWords.length - 1) {
            if (tokenMatches[last] !== null) {
                groundTruthUsed[tokenMatches[last]] = false;
            }
            tokenMatches[last] = groundTruthWords.length - 1;
            groundTruthUsed[groundTruthWords.length - 1] = true;
        }
    }

    // Step 3: Decide which unmatched GT words replace unmatched tokens vs. which need insertion.
    const result: ConfidenceToken[] = [];
    const tokenReplacements: { [tokenIndex: number]: string } = {};
    const gtWordsToInsert: { gtIndex: number; word: string }[] = [];

    const unmatchedGTWords: { index: number; word: string }[] = [];
    for (let i = 0; i < groundTruthWords.length; i++) {
        if (!groundTruthUsed[i]) {
            unmatchedGTWords.push({ index: i, word: groundTruthWords[i] });
        }
    }

    for (const unmatchedGT of unmatchedGTWords) {
        const gtIndex = unmatchedGT.index;
        const gtWord = unmatchedGT.word;

        let prevMatchedTokenIndex = -1;
        let nextMatchedTokenIndex = tokens.length;

        for (let i = 0; i < tokens.length; i++) {
            if (tokenMatches[i] !== null) {
                if (tokenMatches[i] < gtIndex) {
                    prevMatchedTokenIndex = i;
                }
                if (tokenMatches[i] > gtIndex && i < nextMatchedTokenIndex) {
                    nextMatchedTokenIndex = i;
                }
            }
        }

        let tokenToReplace = -1;
        for (let j = prevMatchedTokenIndex + 1; j < nextMatchedTokenIndex; j++) {
            if (tokenMatches[j] === null && !tokenReplacements[j]) {
                tokenToReplace = j;
                break;
            }
        }

        if (tokenToReplace !== -1) {
            tokenReplacements[tokenToReplace] = gtWord;
        } else {
            gtWordsToInsert.push({ gtIndex: gtIndex, word: gtWord });
        }
    }

    // Step 4: Build the result from tokens, applying replacements and marking discards.
    for (let i = 0; i < tokens.length; i++) {
        if (tokenMatches[i] !== null) {
            result.push({ ...tokens[i], text: groundTruthWords[tokenMatches[i]!] });
        } else if (tokenReplacements[i]) {
            result.push({ ...tokens[i], text: tokenReplacements[i] });
        } else {
            result.push({ ...tokens[i], confidence: 0.5 });
        }
    }

    // Step 5: Insert the remaining ground truth words into the result.
    for (const itemToInsert of gtWordsToInsert) {
        const gtIndex = itemToInsert.gtIndex;
        const gtWord = itemToInsert.word;

        let insertAtIndex = result.length;
        let prevResultToken: ConfidenceToken | null = null;
        let nextResultToken: ConfidenceToken | null = null;

        for (let i = 0; i < result.length; i++) {
            const currentToken = result[i];
            const originalTokenIndex = tokens.findIndex((t) => t.start === currentToken.start);
            const currentGTMatch = originalTokenIndex !== -1 ? tokenMatches[originalTokenIndex] : -1;

            if (currentGTMatch !== -1 && currentGTMatch > gtIndex && i < insertAtIndex) {
                insertAtIndex = i;
            }
        }

        prevResultToken = insertAtIndex > 0 ? result[insertAtIndex - 1] : null;
        nextResultToken = insertAtIndex < result.length ? result[insertAtIndex] : null;

        let timestamp = gtIndex;
        if (prevResultToken && nextResultToken) {
            timestamp = prevResultToken.start + (nextResultToken.start - prevResultToken.start) / 2;
        } else if (prevResultToken) {
            timestamp = prevResultToken.start + 1;
        } else if (nextResultToken) {
            timestamp = Math.max(0, nextResultToken.start - 1);
        }

        result.splice(insertAtIndex, 0, { start: timestamp, text: gtWord });
    }

    return result;
};
