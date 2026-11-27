import { ARTISTS as DEFAULT_ARTISTS } from './artists.js';
import { QUESTIONS as DEFAULT_QUESTIONS } from './questions.js';

let currentContent = { artists: DEFAULT_ARTISTS, questions: DEFAULT_QUESTIONS };

export function getGameContent() {
  return currentContent;
}

export function setGameContent(content) {
  if (!content || !Array.isArray(content.artists) || !content.questions || typeof content.questions !== 'object') return;
  currentContent = content;
}

export function getDefaultGameContent() {
  return { artists: DEFAULT_ARTISTS, questions: DEFAULT_QUESTIONS };
}
