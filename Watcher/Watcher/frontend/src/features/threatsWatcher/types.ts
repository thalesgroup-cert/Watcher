import type { LastEvent } from '../timeline/components/LastActor';

export interface Post {
    url: string;
    created_at: string;
}

/** A word trending in the RSS feeds (`TrendyWord`). */
export interface Word {
    id: number;
    name: string;
    /** Number of articles that mention it. */
    occurrences: number;
    /** Average reliability of the sources that mention it, 0-100. */
    score: number;
    /** First seen. */
    created_at: string;
    posts_count: number;
    // Detail only
    posts?: Post[];
    monitored?: boolean;
}

export type Level = 'warm' | 'hot' | 'super_hot';

export interface MonitoredKeyword {
    id: number;
    name: string;
    level: Level;
    level_display: string;
    threshold: number;
    last_seen: string | null;
    occurrences: number;
    posts_count: number;
    created_at: string;
    last_event: LastEvent | null;
    /** A rule (several words) rather than the single word of `name`: then `name` is only its label. */
    is_rule: boolean;
    /** Rule: words that must ALL be in the article (logical AND). */
    all_of: string[];
    /** Rule: when given, at least one of these must be in the article too. */
    any_of: string[];
    /** An article that contains one of these is never matched. */
    exceptions: string[];
    /** Whole words only ('apt' does not match 'adapt'). */
    whole_words: boolean;
    is_active: boolean;
    /** Articles kept to be reviewed (rules only). */
    hits_count: number;
    open_hits_count: number;
    // Detail only
    posts?: Post[];
}

export type MonitoredKeywordInput = Partial<Pick<MonitoredKeyword, 'name' | 'level' | 'all_of' | 'any_of' | 'exceptions' | 'whole_words' | 'is_active'>>;

/** An article that matched a keyword written as a rule. */
export interface KeywordHit {
    id: number;
    keyword: number;
    keyword_name: string;
    url: string;
    title: string;
    /** The words of the rule that were found. */
    matched: string[];
    hit_at: string;
    is_archived: boolean;
}

export interface Source {
    id: number;
    url: string;
    /** 1 = most reliable (100 %), 2 = 50 %, 3 = 20 % (core.get_confidence_score). */
    confident: number;
    country: string;
    country_code: string;
    last_status_code: number | null;
    last_checked: string | null;
    created_at: string;
    last_event: LastEvent | null;
}

export type SourceInput = Pick<Source, 'url' | 'confident' | 'country' | 'country_code'>;

export interface BannedWord {
    id: number;
    name: string;
    created_at: string;
    last_event: LastEvent | null;
}

export interface Summary {
    id: number;
    type: 'weekly_summary' | 'breaking_news' | 'trendy_word_summary';
    keywords: string;
    summary_text: string;
    created_at: string;
    updated_at: string;
}

export type Period = '' | 'today' | '7d' | '30d';
export type Confidence = '' | 'high' | 'medium' | 'low';

export interface WordFilters {
    search: string;
    period: Period;
    confidence: Confidence;
}

export interface Page<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

export interface ListQuery {
    page: number;
    pageSize: number;
    ordering: string;
}

export interface ThreatsStatistics {
    totalWords: number;
    newToday: number;
    newThisWeek: number;
    totalSources: number;
    failingSources: number;
    bannedWords: number;
    monitoredKeywords: number;
    monitoredSeen: number;
    monitoredByLevel: Partial<Record<Level, number>>;
    topWords: { name: string; occurrences: number }[];
    wordsPerDay: { date: string; count: number }[];
    articlesPerDay: { date: string; count: number }[];
    sourcesByCountry: { code: string; country: string; count: number }[];
    sourcesByConfidence: Record<string, number>;
}

/** Most mentioned words and the links between them: two words are linked when articles mention both (issue #334). */
export interface WordGraph {
    nodes: { id: number; name: string; occurrences: number; score: number; posts_count: number }[];
    links: { source: number; target: number; weight: number }[];
}
