import { describe, expect, it } from 'bun:test';

import { syncTokensWithGroundTruth } from './transcriptUtils';

describe('transcriptUtils', () => {
    describe('syncTokensWithGroundTruth', () => {
        it('should be a no-op if everything matches perfectly', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'quick' },
                { end: 2, start: 2, text: 'brown' },
                { end: 4, start: 3, text: 'fox' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'The quick brown fox',
            );
            expect(actual).toEqual(tokens);
        });

        it('should fill in the missing words by estimating where they belong when ground truth is longer than tokens while replacing punctuation', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 3, start: 2, text: 'brown' },
                { end: 3.5, start: 3, text: 'fox' },
                { end: 6, start: 5, text: 'right' },
                { end: 6.9, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'a' },
                { end: 9, start: 8, text: 'last' },
                { end: 10, start: 9, text: 'dog' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'The quick brown fox jumps right over the lazy dog.',
            );
            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'quick' },
                { end: 3, start: 2, text: 'brown' },
                { end: 3.5, start: 3, text: 'fox' },
                { end: 5, start: 3.5, text: 'jumps' },
                { end: 6, start: 5, text: 'right' },
                { end: 6.9, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'the' }, // since there are exactly two words between over and dog, and there were 2 words unmatched [a,last] from the ground truth (the,lazy) we can substitute them
                { end: 9, start: 8, text: 'lazy' },
                { end: 10, start: 9, text: 'dog.' },
            ]);
        });

        it('should match as many words possible and then start estimating where unmatched words would go based on gaps found when ground truth is shorter than tokens', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'uh' },
                { end: 3, start: 2, text: 'quick' },
                { end: 4, start: 3, text: 'blue' },
                { end: 5, start: 4, text: 'umm' },
                { end: 6, start: 5, text: 'fox' },
                { end: 7, start: 6, text: 'jumps' },
                { end: 8, start: 7, text: 'jumps' },
                { end: 9, start: 8, text: 'right' },
                { end: 10, start: 9, text: 'over' },
                { end: 11, start: 10, text: 'the' },
                { end: 12, start: 11, text: 'the' },
                { end: 13, start: 12, text: 'the' },
                { end: 14, start: 13, text: 'lazy' },
                { end: 15, start: 14, text: 'dog' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'The quick brown fox jumps right over the lazy dog',
            );
            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 2, isUnknown: true, start: 1, text: 'uh' }, // since this token was not matched we keep it always with a fixed confidence of 0.5
                { end: 3, start: 2, text: 'quick' },
                { end: 4, start: 3, text: 'brown' }, // should replace the first token after quick with unmatched "brown" since there is a gap between brown and fox
                { end: 5, isUnknown: true, start: 4, text: 'umm' },
                { end: 6, start: 5, text: 'fox' },
                { end: 7, isUnknown: true, start: 6, text: 'jumps' },
                { end: 8, start: 7, text: 'jumps' },
                { end: 9, start: 8, text: 'right' },
                { end: 10, start: 9, text: 'over' },
                { end: 11, isUnknown: true, start: 10, text: 'the' },
                { end: 12, isUnknown: true, start: 11, text: 'the' },
                { end: 13, start: 12, text: 'the' },
                { end: 14, start: 13, text: 'lazy' },
                { end: 15, start: 14, text: 'dog' },
            ]);
        });

        it('should replace all the wrong words in the array when the ground truth and tokens have equal length', () => {
            const tokens = [
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'quick' },
                { end: 3, start: 2, text: 'blue' },
                { end: 4, start: 3, text: 'flocks' },
                { end: 5, start: 4, text: 'jump' },
                { end: 6, start: 5, text: 'rights' },
                { end: 7, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'a' },
                { end: 9, start: 8, text: 'lays' },
                { end: 10, start: 9, text: 'dock' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'The quick brown fox jumps right over the lazy dog.',
            );
            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'quick' },
                { end: 3, start: 2, text: 'brown' },
                { end: 4, start: 3, text: 'fox' },
                { end: 5, start: 4, text: 'jumps' },
                { end: 6, start: 5, text: 'right' },
                { end: 7, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'the' },
                { end: 9, start: 8, text: 'lazy' },
                { end: 10, start: 9, text: 'dog.' },
            ]);
        });

        it('should handle where ground truth is larger than tokens while needing a replacement', () => {
            const tokens = [
                { end: 1, start: 0, text: 'the' },
                { end: 2, start: 1, text: 'quick' },
                { end: 3, start: 2, text: 'brown' },
                { end: 4, start: 3, text: 'fox' },
                { end: 6, start: 5, text: 'right' },
                { end: 7, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'a' },
                { end: 9, start: 8, text: 'a' },
                { end: 10, start: 9, text: 'crazy' },
                { end: 11, start: 10, text: 'dog' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'The quick brown fox jumps right over the lazy dog.',
            );
            expect(actual).toEqual([
                { end: 1, start: 0, text: 'The' },
                { end: 2, start: 1, text: 'quick' },
                { end: 3, start: 2, text: 'brown' },
                { end: 4, start: 3, text: 'fox' },
                { end: 5, start: 4, text: 'jumps' },
                { end: 6, start: 5, text: 'right' },
                { end: 7, start: 6, text: 'over' },
                { end: 8, start: 7, text: 'the' }, // this and the token below were replaced since they were the next ones after the last match
                { end: 9, start: 8, text: 'lazy' },
                { end: 10, isUnknown: true, start: 9, text: 'crazy' }, // unmatched
                { end: 11, start: 10, text: 'dog.' },
            ]);
        });

        it('should match despite diacritics', () => {
            const tokens = [
                { start: 0, text: 'اخبرنا' },
                { start: 1, text: 'معمر' },
                { start: 2, text: 'عن' },
                { start: 3, text: 'ابن' },
                { start: 4, text: 'ابي' },
                { start: 5, text: 'ذئب' },
                { start: 6, text: 'عن' },
                { start: 6.5, text: 'معمر' },
                { start: 6.7, text: 'اخبرنا' },
                { start: 7, text: 'المقبري' },
            ];
            const actual = syncTokensWithGroundTruth(
                tokens,
                'أَخْبَرَنَا مَعْمَرٌ عَنِ ابْنِ أَبِي ذِئْبٍ عَنِ الْمَقْبُرِيِّ',
            );
            expect(actual).toEqual([
                { start: 0, text: 'أَخْبَرَنَا' },
                { start: 1, text: 'مَعْمَرٌ' },
                { start: 2, text: 'عَنِ' },
                { start: 3, text: 'ابْنِ' },
                { start: 4, text: 'أَبِي' },
                { start: 5, text: 'ذِئْبٍ' },
                { start: 6, text: 'عَنِ' },
                { isUnknown: true, start: 6.5, text: 'معمر' },
                { isUnknown: true, start: 6.7, text: 'اخبرنا' },
                { start: 7, text: 'الْمَقْبُرِيِّ' },
            ]);
        });

        it('should work with real tokens', () => {
            const tokens = [
                {
                    end: 1,
                    start: 0,
                    text: 'يقول',
                },
                {
                    end: 2,
                    start: 1,
                    text: 'احسن',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'الله',
                },
                {
                    end: 4,
                    start: 3,
                    text: 'اليك',
                },
                {
                    end: 5,
                    start: 4,
                    text: 'ما',
                },
                {
                    end: 6,
                    start: 5,
                    text: 'السبيل',
                },
                {
                    end: 7,
                    start: 6,
                    text: 'الى',
                },
                {
                    end: 8,
                    start: 7,
                    text: 'تدبر',
                },
                {
                    end: 9,
                    start: 8,
                    text: 'القرآن',
                },
                {
                    end: 10,
                    start: 9,
                    text: 'ما',
                },
                {
                    end: 11,
                    start: 10,
                    text: 'السبيل',
                },
                {
                    end: 12,
                    start: 11,
                    text: 'الى',
                },
                {
                    end: 13,
                    start: 12,
                    text: 'تدبر',
                },
                {
                    end: 14,
                    start: 13,
                    text: 'القرآن',
                },
                {
                    end: 15,
                    start: 14,
                    text: 'تدبر',
                },
                {
                    end: 16,
                    start: 15,
                    text: 'القرآن',
                },
                {
                    end: 17,
                    start: 16,
                    text: 'مقصد',
                },
                {
                    end: 18,
                    start: 17,
                    text: 'لاجله',
                },
                {
                    end: 19,
                    start: 18,
                    text: 'نزل',
                },
                {
                    end: 20,
                    start: 19,
                    text: 'كتاب',
                },
                {
                    end: 21,
                    start: 20,
                    text: 'الله',
                },
                {
                    end: 22,
                    start: 21,
                    text: 'كما',
                },
                {
                    end: 23,
                    start: 22,
                    text: 'قال',
                },
                {
                    end: 24,
                    start: 23,
                    text: 'الله',
                },
                {
                    end: 25,
                    start: 24,
                    text: 'سبحانه',
                },
                {
                    end: 26,
                    start: 25,
                    text: 'وتعالى',
                },
                {
                    end: 27,
                    start: 26,
                    text: 'كتاب',
                },
                {
                    end: 28,
                    start: 27,
                    text: 'انزلناه',
                },
                {
                    end: 29,
                    start: 28,
                    text: 'اليك',
                },
                {
                    end: 30,
                    start: 29,
                    text: 'مبارك',
                },
                {
                    end: 31,
                    start: 30,
                    text: 'ليدبروا',
                },
                {
                    end: 32,
                    start: 31,
                    text: 'اياته',
                },
                {
                    end: 34,
                    start: 33,
                    text: 'وقال',
                },
                {
                    end: 35,
                    start: 34,
                    text: 'افلا',
                },
                {
                    end: 36,
                    start: 35,
                    text: 'يتدبرون',
                },
                {
                    end: 37,
                    start: 36,
                    text: 'القرآن',
                },
                {
                    end: 38,
                    start: 37,
                    text: 'وقال',
                },
                {
                    end: 39,
                    start: 38,
                    text: 'افلم',
                },
                {
                    end: 40,
                    start: 39,
                    text: 'يتدبروا',
                },
                {
                    end: 41,
                    start: 40,
                    text: 'القول',
                },
                {
                    end: 42,
                    start: 41,
                    text: 'فالقرآن',
                },
                {
                    end: 43,
                    start: 42,
                    text: 'انزل',
                },
                {
                    end: 44,
                    start: 43,
                    text: 'لتتدبر',
                },
                {
                    end: 45,
                    start: 44,
                    text: 'اياته',
                },
                {
                    end: 46,
                    start: 45,
                    text: 'وتعقل',
                },
                {
                    end: 47,
                    start: 46,
                    text: 'معانيه',
                },
                {
                    end: 48,
                    start: 47,
                    text: 'ويهتدى',
                },
                {
                    end: 49,
                    start: 48,
                    text: 'بهداياته',
                },
                {
                    end: 50,
                    start: 49,
                    text: 'كما',
                },
                {
                    end: 51,
                    start: 50,
                    text: 'قال',
                },
                {
                    end: 52,
                    start: 51,
                    text: 'الله',
                },
                {
                    end: 53,
                    start: 52,
                    text: 'سبحانه',
                },
                {
                    end: 54,
                    start: 53,
                    text: 'وتعالى',
                },
                {
                    end: 55,
                    start: 54,
                    text: 'ان',
                },
                {
                    end: 56,
                    start: 55,
                    text: 'هذا',
                },
                {
                    end: 57,
                    start: 56,
                    text: 'القرآن',
                },
                {
                    end: 58,
                    start: 57,
                    text: 'يهدي',
                },
                {
                    end: 59,
                    start: 58,
                    text: 'للتي',
                },
                {
                    end: 60,
                    start: 59,
                    text: 'هي',
                },
                {
                    end: 61,
                    start: 60,
                    text: 'اهون',
                },
            ];

            const groundTruth =
                'يقول احسن الله اليك ما السبيل الى تدبر القران؟ تدبر القران مقصد لاجله نزل كتاب الله كما قال الله سبحانه وتعالى كتاب انزلناه اليك مبارك ليدبروا اياته، وقال افلا يتدبرون القران وقال افلم يدبروا القول فالقران انزل لتدبر اياته وتعقل معانيه ويهتدوا بهدايته كما قال الله سبحانه وتعالى إن هذا القران يهدي للتي اقوم.';

            const actual = syncTokensWithGroundTruth(tokens, groundTruth);

            expect(actual).toEqual([
                {
                    end: 1,
                    start: 0,
                    text: 'يقول',
                },
                {
                    end: 2,
                    start: 1,
                    text: 'احسن',
                },
                {
                    end: 3,
                    start: 2,
                    text: 'الله',
                },
                {
                    end: 4,
                    start: 3,
                    text: 'اليك',
                },
                {
                    end: 5,
                    isUnknown: true,
                    start: 4,
                    text: 'ما',
                },
                {
                    end: 6,
                    isUnknown: true,
                    start: 5,
                    text: 'السبيل',
                },
                {
                    end: 7,
                    isUnknown: true,
                    start: 6,
                    text: 'الى',
                },
                {
                    end: 8,
                    isUnknown: true,
                    start: 7,
                    text: 'تدبر',
                },
                {
                    end: 9,
                    isUnknown: true,
                    start: 8,
                    text: 'القرآن',
                },
                {
                    end: 10,
                    start: 9,
                    text: 'ما',
                },
                {
                    end: 11,
                    start: 10,
                    text: 'السبيل',
                },
                {
                    end: 12,
                    start: 11,
                    text: 'الى',
                },
                {
                    end: 13,
                    start: 12,
                    text: 'تدبر',
                },
                {
                    end: 14,
                    start: 13,
                    text: 'القران؟',
                },
                {
                    end: 15,
                    start: 14,
                    text: 'تدبر',
                },
                {
                    end: 16,
                    start: 15,
                    text: 'القران',
                },
                {
                    end: 17,
                    start: 16,
                    text: 'مقصد',
                },
                {
                    end: 18,
                    start: 17,
                    text: 'لاجله',
                },
                {
                    end: 19,
                    start: 18,
                    text: 'نزل',
                },
                {
                    end: 20,
                    start: 19,
                    text: 'كتاب',
                },
                {
                    end: 21,
                    start: 20,
                    text: 'الله',
                },
                {
                    end: 22,
                    start: 21,
                    text: 'كما',
                },
                {
                    end: 23,
                    start: 22,
                    text: 'قال',
                },
                {
                    end: 24,
                    start: 23,
                    text: 'الله',
                },
                {
                    end: 25,
                    start: 24,
                    text: 'سبحانه',
                },
                {
                    end: 26,
                    start: 25,
                    text: 'وتعالى',
                },
                {
                    end: 27,
                    start: 26,
                    text: 'كتاب',
                },
                {
                    end: 28,
                    start: 27,
                    text: 'انزلناه',
                },
                {
                    end: 29,
                    start: 28,
                    text: 'اليك',
                },
                {
                    end: 30,
                    start: 29,
                    text: 'مبارك',
                },
                {
                    end: 31,
                    start: 30,
                    text: 'ليدبروا',
                },
                {
                    end: 32,
                    start: 31,
                    text: 'اياته،',
                },
                {
                    end: 34,
                    start: 33,
                    text: 'وقال',
                },
                {
                    end: 35,
                    start: 34,
                    text: 'افلا',
                },
                {
                    end: 36,
                    start: 35,
                    text: 'يتدبرون',
                },
                {
                    end: 37,
                    start: 36,
                    text: 'القران',
                },
                {
                    end: 38,
                    start: 37,
                    text: 'وقال',
                },
                {
                    end: 39,
                    start: 38,
                    text: 'افلم',
                },
                {
                    end: 40,
                    start: 39,
                    text: 'يدبروا',
                },
                {
                    end: 41,
                    start: 40,
                    text: 'القول',
                },
                {
                    end: 42,
                    start: 41,
                    text: 'فالقران',
                },
                {
                    end: 43,
                    start: 42,
                    text: 'انزل',
                },
                {
                    end: 44,
                    start: 43,
                    text: 'لتدبر',
                },
                {
                    end: 45,
                    start: 44,
                    text: 'اياته',
                },
                {
                    end: 46,
                    start: 45,
                    text: 'وتعقل',
                },
                {
                    end: 47,
                    start: 46,
                    text: 'معانيه',
                },
                {
                    end: 48,
                    start: 47,
                    text: 'ويهتدوا',
                },
                {
                    end: 49,
                    start: 48,
                    text: 'بهدايته',
                },
                {
                    end: 50,
                    start: 49,
                    text: 'كما',
                },
                {
                    end: 51,
                    start: 50,
                    text: 'قال',
                },
                {
                    end: 52,
                    start: 51,
                    text: 'الله',
                },
                {
                    end: 53,
                    start: 52,
                    text: 'سبحانه',
                },
                {
                    end: 54,
                    start: 53,
                    text: 'وتعالى',
                },
                {
                    end: 55,
                    start: 54,
                    text: 'إن',
                },
                {
                    end: 56,
                    start: 55,
                    text: 'هذا',
                },
                {
                    end: 57,
                    start: 56,
                    text: 'القران',
                },
                {
                    end: 58,
                    start: 57,
                    text: 'يهدي',
                },
                {
                    end: 59,
                    start: 58,
                    text: 'للتي',
                },
                {
                    end: 60,
                    isUnknown: true,
                    start: 59,
                    text: 'هي',
                },
                {
                    end: 61,
                    start: 60,
                    text: 'اقوم.',
                },
            ]);
        });
    });
});
