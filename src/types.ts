export type Segment = Token & {
    /**
     * Word-by-word breakdown of the transcription with individual timings
     */
    tokens?: Token[];
};

export type Token = {
    /**
     * End time in seconds.
     */
    end: number;

    /**
     * Start time in seconds.
     */
    start: number;
    /**
     * The transcribed text
     */
    text: string;
};

export const SEGMENT_BREAK = 'SEGMENT_BREAK';

export type MarkedSegment = {
    end: number;
    start: number;
    tokens: MarkedToken[];
};

export type MarkedToken = 'SEGMENT_BREAK' | Token;
