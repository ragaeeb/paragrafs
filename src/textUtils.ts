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
