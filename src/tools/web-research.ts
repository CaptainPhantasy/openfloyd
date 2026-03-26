import { createLogger } from '../utils/logger.js';
import type {
  SearchOptions,
  SearchResult,
  PageContent,
  VerificationResult,
} from '../types/index.js';

const log = createLogger('web-research');

const EXA_API_KEY = process.env['EXA_API_KEY'];
const TAVILY_API_KEY = process.env['TAVILY_API_KEY'];

export class WebResearchTool {
  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    if (EXA_API_KEY) {
      return this.searchExa(query, options);
    }
    if (TAVILY_API_KEY) {
      return this.searchTavily(query, options);
    }

    log.warn('No search API key configured (EXA_API_KEY or TAVILY_API_KEY)');
    return [];
  }

  async extract(url: string): Promise<PageContent> {
    log.info({ url }, 'Extracting page content');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'OpenFloyd/1.0 (research-bot)' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? url;

      // Basic content extraction - strip tags, compress whitespace
      const content = html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<nav[\s\S]*?<\/nav>/gi, '')
        .replace(/<footer[\s\S]*?<\/footer>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 10_000);

      return {
        url,
        title,
        content,
        extractedAt: new Date(),
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async verify(claim: string, sources?: string[]): Promise<VerificationResult> {
    log.info({ claim }, 'Verifying claim');

    const searchResults = await this.search(claim, { maxResults: 5 });
    const allSources = [...(sources ?? []), ...searchResults.map((r) => r.url)].slice(0, 5);

    const verifications: { url: string; supports: boolean; excerpt: string }[] = [];

    for (const url of allSources) {
      try {
        const page = await this.extract(url);
        const claimWords = claim.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
        const matchCount = claimWords.filter((w) => page.content.toLowerCase().includes(w)).length;
        const supports = matchCount / claimWords.length > 0.5;

        // Extract relevant excerpt
        const excerptStart = Math.max(0, page.content.toLowerCase().indexOf(claimWords[0] ?? '') - 100);
        const excerpt = page.content.substring(excerptStart, excerptStart + 300).trim();

        verifications.push({ url, supports, excerpt });
      } catch (err) {
        log.warn({ err, url }, 'Failed to verify against source');
      }
    }

    const supportCount = verifications.filter((v) => v.supports).length;
    const confidence = verifications.length > 0 ? supportCount / verifications.length : 0;

    return {
      claim,
      verified: confidence > 0.5,
      confidence,
      sources: verifications,
    };
  }

  private async searchExa(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const body: Record<string, unknown> = {
      query,
      numResults: options?.maxResults ?? 10,
      useAutoprompt: true,
    };

    if (options?.recency) {
      const days: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };
      const d = new Date();
      d.setDate(d.getDate() - (days[options.recency] ?? 30));
      body['startPublishedDate'] = d.toISOString().split('T')[0];
    }

    if (options?.domains) {
      body['includeDomains'] = options.domains;
    }
    if (options?.excludeDomains) {
      body['excludeDomains'] = options.excludeDomains;
    }

    try {
      const response = await fetch('https://api.exa.ai/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': EXA_API_KEY!,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Exa API error: ${response.status}`);
      }

      const data = await response.json() as {
        results: Array<{ title: string; url: string; text?: string; publishedDate?: string; score: number }>;
      };

      return data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.text?.substring(0, 200) ?? '',
        publishedDate: r.publishedDate ? new Date(r.publishedDate) : undefined,
        score: r.score,
      }));
    } catch (err) {
      log.error({ err }, 'Exa search failed');
      return [];
    }
  }

  private async searchTavily(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    try {
      const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          max_results: options?.maxResults ?? 10,
          search_depth: 'advanced',
          include_domains: options?.domains,
          exclude_domains: options?.excludeDomains,
        }),
      });

      if (!response.ok) {
        throw new Error(`Tavily API error: ${response.status}`);
      }

      const data = await response.json() as {
        results: Array<{ title: string; url: string; content: string; score: number; published_date?: string }>;
      };

      return data.results.map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.content.substring(0, 200),
        publishedDate: r.published_date ? new Date(r.published_date) : undefined,
        score: r.score,
      }));
    } catch (err) {
      log.error({ err }, 'Tavily search failed');
      return [];
    }
  }
}
