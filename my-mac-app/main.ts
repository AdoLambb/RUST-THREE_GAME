import * as THREE from 'three';
import {
  bullets,
  createExplosion,
  createTank,
  enemyTanks,
  explosions,
  fireBullet,
  playerTanks,
  updateTank,
  type TankData,
  type TankTypeId,
} from './tank';
import {
  buildTerrain,
  damageObstacle,
  findObstacleHit,
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
    <p class="settings-hint">镜头默认跟随战车。使用 WASD 驾驶，鼠标瞄准并开火。</p>
    <button class="reset-button" id="reset-game">重开战斗</button>
  </section>
  <div class="crosshair" id="crosshair"></div>
  <div class="toast" id="toast"></div>
  <footer class="controls"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 驾驶</span><span><kbd>鼠标</kbd> 炮塔瞄准</span><span><kbd>左键</kbd> 开火</span><span><kbd>空格</kbd> 加速</span><span><kbd>右键</kbd> 移动至目标</span></footer>
`;

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#101914; color:#eaf0e5; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  #app { position:fixed; inset:0; }
  canvas { display:block; width:100%; height:100%; }
  .topbar { position:absolute; z-index:2; inset:0 0 auto; height:68px; padding:0 24px; display:flex; align-items:center; gap:30px; background:linear-gradient(180deg,#101a17f2,#101a17c9); border-bottom:1px solid #82917444; }
  .brand { display:flex; align-items:center; gap:10px; min-width:220px; }.brand-mark { color:#d8bc6d; font-size:28px; }.brand strong { display:block; font-size:19px; letter-spacing:3px; }.brand small { display:block; margin-top:2px; color:#8b9b83; font-size:9px; letter-spacing:2px; }
  .battle-status { color:#c6d2ba; font-size:13px; letter-spacing:1px; }.battle-status i { display:inline-block; width:7px; height:7px; margin-right:8px; border-radius:50%; background:#8fc779; box-shadow:0 0 9px #8fc779; }
  .top-actions { margin-left:auto; display:flex; align-items:center; gap:18px; }.team-label { color:#8acbff; font-size:13px; }.team-label i { display:inline-block; width:8px; height:8px; margin-right:6px; border-radius:50%; background:#45a9f3; }
  button, select { font:inherit; }.top-actions button { padding:8px 13px; color:#dce8d4; background:#24352b; border:1px solid #55694e; cursor:pointer; }.top-actions button:hover { background:#304536; }
  .battle-hud { position:absolute; z-index:2; top:86px; left:20px; display:flex; gap:10px; }.tank-card,.battle-readout { width:216px; padding:12px 14px; background:#101a17df; border:1px solid #70805c66; box-shadow:0 8px 22px #0005; }.card-title { display:flex; justify-content:space-between; color:#c9d3c0; font-size:12px; }.card-title b { color:#f0d47c; }.health-track { height:7px; margin-top:9px; overflow:hidden; background:#3b2422; border-radius:5px; }.health-track i { display:block; width:100%; height:100%; background:linear-gradient(90deg,#64b85e,#b8db66); transition:width .15s; }.enemy-track i { background:linear-gradient(90deg,#bb5145,#f09565); }.health-copy { margin-top:5px; color:#9aaa8f; font-size:11px; }.battle-readout { width:190px; color:#d7c8bf; font-size:12px; }.battle-readout b { float:right; color:#f0a18a; font-weight:500; }
  .settings-panel { position:absolute; z-index:5; top:78px; right:20px; width:280px; padding:15px; background:#111b18f5; border:1px solid #738264; box-shadow:0 12px 36px #0009; }.settings-panel[hidden] { display:none; }.settings-title { display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; color:#f2d98a; font-weight:700; letter-spacing:1px; }.settings-title button { color:#b9c7b1; background:none; border:0; font-size:22px; cursor:pointer; }.setting-row { display:flex; align-items:center; justify-content:space-between; margin:9px 0; color:#c4d0bd; font-size:13px; }.setting-row select { min-width:125px; padding:6px; color:#e2ebda; background:#202f27; border:1px solid #53664b; }.settings-hint { color:#8b9d86; font-size:11px; line-height:1.6; }.reset-button { width:100%; margin-top:10px; padding:9px; color:#f2d9be; background:#583a30; border:1px solid #a3674e; cursor:pointer; }.reset-button:hover { background:#754638; }
  .crosshair { position:absolute; z-index:2; width:22px; height:22px; border:1px solid #ffe37d; border-radius:50%; transform:translate(-50%,-50%); pointer-events:none; opacity:.9; }.crosshair:before,.crosshair:after { content:""; position:absolute; background:#ffe37d; }.crosshair:before { left:9px; top:-5px; width:1px; height:30px; }.crosshair:after { top:9px; left:-5px; width:30px; height:1px; }
  .toast { position:absolute; z-index:3; top:166px; left:50%; padding:9px 16px; color:#fff0c6; background:#172018e8; border:1px solid #958454; transform:translate(-50%,-6px); opacity:0; transition:.2s; pointer-events:none; }.toast.show { opacity:1; transform:translate(-50%,0); }
  .controls { position:absolute; z-index:2; left:50%; bottom:17px; display:flex; gap:15px; padding:9px 14px; color:#d2d9c9; background:#101914dd; border:1px solid #71806466; transform:translateX(-50%); white-space:nowrap; font-size:11px; }.controls span { display:flex; align-items:center; gap:4px; }.controls kbd { padding:2px 5px; color:#e7d797; background:#354236; border:1px solid #728067; border-radius:3px; font:inherit; }
  @media(max-width:700px) { .topbar { height:58px; padding:0 12px; }.brand { min-width:0; }.brand strong { font-size:16px; }.battle-status { display:none; }.battle-hud { top:70px; left:8px; gap:6px; }.tank-card,.battle-readout { width:155px; padding:9px; }.battle-readout { width:145px; }.controls { max-width:calc(100% - 16px); bottom:8px; gap:7px; flex-wrap:wrap; justify-content:center; white-space:normal; font-size:9px; }.settings-panel { top:64px; right:8px; } }
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
const grid = new THREE.GridHelper(120, 30, 0x9cad78, 0x647255);
grid.position.y = 0.06;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.17;
scene.add(grid);

const playerTypeSelect = document.querySelector<HTMLSelectElement>('#tank-type')!;
const cameraModeSelect = document.querySelector<HTMLSelectElement>('#camera-mode')!;
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
let fireCooldown = 0;
let aiFireCooldown = 0;
let moveTarget: THREE.Vector3 | null = null;
const heldKeys = new Set<string>();
const clock = new THREE.Timer();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const aimPoint = new THREE.Vector3();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const cameraTarget = new THREE.Vector3();
const cameraOffset = new THREE.Vector3(0, 58, 36);

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = 2.2;
}

function makeMatch(typeId: TankTypeId) {
  for (const tank of [...playerTanks, ...enemyTanks]) scene.remove(tank.group);
  playerTanks.splice(0);
  enemyTanks.splice(0);
  for (const bullet of bullets.splice(0)) {
    scene.remove(bullet.mesh);
    bullet.mesh.geometry.dispose();
    (bullet.mesh.material as THREE.Material).dispose();
  }
  for (const explosion of explosions.splice(0)) {
    scene.remove(explosion.mesh);
    explosion.mesh.geometry.dispose();
    (explosion.mesh.material as THREE.Material).dispose();
  }

  createTank(false, 0, 24, scene, ground, typeId);
  player = playerTanks[playerTanks.length - 1];
  createTank(true, 0, -24, scene, ground, 'medium');
  enemy = enemyTanks[enemyTanks.length - 1];
  enemy.targetPos.copy(player.group.position);
  isGameOver = false;
  moveTarget = null;
  battleStatus.textContent = '战斗进行中';
  playerTypeLabel.textContent = player.type.name;
  updateHealthUI();
  cameraTarget.copy(player.group.position);
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

function updateAim(event: PointerEvent) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  return raycaster.ray.intersectPlane(groundPlane, aimPoint) ? aimPoint.clone() : null;
}

function aimTurret(tank: TankData, target: THREE.Vector3) {
  const angle = Math.atan2(target.x - tank.group.position.x, target.z - tank.group.position.z) + Math.PI;
  tank.turretGroup.rotation.y = angle - tank.group.rotation.y;
}

renderer.domElement.addEventListener('pointermove', event => {
  const point = updateAim(event);
  crosshair.style.left = `${event.clientX}px`;
  crosshair.style.top = `${event.clientY}px`;
  if (point && player && player.hp > 0) aimTurret(player, point);
});

function fireAt(point: THREE.Vector3) {
  if (isGameOver || player.hp <= 0 || fireCooldown > 0) return;
  aimTurret(player, point);
  fireBullet(player, point, false, scene);
  fireCooldown = 0.38;
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const point = updateAim(event);
  if (point) fireAt(point);
});

renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
  const point = updateAim(event);
  if (point) moveTarget = point;
});

window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', ' '].includes(key)) event.preventDefault();
  heldKeys.add(key);
});
window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()));

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

function updateProjectiles(delta: number) {
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];
    const previous = bullet.mesh.position.clone();
    bullet.elapsed += delta;
    const progress = THREE.MathUtils.clamp(bullet.elapsed / bullet.duration, 0, 1);
    bullet.mesh.position.copy(bullet.startPos).lerp(bullet.targetPos, progress);
    bullet.mesh.position.y += Math.sin(progress * Math.PI) * 3;

    const obstacleHit = findObstacleHit(previous, bullet.mesh.position);
    if (obstacleHit) {
      damageObstacle(obstacleHit.obstacle, obstacleHit.obstacle.type === 'house' ? 1 : 1);
      if (obstacleHit.obstacle.destroyed) {
        const obstacleIndex = terrainObstacles.indexOf(obstacleHit.obstacle);
        if (obstacleIndex >= 0) terrainObstacles.splice(obstacleIndex, 1);
      }
      createExplosion(obstacleHit.point, scene);
      scene.remove(bullet.mesh);
      bullets.splice(index, 1);
      continue;
    }
    if (progress < 1) continue;

    const impact = bullet.mesh.position.clone();
    const targets = bullet.isEnemy ? [player] : [enemy];
    for (const target of targets) {
      if (target.hp <= 0 || Math.hypot(target.group.position.x - impact.x, target.group.position.z - impact.z) > 5) continue;
      const blocked = findObstacleHit(impact, target.group.position);
      if (!blocked) applyDamage(target, 1);
    }
    createExplosion(impact, scene);
    scene.remove(bullet.mesh);
    bullet.mesh.geometry.dispose();
    (bullet.mesh.material as THREE.Material).dispose();
    bullets.splice(index, 1);
  }
}

function updateExplosions(delta: number) {
  for (let index = explosions.length - 1; index >= 0; index--) {
    const explosion = explosions[index];
    explosion.life -= delta;
    const progress = 1 - Math.max(0, explosion.life) / 0.8;
    explosion.mesh.scale.setScalar(0.4 + progress * 2.4);
    const material = explosion.mesh.material as THREE.MeshBasicMaterial;
    material.opacity = Math.max(0, 1 - progress);
    if (explosion.life > 0) continue;
    scene.remove(explosion.mesh);
    explosion.mesh.geometry.dispose();
    material.dispose();
    explosions.splice(index, 1);
  }
}

function updateCamera(delta: number) {
  if (cameraModeSelect.value === 'follow') {
    cameraTarget.lerp(player.group.position, Math.min(1, delta * 4));
    camera.position.lerp(cameraTarget.clone().add(cameraOffset), Math.min(1, delta * 3));
  }
  camera.lookAt(cameraTarget);
}

function update(delta: number) {
  fireCooldown = Math.max(0, fireCooldown - delta);
  aiFireCooldown = Math.max(0, aiFireCooldown - delta);

  if (!isGameOver && player.hp > 0) {
    const movement = new THREE.Vector3(
      Number(heldKeys.has('d')) - Number(heldKeys.has('a')),
      0,
      Number(heldKeys.has('s')) - Number(heldKeys.has('w')),
    );
    if (movement.lengthSq() > 1) movement.normalize();
    const movingByKeyboard = movement.lengthSq() > 0;
    const boost = heldKeys.has(' ');
    updateTank(
      player,
      [player, enemy],
      delta,
      ground,
      movingByKeyboard ? movement : undefined,
      boost ? 1.8 : 1,
      true,
    );
    if (!movingByKeyboard && moveTarget) {
      player.targetPos.copy(moveTarget);
      if (player.group.position.distanceTo(moveTarget) < 2) moveTarget = null;
    }
    if (aiFireCooldown <= 0 && player.group.position.distanceTo(enemy.group.position) < 65) {
      enemy.turretGroup.updateWorldMatrix(true, false);
      fireBullet(enemy, player.group.position, true, scene);
      aiFireCooldown = 1.4;
    }
  }
  if (enemy.hp > 0 && !isGameOver) {
    enemy.targetPos.copy(player.group.position);
    updateTank(enemy, [player, enemy], delta, ground);
  }
  updateProjectiles(delta);
  updateExplosions(delta);
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
