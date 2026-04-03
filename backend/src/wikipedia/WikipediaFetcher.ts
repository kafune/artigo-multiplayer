const BASE_URL = 'https://pt.wikipedia.org/w/api.php';
const MIN_ARTICLE_LENGTH = 2000;
const MAX_RETRIES = 5;

export interface ArticleData {
  title: string;
  text: string;
  url: string;
}

export class WikipediaFetcher {
  async fetchRandomArticle(): Promise<ArticleData> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const title = await this.getRandomTitle();
      const article = await this.fetchArticleByTitle(title);
      if (article.text.length >= MIN_ARTICLE_LENGTH) {
        return article;
      }
    }
    // Fallback: return whatever the last attempt got
    const title = await this.getRandomTitle();
    return this.fetchArticleByTitle(title);
  }

  async fetchArticleByTitle(title: string): Promise<ArticleData> {
    const params = new URLSearchParams({
      action: 'query',
      titles: title,
      prop: 'extracts',
      explaintext: 'true',
      exsectionformat: 'plain',
      format: 'json',
      origin: '*',
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);

    const data = await res.json() as { query: { pages: Record<string, { title: string; extract?: string; missing?: unknown }> } };
    const pages = data.query.pages;
    const page = Object.values(pages)[0];

    if (!page || page.missing !== undefined) {
      throw new Error(`Article not found: ${title}`);
    }

    const realTitle = page.title;
    const rawText = page.extract ?? '';
    const text = this.cleanExtract(rawText);
    const url = `https://pt.wikipedia.org/wiki/${encodeURIComponent(realTitle.replace(/ /g, '_'))}`;

    return { title: realTitle, text, url };
  }

  private cleanExtract(text: string): string {
    // Cut off at reference/bibliography sections (they produce citation noise)
    const cutoffPatterns = [
      /\n(Referências|Referencias|Ver também|Ligações externas|Bibliografia|Notas|Fontes)\n/i,
      /\n(References|External links|Bibliography|Notes|Sources)\n/i,
    ];
    let cleaned = text;
    for (const pattern of cutoffPatterns) {
      const match = pattern.exec(cleaned);
      if (match) cleaned = cleaned.slice(0, match.index);
    }
    // Limit to 6000 chars to avoid overwhelming tokenization
    if (cleaned.length > 6000) {
      // Cut at last complete sentence within limit
      const truncated = cleaned.slice(0, 6000);
      const lastPeriod = truncated.lastIndexOf('.');
      cleaned = lastPeriod > 3000 ? truncated.slice(0, lastPeriod + 1) : truncated;
    }
    return cleaned.trim();
  }

  private async getRandomTitle(): Promise<string> {
    const params = new URLSearchParams({
      action: 'query',
      list: 'random',
      rnnamespace: '0',
      rnlimit: '1',
      format: 'json',
      origin: '*',
    });

    const res = await fetch(`${BASE_URL}?${params}`);
    if (!res.ok) throw new Error(`Wikipedia API error: ${res.status}`);

    const data = await res.json() as { query: { random: Array<{ title: string }> } };
    return data.query.random[0].title;
  }
}
