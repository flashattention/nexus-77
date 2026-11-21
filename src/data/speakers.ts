/** Who can speak in dialogue / radio. Portraits are coloured monograms for now. */
export interface Speaker {
  name: string;
  color: string;
}

export const SPEAKERS = {
  kai: { name: '카이', color: '#ff5ce0' },
  sunja: { name: '순자 할머니', color: '#ffb347' },
  glitch: { name: '글리치', color: '#39ff88' },
  mos: { name: '모스', color: '#b36bff' },
  tak: { name: '탁 사장', color: '#ff8a2b' },
  deokbae: { name: '덕배', color: '#ffd36b' },
  zero: { name: '제로', color: '#00f0ff' },
  viper: { name: '바이퍼', color: '#9fe8ff' },
  aegis: { name: '아이기스', color: '#9fe8ff' },
  gang: { name: '레드랜턴', color: '#ff3b5c' },
  echo: { name: '???', color: '#c4a0ff' },
  // Ch2
  wrench: { name: '렌치', color: '#ffb347' },
  blaze: { name: '블레이즈', color: '#ff6a2b' },
  signal: { name: '관제 잔여 신호', color: '#c4a0ff' },
  police: { name: '헬릭스 교통국', color: '#6fb6ff' },
  pilot: { name: '앨버트로스', color: '#ff3b5c' },
  driver: { name: '운전자', color: '#d8c8b0' },
  // Ch3
  yuna: { name: '닥터 유나 서', color: '#a0ffd8' },
  crow: { name: '크로우 국장', color: '#c8d0e0' },
  haell: { name: '빅토르 하엘', color: '#ffd36b' },
  detainee: { name: '피의자', color: '#c3bbdc' },
  guard: { name: '헬릭스 경비', color: '#6fb6ff' },
  system: { name: 'SYSTEM', color: '#c3bbdc' },
} satisfies Record<string, Speaker>;

export type SpeakerId = keyof typeof SPEAKERS;

export interface Line {
  who: SpeakerId;
  text: string;
}
