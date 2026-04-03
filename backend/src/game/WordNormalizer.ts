export class WordNormalizer {
  normalize(word: string): string {
    return word
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();
  }

  normalizeTitle(title: string): string {
    return title
      .split(/\s+/)
      .map((w) => this.normalize(w))
      .join(' ');
  }
}
