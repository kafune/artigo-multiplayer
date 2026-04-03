import { ArticleToken, ClientGameState, GameState, GuessRecord, Player } from '../types';
import { WikipediaFetcher } from '../wikipedia/WikipediaFetcher';
import { TextProcessor } from './TextProcessor';
import { WordNormalizer } from './WordNormalizer';

export interface GuessResult {
  revealed: ArticleToken[];
  revealedTokenIds: number[];
  matchCount: number;
  isWin: boolean;
  guessRecord: GuessRecord;
  alreadyGuessed: boolean;
}

export class GameEngine {
  constructor(
    private textProcessor: TextProcessor,
    private normalizer: WordNormalizer,
    private fetcher: WikipediaFetcher
  ) {}

  async initGame(articleTitle?: string): Promise<GameState> {
    const articleData = articleTitle
      ? await this.fetcher.fetchArticleByTitle(articleTitle)
      : await this.fetcher.fetchRandomArticle();

    const tokens = this.textProcessor.tokenize(articleData.text, articleData.title);
    const normalizedTitle = this.normalizer.normalizeTitle(articleData.title);

    return {
      articleTitle: articleData.title,
      normalizedTitle,
      tokens,
      guesses: [],
      startedAt: Date.now(),
      endedAt: null,
      winnerId: null,
      winnerNickname: null,
      articleUrl: articleData.url,
    };
  }

  processGuess(state: GameState, player: Player, rawWord: string): GuessResult {
    const normalizedGuess = this.normalizer.normalize(rawWord);

    // Check if already guessed (same normalized word)
    const alreadyGuessed = state.guesses.some(
      (g) => g.normalizedWord === normalizedGuess
    );

    if (alreadyGuessed) {
      const dummyRecord: GuessRecord = {
        playerId: player.id,
        playerNickname: player.nickname,
        word: rawWord,
        normalizedWord: normalizedGuess,
        timestamp: Date.now(),
        matchCount: 0,
        isWinningGuess: false,
      };
      return { revealed: [], revealedTokenIds: [], matchCount: 0, isWin: false, guessRecord: dummyRecord, alreadyGuessed: true };
    }

    const isWin = this.checkWin(state, normalizedGuess);

    // Reveal matching tokens
    const revealed: ArticleToken[] = [];
    const revealedTokenIds: number[] = [];

    for (const token of state.tokens) {
      if (token.word === normalizedGuess && !token.isRevealed) {
        token.isRevealed = true;
        revealed.push(token);
        revealedTokenIds.push(token.id);
      }
    }

    const guessRecord: GuessRecord = {
      playerId: player.id,
      playerNickname: player.nickname,
      word: rawWord,
      normalizedWord: normalizedGuess,
      timestamp: Date.now(),
      matchCount: revealed.length,
      isWinningGuess: isWin,
    };

    state.guesses.push(guessRecord);

    if (isWin) {
      state.endedAt = Date.now();
      state.winnerId = player.id;
      state.winnerNickname = player.nickname;
    }

    return { revealed, revealedTokenIds, matchCount: revealed.length, isWin, guessRecord, alreadyGuessed: false };
  }

  checkWin(state: GameState, normalizedGuess: string): boolean {
    return normalizedGuess === state.normalizedTitle;
  }

  buildClientGameState(state: GameState): ClientGameState {
    const totalHiddenCount = state.tokens.filter(
      (t) => t.word !== null && !t.isStopword
    ).length;
    const revealedCount = state.tokens.filter(
      (t) => t.word !== null && !t.isStopword && t.isRevealed
    ).length;

    return {
      tokens: state.tokens,
      guesses: state.guesses,
      startedAt: state.startedAt,
      endedAt: state.endedAt,
      winnerId: state.winnerId,
      winnerNickname: state.winnerNickname,
      articleUrl: state.endedAt !== null ? state.articleUrl : null,
      revealedCount,
      totalHiddenCount,
    };
  }
}
