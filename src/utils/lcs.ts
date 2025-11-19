type LCSTable = number[][];

/**
 * Builds a dynamic programming table for Longest Common Subsequence (LCS).
 *
 * @param a - Normalized list of original token strings
 * @param b - Normalized list of ground truth words
 * @returns 2D array representing the LCS table (dimensions: (a.length + 1) x (b.length + 1))
 *
 * @complexity O(m * n) where m and n are lengths of `a` and `b`
 */
export const buildLcsTable = (a: string[], b: string[]) => {
    const m = a.length;
    const n = b.length;
    const table: LCSTable = Array.from({ length: m + 1 }, () =>
        Array(n + 1).fill(0),
    );

    for (let i = 0; i < m; i++) {
        for (let j = 0; j < n; j++) {
            if (a[i] === b[j]) {
                table[i + 1][j + 1] = table[i][j] + 1;
            } else {
                table[i + 1][j + 1] = Math.max(
                    table[i][j + 1],
                    table[i + 1][j],
                );
            }
        }
    }
    return table;
};

/**
 * Extracts index pairs of matched words from the LCS table.
 *
 * Backtracks through the LCS table to find all aligned index pairs
 * between the original and ground truth arrays.
 *
 * @param table - LCS dynamic programming table
 * @param original - Normalized original token texts
 * @param ground - Normalized ground truth words
 * @returns Array of match objects with `gtIndex` and `origIndex` pairs
 */
export const extractLcsMatches = (
    table: LCSTable,
    original: string[],
    ground: string[],
) => {
    const matches = new Map<number, number>();
    let i = original.length;
    let j = ground.length;

    while (i > 0 && j > 0) {
        if (original[i - 1] === ground[j - 1]) {
            matches.set(i - 1, j - 1);
            i--;
            j--;
        } else if (table[i - 1][j] >= table[i][j - 1]) {
            i--;
        } else {
            j--;
        }
    }
    return matches;
};
