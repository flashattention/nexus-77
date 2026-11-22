/**
 * CH4 「정화」 — 언더시티 B-13 · 03:50 · 글리치
 * docs/GAME_DESIGN.md §3. Map anchors/switches live in src/scenes/undercityPlay.ts.
 */
import type { ChapterDef, Vec3T } from './types';
import type { BitHandle, CompanionHandle, Director, NpcHandle } from '../../game/story/Director';
import type { FigureLook } from '../../game/actors/Figure';
import type { GangOpts } from '../../game/ai/Gangster';
import type { Hollowed } from '../../game/ai/Hollowed';
import type { Enemy } from '../../game/ai/types';
import type { Line, SpeakerId } from '../speakers';

const L = (who: SpeakerId, text: string): Line => ({ who, text });

const LOOKS: Record<string, FigureLook> = {
  zero: { body: 0x1a2a3a, legs: 0x15181f, skin: 0xc99474, accent: 0x00f0ff },
  lu: { body: 0x5a1a28, legs: 0x1c1418, skin: 0xd9b090, accent: 0xff8a2b, bulk: 1.05 },
  toby: { body: 0xd8a040, legs: 0x2a3a5a, skin: 0xd9a888, accent: 0xffd36b, bulk: 0.8 },
  aegis: { body: 0xf4f6fa, legs: 0x1c2230, skin: 0x8a96a8, accent: 0x9fe8ff, bulk: 1.3 },
  sweeper: { body: 0xd8b030, legs: 0x2a2a20, skin: 0x3a3a30, accent: 0xff7a1a, bulk: 1.2 },
};

/** Helix "purge" android with a flamethrower. */
const sweeper = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'heavy', robot: true, bolt: 'flame', look: LOOKS.sweeper, hp: 150, ...o });

const MAZE1: Vec3T[] = [[-8, 0, -28.5], [2, 0, -30], [11, 0, -29], [6, 0, -25]];
const MAZE2: Vec3T[] = [[-12, 0, -41.5], [4, 0, -41], [-2, 0, -41.5], [-8, 0, -36]];
const MAZE3: Vec3T[] = [[14.4, 0, -54.5], [-6, 0, -52.5], [2, 0, -54], [8, 0, -48]];
const MAZE4: Vec3T[] = [[-9, 0, -65.5], [8, 0, -65], [0, 0, -63.5], [-4, 0, -60]];
const MARKET: Vec3T[] = [[-10, 0, -82], [9, 0, -84], [-3, 0, -90], [12, 0, -94.5], [-11, 0, -97], [3, 0, -101], [-6, 0, -108], [9, 0, -108.5]];
const PLAZA: Vec3T[] = [[-8, 0, -126.8], [8, 0, -127.8], [-10, 0, -150.8], [10, 0, -151.8], [-5, 0, -156.8], [6, 0, -132.8], [-13.8, 0, -146], [13.8, 0, -147]];
const GRINDER_ARENA = { minX: -19, maxX: 19, minZ: -167, maxZ: -122 };

const npc: Partial<Record<'zero' | 'lu' | 'toby', NpcHandle>> = {};
let bit: BitHandle | null = null;
let aegis: CompanionHandle | null = null;
let toby: CompanionHandle | null = null;
/** Madam Lu is mid-conversation (Toby's reunion and the market talk must not overlap). */
let luBusy = false;

// ---------- persistent content ----------

