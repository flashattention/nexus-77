import type { ChapterDef } from './types';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import { CH4 } from './ch4';
import { CH5 } from './ch5';

export type { ChapterDef } from './types';

/** Playable chapters in story order. */
export const CHAPTERS: ChapterDef[] = [CH1, CH2, CH3, CH4, CH5];

export function chapterForDistrict(districtId: string): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.districtId === districtId);
}

export function nextChapter(ch: ChapterDef): ChapterDef | undefined {
  return CHAPTERS.find((c) => c.no === ch.no + 1);
}

/** Chapters unlock in order: the previous one must be cleared (docs/GAME_DESIGN.md §5). */
export function isUnlocked(ch: ChapterDef, cleared: readonly string[]): boolean {
  const prev = CHAPTERS.find((c) => c.no === ch.no - 1);
  return !prev || cleared.includes(prev.id);
}
