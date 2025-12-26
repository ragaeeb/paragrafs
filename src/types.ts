import type { AlwaysBreakMarker, SegmentBreakMarker } from './utils/constants';

/**
 * Represents a segment that was updated with the ground truth values.
 */
export type GroundedSegment = Omit<Segment, 'tokens'> & {
    tokens: GroundedToken[];
};

/**
 * Represents a token that was matched or unmatched during sync with the ground truth value.
 */
export type GroundedToken = Token & {
    /** If this is true it means this token was not matched during the ground truth syncing */
    isUnknown?: boolean;
};

export type HintMap = Record<string, string[][]>;

export type ArabicNormalizationOptions = {
    normalizeAlef?: boolean;
    normalizeHamza?: boolean;
    normalizeYa?: boolean;
    removeTatweel?: boolean;
};

export type GenerateHintsOptions = {
    boundaryStrategy?: 'none' | 'segment';
    dedupe?: 'closed' | 'none';
    maxN?: number;
    minCount?: number;
    minN?: number;
    normalization?: ArabicNormalizationOptions;
    stopwords?: string[];
    topK?: number;
};

export type Hints = {
    map: HintMap;
    normalization: Required<ArabicNormalizationOptions>;
};

export type GeneratedHint = {
    count: number;
    firstOccurrenceIndex?: number;
    length: number;
    normalizedPhrase: string;
    phrase: string;
    topSurfaceForms?: string[];
};

/**
 * Represents a segment during the marking and processing stage.
 * Contains an array of tokens that may include segment break markers.
 */
export type MarkedSegment = {
    /**
     * End time of the segment in seconds
     */
    end: number;

    /**
     * Start time of the segment in seconds
     */
    start: number;

    /**
     * Array of tokens and segment break markers that make up this segment
     */
    tokens: MarkedToken[];
};

/**
 * Represents either a token or a segment break marker.
 * Used during the processing of text to identify natural break points.
 */
export type MarkedToken = Token | AlwaysBreakMarker | SegmentBreakMarker;

export type MarkTokensWithDividersOptions = {
    fillers?: string[];
    gapThreshold: number;
    hints?: Hints;
};

export type MarkAndCombineSegmentsOptions = MarkTokensWithDividersOptions & {
    maxSecondsPerSegment: number;
    minWordsPerSegment: number;
};

/**
 * Represents a segment of text with timing information and optional word-level tokens.
 * A segment is a higher-level structure that contains a sequence of related tokens.
 */
export type Segment = Token & {
    /**
     * Word-by-word breakdown of the transcription with individual timings
     */
    tokens: Token[];
};

/**
 * Represents a single token (word or phrase) with timing information.
 * This is the basic unit of transcribed text.
 */
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
