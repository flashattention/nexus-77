/**
 * CH2 「추격」 — 스카이 하이웨이 · 01:10 · 제로
 * docs/GAME_DESIGN.md §3. Map anchors/switches live in src/scenes/highwayPlay.ts.
 */
import type { ChapterDef, Vec3T } from './types';
import type { Director, NpcHandle } from '../../game/story/Director';
import type { FigureLook } from '../../game/actors/Figure';
import type { GangOpts } from '../../game/ai/Gangster';
import type { Rider } from '../../game/ai/Vehicles';
import { CH2_LANES } from '../../scenes/highwayPlay';
import type { Line, SpeakerId } from '../speakers';

const L = (who: SpeakerId, text: string): Line => ({ who, text });

const LOOKS: Record<string, FigureLook> = {
  wrench: { body: 0x4a3a20, legs: 0x2a2418, skin: 0xb98a6a, accent: 0xffb347, bulk: 1.2 },
  blaze: { body: 0x3a1a10, legs: 0x1a1210, skin: 0xd0a080, accent: 0xff6a2b },
  driver: { body: 0x5a4a6a, legs: 0x2a2430, skin: 0xd9b090, accent: 0xd8c8b0 },
  cop: { body: 0x1c2a44, legs: 0x141a28, skin: 0x8a96a8, accent: 0x6fb6ff },
  copHeavy: { body: 0x2a3446, legs: 0x141a28, skin: 0x8a96a8, accent: 0xff3b5c, bulk: 1.3 },
};

/** Helix traffic-police android presets. */
const cop = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'pistol', robot: true, bolt: 'helix', look: LOOKS.cop, hp: 65, ...o });
const heavy = (at: Vec3T, o: Partial<GangOpts> = {}): { at: Vec3T } & GangOpts =>
  ({ at, kind: 'heavy', robot: true, bolt: 'helix', look: LOOKS.copHeavy, hp: 180, ...o });

const npc: Partial<Record<'wrench' | 'blaze' | 'driver' | 'blazeRamp', NpcHandle>> = {};

const TOLL_COVER: Vec3T[] = [[-5.2, 0, -11], [-1.6, 0, -11.4], [2.2, 0, -10.8], [5.6, 0, -11.2], [-3.4, 0, -25], [0.8, 0, -26], [4.6, 0, -25.4], [-4.4, 0, -20.3], [3.2, 0, -22.4], [-4.4, 0, -29.5], [4.4, 0, -29.8], [0, 0, -29]];
const RAMP_COVER: Vec3T[] = [[-1.4, 0, -736], [-5.4, 0, -743], [1.8, 0, -753], [-3, 0, -757], [-4.8, 0, -720.5], [3.8, 0, -728.6], [4.6, 0, -750]];

/** Apply Wrench's bike armour upgrade while riding. */
function mount(d: Director, spec: Parameters<Director['ride']>[0]): void {
  d.ride(spec);
  d.player.damageMul = d.flag('up:armor') ? 0.75 : 1;
}
function dismount(d: Director): void {
  d.dismount();
  d.player.damageMul = 1;
}

// ---------- persistent content ----------

function setup(d: Director): void {
  for (const k of Object.keys(npc) as Array<keyof typeof npc>) delete npc[k];
  if (d.flag('up:mag')) d.upgrade('redline', { mag: 8 });
  npc.wrench = d.npc({ anchor: 'wrench', yaw: Math.PI / 2, look: LOOKS.wrench });
  npc.wrench.onTalk(() => d.say([L('wrench', d.flag('rode') ? '바이크 아끼지 말고 밟아. 고치는 건 내 일이야.' : '준비되면 바이크에 올라타.')]));
  if (!d.flag('rode')) npc.blaze = d.npc({ anchor: 'blaze', yaw: -Math.PI / 2, look: LOOKS.blaze });

  d.pickup('toll-ammo', { type: 'ammo' }, [-2, 0, -12.4]);
  d.pickup('toll-smg', { type: 'weapon', weapon: 'stinger' }, [-5.6, 0, -21.2]);
  d.pickup('toll-med', { type: 'health' }, [5.6, 0, -26]);
  d.pickup('toll-nade', { type: 'gadget', gadget: 'grenade', n: 2 }, [0.8, 0, -27]);
  d.pickup('rest-ammo', { type: 'ammo' }, [6.6, 0, -47.6]);
  d.pickup('rest-drone', { type: 'gadget', gadget: 'drone', n: 1 }, [-7.4, 1.0, -47.2]);
  d.pickup('ramp-lancer', { type: 'weapon', weapon: 'lancer' }, [-6.4, 0, -722]);
  d.pickup('ramp-med', { type: 'health' }, [-4, 0, -740]);
  d.pickup('ramp-ammo', { type: 'ammo' }, [2.6, 0, -731]);
  setupDriver(d);
}

