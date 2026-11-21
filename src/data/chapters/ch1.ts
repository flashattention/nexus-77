/**
 * CH1 「배달」 — 네온 바자르 · 23:40 · 카이
 * docs/GAME_DESIGN.md §3. Map anchors/switches live in src/scenes/bazaarPlay.ts.
 */
import type { ChapterDef, Vec3T } from './types';
import type { Director, NpcHandle } from '../../game/story/Director';
import type { FigureLook } from '../../game/actors/Figure';
import type { Line, SpeakerId } from '../speakers';

const L = (who: SpeakerId, text: string): Line => ({ who, text });

const LOOKS: Record<string, FigureLook> = {
  sunja: { body: 0x6a2a44, legs: 0x2a2430, skin: 0xd9a888, accent: 0xffb347 },
  tak: { body: 0x4a3420, legs: 0x241c18, skin: 0xc99474, accent: 0xff8a2b, bulk: 1.15 },
  mos: { body: 0x2a1f3a, legs: 0x18141f, skin: 0xb98a6a, accent: 0xb36bff, hood: true },
  deokbae: { body: 0x3a3a1a, legs: 0x22220f, skin: 0xd0a080, accent: 0xffd36b, bulk: 1.2 },
  zero: { body: 0xd8dde8, legs: 0x1a1e2c, skin: 0x8a6a5a, accent: 0xff3b5c },
};

/** NPC handles for the current session (setup() runs once per session). */
const npc: Partial<Record<'sunja' | 'tak' | 'mos' | 'deokbae' | 'zero', NpcHandle>> = {};

// ---------- encounter data ----------

const AMBUSH_COVER: Vec3T[] = [
  [-1.3, 0, -16.5], [2.6, 0, -19.8], [3.5, 0, -18.8], [-2.3, 0, -23.6], [0.6, 0, -26.9],
  [1.6, 0, -27.3], [4.3, 0, -14.3], [-3, 0, -12.2], [-3, 0, -8.2], [4.3, 0, -10.2],
];
const MARKET_COVER_1: Vec3T[] = [[-5.5, 0, -36.6], [-2.5, 0, -42.2], [-6.6, 0, -45], [-10.6, 0, -48.6], [-4.4, 0, -47.5], [-10, 0, -38]];
const MARKET_COVER_2: Vec3T[] = [[3.5, 0, -39.8], [6.6, 0, -45], [3.5, 0, -48.8], [10.4, 0, -42], [6.6, 0, -37], [9.2, 0, -51]];
const MARKET_COVER_3: Vec3T[] = [[-2.5, 0, -51.2], [-3.5, 0, -57.3], [-6.6, 0, -53], [-0.5, 0, -60.2], [-6.6, 0, -60], [-10.4, 0, -55]];
const VIPER_SPOTS: Vec3T[] = [[-8, 5, -70], [6, 5, -71], [-4, 5, -79], [8.5, 5, -83], [-9, 5, -89], [2, 5, -91], [0, 5, -86], [-3, 5, -73]];

// ---------- persistent content (side missions, NPCs, pickups) ----------

function setup(d: Director): void {
  npc.sunja = d.npc({ anchor: 'sunja', yaw: -Math.PI / 2, look: LOOKS.sunja });
  if (d.flag('gotPackage')) sunjaAfter(d);
  npc.zero = d.npc({ anchor: 'zero', yaw: Math.PI, look: LOOKS.zero });

  // Pickups placed around the map (stay collected across checkpoints).
  d.pickup('alley-ammo', { type: 'ammo' }, [-2.4, 0, -19]);
  d.pickup('alley-med', { type: 'health' }, [4.4, 0, -26]);
  d.pickup('stash-shotgun', { type: 'weapon', weapon: 'shredder' }, 'stash');
  d.pickup('market-nade', { type: 'gadget', gadget: 'grenade', n: 2 }, [5.6, 0.9, -33]);
  d.pickup('market-ammo1', { type: 'ammo' }, [-0.6, 0, -55]);
  d.pickup('market-med', { type: 'health' }, [10.4, 0, -38.5]);
  d.pickup('market-ammo2', { type: 'ammo' }, [-10.6, 1, -50]);
  d.pickup('roof-med', { type: 'health' }, [-10.4, 5, -71]);
  d.pickup('roof-ammo', { type: 'ammo' }, [10.3, 5, -90]);
  d.pickup('roof-nade', { type: 'gadget', gadget: 'grenade', n: 1 }, [-3, 5, -96]);

  setupTak(d);
  setupMos(d);
}

