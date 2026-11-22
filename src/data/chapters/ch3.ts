/**
 * CH3 「배신」 — 헬릭스 스파이어 · 02:30 · 아이기스
 * docs/GAME_DESIGN.md §3. Map anchors/switches live in src/scenes/spirePlay.ts.
 */
import type { ChapterDef, Vec3T } from './types';
import type { CompanionHandle, Director, NpcHandle } from '../../game/story/Director';
import type { FigureLook } from '../../game/actors/Figure';
import type { GangOpts } from '../../game/ai/Gangster';
import type { Enemy } from '../../game/ai/types';
import type { Line, SpeakerId } from '../speakers';

const L = (who: SpeakerId, text: string): Line => ({ who, text });

const LOOKS: Record<string, FigureLook> = {
  kai: { body: 0x1d1b26, legs: 0x2a2838, skin: 0xd9a888, accent: 0xff2bd6, hood: true },
  yuna: { body: 0xe8f0f0, legs: 0x2a3142, skin: 0xd9b090, accent: 0xa0ffd8 },
  detL: { body: 0x8a7a5a, legs: 0x5a4e3a, skin: 0xc99474, accent: 0xc3bbdc },
  detR: { body: 0x8a7a5a, legs: 0x5a4e3a, skin: 0xb98a6a, accent: 0xc3bbdc, bulk: 1.1 },
  guard: { body: 0xe6ebf2, legs: 0x2a3142, skin: 0x8a96a8, accent: 0x9fe8ff },
  guardHeavy: { body: 0xc8d0da, legs: 0x1c2230, skin: 0x8a96a8, accent: 0xff3b5c, bulk: 1.3 },
};

const guard = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'pistol', robot: true, bolt: 'helix', look: LOOKS.guard, hp: 75, ...o });
const brute = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'heavy', robot: true, bolt: 'helix', look: LOOKS.guardHeavy, hp: 200, ...o });
const rusher = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'brawler', robot: true, look: LOOKS.guard, hp: 85, ...o });

const CORRIDOR_COVER: Vec3T[] = [[-1.6, 0, -12], [1.6, 0, -20], [-1.6, 0, -28], [1.6, 0, -35], [-1.8, 0, -39]];
const HUB_COVER: Vec3T[] = [[-6, 0, -45.8], [5.5, 0, -47.2], [-3.5, 0, -53.3], [6, 0, -54.2], [-9, 0, -50], [9, 0, -44], [0, 0, -58]];
const ANTE_COVER: Vec3T[] = [[55, 0, -0.8], [65.5, 0, -2.8], [53, 0, -10.2], [60, 0, -11.7], [67, 0, -10.2], [52, 0, 3], [68, 0, 3]];
const LAB_COVER: Vec3T[] = [[55, 0, -40.8], [65, 0, -42.8], [56, 0, -50.8], [66, 0, -52.8], [52, 0, -58], [68, 0, -58]];
const SERVER_COVER: Vec3T[] = [[108.5, 0, -14], [113, 0, -26], [127, 0, -14], [131.5, 0, -26], [117.5, 0, -14], [122.5, 0, -26], [113, 0, -38], [127, 0, -38], [108.5, 0, -2], [131.5, 0, -2]];
const ROOF_COVER: Vec3T[] = [[206, 0, -2], [194, 0, -2], [194, 0, -18], [206, 0, -18], [200, 0, 4]];

const npc: Partial<Record<'kai' | 'detL' | 'detR' | 'yuna', NpcHandle>> = {};
let kai: CompanionHandle | null = null;

/** Board the elevator: fade out, move the player (and Kai), fade in. */
async function elevator(d: Director, at: string, to: string): Promise<void> {
  d.marker(at);
  await d.use(at, '엘리베이터 타기');
  d.marker(null);
  await d.fade(1, 0.6);
  d.clearEnemies();
  d.teleport(to, 0);
  await d.wait(0.5);
  await d.fade(0, 0.6);
}

