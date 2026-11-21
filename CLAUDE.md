# CLAUDE.md — NEXUS-77 작업 가이드

이 저장소에서 코딩 에이전트가 이어서 작업할 때 지킬 규칙과 맥락이다.

## 프로젝트 맥락

- 사이버펑크 3D 웹 게임. three.js r187 + Vite + TypeScript. 나중에 Capacitor로 모바일 이식.
- 1인칭 FPS 스토리 게임 「NEXUS-77: 오버라이드」. 챕터(구역)마다 다른 주인공 5명.
- 현재 v0.4(Ch1–3) 완료, 다음 목표는 `docs/ROADMAP.md`의 v0.5(Ch4·Ch5·엔딩)다.
- 작업을 마치면 빌드 통과 후 커밋하고 `https://github.com/flashattention/nexus-77`(origin)에 푸시한다.
- 기획은 `docs/GAME_DESIGN.md`(v0.2 확정). 기획에서 벗어나는 변경은 사용자에게 먼저 확인한다.
- UI 문구는 한국어로 쓴다. 코드 주석과 식별자는 영어로 쓴다.

## 명령

```bash
npm run dev        # 개발 서버
npm run typecheck  # tsc --noEmit
npm run build      # 타입 체크 + 빌드 (커밋 전에 반드시 통과)
```

## 코드 규칙

- 새 코드는 strict TypeScript로 쓴다. `any`는 피하고, 불가피하면 이유를 주석으로 남긴다.
- `src/engine/SceneKit.ts`, `src/scenes/*.ts`는 데모에서 옮겨 온 `// @ts-nocheck` 코드다. 수정하는 함수부터 타입을 붙이고, 파일 전체가 통과하면 nocheck를 지운다.
- 장면 빌더 계약: `(kit, ctx) => void`. 프레임 업데이트는 `ctx.up`, 히어로는 `ctx.hero`. `ctx.mode === 'play'`일 때 빌더는 `ctx.level`(충돌체·스폰·경계)을 채운다 — `kit.solid`/`kit.solidObject`/`kit.playArea`를 쓰고, `kit.city` 건물은 자동으로 충돌체가 된다. 계약을 넓힐 땐 `src/engine/types.ts`부터 바꾸고 5개 장면을 모두 맞춘다.
- 게임 로직은 `src/game/`에 둔다(`Game` 세션, `Input`, `player/`(이동·무기·장비), `ai/`(적), `actors/`(인체 리그·NPC), `story/Director.ts`, `ui/Hud.ts`). 데이터는 `src/data/`(`chapters/`, `weapons.ts`, `items.ts`, `speakers.ts`). 렌더링(`app/`, `engine/`, `scenes/`)과 섞지 않는다. Viewer는 `FrameDriver`(=`Game`)에 카메라와 프레임 로직을 넘긴다.
- 챕터는 `src/data/chapters/chN.ts`의 스테이지 배열이다. 각 스테이지 `run(d)`는 `Director` API(`objective`, `say`, `radio`, `gang`, `drones`, `use`, `zone`, `sw` 등)로 쓰는 async 스크립트이고, 체크포인트 단위다. 이후 스테이지에서 재시작할 때 월드 상태를 되돌리려면 `restore(d)`를 채운다. 맵 좌표는 장면의 `anchors`/`switches` 이름으로 참조한다.
- 정적 소품은 그룹에 모아 `kit.bake`로 병합하고, 재질은 `kit.mat`으로 공유한다(드로우콜). 움직이는 오브젝트는 `userData.dynamic = true`.
- 프레임 안 할당 최소화: 루프에서 `new THREE.Vector3()` 금지, 임시 벡터는 모듈 상수로 재사용한다.
- 장면을 교체하거나 엔티티를 제거할 땐 geometry·material·texture를 `dispose()`한다(`Viewer.disposeScene` 참고).
- 외부 에셋을 추가할 땐 `public/`에 넣고 상대 경로로 참조한다(Capacitor 호환). CDN 런타임 의존은 늘리지 않는다.

## 모바일 고려 (항상)

- 모든 조작은 터치로도 가능해야 한다. 터치 타깃은 최소 44px.
- 세로·가로 둘 다 레이아웃이 깨지지 않게 한다. safe-area inset을 존중한다.
- 성능 예산: 드로우콜 300 이하, 그림자 드리우는 라이트 1개, 모바일 픽셀 비율 1.5 이하.
- 키보드 전용 기능을 만들지 않는다.

## 테스트 / 확인

- 변경 후 `npm run build`로 확인한다. 화면 확인은 `npm run dev` → 데스크톱 + 브라우저 모바일 에뮬레이션(390×844)으로 한다.
- 각 구역은 URL 해시로 바로 열린다: `#bazaar` `#highway` `#spire` `#undercity` `#datacore`. 플레이는 `#bazaar/play`.
- 개발 서버에서는 콘솔에 `window.__nexus`(viewer, game)가 노출된다(프로덕션 빌드에선 제거됨). 브라우저 자동 테스트에 쓴다.
