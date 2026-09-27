export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export interface WebSearchProvider {
  readonly name: string;
  search(query: string, maxResults?: number): Promise<SearchResult[]>;
}

export class NoWebSearchProvider implements WebSearchProvider {
  readonly name = "none";
  async search(): Promise<SearchResult[]> {
    return [];
  }
}
