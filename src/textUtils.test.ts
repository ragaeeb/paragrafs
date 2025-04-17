import { describe, expect, it } from 'bun:test';

import { formatSecondsToTimestamp, isEndingWithPunctuation } from './textUtils';

describe('textUtils', () => {
    describe('formatSecondsToTimestamp', () => {
        it('should format time as "01:01:01" for 3661 seconds with padding', () => {
            expect(formatSecondsToTimestamp(3661)).toBe('1:01:01');
        });

        it('should format time as "01:00:00" for 3600 seconds with padding', () => {
            expect(formatSecondsToTimestamp(3600)).toBe('1:00:00');
        });

        it('should format time as "2:02:02" for 7322 seconds', () => {
            expect(formatSecondsToTimestamp(7322)).toBe('2:02:02');
        });

        it('should format time as "00:59" for 59 seconds with padding', () => {
            expect(formatSecondsToTimestamp(59)).toBe('0:59');
        });

        it('should format time as "0:00" for 0 seconds', () => {
            expect(formatSecondsToTimestamp(0)).toBe('0:00');
        });

        it('should format time as "1:01" for 61 seconds', () => {
            expect(formatSecondsToTimestamp(61)).toBe('1:01');
        });

        it('should correctly handle a large number of seconds (e.g., 100000 seconds) with padding', () => {
            expect(formatSecondsToTimestamp(100000)).toBe('27:46:40');
        });

        it('should format time as "1:02:03" for 3723 seconds', () => {
            expect(formatSecondsToTimestamp(3723)).toBe('1:02:03');
        });

        it('should format time as "15s" for 15 seconds', () => {
            expect(formatSecondsToTimestamp(15)).toBe('0:15');
        });
    });

    describe('isEndingWithPunctuation', () => {
        it('should be true for question marks', () => {
            expect(isEndingWithPunctuation('abcd?')).toBeTrue();
        });

        it('should be true for Arabic question marks', () => {
            expect(isEndingWithPunctuation('عبد الرحمن؟')).toBeTrue();
        });

        it('should be true for exclamation marks', () => {
            expect(isEndingWithPunctuation('Yes!')).toBeTrue();
        });

        it('should be true for periods', () => {
            expect(isEndingWithPunctuation('Yes.')).toBeTrue();
        });

        it('should be true for multiple punctuation', () => {
            expect(isEndingWithPunctuation('Yes!??')).toBeTrue();
        });

        it('should be false for non-punctuations', () => {
            expect(isEndingWithPunctuation('Yes')).toBeFalse();
        });

        it('should be false if we do not end with a puncutation', () => {
            expect(isEndingWithPunctuation('Yes? And no')).toBeFalse();
        });
    });
});
