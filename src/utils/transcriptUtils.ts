import type { GroundedToken, Hints, Token } from '@/types';

import { buildLcsTable, extractLcsMatches } from './lcs';
import { normalizeWord } from './textUtils';

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
 * @typedef {object} CreateInsertionTokenProps
 * @property {string[]} gtGap - The list of ground truth words in the current gap.
 * @property {number} gtGapIndex - The index of the current word within the `gtGap`.
 * @property {Token[]} tokenGap - The list of original tokens in the current gap.
 * @property {Token | null} prevToken - The last processed token before the gap.
 * @property {Token} nextToken - The next anchor token that defines the end of the gap.
 */
type CreateInsertionTokenProps = {
    gtGap: string[];
    gtGapIndex: number;
    nextToken: Token;
    prevToken: null | Token;
    tokenGap: Token[];
};

/**
 * Creates a new token for an inserted ground truth word.
 * It estimates the start and end times by distributing the available time
 * within the gap between the previous and next anchor tokens.
 *
 * @param {string} text - The text of the token to be inserted.
 * @param {CreateInsertionTokenProps} props - The contextual information for the insertion.
 * @returns {Token} A new token with estimated timing.
 */
const createInsertionToken = (
    text: string,
    { gtGap, gtGapIndex, nextToken, prevToken, tokenGap }: CreateInsertionTokenProps,
): Token => {
    const gapStartTime = prevToken?.end ?? 0;
    const gapEndTime = nextToken.start;
    const timeAvailable = Math.max(0, gapEndTime - gapStartTime);

    // Distribute the available time amongst all words that need to be inserted in this gap.
    const itemsToInsert = gtGap.length - tokenGap.length;
    const timePerItem = itemsToInsert > 0 ? timeAvailable / itemsToInsert : 0;

    // Calculate the position of *this specific word* within the set of insertions.
    const insertionIndex = gtGapIndex - tokenGap.length;
    const start = gapStartTime + insertionIndex * timePerItem;
    const end = start + timePerItem;

    return { end, start, text };
};

/**
 * Distributes the words from the ground truth into their matching indices in the tokens. If something cannot be matched, then we will keep the token with a isUnknown flag on it.
 * @param tokens The word-by-word tokens from the AI.
 * @param groundTruth The human-agent verified text for the transcription.
 * @returns The corrected tokens with a best-effort of the ground truth values applied.
 */
export const syncTokensWithGroundTruth = (tokens: Token[], groundTruth: string): GroundedToken[] => {
    if (tokens.length === 0) {
        return tokens;
    }

    const groundTruthWords = groundTruth.trim().match(/[\w\u0600-\u06FF]+[؟،.]?|\S+/g) || [];

    // Step 1: Normalize inputs ONCE for performance.
    const normalizedTokens = tokens.map((t) => normalizeWord(t.text));
    const normalizedGTWords = groundTruthWords.map(normalizeWord);

    // Step 2: Build LCS table and extract reliable "anchor" matches.
    const lcsTable = buildLcsTable(normalizedTokens, normalizedGTWords);
    const lcsMatches = extractLcsMatches(lcsTable, normalizedTokens, normalizedGTWords);

    // Step 3: Enforce hard constraints for first and last tokens.
    lcsMatches.set(0, 0);

    if (tokens.length > 1) {
        lcsMatches.set(tokens.length - 1, groundTruthWords.length - 1);
    } else {
        // Single-token segment: add a **synthetic trailing anchor** instead
        lcsMatches.set(tokens.length, groundTruthWords.length);
    }

    // Step 4: Create a sorted list of anchors, ensuring they are strictly increasing.
    const anchors = Array.from(lcsMatches.entries())
        .sort((a, b) => a[0] - b[0])
        .filter((v, i, a) => !i || v[1] > a[i - 1][1]);

    // Step 5: Process the segments between anchors.
    const result: GroundedToken[] = [];
    let lastTokenIndex = -1;
    let lastGtIndex = -1;

    for (const [currentTokenIndex, currentGtIndex] of anchors) {
        const tokenGap = tokens.slice(lastTokenIndex + 1, currentTokenIndex);
        const gtGap = groundTruthWords.slice(lastGtIndex + 1, currentGtIndex);

        let tokenGapIndex = 0;
        let gtGapIndex = 0;

        // Resolve the gap by pairing tokens and GT words.
        while (tokenGapIndex < tokenGap.length || gtGapIndex < gtGap.length) {
            if (tokenGapIndex < tokenGap.length && gtGapIndex < gtGap.length) {
                // Case 1: Substitution. A token exists for a GT word. Use token's timing.
                result.push({
                    ...tokenGap[tokenGapIndex],
                    text: gtGap[gtGapIndex],
                });
                tokenGapIndex++;
                gtGapIndex++;
            } else if (tokenGapIndex < tokenGap.length) {
                // Case 2: Discard. An extra AI token. Mark with low confidence.
                result.push({ ...tokenGap[tokenGapIndex], isUnknown: true });
                tokenGapIndex++;
            } else {
                // Case 3: Insertion. An extra GT word. Create a new token.
                const insertion = createInsertionToken(gtGap[gtGapIndex], {
                    gtGap,
                    gtGapIndex,
                    nextToken: tokens[currentTokenIndex],
                    prevToken: lastTokenIndex === -1 ? null : tokens[lastTokenIndex],
                    tokenGap,
                });
                result.push(insertion);
                gtGapIndex++;
            }
        }

        // Add the anchor token itself.
        result.push({
            ...tokens[currentTokenIndex],
            text: groundTruthWords[currentGtIndex],
        });

        lastTokenIndex = currentTokenIndex;
        lastGtIndex = currentGtIndex;
    }

    return result;
};
