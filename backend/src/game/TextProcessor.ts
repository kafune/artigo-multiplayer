import { ArticleToken } from '../types';
import { WordNormalizer } from './WordNormalizer';

// Groups: accented word chars | digits | paragraph break (\n\n+) | single newline | whitespace run | punctuation
const TOKEN_REGEX = /([À-ÖØ-öø-ÿA-Za-z]+|\d+|\n{2,}|\n|[^\S\n]+|[^\wÀ-ÖØ-öø-ÿ\s])/gu;

export class TextProcessor {
  constructor(
    private stopwords: Set<string>,
    private normalizer: WordNormalizer
  ) {}

  tokenize(rawText: string, title: string): ArticleToken[] {
    const normalizedTitle = this.normalizer.normalizeTitle(title);
    const titleWords = normalizedTitle.split(' ');

    const matches = rawText.match(TOKEN_REGEX) ?? [];
    const tokens: ArticleToken[] = [];
    let id = 0;

    for (const surface of matches) {
      const isWord = /[À-ÖØ-öø-ÿA-Za-z]/u.test(surface);

      if (!isWord) {
        tokens.push({
          id: id++,
          surface,
          word: null,
          isStopword: false,
          isRevealed: true,
          isTitle: false,
        });
        continue;
      }

      const normalized = this.normalizer.normalize(surface);
      const isStopword = this.stopwords.has(normalized);
      const isTitle = titleWords.includes(normalized);

      tokens.push({
        id: id++,
        surface,
        word: normalized,
        isStopword,
        isRevealed: isStopword,
        isTitle,
      });
    }

    return tokens;
  }
}
