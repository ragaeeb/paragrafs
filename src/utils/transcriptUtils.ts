import type { Hints, Token } from '@/types';

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