function sunjaAfter(d: Director): void {
  npc.sunja?.onTalk(() => d.say([L('sunja', '조심해서 가거라. 국물은 식어도 약속은 식으면 안 되는 거야.')]));
}

/** Side mission 1: recover 탁 사장's three stolen crates (reward: grenades + memory fragment). */
function setupTak(d: Director): void {
  const tak = npc.tak = d.npc({ anchor: 'tak', yaw: -Math.PI / 2, look: LOOKS.tak });
  const spawnLoot = (): void => {
    d.pickup('loot1', { type: 'item', item: 'goods' }, 'loot1');
    d.pickup('loot2', { type: 'item', item: 'goods' }, 'loot2');
    d.pickup('loot3', { type: 'item', item: 'goods' }, 'loot3');
  };
  const refresh = (): void => {
    if (d.flag('frag:tak')) {
      d.side('tak', null);
      tak.onTalk(() => d.say([L('tak', '덕분에 오늘 장사는 하겠어. 고마워, 배달부.')]));
      return;
    }
    if (!d.flag('tak:accepted')) {
      tak.onTalk(async () => {
        const c = await d.choose([
          L('tak', '이봐, 배달부! 정전 틈에 레드랜턴 놈들이 내 물건 상자를 셋이나 털어 갔어.'),
          L('tak', '시장 안 어딘가에 숨겨 뒀을 거야. 찾아 주면 섭섭지 않게 챙겨 주지.'),
        ], ['찾아볼게요', '지금은 바빠요']);
        if (c === 0) { d.setFlag('tak:accepted'); spawnLoot(); refresh(); }
      });
      return;
    }
    tak.onTalk(async () => {
      const n = d.item('goods');
      if (n < 3) { await d.say([L('tak', `아직 ${3 - n}개 남았어. 노점 뒤쪽이랑 계단 근처를 봐.`)]); return; }
      d.removeItem('goods', 3);
      await d.say([
        L('tak', '내 상자! 이 시장에서 이십 년을 버텼는데, 이런 밤은 처음이야.'),
        L('tak', '이거 받아. 장사하다 주운 건데, 너한테 더 쓸모 있겠지.'),
        L('tak', '…처음 노점 열던 날도 비가 왔지. 그날 첫 손님이 꼭 너 같은 배달부였어.'),
      ]);
      d.giveGadget('grenade', 2);
      d.fragment('tak');
      refresh();
    });
  };
  if (d.flag('tak:accepted') && !d.flag('frag:tak')) spawnLoot();
  d.every(() => {
    if (d.flag('tak:accepted') && !d.flag('frag:tak')) {
      const n = d.item('goods');
      d.side('tak', n >= 3 ? '탁 사장에게 물건 돌려주기' : '탁 사장의 물건 되찾기', n >= 3 ? undefined : `${n}/3`);
    }
  });
  refresh();
}

