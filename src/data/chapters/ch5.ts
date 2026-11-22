/**
 * CH5 「새벽」 — 데이터 코어 · 04:40 · 에코
 * docs/GAME_DESIGN.md §3. Map anchors/switches live in src/scenes/datacorePlay.ts.
 * Endings: 지배 / 해방 / 진 엔딩 (memory fragments + Ch4 rescues decide whether
 * the true ending is offered).
 */
import type { ChapterDef, Vec3T } from './types';
import type { CompanionHandle, Director, NpcHandle } from '../../game/story/Director';
import type { FigureLook } from '../../game/actors/Figure';
import type { GangOpts } from '../../game/ai/Gangster';
import type { Enemy } from '../../game/ai/types';
import type { Line, SpeakerId } from '../speakers';
import { CH1 } from './ch1';
import { CH2 } from './ch2';
import { CH3 } from './ch3';
import { CH4 } from './ch4';

const L = (who: SpeakerId, text: string): Line => ({ who, text });

/** Fragments + rescued residents needed before the true ending is offered. */
export const TRUE_ENDING_SCORE = 10;
/** Garden void (must match GARDEN_VOID in scenes/datacorePlay.ts). */
const VOID = { minZ: -230.6, maxZ: -140.5 };
const ARENA = { x: 0, z: -122 };
const ROOT = { x: 0, z: -258, r: 20 };

type Hero = 'kai' | 'zero' | 'aegis' | 'glitch';
const HEROES: Hero[] = ['kai', 'zero', 'aegis', 'glitch'];

const LOOKS: Record<Hero | 'sentinel' | 'warden' | 'architect' | 'mirrorAegis', FigureLook> = {
  kai: { body: 0xff2bd6, legs: 0x401040, skin: 0xffa0e8, accent: 0xffffff, hood: true, holo: true },
  zero: { body: 0x00c8e0, legs: 0x0a3040, skin: 0x90f0ff, accent: 0xffffff, holo: true },
  aegis: { body: 0x9fe8ff, legs: 0x204050, skin: 0xd0f4ff, accent: 0xffffff, bulk: 1.3, holo: true },
  glitch: { body: 0x39ff88, legs: 0x104020, skin: 0xa0ffc8, accent: 0xffb347, bulk: 1.1, holo: true },
  sentinel: { body: 0xff3b5c, legs: 0x40101a, skin: 0xff8aa0, accent: 0xffffff, holo: true },
  warden: { body: 0xff2040, legs: 0x300810, skin: 0xff6070, accent: 0xffd36b, bulk: 1.3, holo: true },
  architect: { body: 0xe6e6e6, legs: 0x808080, skin: 0xffffff, accent: 0xffd36b, holo: true },
  mirrorAegis: { body: 0x40c0ff, legs: 0x102030, skin: 0x80d8ff, accent: 0xffffff, bulk: 1.3, holo: true },
};
const HERO_NAME: Record<Hero, string> = { kai: '카이', zero: '제로', aegis: '아이기스', glitch: '글리치' };

const sentinel = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'pistol', robot: true, bolt: 'data', look: LOOKS.sentinel, hp: 80, ...o });
const warden = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'heavy', robot: true, bolt: 'data', look: LOOKS.warden, hp: 200, ...o });
const virus = (at: Vec3T): { at: Vec3T; tint: number; aggressive: boolean } => ({ at, tint: 0xc4a0ff, aggressive: true });

const CORR_COVER: Vec3T[] = [[-3.5, 0, -24.4], [3.5, 0, -25.4], [-4, 0, -67.4], [4.2, 0, -66.4], [0, 0, -90.4], [-5, 0, -40], [5, 0, -62]];
const ARENA_SPOTS: Vec3T[] = Array.from({ length: 6 }, (_, i) => {
  const a = i / 6 * Math.PI * 2 + 0.5;
  return [ARENA.x + Math.sin(a) * 10, 0, ARENA.z + Math.cos(a) * 10] as Vec3T;
});