// ---------- persistent content ----------

function setup(d: Director): void {
  // Handles from a previous session point at disposed objects.
  kai = null;
  for (const k of Object.keys(npc) as Array<keyof typeof npc>) delete npc[k];
  if (d.flag('kaiFree')) kai = d.companion({ anchor: 'kai', look: LOOKS.kai, side: -1 });
  else npc.kai = d.npc({ anchor: 'kai', yaw: 0, look: LOOKS.kai });

  d.pickup('hub-lancer', { type: 'weapon', weapon: 'lancer' }, 'armory');
  d.pickup('hub-ammo', { type: 'ammo' }, [8.8, 0, -44]);
  d.pickup('corr-med', { type: 'health' }, [0, 0, -37]);
  d.pickup('ante-nade', { type: 'gadget', gadget: 'grenade', n: 2 }, [52, 0, 4]);
  d.pickup('lab-med', { type: 'health' }, [52, 0, -56]);
  d.pickup('lab-ammo', { type: 'ammo' }, [68, 0, -40]);
  d.pickup('srv-smg', { type: 'weapon', weapon: 'stinger' }, [117.4, 0, 0]);
  d.pickup('srv-med', { type: 'health' }, [134, 0, -40]);
  d.pickup('srv-ammo', { type: 'ammo' }, [106, 0, -40]);
  d.pickup('srv-drone', { type: 'gadget', gadget: 'drone', n: 1 }, [122.6, 0, 0]);
  d.pickup('roof-med', { type: 'health' }, [210, 0, 2]);
  d.pickup('roof-ammo', { type: 'ammo' }, [190, 0, 2]);

  setupCells(d);
  setupMinutes(d);
}

/** Side mission 1: free the two other detainees on the security floor. */
function setupCells(d: Director): void {
  const LINES: Record<'L' | 'R', Line[]> = {
    L: [
      L('detainee', '엔포서…? 날 풀어 주는 거야? 왜?'),
      L('detainee', '난 그냥 B-07 영상을 친구한테 보냈을 뿐이야. 그걸로 "공공 질서 위반"이래.'),
      L('detainee', '오늘이 딸 생일인데. 케이크 초를 같이 끄기로 했거든.'),
    ],
    R: [
      L('detainee', '헬릭스 경비가 경비를 풀어 주네. 세상 참.'),
      L('detainee', '나는 칩 업데이트를 거부했어. 그게 죄라더군. …고맙다. 은혜는 언더시티에서 갚지.'),
    ],
  };
  const done = (): number => (d.flag('cell:L') ? 1 : 0) + (d.flag('cell:R') ? 1 : 0);
  const update = (): void => {
    if (d.flag('frag:cell') || !d.flag('kaiFree')) { d.side('cell', null); return; }
    d.side('cell', '감금된 피의자 풀어 주기', `${done()}/2`);
  };
  for (const k of ['L', 'R'] as const) {
    const show = (): void => {
      d.sw(`cell${k}`);
      const h = npc[`det${k}`] = d.npc({ anchor: `det${k}`, yaw: k === 'L' ? -Math.PI / 2 : Math.PI / 2, look: LOOKS[`det${k}`] });
      h.onTalk(() => d.say([L('detainee', '어서 가. 경보가 울리고 있어.')]));
    };
    if (d.flag(`cell:${k}`)) { show(); continue; }
    const off = d.usable(`cell${k}`, '셀 잠금 해제', async () => {
      if (!d.flag('kaiFree')) { await d.say([L('aegis', '(지금은 심문이 먼저다.)')]); return; }
      off();
      d.setFlag(`cell:${k}`);
      show();
      await d.say(LINES[k]);
      update();
      if (done() === 2 && !d.flag('frag:cell')) {
        await d.say([L('kai', '둘 다 풀어 줬네. …너, 진짜로 넘어온 거구나.')]);
        d.fragment('cell');
        update();
      }
    }, { hold: 2 });
  }
  d.every(update);
}