/** Side mission 2: collect 모스's debt from 덕배 (reward: ally drone + Viper intel + memory fragment). */
function setupMos(d: Director): void {
  const mos = npc.mos = d.npc({ anchor: 'mos', yaw: Math.PI / 2, look: LOOKS.mos });
  const deok = npc.deokbae = d.npc({ anchor: 'deokbae', yaw: Math.PI / 2, look: LOOKS.deokbae });
  const refresh = (): void => {
    if (d.flag('frag:mos')) {
      d.side('mos', null);
      mos.onTalk(() => d.say([L('mos', '바이퍼를 만나면 비를 봐. 빗물은 거짓말을 안 하거든.')]));
      deok.onTalk(() => d.say([L('deokbae', '이제 됐지? 정전 끝나면 장사나 하게 해 줘.')]));
      return;
    }
    if (!d.flag('mos:accepted')) {
      d.side('mos', null);
      mos.onTalk(async () => {
        const c = await d.choose([
          L('mos', '배달부. 정보 하나 살래? …아니, 일 하나 하자.'),
          L('mos', '안쪽 노점의 덕배가 내 돈을 떼먹었어. 받아 오면 네 뒤를 쫓는 사냥꾼 얘기를 해 주지.'),
        ], ['받아 올게', '관심 없어']);
        if (c === 0) { d.setFlag('mos:accepted'); refresh(); }
      });
      deok.onTalk(() => d.say([L('deokbae', '정전이라 장사도 못 해. 저리 가.')]));
      return;
    }
    if (d.item('chip') === 0 && !d.flag('mos:collected')) {
      d.side('mos', '덕배에게서 빚 받기');
      mos.onTalk(() => d.say([L('mos', '덕배는 시장 안쪽, 구석 노점 뒤에 숨어 있을 거야.')]));
      deok.onTalk(async () => {
        const c = await d.choose([
          L('deokbae', '뭐? 모스가 보냈어? 지금 정전이라 한 푼도 못 벌었다고!'),
        ], ['좋게 말할 때 내놔', '사정 봐줄게. 절반만 줘']);
        if (c === 0) await d.say([L('kai', '모스는 나보다 성격이 안 좋아. 알지?'), L('deokbae', '…알았어, 알았다고. 가져가.')]);
        else { d.setFlag('mos:half'); await d.say([L('deokbae', '진짜? …고맙다. 나머지는 장사 재개하면 꼭 갚을게.')]); }
        d.setFlag('mos:collected');
        d.addItem('chip');
        refresh();
      });
      return;
    }
    d.side('mos', '모스에게 신용칩 전달');
    deok.onTalk(() => d.say([L('deokbae', '모스한테 안부 전해. …아니, 전하지 마.')]));
    mos.onTalk(async () => {
      d.removeItem('chip');
      await d.say([
        L('mos', d.flag('mos:half') ? '절반? …뭐, 덕배 놈 사정도 알긴 하지. 이번만이다.' : '깔끔하네. 마음에 들어.'),
        L('mos', '약속대로. 너를 쫓는 건 바이퍼야. 광학 위장을 쓰는 현상금 사냥꾼.'),
        L('mos', '비 오는 밤엔 위장막에 빗방울이 튀어. 그리고 한 방 맞으면 잠깐 위장이 풀리지.'),
        L('mos', '덤으로 이것도 가져가. 헬릭스 호위 드론인데, 내가 쓰기엔 너무 눈에 띄거든.'),
        L('mos', '…정전 전엔 이 시장도 밤새 불이 꺼지지 않았어. 그때가 그립네.'),
      ]);
      d.giveGadget('drone', 1);
      d.fragment('mos');
      refresh();
    });
  };
  refresh();
}

// ---------- chapter ----------

