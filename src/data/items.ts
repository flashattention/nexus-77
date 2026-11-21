/** Mission items shown in the 소지품 panel. */
export interface ItemDef {
  id: string;
  name: string;
  /** One glyph used as the icon. */
  icon: string;
  color: string;
}

export const ITEMS: Record<string, ItemDef> = {
  package: { id: 'package', name: '에코의 소포', icon: '◆', color: '#c4a0ff' },
  fuse: { id: 'fuse', name: '예비 퓨즈', icon: '⚡', color: '#ffd36b' },
  goods: { id: 'goods', name: '탁 사장의 물건', icon: '▣', color: '#ffb347' },
  chip: { id: 'chip', name: '덕배의 신용칩', icon: '◎', color: '#39ff88' },
  // Ch2
  aidkit: { id: 'aidkit', name: '구급 키트', icon: '✚', color: '#ff5d7a' },
  // Ch3
  keycard: { id: 'keycard', name: '보안층 카드키', icon: '▤', color: '#9fe8ff' },
  minutes: { id: 'minutes', name: '하엘의 회의록', icon: '▦', color: '#ffd36b' },
  authcode: { id: 'authcode', name: '업로드 인증 코드', icon: '⬢', color: '#39ff88' },
};