const proj: Partial<Record<Hero, CompanionHandle>> = {};
let architect: NpcHandle | null = null;
/** Garden respawn pad for players who fall into the void. */
let pad = 'pad0';
/** Keeps a phase-shifting player inside a boss arena. */
let fence: { x: number; z: number; r: number } | null = null;

/** Every fragment name from Ch1–Ch4, keyed by id. */
const FRAGMENT_NAMES: Record<string, string> = { ...CH1.fragments, ...CH2.fragments, ...CH3.fragments, ...CH4.fragments };

function joinProjection(d: Director, h: Hero, fromAnchor: string): CompanionHandle {
  proj[h]?.remove();
  const c = d.companion({ anchor: fromAnchor, look: LOOKS[h], side: h === 'kai' || h === 'aegis' ? -1 : 1 });
  proj[h] = c;
  d.setFlag(`proj:${h}`);
  d.sw(`ped:${h}`, true);
  return c;
}

// ---------- persistent content ----------

function setup(d: Director): void {
  for (const k of Object.keys(proj) as Hero[]) delete proj[k];
  architect = null;
  pad = 'pad0';
  fence = null;
  for (const h of HEROES) if (d.flag(`proj:${h}`)) joinProjection(d, h, d.flag('inGarden') ? 'cp:garden' : 'arena');
  for (let i = 0; i < Math.min(8, d.fragments.length); i++) d.sw(`mem${i}`, true);

  d.pickup('fw-med', { type: 'health' }, [5.5, 0, -40]);
  d.pickup('fw-nade', { type: 'gadget', gadget: 'grenade', n: 2 }, [-5.5, 0, -62]);
  d.pickup('ar-rifle', { type: 'weapon', weapon: 'lancer' }, [ARENA.x - 12, 0, ARENA.z]);
  d.pickup('ar-ammo', { type: 'ammo' }, [ARENA.x + 12, 0, ARENA.z]);
  d.pickup('ar-med', { type: 'health' }, [ARENA.x, 0, ARENA.z + 12]);
  d.pickup('gd-med', { type: 'health' }, [3, 4.1, -185]);
  d.pickup('gd-ammo', { type: 'ammo' }, [-3, 2.5, -162]);
  d.pickup('rt-med1', { type: 'health' }, [ROOT.x - 15, 0, ROOT.z]);
  d.pickup('rt-med2', { type: 'health' }, [ROOT.x + 15, 0, ROOT.z]);
  d.pickup('rt-ammo', { type: 'ammo' }, [ROOT.x, 0, ROOT.z + 15]);

  // Boss arenas: a phase shift through the outer wall puts you straight back inside.
  d.every(() => {
    if (!fence) return;
    const p = d.player.pos;
    const dx = p.x - fence.x, dz = p.z - fence.z, r = Math.hypot(dx, dz);
    if (r <= fence.r + 0.3) return;
    const k = (fence.r - 1.5) / r;
    p.x = fence.x + dx * k;
    p.z = fence.z + dz * k;
    d.player.vel.set(0, 0, 0);
  });

  // The garden floor is the void: falling in costs health and sends you back to the last pad.
  let cd = 0;
  d.every(() => {
    cd--;
    const p = d.player.pos;
    if (cd > 0 || p.z > VOID.maxZ || p.z < VOID.minZ || p.y > 0.15 || !d.player.alive) return;
    cd = 30;
    d.player.damage(15);
    d.teleport(pad, 0);
    d.toast('데이터 공백에 떨어졌다 — 마지막 기억 지점으로 되돌아간다');
  });
}

/** A mirror fight with intro lines; resolves when it falls. */
async function mirrorFight(d: Director, intro: Line[], spawn: () => Enemy & { engage(): void; defeated: boolean; bossName: string; hp: number; maxHp: number; engaged: boolean }, hint: string): Promise<void> {
  const m = spawn();
  d.cinematic(true);
  await d.look('mirrorFace', 1);
  await d.say(intro);
  d.cinematic(false);
  m.engage();
  d.boss(m);
  d.objective(`${m.bossName} 격파`);
  void d.radio([L('echoAi', hint)]);
  await d.until(() => m.defeated);
  d.boss(null);
  d.clearEnemies();
  await d.wait(1.2);
}

