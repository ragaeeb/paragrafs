import { describe, expect, it } from 'bun:test';

import {
    formatSecondsToTimestamp,
    isEndingWithPunctuation,
    normalizeTokenText,
    normalizeWord,
    tokenizeGroundTruth,
} from './textUtils';

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

    describe('normalizeWord', () => {
        it('should remove standard Arabic diacritics', () => {
            expect(normalizeWord('كِتَابٌ')).toBe('كتاب');
        });

        it('should remove general Unicode combining marks', () => {
            expect(normalizeWord('e\u0301')).toBe('e'); // é
        });

        it('should strip leading and trailing punctuation', () => {
            expect(normalizeWord('.hello!')).toBe('hello');
            expect(normalizeWord('world?')).toBe('world');
            expect(normalizeWord(',test,')).toBe('test');
        });

        it('should NOT remove internal punctuation like hyphens', () => {
            expect(normalizeWord('well-being')).toBe('well-being');
        });

        it('should handle a combination of operations', () => {
            expect(normalizeWord('!مَرْحَبًا,')).toBe('مرحبا');
        });

        it('should handle empty strings', () => {
            expect(normalizeWord('')).toBe('');
            expect(normalizeWord('.,!')).toBe('');
        });
    });

    describe('normalizeTokenText', () => {
        it('should remove tatweel when configured', () => {
            expect(normalizeTokenText('اللــــه', { removeTatweel: true })).toBe('الله');
        });

        it('should normalize alef variants when configured', () => {
            expect(normalizeTokenText('إليكم', { normalizeAlef: true })).toBe('اليكم');
        });

        it('should normalize ya variants when configured', () => {
            expect(normalizeTokenText('على', { normalizeYa: true })).toBe('علي');
        });

        it('should normalize hamza seats when configured', () => {
            expect(normalizeTokenText('سُئِلَ', { normalizeHamza: true })).toBe('سءل');
        });
    });

    describe('tokenizeGroundTruth', () => {
        it('should return empty array for empty string', () => {
            const result = tokenizeGroundTruth('');
            expect(result).toEqual([]);
        });

        it('should return empty array for whitespace-only string', () => {
            const result = tokenizeGroundTruth('   \n\t  ');
            expect(result).toEqual([]);
        });

        it('should tokenize simple words separated by spaces', () => {
            const result = tokenizeGroundTruth('hello world test');
            expect(result).toEqual(['hello', 'world', 'test']);
        });

        it('should handle multiple whitespace types (spaces, tabs, newlines)', () => {
            const result = tokenizeGroundTruth('hello\tworld\ntest   more');
            expect(result).toEqual(['hello', 'world', 'test', 'more']);
        });

        it('should attach punctuation to previous word', () => {
            const result = tokenizeGroundTruth('hello world .');
            expect(result).toEqual(['hello', 'world.']);
        });

        it('should attach multiple punctuation marks to previous word', () => {
            const result = tokenizeGroundTruth('hello world ?!');
            expect(result).toEqual(['hello', 'world?!']);
        });

        it('should handle punctuation with mixed whitespace', () => {
            const result = tokenizeGroundTruth('hello world\n\t .');
            expect(result).toEqual(['hello', 'world.']);
        });

        it('should handle Arabic text with punctuation', () => {
            const result = tokenizeGroundTruth('الحمد لله ،');
            expect(result).toEqual(['الحمد', 'لله،']);
        });

        it('should handle words that already have punctuation attached', () => {
            const result = tokenizeGroundTruth('hello world, test.');
            expect(result).toEqual(['hello', 'world,', 'test.']);
        });

        it('should handle consecutive punctuation tokens', () => {
            const result = tokenizeGroundTruth('hello world , . !');
            expect(result).toEqual(['hello', 'world,.!']);
        });

        it('should handle text starting with punctuation (edge case)', () => {
            const result = tokenizeGroundTruth('. hello world');
            expect(result).toEqual(['.', 'hello', 'world']);
        });

        it('should handle mixed content with Arabic and English', () => {
            const result = tokenizeGroundTruth('hello الحمد world .');
            expect(result).toEqual(['hello', 'الحمد', 'world.']);
        });

        it('should handle complex punctuation patterns', () => {
            const result = tokenizeGroundTruth('word1 ; word2 : word3 !');
            expect(result).toEqual(['word1;', 'word2:', 'word3!']);
        });

        it('should handle numbers and punctuation', () => {
            const result = tokenizeGroundTruth('123 456 .');
            expect(result).toEqual(['123', '456.']);
        });

        it('should trim leading and trailing whitespace', () => {
            const result = tokenizeGroundTruth('   hello world   ');
            expect(result).toEqual(['hello', 'world']);
        });

        it('should handle single word', () => {
            const result = tokenizeGroundTruth('hello');
            expect(result).toEqual(['hello']);
        });

        it('should handle single word with punctuation', () => {
            const result = tokenizeGroundTruth('hello .');
            expect(result).toEqual(['hello.']);
        });

        it('should handle only punctuation marks', () => {
            const result = tokenizeGroundTruth('.');
            expect(result).toEqual(['.']);
        });

        it('should handle complex Arabic text from the original test', () => {
            const text = 'محمد وعلى آله وصحبه أجمعين ومن تبعهم بإحسان إلى يوم الدين ؛';
            const result = tokenizeGroundTruth(text);
            expect(result).toEqual([
                'محمد',
                'وعلى',
                'آله',
                'وصحبه',
                'أجمعين',
                'ومن',
                'تبعهم',
                'بإحسان',
                'إلى',
                'يوم',
                'الدين؛',
            ]);
        });
    });
});