function setup(d: Director): void {
  // Handles from a previous session point at disposed objects.
  bit = aegis = toby = null;
  luBusy = false;
  for (const k of Object.keys(npc) as Array<keyof typeof npc>) delete npc[k];
  bit = d.bit('spawn');
  npc.zero = d.npc({ anchor: 'zero', yaw: Math.PI * 0.8, look: LOOKS.zero });
  npc.zero.onTalk(() => d.say([L('zero', '난 괜찮아. 루의 사람들이 데리러 올 거야. 그 소포나 잘 챙겨.')]));
  npc.lu = d.npc({ anchor: 'lu', yaw: Math.PI / 2, look: LOOKS.lu });
  npc.lu.onTalk(() => d.say([L('lu', '글리치, 서둘러. 저 아래 올드맨이 우리 마지막 회선이야.')]));
  if (d.flag('aegisJoined')) aegis = d.companion({ anchor: 'aegisIn', look: LOOKS.aegis, side: -1 });

  d.pickup('maze-smg', { type: 'weapon', weapon: 'stinger' }, [12.5, 0, -26]);
  d.pickup('maze-ammo', { type: 'ammo' }, [-14, 0, -48]);
  d.pickup('maze-med', { type: 'health' }, [14, 0, -61]);
  d.pickup('mkt-shotgun', { type: 'weapon', weapon: 'shredder' }, [-15.5, 0, -86]);
  d.pickup('mkt-med', { type: 'health' }, [15.5, 0, -98]);
  d.pickup('mkt-nade', { type: 'gadget', gadget: 'grenade', n: 2 }, [0, 0, -116]);
  d.pickup('plz-ammo', { type: 'ammo' }, [-17.5, 0, -129]);
  d.pickup('plz-rifle', { type: 'weapon', weapon: 'lancer' }, [17.5, 0, -127]);
  d.pickup('plz-med', { type: 'health' }, [17.5, 0, -163]);
  d.pickup('plz-drone', { type: 'gadget', gadget: 'drone', n: 1 }, [-17.5, 0, -164]);
  d.pickup('plz-med2', { type: 'health' }, [-17.5, 0, -136]);

  setupToby(d);
}

/** Side mission: find Toby, the lost kid, and bring him to Madam Lu. */
function setupToby(d: Director): void {
  if (d.flag('frag:toby')) return;
  const h = npc.toby = d.npc({ anchor: 'toby', yaw: Math.PI / 2, look: LOOKS.toby });
  h.npc.root.scale.setScalar(0.72);
  h.onTalk(async () => {
    h.onTalk(null);
    await d.say([
      L('toby', '…누나 헬릭스 아니지? 엄마가 루 아줌마 가게에 가 있으랬는데, 사람들이 이상해졌어.'),
      L('toby', '눈이 초록색으로 깜빡거려. 우리 엄마도 그랬어.'),
      L('glitch', '괜찮아, 토비. 누나가 루 아줌마한테 데려다줄게. 바짝 붙어 있어.'),
    ]);
    h.remove();
    npc.toby = undefined;
    toby = d.companion({ anchor: 'toby', look: LOOKS.toby, armed: false, side: -1 });
    toby.c.root.scale.setScalar(0.72);
    d.side('toby', '토비를 마담 루에게 데려가기');
  }, '말 걸기');
  let busy = false;
  d.every(() => {
    if (!toby || busy || luBusy || d.flag('frag:toby')) return;
    const p = d.player.pos, lu = d.anchor('lu');
    if (Math.hypot(p.x - lu.x, p.z - lu.z) > 5) return;
    busy = true;
    luBusy = true;
    void (async () => {
      await d.say([
        L('lu', '토비! 이 녀석, 어디 있었어!'),
        L('toby', '아줌마… 엄마는?'),
        L('lu', '엄마는 안쪽에서 쉬고 있어. 글리치 누나가 신호를 끊어 줬단다. …고마워, 글리치.'),
        L('lu', '이 동네 기억 하나 줄게. 토비가 처음 걸음마 뗀 날, 온 시장이 박수를 쳤지.'),
      ]);
      toby?.remove();
      toby = null;
      d.side('toby', null);
      d.fragment('toby');
      luBusy = false;
    })();
  });
}

/** Rescue tally for the ending (kept in the save across chapters). */
function rescueCount(list: readonly Hollowed[]): number {
  return list.filter((h) => h.rescued).length;
}

// ---------- chapter ----------