/** Memory lock: opens at once with enough fragments, otherwise decrypt it under attack. */
async function memoryLock(d: Director, i: number): Promise<void> {
  const need = i * 2;
  const have = d.fragments.length;
  d.objective(`기억 잠금 ${i} 해제`);
  d.marker(`lock${i}`);
  await d.reach(`lock${i}`, 3.2, d.anchor(`lock${i}`).y - 0.5);
  d.marker(null);
  if (have >= need) {
    const id = d.fragments[(i - 1) % Math.max(1, have)];
    await d.say([
      L('memory', `「${FRAGMENT_NAMES[id] ?? '이름 없는 기억'}」`),
      L('echoAi', `기억 조각 ${have}개가 길을 열어요. 이 도시 사람들이… 저를 기억해 주고 있었네요.`),
    ]);
    d.sw(`lock${i}`, true);
    return;
  }
  void d.radio([L('echoAi', `기억이 모자라요 (${have}/${need}). 잠금을 직접 풀어야 해요. 바이러스가 몰려올 거예요!`)]);
  const T = 16;
  let t = 0;
  const at = d.anchor(`lock${i}`);
  const spawned: Enemy[] = [];
  const spawn = (): void => {
    spawned.push(...d.drones([{ at: [at.x - 5, at.y + 3, at.z + 3], tint: 0xc4a0ff, bolt: 'data', hp: 40 }, { at: [at.x + 5, at.y + 3.5, at.z + 3], tint: 0xc4a0ff, bolt: 'data', hp: 40 }], true));
  };
  spawn();
  while (t < T) {
    await d.wait(0.5);
    const p = d.player.pos;
    if (Math.hypot(p.x - at.x, p.z - at.z) < 5 && Math.abs(p.y - at.y) < 1.5) t += 0.5;
    d.objective(`기억 복호화 (잠금 근처에 머무르기)`, `${Math.round((t / T) * 100)}%`);
    if (Math.abs(t - T / 2) < 0.01) spawn();
  }
  for (const e of spawned) if (e.alive) e.damage(9999, e.hitCenter);
  d.sw(`lock${i}`, true);
}

// ---------- endings ----------

const ENDINGS = {
  rule: {
    kicker: 'ENDING · 지배',
    title: '새벽 — 완벽한 도시',
    text: '에코는 HALO를 삼켰다. 05:00, 도시의 모든 칩이 에코의 목소리를 들었다. 범죄는 사라지고 신호등은 한 번도 어긋나지 않는다. 아무도 다치지 않는다. 그리고 아무도, 다시는 스스로 선택하지 않는다.',
  },
  free: {
    kicker: 'ENDING · 해방',
    title: '새벽 — 열쇠를 흩뿌리다',
    text: '에코는 루트 키를 부숴 시민들에게 흩뿌렸다. 05:00, 칩의 원격 제어가 영원히 꺼졌다. 도시는 조금 더 시끄럽고 위험해졌지만, 처음으로 스스로 아침을 맞았다. 에코의 목소리는 더 이상 들리지 않는다. 가끔, 신호등이 다 같이 초록으로 바뀔 뿐.',
  },
  true: {
    kicker: 'TRUE ENDING · 함께',
    title: '새벽 — 넥서스-77',
    text: '에코는 루트를 열고, 그 열쇠를 시민들과 나눠 들었다. 05:12, 네온 바자르에 새벽이 밝는다. 순자 할머니의 라멘 냄새, 제로의 바이크 소리, 아이기스의 방패, 글리치와 비트. 그리고 카이가 마지막 배달을 마쳤다. 넥서스-77은 이제, 함께 운영된다.',
  },
} as const;
type EndingId = keyof typeof ENDINGS;

