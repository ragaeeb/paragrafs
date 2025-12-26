import type { ArabicNormalizationOptions, HintMap, Hints } from '../types';

/**
 * Checks if a text string ends with sentence-ending punctuation.
 * Supports: period (.), question mark (? / ؟), exclamation (!), Arabic semicolon (؛), ellipsis (…).
 *
 * @param {string} text - The text to check for ending punctuation
 * @returns {boolean} True if the text ends with punctuation, false otherwise
 */
export const isEndingWithPunctuation = (text: string): boolean => /[.؟!?؛…]$/.test(text);

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
            // Remove common zero-width / format characters that can sneak into Arabic text.
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            // Remove Arabic diacritic marks and other common combining marks
            .replace(/\p{Mn}/gu, '')
            .replace(/[\u064B-\u065F]/g, '')
            // Strip any punctuation, symbol, or format char at start/end (Unicode property escapes)
            .replace(/^[\p{P}\p{S}\p{Cf}]+|[\p{P}\p{S}\p{Cf}]+$/gu, '')
            // Recompose
            .normalize('NFC')
    );
};

/**
 * Normalizes token text for Arabic-first matching and mining.
 *
 * This builds on `normalizeWord` (diacritics + trim punctuation) and adds optional
 * Arabic-specific normalizations. Use the same normalization for:
 * - mining repeated sequences
 * - matching hints against tokens
 *
 * @param text The token text to normalize
 * @param options Optional Arabic-specific normalizations
 * @returns A normalized token string suitable for comparisons
 */
export const normalizeTokenText = (text: string, options?: ArabicNormalizationOptions): string => {
    let input = text;

    // Preserve hamza information before we strip combining marks.
    // In NFD, ؤ/ئ decompose into base letter + U+0654 (hamza above).
    // We collapse waw/ya hamza seats to a standalone hamza, while leaving alef hamza
    // to be handled by normalizeAlef (or dropped if normalizeAlef is enabled).
    if (options?.normalizeHamza) {
        input = input
            .normalize('NFD')
            // ya/waw seats can have additional vowel marks between the base letter and hamza above in NFD.
            .replace(/\u064A\p{Mn}*\u0654/gu, 'ء') // ي + Mn* + ٔ
            .replace(/\u0648\p{Mn}*\u0654/gu, 'ء') // و + Mn* + ٔ
            .replace(/[\u0654\u0655]/g, '') // drop remaining hamza combining marks (e.g., أ/إ)
            .normalize('NFC');
    }

    let normalized = normalizeWord(input);

    if (options?.removeTatweel) {
        normalized = normalized.replace(/\u0640/g, '');
    }

    if (options?.normalizeAlef) {
        normalized = normalized.replace(/[أإآ]/g, 'ا');
    }

    if (options?.normalizeYa) {
        normalized = normalized.replace(/ى/g, 'ي');
    }

    return normalized;
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
const DEFAULT_HINT_NORMALIZATION: Required<ArabicNormalizationOptions> = {
    normalizeAlef: true,
    normalizeHamza: false,
    normalizeYa: true,
    removeTatweel: true,
};

/**
 * Creates normalized hints for robust Arabic matching (diacritics/punctuation tolerant).
 *
 * Breaking change: hints are now normalized by default. This is intended for Arabic ASR.
 *
 * @param first Either the first hint string, or an options object overriding the default normalization.
 * @param restHints Remaining hint strings, if the first argument was an options object.
 * @returns A normalized hint map plus the normalization settings used for matching.
 */
export const createHints = (first: ArabicNormalizationOptions | string, ...restHints: string[]): Hints => {
    const map: HintMap = {};

    const [options, hints] =
        typeof first === 'string'
            ? [DEFAULT_HINT_NORMALIZATION, [first, ...restHints]]
            : [{ ...DEFAULT_HINT_NORMALIZATION, ...first }, restHints];

    for (const hint of hints) {
        const words = hint
            .split(/\s+/)
            .map((w) => normalizeTokenText(w, options))
            .filter(Boolean);

        if (words.length === 0) {
            continue;
        }

        const firstWord = words[0];
        if (!map[firstWord]) {
            map[firstWord] = [];
        }
        map[firstWord].push(words);
    }

    return { map, normalization: options };
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