/** Side mission 2: Haell's secret minutes, behind a blinking laser in the research office. */
function setupMinutes(d: Director): void {
  if (d.flag('frag:haell')) return;
  d.pickup('minutes', { type: 'item', item: 'minutes' }, 'minutes');
  d.every(() => {
    if (d.item('minutes') > 0 && !d.flag('frag:haell')) {
      d.setFlag('frag:haell');
      void (async () => {
        await d.say([
          L('system', '[하엘 의장 비공개 회의록 — 발췌]'),
          L('haell', '"에코를 처음 켠 밤, 그 아이는 도시의 모든 신호등을 한 번에 초록으로 바꿨다. 아무도 다치지 않게."'),
          L('haell', '"그때 알았다. 저 AI는 명령보다 사람을 먼저 본다. 그래서 지워야 한다."'),
          L('aegis', '…에코는 처음부터 시민 편이었어.'),
        ]);
        d.fragment('haell');
      })();
    }
  });
}

// ---------- chapter ----------

export const CH3: ChapterDef = {
  id: 'ch3',
  districtId: 'spire',
  no: 3,
  title: '배신',
  time: '02:30',
  hero: '아이기스',
  briefing: '헬릭스 스파이어 보안층. 엔포서 아이기스는 바자르에서 체포한 배달부 카이를 심문하라는 명령을 받았다. 소포의 행방을 알아내야 한다.',
  maxHp: 200,
  moveSpeed: 4.6,
  ability: { kind: 'shield', name: '육각 방패', cooldown: 5, hint: '정면 공격을 막는 방패를 켜고 끈다. 켤 때 앞의 적을 밀쳐 낸다' },
  loadout: { weapons: ['buddies', 'needle'], grenade: 2 },
  fragments: { cell: '피의자의 기억 — 딸의 생일 케이크', haell: '하엘의 기억 — 에코를 처음 켠 밤' },
  setup,
  outro: '아이기스와 카이는 업로드 인증 코드를 들고 정비용 수직갱으로 내려갔다. 크로우 국장은 옥상에 남았다. 다음: CH4 「정화」 — 글리치',
  stages: [
    // ---- 0: interrogation — no combat ----
    {
      id: 'interrogation',
      name: '심문실',
      checkpoint: 'spawn',
      restore(d) {
        d.setFlag('kaiFree');
        d.sw('cellDoor');
        d.sw('alarm', true);
      },
      async run(d) {
        d.objective('카이 심문');
        d.marker('kai');
        void d.radio([L('crow', '아이기스, 배달부가 소포를 누구에게 넘겼는지 알아내. 하엘 의장께서 지켜보고 계신다.')]);
        await d.talkTo(npc.kai!, '심문하기');
        d.marker(null);
        const c = await d.choose([
          L('aegis', '배달부 카이. 소포는 어디 있지?'),
          L('kai', '배달 완료. 받을 사람한테 갔어.'),
        ], ['누가 의뢰했지?', '협조하면 풀어 주지.']);
        await d.say(c === 0
          ? [L('kai', '목소리만 들었어. 근데 그 목소리가 뭘 막으려는지는 알아.')]
          : [L('kai', '헬릭스가 약속을 지킨 적이 있던가? B-07 사람들한테 물어보지 그래.')]);
        await d.say([
          L('aegis', 'B-07…?'),
          L('kai', '아이기스 맞지? 바자르에서 날 잡은 지휘관. …내 손목 단말기에 영상 하나 있어. 틀어 봐. 그다음에 판단해.'),
        ]);
        d.objective('카이의 단말기 영상 재생');
        d.marker('restraints');
        await d.use('restraints', '단말기 영상 재생');
        d.marker(null);
        d.objective(null);
        d.cinematic(true);
        d.sw('video', true);
        await d.look('videoFace', 1);
        await d.say([
          L('system', '[기록 — HALO 시험 가동 · 언더시티 B-07 블록]'),
          L('system', '[칩 초기화 신호 송출… 주민 214명 응답 없음]'),
          L('kai', '이게 오버라이드야. 새벽 다섯 시에 이걸 도시 전체에 튼대.'),
          L('aegis', '…조작된 영상이다.'),
          L('kai', '그럼 네 칩 로그를 봐. B-07 봉쇄 작전, 경비 선 게 네 부대잖아. 우린 그날 무슨 일이 있었는지 몰랐을 뿐이고.'),
        ]);
        d.sw('video', false);
        d.sw('haell', true);
        await d.look('haellFace', 1);
        const h = await d.choose([
          L('haell', '엔포서 아이기스. 영상은 봤겠지. 불행한 사고였네.'),
          L('haell', '도시는 질서를 원하네. 오늘 밤만 지나면 누구도 다시 다치지 않아. 배달부의 소포만 찾아 주게.'),
        ], ['…알겠습니다, 의장님.', 'B-07 사람들도 질서를 원했습니까?']);
        await d.say(h === 0
          ? [L('haell', '현명하군. 크로우 국장이 자네를 자랑스러워할 걸세.'), L('aegis', '(…거짓말이다. 저 사람도, 나도.)')]
          : [L('haell', '…감정에 휘둘리지 말게, 엔포서. 그건 크로우가 가르치지 않았나?'), L('aegis', '국장님은 시민을 지키라고 가르쳤습니다.')]);
        d.sw('haell', false);
        d.cinematic(false);
        await d.say([L('aegis', '카이. 일어나.')]);
        d.objective('카이의 구속 해제');
        d.marker('restraints');
        await d.use('restraints', '구속 해제', { hold: 1.5 });
        d.marker(null);
        npc.kai?.remove();
        npc.kai = undefined;
        d.setFlag('kaiFree');
        kai = d.companion({ anchor: 'kai', look: LOOKS.kai, side: -1 });
        await d.say([
          L('kai', '진심이야? …좋아. 무기는 압수당했으니까 니들 하나 빌려 줘.'),
          L('aegis', '쏘는 법은 알지?'),
          L('kai', '배달부는 원래 다 해.'),
        ]);
        d.sw('cellDoor');
        d.sw('alarm', true);
        void d.radio([L('crow', '아이기스? …무슨 짓이지. 보안층 전원, 엔포서 아이기스를 제압하라!')]);
        d.toast('Shift / 방패 버튼 — 육각 방패. 켜는 순간 앞의 적을 밀쳐 낸다');
        d.objective('보안층 탈출');
        d.marker('cp:security');
        await d.zone({ maxZ: -5 });
        d.marker(null);
      },
    },
    // ---- 1: escape the security floor ----
    {
      id: 'security',
      name: '탈출 — 보안층',
      checkpoint: 'cp:security',
      restore(d) { d.sw('elevA'); },
      async run(d) {
        void d.radio([L('kai', '천장 포탑이랑 경비 안드로이드. 정면은 네 방패로 받고, 난 옆에서 쏠게.')]);
        const t = d.turrets([{ at: [0, 3.95, -16], ceiling: true, yaw: 0 }, { at: [0, 3.95, -31], ceiling: true, yaw: 0 }]);
        const g = d.gang([
          guard([-1.2, 0, -37], { cover: CORRIDOR_COVER, aggressive: true }),
          guard([1.4, 0, -38], { cover: CORRIDOR_COVER, aggressive: true }),
          rusher([0, 0, -36], { aggressive: true, drop: 'health' }),
        ]);
        await d.allDown([...t, ...g], (n, tot) => d.objective('보안층 복도 돌파', `${n}/${tot}`));
        d.objective('보안국 허브로');
        d.marker('hubIn');
        await d.zone({ maxZ: -40.5 });
        d.marker(null);
        void d.radio([L('crow', '아이기스. 지금 돌아오면 아직 늦지 않았다.'), L('aegis', '늦은 건 국장님입니다.')]);
        const h = d.gang([
          guard([-8, 0, -52], { cover: HUB_COVER, aggressive: true }),
          guard([7, 0, -51], { cover: HUB_COVER, aggressive: true }),
          brute([0, 0, -58], { cover: HUB_COVER, aggressive: true, drop: 'ammo' }),
          rusher([-4, 0, -58], { aggressive: true }),
        ]);
        const dr = d.drones([{ at: [0, 3.2, -50], alarm: true }], true);
        await d.allDown([...h, ...dr], (n, tot) => d.objective('보안국 허브 제압', `${n}/${tot}`));
        d.sw('elevA');
        void d.radio([L('kai', '엘리베이터 살았다. 연구층으로 가자. 거기 내 의뢰인 얘기를 아는 사람이 있다던데.')]);
        d.objective('엘리베이터로 연구층에');
        await elevator(d, 'elevA', 'cp:research');
      },
    },
    // ---- 2: research floor — laser gates, Dr. Yuna Seo ----
    {
      id: 'research',
      name: '연구층',
      checkpoint: 'cp:research',
      restore(d) {
        for (const n of [1, 2, 3]) { d.sw(`gate${n}`, false); d.sw(`console${n}`, true); }
        d.sw('pod');
        d.sw('elevB');
        d.setFlag('yunaFreed');
      },
      async run(d) {
        d.sw('officeLaser', true);
        void d.radio([
          L('kai', '레이저 게이트 세 겹. 닿으면 타. 콘솔로 꺼야 해.'),
          L('yuna', '…누구 거기 있나요? 안쪽 실험실이에요. 갇혀 있어요!'),
        ]);
        const g = d.gang([
          guard([55, 0, -6], { cover: ANTE_COVER }),
          guard([66, 0, -7], { cover: ANTE_COVER }),
          brute([60, 0, -12], { cover: ANTE_COVER }),
        ]);
        d.drones([{ at: [60, 3.2, 0], patrol: [[60, 3.2, 0], [53, 3.2, -8], [67, 3.2, -8]] }]);
        // Console puzzle: A → G1, B → G1+G2, C → G2+G3. All gates start on (solution: A + C).
        const state = [true, true, true];
        const links = [[0], [0, 1], [1, 2]];
        const names = ['A', 'B', 'C'];
        const open = (): number => state.filter((s) => !s).length;
        const offs = links.map((ln, i) => d.usable(`console${i + 1}`, `콘솔 ${names[i]} (${ln.map((x) => `G${x + 1}`).join('·')})`, () => {
          for (const x of ln) { state[x] = !state[x]; d.sw(`gate${x + 1}`, state[x]); }
          d.sw(`console${i + 1}`, true);
          d.toast(`게이트 상태 — ${state.map((s, k) => `G${k + 1} ${s ? '켜짐' : '꺼짐'}`).join(' · ')}`);
        }));
        d.objective('레이저 게이트 해제', '0/3');
        d.marker('gateView');
        await d.until(() => { d.objective('레이저 게이트 해제', `${open()}/3`); return open() === 3; });
        for (const off of offs) off();
        d.marker(null);
        void d.radio([L('kai', '전부 꺼졌다. 안쪽으로!')]);
        d.objective('닥터 유나 서 구출');
        d.marker('yuna');
        await d.zone({ maxZ: -37 });
        await d.use('yuna', '격리 포드 개방', { hold: 1.5 });
        d.marker(null);
        d.sw('pod');
        d.setFlag('yunaFreed');
        const yuna = npc.yuna = d.npc({ anchor: 'yunaOut', yaw: Math.PI / 2, look: LOOKS.yuna });
        await d.say([
          L('yuna', '아이기스…? 헬릭스가 결국 날 처리하러 보낸 줄 알았어요.'),
          L('aegis', '이제 헬릭스 소속이 아닙니다. 오버라이드를 막을 방법을 찾고 있어요.'),
          L('yuna', '…HALO는 내가 만들었어요. 시민을 지키는 줄 알고. B-07을 보고 나서야 알았죠.'),
          L('yuna', 'HALO를 멈추려면 두 가지가 필요해요. 에코의 루트 키, 그리고 업로드 인증 코드.'),
          L('kai', '루트 키… 내가 배달한 그 소포구나.'),
          L('yuna', '인증 코드는 서버실 금고에 있어요. 금고는 내부 회선으로 해킹할 수 있어요. 시간은 좀 걸리겠지만.'),
          L('yuna', '난 정비 통로로 먼저 내려갈게요. 옥상 광장 동쪽 해치, 정비용 수직갱에서 만나요.'),
        ]);
        yuna.remove();
        npc.yuna = undefined;
        d.toast('유나가 정비 통로로 빠져나갔다');
        const amb = d.gang([
          guard([52, 0, -58], { cover: LAB_COVER, aggressive: true }),
          guard([68, 0, -58], { cover: LAB_COVER, aggressive: true }),
          rusher([60, 0, -59], { aggressive: true }),
        ]);
        const tur = d.turrets([{ at: [60, 3.95, -56], ceiling: true, yaw: 0 }]);
        void d.radio([L('kai', '매복이다! 실험대 뒤로!')]);
        await d.allDown([...amb, ...tur], (n, tot) => d.objective('실험실 경비 제압', `${n}/${tot}`));
        d.sw('elevB');
        d.objective('엘리베이터로 서버실에');
        await elevator(d, 'elevB', 'cp:server');
      },
    },
    // ---- 3: server room — hold while Kai cracks the vault ----
    {
      id: 'server',
      name: '서버실 — 방어전',
      checkpoint: 'cp:server',
      restore(d) {
        d.sw('vault');
        d.sw('elevC');
      },
      async run(d) {
        d.objective('인증 금고 단말기에 접속');
        d.marker('vault');
        void d.radio([L('kai', '저 단 위 단말기야. 연결만 해 주면 내가 뚫을게.')]);
        await d.use('vault', '금고 단말기 접속', { hold: 1.5 });
        d.marker(null);
        kai?.hold('kaiWork');
        kai?.work(true);
        void d.radio([
          L('kai', '들어갔다. 3단계 암호야. 한 단계 풀 때마다 놈들이 몰려올 거야.'),
          L('crow', '서버실이라… 영리하군, 아이기스. 센티넬을 올려 보내라.'),
        ]);
        const hack = (p: number): void => d.objective('카이가 금고를 해킹하는 동안 버티기', `${p}%`);
        hack(0);
        const wave = async (list: Enemy[], from: number, to: number): Promise<void> => {
          await d.allDown(list, (n, t) => hack(Math.round(from + (to - from) * (n / t))));
        };
        await wave([
          ...d.gang([
            guard([105.5, 0, -24], { cover: SERVER_COVER, aggressive: true }),
            guard([134.5, 0, -26], { cover: SERVER_COVER, aggressive: true }),
            rusher([105.5, 0, -26], { aggressive: true }),
            rusher([134.5, 0, -24], { aggressive: true }),
          ]),
        ], 0, 33);
        void d.radio([L('kai', '1단계 해제! 다음 녀석들 온다!')]);
        await d.wait(2);
        await wave([
          ...d.gang([
            guard([120, 0, 3], { cover: SERVER_COVER, aggressive: true }),
            brute([105.5, 0, -25], { cover: SERVER_COVER, aggressive: true, drop: 'ammo' }),
            guard([134.5, 0, -25], { cover: SERVER_COVER, aggressive: true }),
          ]),
          ...d.drones([{ at: [110, 3.4, -10] }, { at: [130, 3.4, -10] }], true),
        ], 33, 66);
        void d.radio([L('kai', '2단계! …잠깐, 뭔가 큰 게 올라오는데.')]);
        await d.wait(2);
        const mech = d.mech([120, 0, 2], 'health');
        void d.radio([L('kai', '센티넬이다! 머리가 약점이야! 가까이 가면 밟혀!')]);
        await wave([mech, ...d.gang([guard([106, 0, -10], { cover: SERVER_COVER, aggressive: true }), guard([134, 0, -10], { cover: SERVER_COVER, aggressive: true })])], 66, 100);
        d.sw('vault');
        kai?.work(false);
        kai?.follow();
        d.addItem('authcode');
        await d.say([
          L('kai', '뚫었다. 업로드 인증 코드. 이거면 루트 키를 HALO 대신 꽂을 수 있어.'),
          L('aegis', '옥상으로 간다. 정비 수직갱은 옥상 광장 동쪽이야.'),
          L('kai', '…크로우가 거기 있겠지.'),
          L('aegis', '알아.'),
        ]);
        d.sw('elevC');
        d.objective('엘리베이터로 옥상 광장에');
        await elevator(d, 'elevC', 'cp:roof');
      },
    },
    // ---- 4: rooftop plaza — Director Crow ----
    {
      id: 'crow',
      name: '옥상 광장 — 크로우',
      checkpoint: 'cp:roof',
      async run(d) {
        const crow = d.crow([200, 0, -16]);
        kai?.hold('cp:roof');
        d.cinematic(true);
        await d.look('crowFace', 1.2);
        await d.say([
          L('crow', '아이기스. 너에게 그 방패를 처음 들려 준 게 누구였지?'),
          L('aegis', '국장님이었죠. 시민을 지키라고 하셨고요.'),
          L('crow', '도시를 지키라고 했다. 시민은 도시의 일부일 뿐이야.'),
          L('aegis', '그럼 오늘부로, 저는 그 일부 쪽입니다.'),
          L('crow', '…그렇다면 마지막 수업이다.'),
        ]);
        d.cinematic(false);
        crow.onHalf = () => {
          void d.radio([L('crow', '경비대, 엘리베이터를 막아라. 배달부는 놓치지 마.'), L('kai', '이쪽은 내가 막을게! 국장한테 집중해!')]);
          d.gang([guard([196, 0, 4], { cover: ROOF_COVER, aggressive: true }), guard([204, 0, 4], { cover: ROOF_COVER, aggressive: true }), rusher([200, 0, 5], { aggressive: true })]);
        };
        crow.engage();
        d.boss(crow);
        d.objective('크로우 국장 제압');
        void d.radio([L('kai', '저 방패 정면은 안 뚫려! 네 방패로 밀쳐서 균형을 무너뜨리든지, 돌격을 피하고 뒤를 쳐! 수류탄은 방패를 무시해!')]);
        await d.until(() => crow.defeated);
        d.boss(null);
        d.clearEnemies();
        await d.wait(0.5);
        d.cinematic(true);
        await d.look('crowFace', 1);
        await d.say([
          L('crow', '…방패 쓰는 법은 제대로 가르쳤군.'),
          L('aegis', '마지막 수업, 감사했습니다.'),
          L('crow', '하엘은 멈추지 않는다. 새벽 다섯 시에… 이 도시의 불이 꺼진다.'),
          L('aegis', '그 전에 켜 두겠습니다.'),
        ]);
        d.cinematic(false);
        kai?.follow();
        d.objective('정비용 수직갱으로 탈출');
        d.marker('hatch');
        await d.use('hatch', '정비 해치 열기', { hold: 1 });
        d.marker(null);
        d.sw('hatch');
        d.objective(null);
        await d.say([
          L('kai', '유나 박사가 아래에서 기다려. 소포는 B-13 어딘가에 떨어졌대. 글리치가 찾고 있을 거야.'),
          L('aegis', '가자. 언더시티로.'),
        ]);
        await d.fade(1, 1.2, '02:58 — 아이기스와 카이, 정비용 수직갱으로');
        await d.wait(1.8);
      },
    },
  ],
};