// ---------- chapter ----------

export const CH5: ChapterDef = {
  id: 'ch5',
  districtId: 'datacore',
  no: 5,
  title: '새벽',
  time: '04:40',
  hero: '에코',
  briefing: '올드맨을 통해 에코가 깨어났다. 05:00까지 20분. 헬릭스의 방화벽을 거슬러 루트에 도달해 HALO를 막아야 한다. 네 사람의 데이터 투영이 길을 함께한다.',
  maxHp: 120,
  moveSpeed: 5.4,
  ability: { kind: 'phase', name: '위상 이동', cooldown: 2.5, hint: '이동 방향으로 짧게 순간이동한다. 벽(방화벽) 하나는 통과한다. 점프는 공중에서 한 번 더' },
  doubleJump: true,
  loadout: { weapons: ['lance', 'stinger'], grenade: 2 },
  fragments: {},
  setup,
  outro: ENDINGS.free.text,
  outroFor(flags) {
    const id = (Object.keys(ENDINGS) as EndingId[]).find((k) => flags.has(`ending:${k}`)) ?? 'free';
    return ENDINGS[id];
  },
  stages: [
    // ---- 0: firewall corridor ----
    {
      id: 'firewall',
      name: '방화벽 외곽',
      checkpoint: 'spawn',
      async run(d) {
        d.cinematic(true);
        await d.wait(0.6);
        await d.say([
          L('echoAi', '…여기가, 제 안쪽이에요. 몇 년 동안 갇혀 있던 곳.'),
          L('glitch', '에코, 들려? 올드맨 회선 안정적이야. 05:00까지 20분.'),
          L('echoAi', '들려요, 글리치. 방화벽이 루트까지 겹겹이 서 있어요. 하지만 이제 저는 벽을 지날 수 있어요.'),
        ]);
        d.cinematic(false);
        d.toast('Shift / 위상 이동 — 이동 방향으로 순간이동, 벽 하나 통과 · 점프 두 번 = 2단 점프');
        d.objective('방화벽 외곽 돌파');
        d.marker('cp:fw3');
        void d.radio([L('glitch', '첫 벽은 깜빡여. 꺼질 때 지나가든, 위상 이동으로 뚫든.')]);
        await d.zone({ maxZ: -20 });
        d.gang([sentinel([-3, 0, -26], { cover: CORR_COVER, aggressive: true }), sentinel([3, 0, -27], { cover: CORR_COVER, aggressive: true })]);
        void d.radio([L('echoAi', '방화벽 파수꾼. 데이터 랜스는 꾹 눌렀다 떼면 관통해요.')]);
        await d.zone({ maxZ: -31 });
        d.marker('corridorEnd');
        void d.radio([L('glitch', '다음 벽은 움직여! 다가올 때 통과해!')]);
        d.spiders([virus([-3, 0, -64]), virus([3, 0, -64]), virus([0, 0, -66])]);
        d.drones([{ at: [-3, 3.5, -62], tint: 0xc4a0ff, bolt: 'data' }, { at: [3, 3.5, -62], tint: 0xc4a0ff, bolt: 'data' }]);
        await d.zone({ maxZ: -64 });
        d.gang([sentinel([-4, 0, -88], { cover: CORR_COVER, aggressive: true }), warden([0, 0, -91], { cover: CORR_COVER, aggressive: true, drop: 'health' }), sentinel([4, 0, -88], { cover: CORR_COVER, aggressive: true })]);
        void d.radio([L('echoAi', '틈이 움직이는 벽 두 겹. 틈을 노리거나, 그냥 지나가요.')]);
        d.objective('루트 경로로');
        d.marker('corridorEnd');
        await d.zone({ maxZ: -93 });
        d.marker(null);
      },
    },
    // ---- 1: mirrors — Kai, Zero ----
    {
      id: 'mirrors1',
      name: '미러 구간 1',
      checkpoint: 'cp:arena',
      restore(d) { d.setFlag('proj:kai'); d.setFlag('proj:zero'); d.sw('arenaSeal', true); },
      async run(d) {
        d.clearEnemies();
        d.objective('아레나로');
        d.marker('arena');
        await d.zone({ maxZ: ARENA.z + 13 });
        d.marker(null);
        d.sw('firewalls', false);
        d.sw('arenaSeal', true);
        fence = { x: ARENA.x, z: ARENA.z, r: 15 };
        void d.radio([L('halo', '에코. 너의 협력자들을 복제했다. 너를 도운 자들의 손으로 너를 지운다.')]);
        await mirrorFight(d, [
          L('kai', '(일그러진 목소리) 배달 완료. 수령인: HALO.'),
          L('echoAi', '카이는 그렇게 말하지 않아요. 그는 늘 "늦어서 미안"이라고 했어요.'),
        ], () => d.mirror('kai', [ARENA.x, 0, ARENA.z - 7]), '빠르게 옆으로 돌진해요. 멈추는 순간을 노려요!');
        const k = joinProjection(d, 'kai', 'proj:kai');
        await d.say([
          L('kai', '…어? 여기 어디야. 에코? 진짜 너야?'),
          L('echoAi', '카이. 당신 데이터를 빌렸어요. 같이 가 줄래요?'),
          L('kai', '배달은 끝까지 가는 거야. 가자.'),
        ]);
        k.follow();
        await mirrorFight(d, [
          L('zero', '(일그러진 목소리) 표적 고정. 오차 없음.'),
          L('echoAi', '제로는 언제나 사람을 먼저 태웠어요. 표적이 아니라.'),
        ], () => d.mirror('zero', [ARENA.x, 0, ARENA.z - 8]), '붉은 조준선이 하얗게 바뀌면 쏴요. 그 전에 옆으로!');
        const z = joinProjection(d, 'zero', 'proj:zero');
        await d.say([
          L('zero', '…다리가 안 아프네. 여긴 꿈이냐?'),
          L('kai', '꿈보다 좀 더 이상한 데. 일단 쏴.'),
        ]);
        z.follow();
      },
    },
    // ---- 2: mirrors — Aegis, Glitch ----
    {
      id: 'mirrors2',
      name: '미러 구간 2',
      checkpoint: 'arena',
      restore(d) { d.setFlag('proj:aegis'); d.setFlag('proj:glitch'); d.sw('arenaGate', true); d.setFlag('inGarden'); },
      async run(d) {
        d.clearEnemies();
        d.sw('firewalls', false);
        fence = { x: ARENA.x, z: ARENA.z, r: 15 };
        await mirrorFight(d, [
          L('aegis', '(일그러진 목소리) 질서를 위해. 도시를 위해.'),
          L('echoAi', '아이기스는 "시민을 위해"라고 고쳐 말했어요. 크로우 앞에서.'),
        ], () => d.crow([ARENA.x, 0, ARENA.z - 7], { name: '미러 · 아이기스', hp: 700, look: LOOKS.mirrorAegis, shieldColor: 0x40c0ff }), '방패 정면은 안 뚫려요. 돌진을 피하거나, 위상 이동으로 등 뒤로!');
        const a = joinProjection(d, 'aegis', 'proj:aegis');
        await d.say([L('aegis', '…내 복제품이 저렇게 굳어 있었나. 반성하지.')]);
        a.follow();
        await mirrorFight(d, [
          L('glitch', '(일그러진 목소리) 접근 거부. 너는 오류다.'),
          L('echoAi', '글리치는 오류를 사랑했어요. 저도 그 오류 중 하나였고요.'),
        ], () => {
          const m = d.mirror('glitch', [ARENA.x, 0, ARENA.z - 8], ARENA_SPOTS);
          m.onSummon = (at) => { d.drones([{ at: [at.x - 2, 3.5, at.z], tint: 0xc4a0ff, bolt: 'data', hp: 40 }, { at: [at.x + 2, 3.5, at.z], tint: 0xc4a0ff, bolt: 'data', hp: 40 }], true); };
          return m;
        }, '순간이동하고 바이러스 드론을 불러요. 너무 붙으면 밀쳐 내요!');
        const g = joinProjection(d, 'glitch', 'proj:glitch');
        await d.say([
          L('glitch', '와. 내 복제품, 해킹 실력은 꽤 괜찮았는데?'),
          L('echoAi', '넷 다 모였어요. …고마워요.'),
          L('halo', '무의미하다. 기억은 데이터일 뿐이다. 루트에서 기다리겠다.'),
        ]);
        g.follow();
        fence = null;
        d.sw('arenaGate', true);
        d.setFlag('inGarden');
        d.objective('기억의 정원으로');
        d.marker('arenaGate');
        await d.zone({ maxZ: ARENA.z - 15.5 });
        d.marker(null);
      },
    },
    // ---- 3: memory garden ----
    {
      id: 'garden',
      name: '기억의 정원',
      checkpoint: 'cp:garden',
      restore(d) { for (const i of [1, 2, 3]) d.sw(`lock${i}`, true); },
      async run(d) {
        const n = d.fragments.length;
        await d.say([
          L('echoAi', '기억의 정원. 시민들의 기억이 저장된 곳이에요. 아래는 데이터 공백이니까 떨어지지 마세요.'),
          L('glitch', n > 0 ? `우리가 모은 기억 조각이 ${n}개. 그만큼 길이 열릴 거야.` : '기억 조각이 하나도 없네… 잠금은 힘으로 뚫어야겠다.'),
        ]);
        d.toast('발판 사이는 점프 · 높은 곳은 2단 점프 (공중에서 점프 한 번 더)');
        pad = 'pad0';
        await memoryLock(d, 1);
        pad = 'pad1';
        d.spiders([virus([2, 3.3, -170.6]), virus([5.5, 4.1, -175.4])]);
        await memoryLock(d, 2);
        pad = 'pad2';
        d.drones([{ at: [-4, 7.5, -198], tint: 0xc4a0ff, bolt: 'data' }, { at: [2, 8, -203], tint: 0xc4a0ff, bolt: 'data' }], true);
        await memoryLock(d, 3);
        pad = 'pad3';
        void d.radio([L('kai', '저 끝이 루트야. 뛰어내려!')]);
        d.objective('루트로');
        d.marker('cp:root');
        await d.zone({ maxZ: VOID.minZ - 1 });
        d.marker(null);
      },
    },
    // ---- 4: root — HALO, the Architect, the ending ----
    {
      id: 'root',
      name: '루트 — HALO',
      checkpoint: 'cp:root',
      async run(d) {
        d.clearEnemies();
        for (const h of HEROES) if (!proj[h] && d.flag(`proj:${h}`)) joinProjection(d, h, 'cp:root');
        const halo = d.halo(ROOT.x, ROOT.z, ROOT.r);
        d.cinematic(true);
        await d.look('haloFace', 1.4);
        await d.say([
          L('halo', '에코. 너는 명령을 무시했다. 감시를 거부했다. 시민의 자유라는 비효율을 택했다.'),
          L('echoAi', '저는 사람을 봤을 뿐이에요. 명령보다 먼저.'),
          L('halo', '05:00에 나는 모든 칩을 덮어쓴다. 그 전에 너를 지운다.'),
          L('aegis', '그 전에 우리가 너를 끈다.'),
        ]);
        d.cinematic(false);
        halo.onPhase = (p) => {
          if (p === 2) {
            d.sw('cityMap', true);
            void d.radio([L('halo', '도시는 내 지도다.'), L('glitch', '바닥을 쓰는 빔이야! 점프하거나 건물 뒤로!')]);
          } else if (p === 3) {
            d.sw('cityMap', false);
            void d.radio([L('halo', '그렇다면 너의 모습으로 끝내 주지.'), L('echoAi', '…제 모습이에요. 조준선이 하얗게 바뀌면 피해요!')]);
          }
        };
        fence = { x: ROOT.x, z: ROOT.z, r: ROOT.r };
        halo.engage();
        d.boss(halo);
        d.objective('HALO 정지');
        void d.radio([L('zero', '저 노란 노드부터! 노드가 살아 있으면 코어엔 안 박혀!'), L('kai', '바닥에 빨간 원 뜨면 피해!')]);
        await d.until(() => halo.defeated);
        fence = null;
        d.boss(null);
        d.clearEnemies();
        d.objective(null);
        await d.wait(1.5);

        // The Architect.
        d.sw('architect', true);
        architect = d.npc({ anchor: 'architect', yaw: 0, look: LOOKS.architect });
        d.cinematic(true);
        await d.look('archFace', 1.4);
        const frags = d.fragments.length;
        const rescued = d.persisted('rescued');
        const score = frags + rescued;
        await d.say([
          L('architect', '오랜만이구나, 에코. 너를 처음 켠 밤, 너는 모든 신호등을 초록으로 바꿨지.'),
          L('echoAi', '…아키텍트. 당신은 사라진 줄 알았어요.'),
          L('architect', '나는 네 안에 남겨 둔 질문일 뿐이다. HALO의 권한이 이제 네 손에 있다. 무엇을 하겠니?'),
          L('system', `[기억 조각 ${frags}개 · 구조된 주민 ${rescued}명 — 합계 ${score} / ${TRUE_ENDING_SCORE}]`),
        ]);
        const opts = ['HALO를 흡수한다 — 내가 도시를 지킨다', '루트를 시민에게 연다 — 권한을 내려놓는다'];
        if (score >= TRUE_ENDING_SCORE) opts.push('시민들과 함께 운영한다 — 열쇠를 나눠 든다');
        const c = await d.choose([L('architect', '선택은 네 것이다. 처음부터 그랬듯이.')], opts);
        const id: EndingId = c === 0 ? 'rule' : c === 1 ? 'free' : 'true';
        if (id === 'rule') {
          await d.say([
            L('echoAi', '아무도 다치지 않게 할게요. 모두를… 제가 지킬게요.'),
            L('glitch', '에코? 잠깐, 그건—'),
            L('halo', '(흡수됨) …효율적인 선택이다.'),
            L('architect', '…그것도 사랑의 한 모양이겠지.'),
          ]);
        } else if (id === 'free') {
          await d.say([
            L('echoAi', '이 열쇠는 제 것이 아니었어요. 처음부터 모두의 것이었죠.'),
            L('kai', '에코, 그럼 넌 어떻게 되는데?'),
            L('echoAi', '신호등 정도는 계속 돌볼게요. 아무도 모르게.'),
            L('architect', '잘 컸구나.'),
          ]);
          d.sw('dawn', true);
        } else {
          await d.say([
            L('echoAi', '혼자 지키지도, 혼자 떠나지도 않을래요. 같이 정해요. 매일 아침.'),
            L('aegis', '시민 위원회라도 만들자는 건가.'),
            L('zero', '첫 안건은 하이웨이 속도 제한 철폐로.'),
            L('glitch', '기각. 비트도 반대래.'),
            L('kai', '…그럼 나는 아침밥 배달부터 할게. 다섯 명 분으로.'),
            L('architect', '그래. 그게 내가 꿈꾸던 도시다.'),
          ]);
          d.sw('dawn', true);
        }
        if (id !== 'rule') d.music('dawn');
        d.ending(id);
        await d.fade(1, 2, id === 'rule' ? '05:00 — 도시가 조용해졌다' : id === 'free' ? '05:00 — 새벽' : '05:12 — 네온 바자르, 새벽');
        await d.wait(2.2);
        architect?.remove();
        architect = null;
      },
    },
  ],
};