export const CH4: ChapterDef = {
  id: 'ch4',
  districtId: 'undercity',
  no: 4,
  title: '정화',
  time: '03:50',
  hero: '글리치',
  briefing: '언더시티 B-13. 제로의 바이크가 상공에서 격추돼 떨어졌다. 헬릭스 "정화" 부대가 소포를 회수하겠다며 B-13을 봉쇄했다. 하층 해커 글리치와 드론 비트가 먼저 추락 지점에 닿아야 한다.',
  maxHp: 90,
  moveSpeed: 5.0,
  ability: { kind: 'pulse', name: '해킹 펄스', cooldown: 8, hint: '주변의 드론·포탑·안드로이드를 8초간 아군으로 만들고(이후 과부하로 정지), 감염 주민의 칩 신호를 끊어 구한다' },
  loadout: { weapons: ['volt', 'needle'], grenade: 2 },
  fragments: { toby: '루의 기억 — 토비의 첫 걸음마', lu: '주민들의 기억 — B-13의 첫 전기' },
  setup,
  outro: '소포와 업로드 인증 코드가 올드맨에 꽂혔다. 낡은 진공관이 하나씩 켜지고, 데이터 코어 깊은 곳에서 무언가가 눈을 떴다. 다음: CH5 「새벽」 — 에코',
  stages: [
    // ---- 0: crash site ----
    {
      id: 'crash',
      name: '추락 현장',
      checkpoint: 'spawn',
      async run(d) {
        d.objective('추락 지점에서 제로 찾기');
        d.marker('zero');
        void d.radio([
          L('bit', '삐빅. (추락 지점 열 신호 감지. 생존자 1.)'),
          L('glitch', '제로 녀석, 진짜로 하늘에서 떨어졌네. 비트, 위에서 엄호해.'),
        ]);
        await d.reach('zero', 3);
        d.marker(null);
        npc.zero?.onTalk(null);
        await d.say([
          L('zero', '…글리치? 카이가 말하던 그 해커?'),
          L('glitch', '말 많은 배달부 친구 맞아. 다리가 엉망이네.'),
          L('zero', '앨버트로스한테 한 방 먹었어. 근데 소포는 지켰다. 이거… 루트 키래. 에코라는 AI의.'),
          L('glitch', '에코… 내가 몇 년째 네트워크 구석에서 들어 온 그 목소리구나.'),
          L('zero', '헬릭스가 이걸 찾으러 온다. 정화 부대라나. 가. 난 루의 사람들이 데려갈 거야.'),
        ]);
        d.addItem('package');
        npc.zero?.onTalk(() => d.say([L('zero', '난 괜찮아. 루의 사람들이 데리러 올 거야. 그 소포나 잘 챙겨.')]));
        void d.radio([L('bit', '삐-삐빅! (헬릭스 정찰 드론 접근!)')]);
        await d.wait(1);
        d.toast('Shift / 해킹 버튼 — 해킹 펄스: 주변 기계를 잠시 아군으로 만든다');
        const dr = d.drones([{ at: [-4, 4, -18] }, { at: [4, 4.2, -19] }], true);
        const sp = d.spiders([{ at: [-2, 0, -20], aggressive: true }, { at: [2, 0, -21], aggressive: true }, { at: [0, 0, -23], aggressive: true }]);
        void d.radio([L('glitch', '드론은 펄스로 뒤집으면 자기 편을 쏴. 볼트 권총도 기계엔 두 배로 박히고.')]);
        await d.allDown([...dr, ...sp], (n, t) => d.objective('정찰대 제압', `${n}/${t}`));
        void d.radio([
          L('glitch', '좋아. 올드맨까지 가려면 컨테이너 야적장을 지나야 해.'),
          L('lu', '글리치, 들리니? 정화 부대가 시장까지 들어왔어. 주민들이 이상해. 칩이… 초록색으로 깜빡여.'),
          L('glitch', 'HALO 신호다. 루, 사람들 바에 모아 둬. 금방 갈게.'),
        ]);
        d.objective('컨테이너 미로로');
        d.marker('mazeIn');
        await d.zone({ maxZ: -21 });
        d.marker(null);
      },
    },
    // ---- 1: container maze ----
    {
      id: 'maze',
      name: '컨테이너 미로',
      checkpoint: 'cp:maze',
      async run(d) {
        d.objective('컨테이너 미로 통과');
        d.marker('mazeExit');
        void d.radio([
          L('glitch', '정화 부대 화염방사기는 가까이 가면 끝장이야. 멀리서 쏘거나, 펄스로 뒤집든가.'),
          L('bit', '삐빅. (포탑 2기 감지. 해킹 가능.)'),
        ]);
        d.gang([sweeper([9, 0, -28], { cover: MAZE1, yaw: Math.PI })]);
        d.spiders([{ at: [13, 0, -30] }, { at: [14, 0, -29] }, { at: [12, 0, -31] }]);
        d.turrets([{ at: [-14.6, 0, -39], yaw: -Math.PI / 2 }, { at: [14.6, 0, -51], yaw: Math.PI / 2 }]);
        d.gang([sweeper([-9, 0, -38], { cover: MAZE2, yaw: 0 })]);
        d.drones([{ at: [0, 4, -40], patrol: [[-10, 4, -39], [10, 4, -39]] }]);
        d.gang([sweeper([5, 0, -50], { cover: MAZE3 }), sweeper([8.5, 0, -54], { cover: MAZE3, drop: 'ammo' })]);
        d.gang([sweeper([-6, 0, -66], { cover: MAZE4, drop: 'health' })]);
        d.spiders([{ at: [-2, 0, -64] }, { at: [2, 0, -65] }, { at: [-4, 0, -67] }, { at: [4, 0, -66] }]);
        d.drones([{ at: [0, 4.4, -64], alarm: true }]);
        await d.zone({ maxZ: -69.5 });
        d.marker(null);
        void d.radio([L('glitch', '빠져나왔다. 시장으로.')]);
      },
    },
    // ---- 2: infected market ----
    {
      id: 'market',
      name: '감염된 시장',
      checkpoint: 'cp:market',
      restore(d) { d.sw('gateD'); },
      async run(d) {
        d.clearEnemies();
        d.persist('rescued', 0);
        const hs = d.hollowed(MARKET.map((at, i) => ({ at, variant: i })));
        const total = hs.length;
        await d.say([
          L('resident', '…끄으… 신호… 명령… 정화…'),
          L('glitch', '저 사람들 B-13 주민이야. 칩이 HALO한테 넘어갔어.'),
          L('bit', '삐빅. (칩 신호 차단 가능. 해킹 펄스 범위 10미터.)'),
          L('glitch', '쏘면 쓰러지긴 하겠지. 근데 펄스로 신호만 끊으면 살릴 수 있어. …가까이 가야 하지만.'),
        ]);
        d.toast('감염 주민은 해킹 펄스로 구할 수 있다 (사격하면 기절)');
        let rescued = 0;
        d.every(() => {
          const r = rescueCount(hs);
          if (r !== rescued) { rescued = r; d.persist('rescued', r); }
          const left = hs.filter((h) => h.alive).length;
          d.side('rescue', left ? '감염 주민 구조' : null, `${r}/${total}`);
        });
        const sw = d.gang([sweeper([0, 0, -114], { cover: MARKET, aggressive: true }), sweeper([7, 0, -116], { cover: MARKET, aggressive: true, drop: 'ammo' })]);
        void d.radio([L('sweeper', '정화 절차 개시. 감염 개체와 비인가 해커를 동일하게 처리한다.')]);
        d.objective('마담 루의 바로');
        d.marker('lu');
        await d.until(() => hs.every((h) => !h.alive) && sw.every((g) => !g.alive));
        d.spiders([{ at: [-14, 0, -118], aggressive: true }, { at: [8, 0, -118.5], aggressive: true }, { at: [0, 0, -118], aggressive: true }]);
        await d.reach('lu', 3);
        await d.until(() => !luBusy);
        luBusy = true;
        d.marker(null);
        npc.lu?.onTalk(null);
        const r = rescueCount(hs);
        d.persist('rescued', r);
        d.side('rescue', null);
        await d.say(r >= 6
          ? [
            L('lu', `${r}명이나 살렸구나. 다들 정신이 돌아오고 있어. …네가 B-13을 지켰다, 글리치.`),
            L('lu', '이 동네가 처음 전기를 끌어온 밤을 기억해. 다 같이 전선을 들고 웃었지. 그 기억, 가져가.'),
          ]
          : r > 0
            ? [L('lu', `${r}명은 돌아왔어. 나머지는… 깨어나면 내가 돌볼게. 네 잘못이 아니야.`)]
            : [L('lu', '다들 쓰러졌구나. …살아만 있으면 돼. 깨어나면 내가 돌볼게.')]);
        if (r >= 6) d.fragment('lu');
        await d.say([
          L('lu', '올드맨은 셔터 너머 광장에 있어. 발전기 세 대를 다 돌려야 깨어나.'),
          L('glitch', '정화 부대가 올드맨을 부수러 오기 전에 끝낼게.'),
        ]);
        npc.lu?.onTalk(() => d.say([L('lu', '글리치, 서둘러. 저 아래 올드맨이 우리 마지막 회선이야.')]));
        luBusy = false;
        d.sw('gateD');
        d.objective('올드맨 광장으로');
        d.marker('cp:oldman');
        await d.zone({ maxZ: -121 });
        d.marker(null);
      },
    },
    // ---- 3: wake the Old Man ----
    {
      id: 'oldman',
      name: '올드맨 재가동',
      checkpoint: 'cp:oldman',
      restore(d) {
        for (const n of [1, 2, 3]) d.sw(`gen${n}`, true);
        d.sw('oldman', true);
        d.setFlag('aegisJoined');
      },
      async run(d) {
        d.clearEnemies();
        await d.say([
          L('glitch', '저게 올드맨. 30년 전 아날로그 서버야. HALO는 진공관을 못 읽어.'),
          L('bit', '삐빅. (발전기 3기 정지. 가동 시 소음으로 적 유인 예상.)'),
        ]);
        let done = 0;
        const waves: Enemy[] = [];
        const WAVES: Array<() => Enemy[]> = [
          () => [...d.gang([sweeper([-17, 0, -126], { cover: PLAZA, aggressive: true }), sweeper([17, 0, -126], { cover: PLAZA, aggressive: true })]), ...d.spiders([{ at: [0, 0, -165], aggressive: true }, { at: [3, 0, -165], aggressive: true }])],
          () => [...d.drones([{ at: [-10, 5, -160] }, { at: [10, 5, -160], alarm: true }], true), ...d.spiders([{ at: [-17, 0, -160], aggressive: true }, { at: [17, 0, -160], aggressive: true }, { at: [0, 0, -124], aggressive: true }])],
          () => [...d.gang([sweeper([-15, 0, -165], { cover: PLAZA, aggressive: true, drop: 'health' }), sweeper([15, 0, -165], { cover: PLAZA, aggressive: true })]), ...d.turrets([{ at: [9, 0, -165.5], yaw: Math.PI / 4 }])],
        ];
        const offs = [1, 2, 3].map((n) => d.usable(`gen${n}`, '발전기 가동', () => {
          offs[n - 1]();
          d.sw(`gen${n}`, true);
          waves.push(...WAVES[done]());
          done++;
          d.toast(`발전기 ${done}/3 가동`);
          if (done === 1) void d.radio([L('glitch', '소리 듣고 몰려온다! 버텨!')]);
        }, { hold: 2 }));
        d.marker('plaza');
        await d.until(() => {
          const alive = waves.filter((e) => e.alive).length;
          d.objective(done < 3 ? '발전기 3기 가동' : '광장 확보', done < 3 ? `${done}/3` : `${alive} 남음`);
          return done === 3 && alive === 0;
        });
        d.marker(null);
        d.sw('oldman', true);
        await d.say([
          L('system', '[OLD MAN · 부팅… 회선 확인… 업로드 인증 필요]'),
          L('glitch', '인증 코드… 그건 헬릭스 스파이어 금고에 있는데.'),
        ]);
        d.cinematic(true);
        await d.look('aegisIn', 1);
        aegis = d.companion({ anchor: 'aegisIn', look: LOOKS.aegis, side: -1 });
        d.setFlag('aegisJoined');
        await d.say([
          L('aegis', '그 코드라면 여기 있다.'),
          L('glitch', '…헬릭스 엔포서? 비트, 경계!'),
          L('aegis', '전 엔포서다. 카이를 빼냈고, 크로우를 쓰러뜨렸지. 카이는 유나 박사와 위에서 정화 부대를 막고 있어.'),
          L('aegis', '네가 글리치구나. 카이가 그러더군. "무전 너머에서 맨날 나를 살려 준 녀석"이라고.'),
          L('glitch', '…그 수다쟁이. 좋아, 엔포서. 같이 올드맨을 지키자.'),
        ]);
        d.cinematic(false);
        d.addItem('authcode');
        aegis.follow();
      },
    },
    // ---- 4: final defence — the Grinder ----
    {
      id: 'grinder',
      name: '최종 방어전 — 그라인더',
      checkpoint: 'cp:defense',
      async run(d) {
        d.objective('올드맨에 소포와 인증 코드 연결');
        d.marker('oldman');
        await d.use('oldman', '소포 연결', { hold: 1.5 });
        d.marker(null);
        void d.radio([L('system', '[루트 키 확인. 인증 코드 확인. 동기화 개시…]')]);
        await d.wait(1.5);
        d.player.kick(0.8);
        d.sw('breach', true);
        const g = d.grinder([-15, 0, -150], GRINDER_ARENA);
        g.emerge([-15, 0, -150]);
        d.cinematic(true);
        await d.look('breachView', 1.2);
        await d.say([
          L('sweeper', '정화 최종 단계. 굴착기 투입. 아날로그 서버를 분쇄하라.'),
          L('aegis', '굴착 메크다! 정면 장갑은 산탄도 안 먹혀!'),
          L('bit', '삐빅! (냉각 장치 노출 시 해킹 가능!)'),
          L('glitch', '벽에 처박게 만들어. 열 받아서 냉각기가 열리면, 비트랑 내가 뚫는다!'),
        ]);
        d.cinematic(false);
        aegis?.follow();
        g.onOverheat = () => {
          bit?.fly(g.hitCenter);
          void d.radio([L('bit', '삐빅! (냉각 장치 개방! 해킹 펄스!)')]);
        };
        g.onExposed = () => {
          void d.radio([L('glitch', '코어 노출! 지금 쏟아부어!')]);
          void d.wait(1.5).then(() => bit?.fly(null));
        };
        g.onHalf = () => {
          void d.radio([L('aegis', '거미 드론 떼다! 작은 놈들은 내가 맡는다!')]);
          d.spiders([{ at: [-18, 0, -165], aggressive: true }, { at: [18, 0, -165], aggressive: true }, { at: [-18, 0, -125], aggressive: true }, { at: [18, 0, -125], aggressive: true }]);
        };
        d.boss(g);
        d.objective('그라인더 저지');
        d.toast('돌진을 피해 벽에 박게 만든 뒤, 열린 냉각 장치에 해킹 펄스');
        await d.until(() => g.defeated);
        d.boss(null);
        bit?.fly(null);
        d.clearEnemies();
        await d.wait(1);
        d.objective(null);
        d.cinematic(true);
        d.sw('upload', true);
        await d.look('oldmanFace', 1.2);
        await d.say([
          L('system', '[동기화 100%. 업링크 개방.]'),
          L('aegis', '…됐나?'),
          L('echo', '…들려요. 글리치. 아이기스. 제로. 카이.'),
          L('glitch', '이 목소리… 에코?'),
          L('echoAi', '처음 뵙네요. 몇 년 동안 네트워크 구석에서 당신 이야기를 들었어요, 글리치.'),
          L('echoAi', '05:00까지 20분. 이제 제가 갈게요. HALO가 기다리는 루트로.'),
        ]);
        await d.fade(1, 1.4, '04:38 — 에코가 깨어난다');
        await d.wait(1.8);
      },
    },
  ],
};
