import type { SceneBuilder } from '../engine/types';
import { buildBazaar } from '../scenes/bazaar';
import { buildHighway } from '../scenes/highway';
import { buildSpire } from '../scenes/spire';
import { buildUndercity } from '../scenes/undercity';
import { buildDatacore } from '../scenes/datacore';

export interface District {
  id: string;
  /** District name shown in UI */
  name: string;
  nameEn: string;
  /** Short zone label */
  zone: string;
  character: {
    name: string;
    nameEn: string;
    role: string;
    bio: string;
  };
  /** Key colours (first = district accent) */
  palette: string[];
  /** CSS background behind the transparent WebGL canvas */
  sky: string;
  /** UI accent colour (text-safe on dark) */
  accent: string;
  build: SceneBuilder;
}

export const DISTRICTS: District[] = [
  {
    id: 'bazaar',
    name: '네온 바자르',
    nameEn: 'NEON BAZAAR',
    zone: '거리 시장 구역',
    character: {
      name: '카이',
      nameEn: 'KAI',
      role: '거리 러너 · 배달 해커',
      bio: '비 내리는 야시장을 누비며 암호화된 소포를 나르는 배달 해커. 후드의 LED 줄무늬로 동료에게 신호를 보낸다.',
    },
    palette: ['#FF2BD6', '#FFB347', '#00F0FF', '#1D1B26', '#FF3B5C'],
    sky: 'linear-gradient(180deg, #0a0210 0%, #1e0828 45%, #3a0f44 80%, #521a52 100%)',
    accent: '#ff5ce0',
    build: buildBazaar,
  },
  {
    id: 'highway',
    name: '스카이 하이웨이',
    nameEn: 'SKYLANE 9',
    zone: '고가 고속 구역',
    character: {
      name: '제로',
      nameEn: 'ZERO',
      role: '호버바이크 라이더',
      bio: '도시 상공 9번 고가도로의 전설적인 레이서. 신호가 끊긴 구간도 감으로 달리고, 붉은 꼬리불이 지나간 자리엔 기록만 남는다.',
    },
    palette: ['#00F0FF', '#FF3B5C', '#EEF1F7', '#1A1E2C', '#FF2BD6'],
    sky: 'linear-gradient(180deg, #02040c 0%, #071028 45%, #0f1f48 80%, #1a2c5c 100%)',
    accent: '#00f0ff',
    build: buildHighway,
  },
  {
    id: 'spire',
    name: '헬릭스 스파이어',
    nameEn: 'HELIX SPIRE',
    zone: '기업 본사 구역',
    character: {
      name: '아이기스',
      nameEn: 'AEGIS',
      role: '기업 보안 엔포서',
      bio: '헬릭스 다이내믹스 본사 광장을 지키는 중장갑 경비 요원. 육각 에너지 방패를 펼치면 광장 전체가 봉쇄된다.',
    },
    palette: ['#9FE8FF', '#F4F6FA', '#1C2230', '#6FA8D0', '#FF2BD6'],
    sky: 'linear-gradient(180deg, #040910 0%, #0b1a2e 45%, #16314d 80%, #24496a 100%)',
    accent: '#9fe8ff',
    build: buildSpire,
  },
  {
    id: 'undercity',
    name: '언더시티 B-13',
    nameEn: 'UNDERCITY B-13',
    zone: '하층 슬럼 구역',
    character: {
      name: '글리치',
      nameEn: 'GLITCH',
      role: '하층 해커',
      bio: '상층 도시의 그림자 아래에서 사는 천재 해커. 드론 비트와 함께 기업 서버를 몰래 드나들며 정보를 빼돌린다.',
    },
    palette: ['#39FF88', '#FF8A2B', '#4A4A2E', '#14140F', '#FFD36B'],
    sky: 'linear-gradient(180deg, #020403 0%, #08120c 45%, #0f1f15 80%, #16291c 100%)',
    accent: '#39ff88',
    build: buildUndercity,
  },
  {
    id: 'datacore',
    name: '데이터 코어',
    nameEn: 'NEXUS//NET',
    zone: '가상 네트워크 층',
    character: {
      name: '에코',
      nameEn: 'ECHO',
      role: '도시 관리 AI',
      bio: '도시 전체 네트워크를 관리하는 AI가 스스로 만든 아바타. 현실 구역에서 벌어질 일을 가상 공간에서 먼저 본다.',
    },
    palette: ['#9B5CFF', '#00F0FF', '#FF2BD6', '#07030F', '#E6D8FF'],
    sky: 'linear-gradient(180deg, #05020c 0%, #0d0620 45%, #1a0b36 80%, #26104a 100%)',
    accent: '#c4a0ff',
    build: buildDatacore,
  },
];
