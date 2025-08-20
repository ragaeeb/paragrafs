import type { Hints } from '../types';

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
 * Normalizes a word by removing diacritics and punctuation.
 *
 * This function:
 * 1. Decomposes Unicode characters (NFD normalization)
 * 2. Removes Arabic diacritics
 * 3. Strips leading and trailing punctuation or symbols
 * 4. Recomposes Unicode characters (NFC normalization)
 *
 * @param {string} w - The word to normalize
 * @returns {string} The normalized word
 */
export const normalizeWord = (w: string) => {
    return (
        w
            // Decompose to strip diacritics
            .normalize('NFD')
            // Remove Arabic diacritic marks and other common combining marks
            .replace(/\p{Mn}/gu, '')
            .replace(/[\u064B-\u065F]/g, '')
            // Strip any punctuation or symbol at start/end (Unicode property escapes)
            .replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
            // Recompose
            .normalize('NFC')
    );
};

/**
 * Creates a map of hints organized by their first word.
 *
 * Takes multiple hint strings, splits each into words, and organizes them into
 * a map where the keys are the first words and values are arrays of word arrays.
 *
 * @param {...string} hints - One or more hint strings to process
 * @returns {Hints} A map of hints organized by their first word
 */
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

/**
 * Tokenizes ground truth text properly, ensuring punctuation is attached to words
 * rather than creating separate tokens.
 * @param groundTruth The ground truth to tokenize.
 * @returns The tokenized ground truth with the punctuations properly attached.
 */
export const tokenizeGroundTruth = (groundTruth: string): string[] => {
    // First, let's split on whitespace and newlines to get word candidates
    const rawTokens = groundTruth
        .trim()
        .split(/\s+/)
        .map((t) => t.trim())
        .filter(Boolean);
    const result: string[] = [];

    for (const token of rawTokens) {
        // Check if this token is just punctuation that should be attached to the previous word
        // Updated regex to properly handle Arabic punctuation and other punctuation marks
        if (result.length > 0 && /^[\p{P}\p{S}]+$/u.test(token)) {
            // Attach punctuation to the previous word
            result[result.length - 1] += token;
        } else {
            result.push(token);
        }
    }

    return result;
};
