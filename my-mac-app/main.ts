import * as THREE from 'three';
import {
  bullets,
  createExplosion,
  createTank,
  disposeGroup,
  disposeTank,
  enemyTanks,
  explosions,
  fireBullet,
  getShotRangeBounds,
  playerTanks,
  updateTank,
  type TankData,
  type TankTypeId,
} from './tank';
import {
  buildTerrain,
  damageObstacle,
  findObstacleHit,
  getGroundHeight,
  getGroundNormal,
  terrainObstacles,
} from './terrain';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Missing #app root element');

app.innerHTML = `
  <header class="topbar">
    <div class="brand"><span class="brand-mark">⬡</span><div><strong>钢铁前线</strong><small>ARMORED FRONTIER</small></div></div>
    <div class="battle-status"><i></i><span id="battle-status">战斗进行中</span></div>
    <div class="top-actions"><span class="team-label"><i></i>蓝方</span><button id="settings-button" aria-expanded="false">⚙ 设置</button></div>
  </header>
  <section class="battle-hud">
    <div class="tank-card"><div class="card-title"><span>我方战车</span><b id="player-type">中型坦克</b></div><div class="health-track"><i id="player-health"></i></div><div class="health-copy" id="player-health-copy">装甲 4 / 4</div></div>
    <div class="battle-readout"><span>敌方战车</span><b id="enemy-health-copy">装甲 4 / 4</b><div class="health-track enemy-track"><i id="enemy-health"></i></div></div>
  </section>
  <section class="settings-panel" id="settings-panel" hidden>
    <div class="settings-title">战场设置 <button id="close-settings" aria-label="关闭设置">×</button></div>
    <label class="setting-row"><span>镜头模式</span><select id="camera-mode"><option value="follow">跟随战车</option><option value="fixed">固定视角</option></select></label>
    <label class="setting-row"><span>坦克类型</span><select id="tank-type"><option value="light">轻型坦克</option><option value="medium">中型坦克</option><option value="heavy">重型坦克</option></select></label>
    <div class="ai-settings">
      <div class="ai-settings-title">敌方 AI 范围</div>
      <label class="range-setting"><span>活动半径 <output id="enemy-move-value"></output></span><input id="enemy-move-range" type="range" min="8" max="60" step="1"></label>
      <label class="range-setting"><span>射击范围 <output id="enemy-attack-value"></output></span><input id="enemy-attack-range" type="range" min="10" max="70" step="1"></label>
      <label class="range-setting"><span>视觉范围 <output id="enemy-vision-value"></output></span><input id="enemy-vision-range" type="range" min="11" max="80" step="1"></label>
      <small class="range-hint">视觉范围始终大于射击范围；地形障碍会遮挡视野。</small>
    </div>
    <p class="settings-hint">右键拖动旋转视角，滚轮缩放；镜头默认跟随战车。</p>
    <button class="reset-button" id="reset-game">重开战斗</button>
  </section>
  <div class="crosshair" id="crosshair"></div>
  <div class="toast" id="toast"></div>
  <footer class="controls"><span><kbd>W/S</kbd> 前进/倒车</span><span><kbd>A/D</kbd> 履带转向</span><span><kbd>鼠标</kbd> 炮塔瞄准</span><span><kbd>左键</kbd> 开火</span><span><kbd>空格</kbd> 加速</span><span><kbd>右键拖动</kbd> 旋转视角</span><span><kbd>滚轮</kbd> 缩放</span></footer>
`;

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#101914; color:#eaf0e5; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  #app { position:fixed; inset:0; }
  canvas { display:block; width:100%; height:100%; }
  .topbar { position:absolute; z-index:2; inset:0 0 auto; height:58px; padding:0 22px; display:flex; align-items:center; gap:26px; background:linear-gradient(180deg,rgba(11,12,22,.94),rgba(11,12,22,.62)); border-bottom:1px solid #9e79da55; box-shadow:0 8px 26px #06050d55; pointer-events:none; }
  .brand { display:flex; align-items:center; gap:10px; min-width:220px; }.brand-mark { color:#d8bc6d; font-size:28px; }.brand strong { display:block; font-size:19px; letter-spacing:3px; }.brand small { display:block; margin-top:2px; color:#8b9b83; font-size:9px; letter-spacing:2px; }
  .battle-status { color:#d8c9f2; font-size:12px; letter-spacing:1px; }.battle-status i { display:inline-block; width:7px; height:7px; margin-right:8px; border-radius:50%; background:#a883f4; box-shadow:0 0 9px #a883f4; }
  .top-actions { margin-left:auto; display:flex; align-items:center; gap:18px; }.team-label { color:#8acbff; font-size:13px; }.team-label i { display:inline-block; width:8px; height:8px; margin-right:6px; border-radius:50%; background:#45a9f3; }
  button, select { font:inherit; }.top-actions button { padding:7px 12px; color:#e7dcf7; background:#211b30; border:1px solid #7756a2; cursor:pointer; pointer-events:auto; }.top-actions button:hover { background:#332344; }
  .battle-hud { position:absolute; z-index:2; top:74px; left:16px; display:flex; gap:7px; pointer-events:none; }.tank-card,.battle-readout { width:188px; padding:9px 11px; background:linear-gradient(135deg,rgba(15,14,25,.9),rgba(19,18,29,.78)); border:1px solid #8d70bb66; border-left:2px solid #9f77e7; box-shadow:0 8px 22px #0005; backdrop-filter:blur(8px); }.card-title { display:flex; justify-content:space-between; color:#d5cee2; font-size:11px; }.card-title b { color:#d8baff; }.health-track { height:6px; margin-top:7px; overflow:hidden; background:#3b2422; border-radius:5px; }.health-track i { display:block; width:100%; height:100%; background:linear-gradient(90deg,#7b53d1,#c39aff); transition:width .15s; }.enemy-track i { background:linear-gradient(90deg,#bb3e80,#f08ac5); }.health-copy { margin-top:4px; color:#aaa0b9; font-size:10px; }.battle-readout { color:#d7c8bf; font-size:11px; }.battle-readout b { float:right; color:#f0a1d0; font-weight:500; }
  .settings-panel { position:absolute; z-index:5; top:68px; right:14px; width:min(300px,calc(100vw - 28px)); max-height:calc(100vh - 82px); overflow:auto; padding:14px; background:rgba(15,14,24,.96); border:1px solid #8565b5; box-shadow:0 12px 36px #0009; backdrop-filter:blur(12px); }.settings-panel[hidden] { display:none; }.settings-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; color:#d8baff; font-weight:700; letter-spacing:1px; }.settings-title button { color:#cbbce1; background:none; border:0; font-size:22px; cursor:pointer; }.setting-row { display:flex; align-items:center; justify-content:space-between; margin:9px 0; color:#d0c8dc; font-size:12px; }.setting-row select { min-width:125px; padding:6px; color:#e8def5; background:#211c2c; border:1px solid #66517f; }.ai-settings { padding:11px 0 3px; margin-top:11px; border-top:1px solid #8565b555; }.ai-settings-title { margin-bottom:10px; color:#d8baff; font-size:12px; letter-spacing:1px; }.range-setting { display:block; margin:10px 0; color:#d0c8dc; font-size:11px; }.range-setting span { display:flex; justify-content:space-between; margin-bottom:5px; }.range-setting output { color:#d5b8ff; font-variant-numeric:tabular-nums; }.range-setting input { width:100%; accent-color:#aa69ff; }.range-hint { color:#9e94ae; font-size:10px; line-height:1.5; }.settings-hint { color:#9e94ae; font-size:10px; line-height:1.6; }.reset-button { width:100%; margin-top:10px; padding:9px; color:#f2d9ee; background:#48253d; border:1px solid #a85a91; cursor:pointer; }.reset-button:hover { background:#603052; }
  .crosshair { position:absolute; z-index:2; width:22px; height:22px; border:1px solid #ffe37d; border-radius:50%; transform:translate(-50%,-50%); pointer-events:none; opacity:.9; }.crosshair:before,.crosshair:after { content:""; position:absolute; background:#ffe37d; }.crosshair:before { left:9px; top:-5px; width:1px; height:30px; }.crosshair:after { top:9px; left:-5px; width:30px; height:1px; }
  .toast { position:absolute; z-index:3; top:166px; left:50%; padding:9px 16px; color:#fff0c6; background:#172018e8; border:1px solid #958454; transform:translate(-50%,-6px); opacity:0; transition:.2s; pointer-events:none; }.toast.show { opacity:1; transform:translate(-50%,0); }
  .controls { position:absolute; z-index:2; left:50%; bottom:12px; display:flex; gap:12px; padding:7px 11px; color:#d8d0e4; background:rgba(14,13,22,.82); border:1px solid #8667ad66; box-shadow:0 8px 26px #0006; transform:translateX(-50%); white-space:nowrap; font-size:10px; pointer-events:none; backdrop-filter:blur(8px); }.controls span { display:flex; align-items:center; gap:4px; }.controls kbd { padding:2px 5px; color:#dfc7ff; background:#2a2237; border:1px solid #725b91; border-radius:3px; font:inherit; }
  @media(max-width:700px) { .topbar { height:52px; padding:0 10px; }.brand { min-width:0; }.brand strong { font-size:15px; }.brand small { font-size:8px; }.battle-status { display:none; }.battle-hud { top:62px; left:6px; gap:5px; }.tank-card,.battle-readout { width:142px; padding:7px 8px; }.battle-readout { width:142px; }.controls { max-width:calc(100% - 12px); bottom:6px; gap:6px; flex-wrap:wrap; justify-content:center; white-space:normal; font-size:9px; }.settings-panel { top:58px; right:6px; } }
`;
document.head.appendChild(style);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1b2c26);
scene.fog = new THREE.Fog(0x1b2c26, 80, 165);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.1, 250);
camera.up.set(0, 1, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xc6d9be, 0x394437, 1.8));
const sunlight = new THREE.DirectionalLight(0xffe7c2, 2);
sunlight.position.set(-35, 60, 20);
sunlight.castShadow = true;
sunlight.shadow.mapSize.set(2048, 2048);
scene.add(sunlight);

const ground = buildTerrain(scene);
const landingMarker = new THREE.Group();
const landingMarkerMaterial = new THREE.MeshBasicMaterial({
  color: 0xb34dff,
  transparent: true,
  opacity: 0,
  depthWrite: false,
});
const landingRing = new THREE.Mesh(new THREE.RingGeometry(0.65, 0.9, 32), landingMarkerMaterial);
landingRing.rotation.x = -Math.PI / 2;
landingRing.position.y = 0.06;
landingMarker.add(landingRing);
landingMarker.visible = false;
scene.add(landingMarker);
function createAimRangeMarker(color: number) {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.48, 0.68, 32), material);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.07;
  group.add(ring);
  scene.add(group);
  group.visible = false;
  return group;
}
const nearestAimMarker = createAimRangeMarker(0x38e7ff);
const farthestAimMarker = createAimRangeMarker(0xb34dff);
const grid = new THREE.GridHelper(120, 30, 0x9cad78, 0x647255);
grid.position.y = 0.06;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.17;
scene.add(grid);

const playerTypeSelect = document.querySelector<HTMLSelectElement>('#tank-type')!;
const cameraModeSelect = document.querySelector<HTMLSelectElement>('#camera-mode')!;
const enemyMoveRangeInput = document.querySelector<HTMLInputElement>('#enemy-move-range')!;
const enemyAttackRangeInput = document.querySelector<HTMLInputElement>('#enemy-attack-range')!;
const enemyVisionRangeInput = document.querySelector<HTMLInputElement>('#enemy-vision-range')!;
const settingsPanel = document.querySelector<HTMLElement>('#settings-panel')!;
const settingsButton = document.querySelector<HTMLButtonElement>('#settings-button')!;
const playerHealthBar = document.querySelector<HTMLElement>('#player-health')!;
const playerHealthCopy = document.querySelector<HTMLElement>('#player-health-copy')!;
const enemyHealthBar = document.querySelector<HTMLElement>('#enemy-health')!;
const enemyHealthCopy = document.querySelector<HTMLElement>('#enemy-health-copy')!;
const playerTypeLabel = document.querySelector<HTMLElement>('#player-type')!;
const battleStatus = document.querySelector<HTMLElement>('#battle-status')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const crosshair = document.querySelector<HTMLDivElement>('#crosshair')!;

const cameraPreference = localStorage.getItem('tank-camera-mode');
cameraModeSelect.value = cameraPreference === 'fixed' ? 'fixed' : 'follow';

let player: TankData;
let enemy: TankData;
let isGameOver = false;
let toastTimer = 0;
let cameraDragPointerId: number | null = null;
let previousCameraPointer = { x: 0, y: 0 };
let landingMarkerLife = 0;
let cameraShakeTime = 0;
let cameraShakeAmplitude = 0;
let soundContext: AudioContext | null = null;
interface DustParticle {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  groundY: number;
  material: THREE.MeshBasicMaterial;
}
const dustParticles: DustParticle[] = [];
const enemyHome = new THREE.Vector3();
const enemyMoveRadius = { value: loadEnemySetting('enemy-move-radius', 36, 8, 60) };
const enemyAttackRange = { value: loadEnemySetting('enemy-attack-range', 42, 10, 70) };
const enemyVisionRange = { value: loadEnemySetting('enemy-vision-range', 48, 11, 80) };
const heldKeys = new Set<string>();
const clock = new THREE.Timer();
const raycaster = new THREE.Raycaster();
const projectileRaycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const projectileDirection = new THREE.Vector3();
const projectileHitPoint = new THREE.Vector3();
const targetBounds = new THREE.Box3();

function unlockSound() {
  soundContext ??= new AudioContext();
  if (soundContext.state === 'suspended') void soundContext.resume();
}

function playDragonRoar() {
  const context = soundContext;
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.32, now + 0.035);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 1.25);
  master.connect(context.destination);

  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(900, now);
  filter.frequency.exponentialRampToValueAtTime(150, now + 1.05);
  filter.Q.setValueAtTime(5, now);
  filter.connect(master);

  const distortion = context.createWaveShaper();
  const curve = new Float32Array(256);
  for (let index = 0; index < curve.length; index++) {
    const x = (index * 2) / (curve.length - 1) - 1;
    curve[index] = Math.tanh(x * 3.4);
  }
  distortion.curve = curve;
  distortion.oversample = '2x';
  distortion.connect(filter);

  for (const [frequency, type, level] of [
    [92, 'sawtooth', 0.55],
    [138, 'triangle', 0.3],
    [46, 'sine', 0.38],
  ] as const) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.48, now + 0.95);
    oscillator.detune.setValueAtTime(-12, now);
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
    oscillator.connect(gain);
    gain.connect(distortion);
    oscillator.start(now);
    oscillator.stop(now + 1.2);
  }

  const noiseBuffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let index = 0; index < noiseData.length; index++) {
    noiseData[index] = (Math.random() * 2 - 1) * (1 - index / noiseData.length);
  }
  const noise = context.createBufferSource();
  noise.buffer = noiseBuffer;
  const noiseFilter = context.createBiquadFilter();
  noiseFilter.type = 'bandpass';
  noiseFilter.frequency.setValueAtTime(620, now);
  noiseFilter.frequency.exponentialRampToValueAtTime(115, now + 0.8);
  noiseFilter.Q.value = 0.8;
  const noiseGain = context.createGain();
  noiseGain.gain.setValueAtTime(0.18, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.78);
  noise.connect(noiseFilter);
  noiseFilter.connect(noiseGain);
  noiseGain.connect(master);
  noise.start(now);
  noise.stop(now + 0.8);
}
const slopeNormal = new THREE.Vector3();
const worldUp = new THREE.Vector3(0, 1, 0);
const projectileModelForward = new THREE.Vector3(0, 0, 1);
const cameraTarget = new THREE.Vector3();
const cameraDistance = { value: 26 };
const cameraYaw = { value: 0 };
const cameraElevation = { value: 0.58 };
const cameraOffset = new THREE.Vector3();
const desiredCameraPosition = new THREE.Vector3();
const followTarget = new THREE.Vector3();
const dustGeometry = new THREE.SphereGeometry(0.16, 6, 5);

function loadEnemySetting(key: string, fallback: number, minimum: number, maximum: number) {
  const stored = Number(localStorage.getItem(key));
  return Number.isFinite(stored) && stored >= minimum && stored <= maximum ? stored : fallback;
}

function updateEnemyRangeLabels() {
  document.querySelector('#enemy-move-value')!.textContent = `${enemyMoveRadius.value} 米`;
  document.querySelector('#enemy-attack-value')!.textContent = `${enemyAttackRange.value} 米`;
  document.querySelector('#enemy-vision-value')!.textContent = `${enemyVisionRange.value} 米`;
}

function setRangeInput(input: HTMLInputElement, value: number, minimum: number, maximum: number) {
  input.min = String(minimum);
  input.max = String(maximum);
  input.value = String(value);
}

function configureEnemyRanges(changed?: 'attack' | 'vision') {
  if (changed === 'attack' && enemyVisionRange.value <= enemyAttackRange.value) {
    enemyVisionRange.value = Math.min(80, enemyAttackRange.value + 2);
  }
  if (changed === 'vision' && enemyVisionRange.value <= enemyAttackRange.value) {
    enemyAttackRange.value = Math.max(10, enemyVisionRange.value - 2);
  }
  enemyVisionRange.value = Math.max(enemyAttackRange.value + 1, enemyVisionRange.value);
  setRangeInput(enemyMoveRangeInput, enemyMoveRadius.value, 8, 60);
  setRangeInput(enemyAttackRangeInput, enemyAttackRange.value, 10, 70);
  setRangeInput(enemyVisionRangeInput, enemyVisionRange.value, 11, 80);
  localStorage.setItem('enemy-move-radius', String(enemyMoveRadius.value));
  localStorage.setItem('enemy-attack-range', String(enemyAttackRange.value));
  localStorage.setItem('enemy-vision-range', String(enemyVisionRange.value));
  updateEnemyRangeLabels();
}

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = 2.2;
}

function makeMatch(typeId: TankTypeId) {
  landingMarkerLife = 0;
  landingMarker.visible = false;
  nearestAimMarker.visible = false;
  farthestAimMarker.visible = false;
  cameraShakeTime = 0;
  cameraShakeAmplitude = 0;
  for (const particle of dustParticles.splice(0)) {
    scene.remove(particle.mesh);
    particle.material.dispose();
  }
  for (const tank of [...playerTanks, ...enemyTanks]) {
    scene.remove(tank.group);
    disposeTank(tank);
  }
  playerTanks.splice(0);
  enemyTanks.splice(0);
  for (const bullet of bullets.splice(0)) {
    scene.remove(bullet.mesh);
    disposeGroup(bullet.mesh);
  }
  for (const explosion of explosions.splice(0)) {
    scene.remove(explosion.mesh);
    disposeGroup(explosion.mesh);
  }

  createTank(false, 0, 42, scene, ground, typeId);
  player = playerTanks[playerTanks.length - 1];
  createTank(true, 0, -42, scene, ground, 'medium');
  enemy = enemyTanks[enemyTanks.length - 1];
  enemyHome.copy(enemy.group.position);
  enemy.targetPos.copy(player.group.position);
  isGameOver = false;
  battleStatus.textContent = '战斗进行中';
  playerTypeLabel.textContent = player.type.name;
  updateHealthUI();
  cameraTarget.copy(player.group.position);
  cameraTarget.y += 1.15;
}

function updateHealthUI() {
  const playerRatio = THREE.MathUtils.clamp(player.hp / player.type.maxHp, 0, 1);
  const enemyRatio = THREE.MathUtils.clamp(enemy.hp / enemy.type.maxHp, 0, 1);
  playerHealthBar.style.width = `${playerRatio * 100}%`;
  playerHealthCopy.textContent = `装甲 ${Math.max(0, player.hp)} / ${player.type.maxHp}`;
  enemyHealthBar.style.width = `${enemyRatio * 100}%`;
  enemyHealthCopy.textContent = `装甲 ${Math.max(0, enemy.hp)} / ${enemy.type.maxHp}`;
}

makeMatch('medium');
configureEnemyRanges();

function updateAim(event: PointerEvent) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const groundHit = raycaster.intersectObject(ground, false)[0];
  return groundHit ? groundHit.point.clone() : null;
}

function aimTurret(tank: TankData, target: THREE.Vector3) {
  const angle = Math.atan2(target.x - tank.group.position.x, target.z - tank.group.position.z) + Math.PI;
  tank.turretTargetAngle = angle - tank.group.rotation.y;
}

function positionAimRangeMarker(marker: THREE.Group, point: THREE.Vector3) {
  marker.position.set(point.x, getGroundHeight(point.x, point.z, ground) + 0.025, point.z);
  marker.quaternion.setFromUnitVectors(
    worldUp,
    getGroundNormal(point.x, point.z, ground, slopeNormal),
  );
  marker.visible = true;
}

renderer.domElement.addEventListener('pointermove', event => {
  const point = updateAim(event);
  crosshair.style.left = `${event.clientX}px`;
  crosshair.style.top = `${event.clientY}px`;
  if (point && player && player.hp > 0) {
    aimTurret(player, point);
    const bounds = getShotRangeBounds(player, point, ground);
    positionAimRangeMarker(nearestAimMarker, bounds.nearest);
    positionAimRangeMarker(farthestAimMarker, bounds.farthest);
  }
});

renderer.domElement.addEventListener('pointerleave', () => {
  nearestAimMarker.visible = false;
  farthestAimMarker.visible = false;
});

function fireAt(point: THREE.Vector3) {
  if (isGameOver || player.hp <= 0) return;
  unlockSound();
  aimTurret(player, point);
  player.turretGroup.rotation.y = player.turretTargetAngle;
  player.barrelGroup.updateWorldMatrix(true, false);
  const desiredRange = Math.hypot(point.x - player.group.position.x, point.z - player.group.position.z);
  fireBullet(player, false, scene, ground, true, Number.POSITIVE_INFINITY, desiredRange);
  createShotEffects(player, false);
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button === 2) {
    event.preventDefault();
    cameraDragPointerId = event.pointerId;
    previousCameraPointer = { x: event.clientX, y: event.clientY };
    renderer.domElement.setPointerCapture(event.pointerId);
    cameraModeSelect.value = 'fixed';
    localStorage.setItem('tank-camera-mode', 'fixed');
    return;
  }
  if (event.button !== 0) return;
  const point = updateAim(event);
  if (point) fireAt(point);
});

renderer.domElement.addEventListener('pointermove', event => {
  if (event.pointerId !== cameraDragPointerId) return;
  const deltaX = event.clientX - previousCameraPointer.x;
  const deltaY = event.clientY - previousCameraPointer.y;
  previousCameraPointer = { x: event.clientX, y: event.clientY };
  cameraYaw.value -= deltaX * 0.006;
  cameraElevation.value = THREE.MathUtils.clamp(cameraElevation.value - deltaY * 0.006, 0.2, 1.42);
});

function stopCameraDrag(event: PointerEvent) {
  if (event.pointerId !== cameraDragPointerId) return;
  cameraDragPointerId = null;
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }
}

renderer.domElement.addEventListener('pointerup', stopCameraDrag);
renderer.domElement.addEventListener('pointercancel', stopCameraDrag);
renderer.domElement.addEventListener('lostpointercapture', stopCameraDrag);
renderer.domElement.addEventListener('contextmenu', event => event.preventDefault());

renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  cameraDistance.value = THREE.MathUtils.clamp(
    cameraDistance.value * Math.exp(event.deltaY * 0.001),
    24,
    120,
  );
}, { passive: false });

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', ' '].includes(key)) event.preventDefault();
  heldKeys.add(key);
});
window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()));
window.addEventListener('blur', () => {
  heldKeys.clear();
  cameraDragPointerId = null;
});

settingsButton.addEventListener('click', () => {
  settingsPanel.hidden = !settingsPanel.hidden;
  settingsButton.setAttribute('aria-expanded', String(!settingsPanel.hidden));
});
document.querySelector('#close-settings')!.addEventListener('click', () => {
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
});
cameraModeSelect.addEventListener('change', () => {
  localStorage.setItem('tank-camera-mode', cameraModeSelect.value);
});
playerTypeSelect.addEventListener('change', () => {
  makeMatch(playerTypeSelect.value as TankTypeId);
});
enemyMoveRangeInput.addEventListener('input', () => {
  enemyMoveRadius.value = Number(enemyMoveRangeInput.value);
  configureEnemyRanges();
});
enemyAttackRangeInput.addEventListener('input', () => {
  enemyAttackRange.value = Number(enemyAttackRangeInput.value);
  configureEnemyRanges('attack');
});
enemyVisionRangeInput.addEventListener('input', () => {
  enemyVisionRange.value = Number(enemyVisionRangeInput.value);
  configureEnemyRanges('vision');
});
document.querySelector('#reset-game')!.addEventListener('click', () => {
  makeMatch(playerTypeSelect.value as TankTypeId);
  settingsPanel.hidden = true;
  settingsButton.setAttribute('aria-expanded', 'false');
  showToast('战斗已重置');
});

function applyDamage(tank: TankData, damage: number) {
  if (tank.hp <= 0) return;
  tank.hp = Math.max(0, tank.hp - damage);
  if (tank.hp === 0) {
    tank.group.visible = false;
    if (tank === player) {
      isGameOver = true;
      battleStatus.textContent = '战车已被摧毁';
      showToast('任务失败 · 点击设置重开战斗');
    } else {
      isGameOver = true;
      battleStatus.textContent = '战斗胜利';
      showToast('任务完成 · 敌方战车已摧毁');
    }
  }
  updateHealthUI();
}

function enemyCanSeePlayer() {
  const distance = Math.hypot(
    enemy.group.position.x - player.group.position.x,
    enemy.group.position.z - player.group.position.z,
  );
  if (distance > enemyVisionRange.value) return false;
  const eyePosition = enemy.group.position.clone().add(new THREE.Vector3(0, 2.5, 0));
  const targetPosition = player.group.position.clone().add(new THREE.Vector3(0, 1.2, 0));
  return findObstacleHit(eyePosition, targetPosition) === null;
}

function updateEnemyMovement(delta: number, canSeePlayer: boolean) {
  const offset = player.group.position.clone().sub(enemyHome).setY(0);
  const desiredPosition = enemyHome.clone();
  if (canSeePlayer) {
    if (offset.length() > enemyMoveRadius.value) offset.setLength(enemyMoveRadius.value);
    desiredPosition.add(offset);
  } else if (enemy.group.position.distanceTo(enemyHome) <= enemyMoveRadius.value) {
    enemy.targetPos.copy(enemy.group.position);
  }
  if (canSeePlayer || enemy.group.position.distanceTo(enemyHome) > enemyMoveRadius.value + 0.5) {
    enemy.targetPos.copy(desiredPosition);
  }
  updateTank(enemy, [player, enemy], delta, ground);
}

function angleDifference(current: number, target: number) {
  return THREE.MathUtils.euclideanModulo(target - current + Math.PI, Math.PI * 2) - Math.PI;
}

function fireEnemyAtPlayer(canSeePlayer: boolean) {
  if (!canSeePlayer || enemy.fireCooldown > 0 || player.hp <= 0) return;
  enemy.barrelGroup.updateWorldMatrix(true, false);
  const muzzle = enemy.barrelGroup.localToWorld(
    new THREE.Vector3(enemy.nextBarrelSide * 0.19, 0, -2.24),
  );
  const target = player.group.position.clone();
  const direction = target.clone().sub(muzzle).setY(0);
  const targetDistance = direction.length();
  const targetInRange = targetDistance <= enemyAttackRange.value;
  if (!targetInRange) {
    enemy.turretTargetAngle = Math.atan2(direction.x, direction.z) + Math.PI - enemy.group.rotation.y;
  } else {
    target.y = getGroundHeight(target.x, target.z, ground);
    aimTurret(enemy, target);
  }
  if (Math.abs(angleDifference(enemy.turretGroup.rotation.y, enemy.turretTargetAngle)) > 0.08) return;
  fireBullet(enemy, true, scene, ground, targetInRange, enemyAttackRange.value);
  enemy.fireCooldown = enemy.type.reloadTime;
  createShotEffects(enemy, true);
}

function createShotEffects(tank: TankData, isEnemy: boolean) {
  cameraShakeTime = 0.22;
  cameraShakeAmplitude = Math.max(cameraShakeAmplitude, tank.type.id === 'heavy' ? 0.28 : 0.2);
  const groundY = getGroundHeight(tank.group.position.x, tank.group.position.z, ground);
  const color = isEnemy ? 0x9a657e : 0x82745e;
  for (let index = 0; index < 18; index++) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(dustGeometry, material);
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.65 + Math.random() * 1.55;
    mesh.position.set(
      tank.group.position.x + Math.cos(angle) * radius,
      groundY + 0.1 + Math.random() * 0.16,
      tank.group.position.z + Math.sin(angle) * radius,
    );
    const scale = 0.55 + Math.random() * 1.15;
    mesh.scale.set(scale * 1.4, scale * 0.35, scale);
    scene.add(mesh);
    dustParticles.push({
      mesh,
      velocity: new THREE.Vector3(
        Math.cos(angle) * (0.45 + Math.random() * 1.2),
        0.7 + Math.random() * 1.25,
        Math.sin(angle) * (0.45 + Math.random() * 1.2),
      ),
      life: 0.55 + Math.random() * 0.4,
      maxLife: 0.95,
      groundY,
      material,
    });
  }
}

function updateDust(delta: number) {
  for (let index = dustParticles.length - 1; index >= 0; index--) {
    const particle = dustParticles[index];
    particle.life -= delta;
    particle.velocity.y -= 2.8 * delta;
    particle.velocity.multiplyScalar(Math.exp(-1.1 * delta));
    particle.mesh.position.addScaledVector(particle.velocity, delta);
    if (particle.mesh.position.y < particle.groundY + 0.06) {
      particle.mesh.position.y = particle.groundY + 0.06;
      particle.velocity.y = Math.max(0, particle.velocity.y);
    }
    const progress = THREE.MathUtils.clamp(particle.life / particle.maxLife, 0, 1);
    particle.material.opacity = 0.58 * progress;
    particle.mesh.scale.multiplyScalar(1 + delta * 0.8);
    if (particle.life > 0) continue;
    scene.remove(particle.mesh);
    particle.material.dispose();
    dustParticles.splice(index, 1);
  }
}

function removeProjectile(bullet: (typeof bullets)[number]) {
  scene.remove(bullet.mesh);
  disposeGroup(bullet.mesh);
}

function showLandingMarker(point: THREE.Vector3, isEnemy: boolean) {
  landingMarker.position.set(point.x, getGroundHeight(point.x, point.z, ground) + 0.02, point.z);
  landingMarker.quaternion.setFromUnitVectors(
    worldUp,
    getGroundNormal(point.x, point.z, ground, slopeNormal),
  );
  landingMarkerMaterial.color.set(isEnemy ? 0xff52dc : 0xb34dff);
  landingMarkerMaterial.opacity = 0.9;
  landingMarkerLife = 4;
  landingMarker.visible = true;
}

function updateProjectiles(delta: number) {
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];
    const previous = bullet.mesh.position.clone();
    const step = Math.min(delta, bullet.duration - bullet.elapsed);
    const nextVelocity = bullet.velocity.clone().multiplyScalar(Math.exp(-bullet.airDrag * step));
    nextVelocity.y -= bullet.gravity * step;
    bullet.mesh.position.addScaledVector(
      bullet.velocity.clone().add(nextVelocity).multiplyScalar(0.5),
      step,
    );
    bullet.velocity.copy(nextVelocity);
    bullet.mesh.quaternion.setFromUnitVectors(
      projectileModelForward,
      projectileDirection.copy(bullet.velocity).normalize(),
    );
    bullet.elapsed += step;
    const finished = bullet.elapsed >= bullet.duration;

    const segment = bullet.mesh.position.clone().sub(previous);
    const segmentLength = segment.length();
    let nearestDistance = Number.POSITIVE_INFINITY;
    let impactPoint: THREE.Vector3 | null = null;
    let hitObstacle: ReturnType<typeof findObstacleHit> = null;
    let hitTank: TankData | null = null;

    if (segmentLength > 0) {
      projectileDirection.copy(segment).divideScalar(segmentLength);
      const obstacleHit = findObstacleHit(previous, bullet.mesh.position);
      if (obstacleHit) {
        nearestDistance = previous.distanceTo(obstacleHit.point);
        impactPoint = obstacleHit.point;
        hitObstacle = obstacleHit;
      }

      const target = bullet.canDamageUnit ? (bullet.isEnemy ? player : enemy) : null;
      if (target?.hp && target.hp > 0) {
        target.group.updateWorldMatrix(true, true);
        targetBounds.setFromObject(target.group).expandByScalar(0.24);
        projectileRaycaster.set(previous, projectileDirection);
        projectileRaycaster.near = 0;
        projectileRaycaster.far = segmentLength;
        const tankHit = projectileRaycaster.ray.intersectBox(targetBounds, projectileHitPoint);
        if (tankHit) {
          const distance = previous.distanceTo(tankHit);
          if (distance < nearestDistance) {
            nearestDistance = distance;
            impactPoint = tankHit.clone();
            hitObstacle = null;
            hitTank = target;
          }
        }
      }

      projectileRaycaster.set(previous, projectileDirection);
      projectileRaycaster.near = 0;
      projectileRaycaster.far = segmentLength;
      const groundHit = projectileRaycaster.intersectObject(ground, false)[0];
      if (groundHit && groundHit.distance < nearestDistance) {
        nearestDistance = groundHit.distance;
        impactPoint = groundHit.point.clone();
        hitObstacle = null;
        hitTank = null;
      }
    }

    if (!impactPoint && finished) {
      impactPoint = bullet.targetPos.clone();
    }
    if (!impactPoint) continue;

    if (hitObstacle) {
      damageObstacle(hitObstacle.obstacle, 1);
      if (hitObstacle.obstacle.destroyed) {
        const obstacleIndex = terrainObstacles.indexOf(hitObstacle.obstacle);
        if (obstacleIndex >= 0) terrainObstacles.splice(obstacleIndex, 1);
      }
    }
    if (hitTank) applyDamage(hitTank, 1);
    showLandingMarker(impactPoint, bullet.isEnemy);
    bullet.mesh.position.copy(impactPoint);
    createExplosion(impactPoint, scene, projectileDirection);
    playDragonRoar();
    removeProjectile(bullet);
    bullets.splice(index, 1);
  }
}

function updateExplosions(delta: number) {
  for (let index = explosions.length - 1; index >= 0; index--) {
    const explosion = explosions[index];
    explosion.life -= delta;
    const progress = 1 - Math.max(0, explosion.life) / explosion.maxLife;
    const fade = Math.max(0, 1 - Math.max(0, progress - 0.38) / 0.62);
    const flash = Math.max(0, 1 - progress * 5);
    explosion.core.scale.setScalar(0.25 + flash * 2.5 + progress * 0.75);
    (explosion.core.material as THREE.MeshBasicMaterial).opacity = fade;
    explosion.rings.forEach((ring, index) => {
      ring.scale.setScalar(0.12 + progress * (3.6 + index * 0.65));
      ring.rotation.z += delta * (index % 2 === 0 ? 1.8 : -1.4);
      (ring.material as THREE.MeshBasicMaterial).opacity = fade;
    });
    explosion.sparks.forEach(spark => {
      spark.mesh.position.addScaledVector(spark.velocity, delta);
      spark.velocity.y -= delta * 5;
      spark.mesh.quaternion.setFromUnitVectors(
        worldUp,
        spark.velocity.clone().normalize(),
      );
      (spark.mesh.material as THREE.MeshBasicMaterial).opacity = fade;
    });
    if (explosion.life > 0) continue;
    scene.remove(explosion.mesh);
    disposeGroup(explosion.mesh);
    explosions.splice(index, 1);
  }
}

function updateCamera(delta: number) {
  if (cameraModeSelect.value === 'follow') {
    followTarget.copy(player.group.position);
    followTarget.y += 1.15;
    cameraTarget.lerp(followTarget, Math.min(1, delta * 4));
  }
  const horizontalDistance = Math.cos(cameraElevation.value) * cameraDistance.value;
  cameraOffset.set(
    Math.sin(cameraYaw.value) * horizontalDistance,
    Math.sin(cameraElevation.value) * cameraDistance.value,
    Math.cos(cameraYaw.value) * horizontalDistance,
  );
  desiredCameraPosition.copy(cameraTarget).add(cameraOffset);
  camera.position.lerp(desiredCameraPosition, Math.min(1, delta * 4));
  if (cameraShakeTime > 0) {
    cameraShakeTime = Math.max(0, cameraShakeTime - delta);
    const elapsed = 0.22 - cameraShakeTime;
    const envelope = Math.exp(-18 * elapsed);
    const oscillation = cameraShakeAmplitude * envelope;
    camera.position.x += Math.cos(elapsed * 2 * Math.PI * 26) * oscillation;
    camera.position.y += Math.sin(elapsed * 2 * Math.PI * 21) * oscillation * 0.55;
    camera.position.z += Math.cos(elapsed * 2 * Math.PI * 19) * oscillation * 0.7;
    if (cameraShakeTime === 0) cameraShakeAmplitude = 0;
  }
  camera.lookAt(cameraTarget);
}

function update(delta: number) {
  if (!isGameOver && player.hp > 0) {
    const throttle = Number(heldKeys.has('w')) - Number(heldKeys.has('s'));
    const steering = Number(heldKeys.has('d')) - Number(heldKeys.has('a'));
    const driveInput = new THREE.Vector3(steering, 0, throttle);
    const boost = heldKeys.has(' ');
    updateTank(
      player,
      [player, enemy],
      delta,
      ground,
      driveInput,
      boost ? 1.8 : 1,
      true,
    );
  }
  if (enemy.hp > 0 && !isGameOver) {
    const canSeePlayer = enemyCanSeePlayer();
    updateEnemyMovement(delta, canSeePlayer);
    fireEnemyAtPlayer(canSeePlayer);
  }
  updateProjectiles(delta);
  updateExplosions(delta);
  updateDust(delta);
  if (landingMarkerLife > 0) {
    landingMarkerLife = Math.max(0, landingMarkerLife - delta);
    landingMarkerMaterial.opacity = Math.min(0.9, landingMarkerLife * 1.5);
    landingMarker.visible = landingMarkerLife > 0;
  }
  updateCamera(delta);
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) toast.classList.remove('show');
  }
}

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  clock.update();
  update(Math.min(clock.getDelta(), 0.05));
  renderer.render(scene, camera);
}
animate();