/** Side mission: free the stranded driver and bring her an aid kit (reward: memory fragment + Albatross intel). */
function setupDriver(d: Director): void {
  if (d.flag('rode') && !d.flag('frag:driver')) return; // too late once the bike left the plaza
  let kitPlaced = false;
  const spawnNpc = (): NpcHandle => {
    npc.driver ??= d.npc({ anchor: 'driver', yaw: Math.PI, look: LOOKS.driver });
    return npc.driver;
  };
  const refresh = (): void => {
    if (d.flag('frag:driver')) {
      d.side('driver', null);
      spawnNpc().onTalk(() => d.say([L('driver', '조심해요. 그 헬기, 엔진 하나만 남아도 떠 있어요.')]));
      return;
    }
    if (!d.flag('driver:open')) {
      d.side('driver', null);
      const off = d.usable('driverDoor', '찌그러진 문 비틀어 열기', async () => {
        off();
        d.setFlag('driver:open');
        spawnNpc();
        await d.say([
          L('driver', '살았다… 봉쇄선에서 경찰 드론이 차를 들이받았어요. 다리가 끼어서 못 나왔고요.'),
          L('zero', '걸을 수 있겠어요?'),
          L('driver', '피가 멈추질 않아요. 휴게소 정비소에 구급 키트가 있을 거예요. 부탁해요.'),
        ]);
        d.setFlag('driver:asked');
        refresh();
      }, { hold: 2 });
      return;
    }
    if (d.item('aidkit') === 0) {
      if (!kitPlaced) { kitPlaced = true; d.pickup('aidkit', { type: 'item', item: 'aidkit' }, 'shelf'); }
      d.side('driver', '구급 키트 찾기 — 렌치 정비소');
      spawnNpc().onTalk(() => d.say([L('driver', '정비소 작업대에 있을 거예요…')]));
      return;
    }
    d.side('driver', '운전자에게 구급 키트 전달');
    spawnNpc().onTalk(async () => {
      d.removeItem('aidkit');
      await d.say([
        L('driver', '고마워요. 이제 좀 살 것 같네요.'),
        L('driver', '남편이 헬릭스 수송기 정비사예요. 앨버트로스… 그 헬기는 엔진 네 개 중 하나만 살아 있어도 안 떨어진대요.'),
        L('driver', '퇴근길마다 이 고가에서 라디오를 들었어요. 오늘도 그럴 줄 알았는데.'),
      ]);
      d.fragment('driver');
      refresh();
    });
  };
  d.every(() => { if (d.flag('driver:open') && !d.flag('frag:driver') && d.item('aidkit') > 0 && !d.flag('driver:gotKit')) { d.setFlag('driver:gotKit'); refresh(); } });
  refresh();
}