export const CH1: ChapterDef = {
  id: 'ch1',
  districtId: 'bazaar',
  no: 1,
  title: '배달',
  time: '23:40',
  hero: '카이',
  briefing: '익명의 의뢰: 라멘 노점에 맡겨 둔 소포를 받아 스카이레인 진입로의 제로에게 전달할 것. 헬릭스가 시장 골목을 봉쇄했다.',
  maxHp: 100,
  moveSpeed: 5.4,
  ability: { kind: 'dash', name: '대시', cooldown: 3, hint: '짧게 돌진한다. 돌진하는 동안 무적' },
  loadout: { weapons: ['stinger', 'needle'] },
  fragments: { tak: '탁 사장의 기억 — 첫 노점을 연 날', mos: '모스의 기억 — 불이 꺼지지 않던 시장' },
  setup,
  outro: '소포는 제로의 호버바이크에 실려 스카이레인 9로 향했다. 카이는 헬릭스 보안국에 끌려갔다. 다음: CH2 「추격」 — 제로',
  stages: [
    // ---- 0: pick up the package + training ----
    {
      id: 'pickup',
      name: '배달 접수',
      checkpoint: 'spawn',
      async run(d) {
        d.objective('라멘 노점의 순자 할머니 만나기');
        d.marker('sunja');
        void d.radio([
          L('glitch', '카이, 들려? 의뢰인이 라멘 노점에 소포를 맡겨 뒀대.'),
          L('glitch', '헬릭스가 골목을 막아 놨으니까, 조용히 받아서 빠지자.'),
        ]);
        await d.talkTo(npc.sunja!);
        await d.say([
          L('sunja', '왔구나, 카이. 비 맞고 다니면 감기 든다.'),
          L('sunja', '이거, 웬 아가씨 목소리가 너한테만 주라더라. 무겁지도 않은데 이상하게 손이 떨려.'),
          L('kai', '고마워요, 할머니. 라멘은 다음에 꼭 먹으러 올게요.'),
          L('echo', '…이 소포를 새벽 다섯 시 전에 데이터 코어로. 늦으면, 이 도시는 깨어나지 못해요.'),
          L('kai', '방금… 소포가 말한 거야?'),
        ]);
        d.addItem('package');
        d.setFlag('gotPackage');
        sunjaAfter(d);

        d.marker(null);
        d.objective('사격 연습: 깡통 드론', '0/3');
        void d.radio([
          L('glitch', '…뭐야 그 목소리. 일단 손부터 풀자. 옛날 연습용 깡통 드론 세 대 띄웠어.'),
          L('glitch', '1·2번으로 무기 교체, Shift로 대시. 터치면 아래 핫바를 눌러.'),
        ]);
        const cans = d.drones([
          { at: [-0.6, 1.9, -10], dummy: true },
          { at: [2.4, 2.4, -12], dummy: true },
          { at: [0.6, 1.6, -14.4], dummy: true },
        ]);
        await d.allDown(cans, (n, t) => d.objective('사격 연습: 깡통 드론', `${n}/${t}`));
        await d.wait(0.8);
      },
    },
    // ---- 1: Red Lantern ambush, then hold while Glitch hacks the shutter ----
    {
      id: 'ambush',
      name: '레드랜턴 매복',
      checkpoint: 'cp:ambush',
      restore(d) { d.sw('shutter'); },
      async run(d) {
        void d.radio([L('glitch', '잠깐, 레드랜턴 무전이 잡혀. 매복이야! 엄폐물 끼고 싸워!')]);
        await d.wait(1);
        const gang = d.gang([
          { at: [-2, 0, -29], kind: 'pistol', cover: AMBUSH_COVER, aggressive: true, yaw: Math.PI },
          { at: [3, 0, -29.5], kind: 'pistol', cover: AMBUSH_COVER, aggressive: true, yaw: Math.PI },
          { at: [-3.6, 0, -21], kind: 'brawler', aggressive: true, yaw: Math.PI, drop: 'health' },
          { at: [4.6, 0, -23], kind: 'brawler', aggressive: true, yaw: Math.PI },
        ]);
        const drones = d.drones([{ at: [0.5, 4.5, -24], alarm: true }], true);
        void d.radio([L('glitch', '주황색 고리 드론은 경보기야. 오래 두면 증원을 불러!')]);
        await d.allDown([...gang, ...drones], (n, t) => d.objective('레드랜턴 매복 제압', `${n}/${t}`));

        void d.radio([L('glitch', '정리됐네. 셔터 해킹 들어간다. 20초만 버텨!')]);
        d.drones([{ at: [-1, 5.4, -29] }, { at: [2, 5.4, -29] }], true);
        for (let s = 20; s > 0; s--) {
          d.objective('셔터 해킹 중 — 버티기', `${s}초`);
          await d.wait(1);
        }
        d.sw('shutter');
        void d.radio([L('glitch', '열렸다! 시장 안으로 들어가.')]);
        d.objective('정전된 시장으로 들어가기');
        d.marker('marketIn');
        await d.zone({ maxZ: -32.5 });
        d.marker(null);
      },
    },
    // ---- 2: blackout market — restore three breakers (one needs a fuse) ----
    {
      id: 'market',
      name: '정전 시장',
      checkpoint: 'cp:market',
      restore(d) {
        for (const n of [1, 2, 3]) { d.sw(`breaker${n}`); d.sw(`power${n}`); }
        d.sw('gate');
      },
      async run(d) {
        void d.radio([
          L('glitch', '시장 전체가 정전이야. 배전함 세 개를 살려야 옥상 비상계단 게이트가 열려.'),
          L('glitch', '레드랜턴 행동대장이 안쪽에 있어. 시장 사람들도 숨어 있으니까 말 걸어 봐.'),
        ]);
        d.gang([
          { at: [-6, 0, -42], kind: 'pistol', cover: MARKET_COVER_1 },
          { at: [-1, 0, -46], kind: 'pistol', cover: MARKET_COVER_1, yaw: Math.PI },
          { at: [-9.5, 0, -48], kind: 'brawler' },
          { at: [6, 0, -42.5], kind: 'pistol', cover: MARKET_COVER_2 },
          { at: [9.5, 0, -50], kind: 'brawler', yaw: Math.PI },
          { at: [-5, 0, -61], kind: 'heavy', cover: MARKET_COVER_3, drop: 'item:fuse' },
          { at: [-1, 0, -57], kind: 'pistol', cover: MARKET_COVER_3 },
        ]);
        d.drones([
          { at: [4, 3.5, -38], patrol: [[4, 3.5, -38], [4, 3.8, -54], [-1, 3.5, -54]] },
          { at: [-8, 3.5, -55], patrol: [[-8, 3.5, -55], [0, 3.8, -61], [-4, 3.5, -48]], alarm: true },
        ]);

        const fixed = new Set<number>();
        const update = (): void => d.objective('배전함 복구', `${fixed.size}/3`);
        update();
        // Marker: first breaker still down.
        const nearest = (): void => {
          const left = [1, 2, 3].filter((n) => !fixed.has(n));
          if (!left.length) { d.marker(null); return; }
          d.marker(`breaker${left[0]}`);
        };
        nearest();
        const restore = (n: number): void => {
          d.sw(`breaker${n}`);
          d.sw(`power${n}`);
          fixed.add(n);
          d.toast(`${n}구역 전력 복구`);
          update();
          nearest();
        };
        const b1 = async (): Promise<void> => { await d.use('breaker1', '배전함 복구', { hold: 1.5 }); restore(1); };
        const b3 = async (): Promise<void> => { await d.use('breaker3', '배전함 복구', { hold: 1.5 }); restore(3); };
        const b2 = async (): Promise<void> => {
          if (!d.item('fuse')) {
            await d.use('breaker2', '배전함 살펴보기');
            if (!d.item('fuse')) {
              await d.say([
                L('kai', '퓨즈가 타 버렸네.'),
                L('glitch', '행동대장이 예비 퓨즈를 챙겨 다닌대. 시장 안쪽, 덩치 큰 놈이야.'),
              ]);
              d.side('fuse', '예비 퓨즈 확보 — 레드랜턴 행동대장');
              await d.until(() => d.item('fuse') > 0);
              d.side('fuse', null);
              void d.radio([L('glitch', '퓨즈 챙겼지? 2번 배전함으로 가.')]);
            }
          }
          await d.use('breaker2', '퓨즈 끼우고 복구', { hold: 1.5 });
          d.removeItem('fuse');
          restore(2);
        };
        await Promise.all([b1(), b2(), b3()]);

        d.sw('gate');
        void d.radio([
          L('glitch', '전력 복구! 비상계단 게이트 열렸어. 옥상으로 올라가.'),
          L('glitch', '시장 사람들 부탁은 올라가기 전에 들어 줘. 옥상에선 내려올 틈이 없을 거야.'),
        ]);
        d.objective('비상계단으로 옥상에 올라가기');
        d.marker('roofTop');
        await d.zone({ maxZ: -64.2, minY: 4.5 });
        d.marker(null);
      },
    },
    // ---- 3: rooftop boss — Viper ----
    {
      id: 'viper',
      name: '옥상 — 바이퍼',
      checkpoint: 'cp:roof',
      async run(d) {
        d.pickup('roof-lancer', { type: 'weapon', weapon: 'lancer' }, 'roofCache');
        void d.radio([L('zero', '카이, 옥상 끝에서 기다린다. 계단 옆 가방에 랜서 하나 넣어 놨어. 써.')]);
        d.objective('옥상을 가로질러 제로에게');
        d.marker('zero');
        await d.zone({ maxZ: -73, minY: 4.5 });
        d.marker(null);

        const v = d.viper([0, 5, -85], VIPER_SPOTS);
        d.cinematic(true);
        await d.look('viperFace', 1);
        await d.say([
          L('viper', '배달부. 소포 두고 가면 다리는 남겨 줄게.'),
          L('kai', '배달은 끝까지가 원칙이라서.'),
          L('viper', '헬릭스가 그 소포에 얼마를 걸었는지 알면, 그런 말 못 할걸.'),
        ]);
        d.cinematic(false);
        v.onHalf = () => {
          void d.radio([L('viper', '귀찮게 하네. 얘들아, 놀아 줘.')]);
          d.drones([{ at: [-6, 9, -86] }, { at: [6, 9, -90] }], true);
        };
        v.engage();
        d.boss(v);
        d.objective('바이퍼 제압');
        void d.radio(d.flag('frag:mos')
          ? [L('kai', '모스 말대로라면… 빗방울이 튀는 곳. 한 방 맞히면 위장이 풀린다.')]
          : [L('glitch', '광학 위장이야! 빗방울이 튀는 곳을 봐! 붉은 레이저가 보이면 옆으로 피하고!')]);
        await d.until(() => v.defeated);
        d.boss(null);
        d.clearEnemies();
        await d.wait(0.6);
        d.cinematic(true);
        await d.look('viperFace', 0.8);
        await d.say([
          L('viper', '…쳇. 배달부 주제에.'),
          L('viper', '기억해 둬. 새벽이 오면, 그 소포 때문에 이 도시가 뒤집혀.'),
          L('kai', '그러니까 빨리 배달해야지.'),
        ]);
        v.despawn();
        d.toast('바이퍼가 위장막 속으로 사라졌다');
        d.cinematic(false);
      },
    },
    // ---- 4: hand-off to Zero, Helix arrives ----
    {
      id: 'handoff',
      name: '인계',
      checkpoint: 'cp:handoff',
      async run(d) {
        const zero = npc.zero!;
        d.objective('제로에게 소포 전달');
        d.marker('zero');
        await d.talkTo(zero, '소포 전달');
        d.marker(null);
        await d.say([
          L('zero', '늦었네, 카이.'),
          L('kai', '바이퍼랑 춤 좀 췄어. 자, 소포.'),
          L('zero', '…이게 그렇게 비싼 물건이야? 가볍기만 한데.'),
          L('kai', '열어 보진 마. 언더시티 입구, 글리치한테. 새벽 다섯 시 전에.'),
        ]);
        d.removeItem('package');
        d.objective(null);
        d.cinematic(true);
        d.sw('helix');
        d.drones([
          { at: [-4, 9, -88], prop: true },
          { at: [4, 9.5, -86], prop: true },
          { at: [0, 10, -92], prop: true },
        ]);
        await d.look('helixSky', 1);
        await d.say([
          L('aegis', '헬릭스 보안국이다. 배달부 카이, 무기를 내려놓고 엎드려라.'),
          L('zero', '헬릭스 경비대?! 카이, 타!'),
          L('kai', '둘 다는 못 빠져나가. 너 먼저 가. 소포가 먼저야.'),
          L('zero', '…살아 있어라.'),
        ]);
        zero.remove();
        d.sw('bikeAway');
        await d.look('bikeAway', 2);
        await d.look('helixSky', 0.8);
        await d.say([
          L('aegis', '저항하지 마라. 지금부터 넌 헬릭스의 손님이다.'),
          L('kai', '…배달 완료.'),
        ]);
        await d.fade(1, 1.2, '23:58 — 카이, 헬릭스 보안국에 체포');
        await d.wait(1.8);
      },
    },
  ],
};
