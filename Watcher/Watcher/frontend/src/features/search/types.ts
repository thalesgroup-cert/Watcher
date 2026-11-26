export interface SearchResult {
    id: number | string;
    type: string;
    title: string;
    subtitle: string;
    to: string;
}

export interface SearchGroup {
    module: string;
    label: string;
    results: SearchResult[];
    more: boolean;
    error: boolean;
}

export interface SearchResponse {
    query: string;
    groups: SearchGroup[];
}