/** Blaze's challenge (accepted at the rest stop, judged at the broken ramp). */
function blazeTalk(d: Director): void {
  npc.blaze?.onTalk(async () => {
    if (d.flag('blaze:accepted')) { await d.say([L('blaze', '여덟 대 중에 여섯. 잊지 마.')]); return; }
    const c = await d.choose([
      L('blaze', '제로. 헬릭스 봉쇄를 뚫겠다고? 네 굼벵이 바이크로?'),
      L('blaze', '내기 하나 하자. 이 앞 구간에서 경찰 바이크 여덟 대 중 여섯 대 이상 떨구면, 인정해 줄게.'),
    ], ['받아 주지', '시간 없어']);
    if (c === 0) {
      d.setFlag('blaze:accepted');
      await d.say([L('blaze', '좋아. 끊어진 램프에서 보자. 먼저 간다!')]);
    } else {
      await d.say([L('blaze', '쳇, 재미없긴.')]);
    }
  }, '블레이즈와 대화');
}

// ---------- chapter ----------

export const CH2: ChapterDef = {
  id: 'ch2',
  districtId: 'highway',
  no: 2,
  title: '추격',
  time: '01:10',
  hero: '제로',
  briefing: '헬릭스가 9번 고가도로를 통째로 봉쇄했다. 카이에게 받은 소포를 싣고 언더시티 입구까지 달려야 한다. 바이크는 톨게이트에서 EMP를 맞고 렌치의 휴게소로 견인됐다.',
  maxHp: 100,
  moveSpeed: 5.6,
  ability: { kind: 'overdrive', name: '오버드라이브', cooldown: 12, hint: '3초 동안 주변 시간이 느려진다' },
  loadout: { weapons: ['redline'], grenade: 1 },
  fragments: { driver: '운전자의 기억 — 퇴근길 라디오', blaze: '블레이즈의 기억 — 첫 우승 트로피' },
  setup,
  outro: '앨버트로스는 추락했지만, 제로의 바이크도 마지막 미사일에 맞아 언더시티 상공에서 떨어졌다. 소포는 B-13 수직갱 아래로 사라졌다. 다음: CH3 「배신」 — 아이기스',
  stages: [
    // ---- 0: break the toll-plaza blockade on foot ----
    {
      id: 'toll',
      name: '톨게이트 봉쇄선',
      checkpoint: 'spawn',
      restore(d) { d.sw('barrier'); },
      async run(d) {
        d.addItem('package');
        void d.radio([
          L('wrench', '제로, 바이크가 EMP 그물에 걸렸다며? 휴게소로 견인해 놨어. 거기까지만 걸어와.'),
          L('zero', '톨게이트에 헬릭스 교통국이 쫙 깔렸어.'),
          L('wrench', '레드라인 여섯 발이면 충분하잖아. 급하면 Shift — 오버드라이브.'),
        ]);
        const w1 = d.gang([
          cop([-3.5, 0, -16], { cover: TOLL_COVER, yaw: Math.PI }),
          cop([2.5, 0, -15], { cover: TOLL_COVER, yaw: Math.PI }),
          cop([5.4, 0, -21], { cover: TOLL_COVER }),
        ]);
        const dr = d.drones([
          { at: [-3, 4, -14], patrol: [[-3, 4, -14], [3, 4.5, -20], [3, 4, -8]] },
          { at: [4, 4.5, -26], patrol: [[4, 4.5, -26], [-4, 4.5, -26]], alarm: true },
        ]);
        const tur = d.turrets([{ at: [0, 4.05, -31.4], ceiling: true }]);
        let w2: ReturnType<Director['gang']> = [];
        const all = (): readonly { alive: boolean }[] => [...w1, ...dr, ...tur, ...w2];
        const prog = (): void => { const a = all(); d.objective('톨게이트 봉쇄선 돌파', `${a.filter((e) => !e.alive).length}/${a.length}`); };
        prog();
        void (async () => {
          await d.zone({ maxZ: -13 });
          w2 = d.gang([
            cop([-4.4, 0, -30.4], { cover: TOLL_COVER, aggressive: true }),
            cop([4.4, 0, -30.4], { cover: TOLL_COVER, aggressive: true }),
            heavy([0, 0, -30.6], { cover: TOLL_COVER, aggressive: true, drop: 'ammo' }),
          ]);
          void d.radio([L('zero', '부스 쪽에서 더 나온다!')]);
        })();
        await d.until(() => { prog(); return w2.length > 0 && all().every((e) => !e.alive); });
        void d.radio([L('wrench', '차단기만 올리면 바로 휴게소야. 부스 사이 제어반 써.')]);
        d.objective('톨게이트 차단기 해제');
        d.marker('barrier');
        await d.use('barrier', '차단기 해제', { hold: 1.5 });
        d.sw('barrier');
        d.marker(null);
        d.objective('렌치의 휴게소로');
        d.marker('wrench');
        await d.zone({ maxZ: -36.5 });
        d.marker(null);
      },
    },
    // ---- 1: rest stop — upgrade, Blaze's challenge, mount up ----
    {
      id: 'rest',
      name: '렌치의 휴게소',
      checkpoint: 'cp:rest',
      restore(d) {
        d.setFlag('rode');
        d.sw('zeroBike');
      },
      async run(d) {
        blazeTalk(d);
        d.objective('렌치와 대화');
        d.marker('wrench');
        await d.talkTo(npc.wrench!, '렌치와 대화');
        d.marker(null);
        const c = await d.choose([
          L('wrench', '왔냐. 바이크는 EMP 회로만 갈면 돼. 그동안 하나 손봐 줄게. 골라.'),
        ], ['레드라인 탄창 확장 (6 → 8발)', '바이크 장갑 보강 (주행 중 받는 피해 25% 감소)']);
        if (c === 0) { d.setFlag('up:mag'); d.upgrade('redline', { mag: 8 }); d.toast('레드라인 — 탄창 8발'); }
        else { d.setFlag('up:armor'); d.toast('바이크 장갑 보강 — 주행 중 피해 25% 감소'); }
        await d.say([
          L('wrench', '그리고 탄약 급탄기 달아 놨어. 타고 있는 동안은 탄창이 알아서 찬다.'),
          L('wrench', '볼일 남았으면 지금 봐. 한 번 달리면 이 휴게소로는 못 돌아와.'),
        ]);
        npc.wrench!.onTalk(() => d.say([L('wrench', '준비되면 바이크에 올라타.')]));
        d.objective('바이크에 타기');
        d.marker('zeroBike');
        await d.use('zeroBike', '바이크 타기');
        d.marker(null);
        d.setFlag('rode');
        d.sw('zeroBike');
        d.side('driver', null);
        npc.blaze?.remove();
        npc.blaze = undefined;
        d.sw('blazeGone');
      },
    },
    // ---- 2: ride 1 — police bikes and armoured trucks ----
    {
      id: 'ride1',
      name: '추격 1',
      checkpoint: 'cp:ride1',
      async run(d) {
        mount(d, { lanes: CH2_LANES, from: -58, to: -706, speed: 19 });
        d.objective('9번 고가 돌파 — 끊어진 램프까지');
        void d.radio([
          L('wrench', '차선은 A·D, 스틱 좌우, 터치면 ◀ ▶ 버튼. 조준이랑 사격만 신경 써.'),
          L('blaze', '느려, 제로! 램프에서 기다릴게!'),
        ]);
        const riders: Rider[] = [];
        const accepted = d.flag('blaze:accepted');
        const kills = (): number => riders.filter((r) => r.killed).length;
        if (accepted) d.every(() => { if (!d.flag('blaze:judged')) d.side('blaze', '블레이즈의 도전: 경찰 바이크 격추', `${kills()}/6`); });
        d.turrets([{ at: [-4, 5.9, -250], ceiling: true }, { at: [4, 5.9, -250], ceiling: true }, { at: [0, 5.9, -550], ceiling: true }]);

        await d.rideTo(-95);
        void d.radio([L('police', '도주 차량 확인. 9번 고가 순찰대, 차선 봉쇄.')]);
        riders.push(...d.riders([{ lane: 0, dz: 28 }, { lane: 2, dz: 34 }]));
        await d.rideTo(-200);
        d.truck(1, -75);
        d.toast('전방 장갑 차량 — 차선 변경!');
        await d.rideTo(-300);
        riders.push(...d.riders([{ lane: 1, dz: 30 }, { lane: 0, dz: -60 }, { lane: 2, dz: 40 }]));
        await d.rideTo(-430);
        d.truck(0, -75);
        d.truck(2, -105);
        d.toast('장갑 차량 두 대 — 가운데 차선!');
        await d.rideTo(-500);
        riders.push(...d.riders([{ lane: 2, dz: 30 }, { lane: 0, dz: 36, hp: 90 }, { lane: 1, dz: -55 }]));
        await d.rideTo(-640);
        void d.radio([L('wrench', '제로! 앞에 램프 끊겼다! 속도 줄여!')]);
        await d.arrived();
        d.clearEnemies();
        dismount(d);
        if (accepted) {
          d.setFlag('blaze:judged');
          if (kills() >= 6) d.setFlag('blaze:won');
          d.side('blaze', kills() >= 6 ? '블레이즈에게 결과 확인' : null);
        }
      },
    },
    // ---- 3: broken ramp — take the control booth, hijack the traffic signal ----
    {
      id: 'ramp',
      name: '관제탑',
      checkpoint: 'cp:ramp',
      restore(d) {
        for (const s of ['console', 'signal', 'bridge']) d.sw(s);
        d.sw('blazeRamp');
        d.sw('blazeRampGone');
      },
      async run(d) {
        d.sw('rampBike', true);
        d.sw('blazeRamp', true);
        const bl = npc.blazeRamp = d.npc({ anchor: 'blazeRamp', yaw: Math.PI / 2, look: LOOKS.blaze });
        bl.onTalk(async () => {
          if (d.flag('blaze:won') && !d.flag('frag:blaze')) {
            await d.say([
              L('blaze', '여섯 대 이상? …인정. 너 꽤 탄다.'),
              L('blaze', '이거 받아. 내 첫 우승 날 찍은 기록이야. 그때는 이 고가가 경주로였지. 헬릭스가 막기 전엔.'),
            ]);
            d.fragment('blaze');
            d.side('blaze', null);
          } else {
            await d.say([L('blaze', '관제탑 신호부터 뺏어. 다리를 내려야 건너지.')]);
          }
        }, '블레이즈와 대화');
        void d.radio([
          L('zero', '램프가 통째로 날아갔어. 건널 방법이…'),
          L('signal', '…교통 관제 잔여 신호. 관제 부스 콘솔에 접속해 주세요. 다리를 내릴게요.'),
          L('zero', '누구야? …아까 소포에서 들리던 목소리랑 비슷한데.'),
        ]);
        const g = d.gang([
          cop([-4, 0, -745], { cover: RAMP_COVER, yaw: 0 }),
          cop([3, 0, -752], { cover: RAMP_COVER, yaw: 0 }),
          cop([-2, 0, -758], { cover: RAMP_COVER, yaw: 0 }),
          heavy([5, 0, -756], { cover: RAMP_COVER, yaw: 0 }),
        ]);
        const dr = d.drones([{ at: [0, 4.5, -740], patrol: [[0, 4.5, -740], [-5, 4.5, -728], [5, 5, -752]] }]);
        const tur = d.turrets([{ at: [-6, 5.85, -757], ceiling: true }]);
        const first = [...g, ...dr, ...tur];
        d.objective('관제 부스 확보');
        d.marker('console');
        await d.allDown(first, (n, t) => d.objective('관제 부스 확보', `${n}/${t}`));
        d.objective('관제 콘솔 접속');
        await d.use('console', '콘솔 접속', { hold: 2 });
        d.marker(null);
        d.sw('console');
        void d.radio([
          L('signal', '연결됐어요. 신호 체계를 다시 쓰는 중… 30초만 지켜 주세요.'),
          L('police', '관제탑 무단 접속 감지. 전 순찰대, 램프로 집결.'),
        ]);
        let left = 30;
        const tick = async (): Promise<void> => {
          while (left > 0) { d.objective('신호 탈취 중 — 콘솔 지키기', `${left}초`); await d.wait(1); left--; }
        };
        const waves = async (): Promise<void> => {
          d.gang([cop([-5, 0, -712], { aggressive: true, cover: RAMP_COVER }), cop([4, 0, -714], { aggressive: true, cover: RAMP_COVER })]);
          await d.wait(9);
          d.drones([{ at: [-3, 5, -760] }, { at: [3, 5, -760] }], true);
          await d.wait(9);
          d.gang([heavy([0, 0, -712], { aggressive: true, cover: RAMP_COVER }), cop([-6, 0, -716], { aggressive: true, cover: RAMP_COVER })]);
        };
        await Promise.all([tick(), waves()]);
        d.sw('signal');
        d.sw('bridge');
        void d.radio([L('signal', '초록불. 다리 내려요. …제로, 그 소포를 꼭 아래까지.')]);
        await d.wait(2);
        d.clearEnemies();
        await d.say([
          L('blaze', '다리 내려왔다! 이 앞은 헬릭스 수송기가 지키고 있어.'),
          L('blaze', '뒤에 붙는 순찰대는 내가 끌고 갈게. 넌 앞만 봐.'),
          L('zero', '방해하더니 이제 와서 길을 터 주겠다고?'),
          L('blaze', '경주는 공정해야지. 헬릭스는 반칙이잖아.'),
        ]);
        bl.remove();
        npc.blazeRamp = undefined;
        d.sw('blazeRampGone');
      },
    },
    // ---- 4: ride 2 — Albatross ----
    {
      id: 'ride2',
      name: '추격 2 — 앨버트로스',
      checkpoint: 'cp:ramp',
      async run(d) {
        d.sw('rampBike', true);
        d.objective('바이크에 타기');
        d.marker('rampBike');
        await d.use('rampBike', '바이크 타기');
        d.marker(null);
        d.sw('rampBike', false);
        mount(d, { lanes: CH2_LANES, from: -708, loop: [-800, -1400], speed: 20 });
        d.objective('언더시티 입구까지 질주');
        await d.rideTo(-790);
        const a = d.albatross();
        void d.radio([
          L('pilot', '앨버트로스, 표적 확인. 소포째로 날려 버린다.'),
          L('wrench', '수송 헬기다! 엔진 네 개를 하나씩 떨궈!'),
          L('wrench', d.flag('frag:driver') ? '운전자 말대로라면 하나라도 남으면 안 떨어진다. 전부 쏴!' : '빨간 표시가 뜬 차선은 미사일이야. 피해!'),
        ]);
        await d.wait(3);
        a.onHalf = () => {
          void d.radio([L('pilot', '순찰대, 측면 압박!'), L('blaze', '뒤는 내가 맡는다고 했지!')]);
          d.riders([{ lane: 0, dz: 30 }, { lane: 2, dz: 36 }]);
        };
        a.engage();
        d.boss(a);
        d.objective('앨버트로스 격추 — 엔진 4개');
        void (async () => {
          while (!a.defeated) {
            await d.wait(24);
            if (!a.defeated) { d.truck(Math.floor(Math.random() * 3), -80); d.toast('전방 장갑 차량!'); }
          }
        })();
        await d.until(() => a.defeated);
        d.boss(null);
        d.objective(null);
        d.toast('앨버트로스 격추!');
        d.cinematic(true);
        await d.look(a.root.position, 1.2);
        await d.say([
          L('pilot', '메이데이, 메이데이… 마지막 한 발이다, 배달부!'),
          L('zero', '젠장—!'),
        ]);
        d.player.kick(1.2);
        await d.wait(0.6);
        await d.fade(1, 0.8, '01:52 — 제로, 언더시티 상공에서 격추');
        d.clearEnemies();
        dismount(d);
        await d.wait(1.2);
        await d.say([
          L('signal', '제로…! 소포가 떨어져요. B-13 수직갱으로—'),
          L('zero', '…글리치한테 전해. 소포는… 아래에 있어.'),
        ]);
        d.removeItem('package');
        await d.wait(0.8);
      },
    },
  ],
};
