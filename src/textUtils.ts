import type { Hints } from './types';

/**
 * Checks if a text string ends with a punctuation mark (period, question mark, exclamation mark).
 * Supports both Latin and Arabic punctuation.
 *
 * @param {string} text - The text to check for ending punctuation
 * @returns {boolean} True if the text ends with punctuation, false otherwise
 */
export const isEndingWithPunctuation = (text: string): boolean => /[.؟!?]$/.test(text);

/**
 * Formats seconds into a human-readable timestamp.
 * For durations less than an hour: m:ss (e.g., "1:05")
 * For durations an hour or longer: h:mm:ss (e.g., "1:02:05")
 *
 * @param {number} seconds - The time duration in seconds
 * @returns {string} Formatted timestamp string
 */
export const formatSecondsToTimestamp = (seconds: number): string => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return hrs > 0
        ? `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
        : `${mins}:${secs.toString().padStart(2, '0')}`;
};

/**
 * Strip leading/trailing punctuation/symbols, remove Arabic diacritics, NFC-normalize.
 */
export const normalizeWord = (w: string) => {
    return (
        w
            // decompose to strip diacritics
            .normalize('NFD')
            // remove Arabic diacritic marks
            .replace(/[\u064B-\u065F]/g, '')
            // strip any punctuation or symbol at start/end (Unicode property escapes)
            .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
            // recompose
            .normalize('NFC')
    );
};

export const createHints = (...hints: string[]) => {
    const hintMap: Hints = {};
    for (const hint of hints) {
        const words = hint.split(' ');
        const first = words[0];
        if (!hintMap[first]) {
            hintMap[first] = [];
        }

        hintMap[first].push(words);
    }

    return hintMap;
};
