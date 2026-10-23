import * as THREE from 'three';
import {
  bullets,
  createExplosion,
  createTank,
  enemyTanks,
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
  <div class="hud">
    <div class="brand"><span class="brand-mark">◆</span><div><strong>赛博红警</strong><small>边境冲突 · 实时战略</small></div></div>
    <div class="status"><span class="live-dot"></span><span id="status">战场已部署</span></div>
    <div class="resources"><span>能源</span><strong id="credits">1200</strong><span class="resource-icon">⬡</span></div>
  </div>
  <div class="left-panel">
    <div class="panel-heading">战场简报 <span>FIELD INTEL</span></div>
    <div class="stat-row"><span>我方战车</span><strong id="army-count">0</strong></div>
    <div class="stat-row"><span>敌方战车</span><strong id="enemy-count">0</strong></div>
    <div class="stat-row"><span>已摧毁障碍</span><strong id="obstacle-count">0</strong></div>
    <div class="selected-info" id="selected-info">左键选择战车，右键下达移动 / 攻击指令</div>
  </div>
  <div class="bottom-panel">
    <div class="orders">
      <button data-unit="light"><kbd>1</kbd><span class="unit-icon light-icon">▰</span><span><b>轻型坦克</b><small>快速 · 造价 300</small></span></button>
      <button data-unit="medium"><kbd>2</kbd><span class="unit-icon medium-icon">▰</span><span><b>中型坦克</b><small>均衡 · 造价 450</small></span></button>
      <button data-unit="heavy"><kbd>3</kbd><span class="unit-icon heavy-icon">▰</span><span><b>重型坦克</b><small>重装 · 造价 650</small></span></button>
    </div>
    <div class="controls">拖动框选 · 右键移动 / 攻击 · 滚轮缩放 · WASD 移动镜头</div>
  </div>
  <div class="selection-box" id="selection-box"></div>
  <div class="toast" id="toast"></div>
`;

const style = document.createElement('style');
style.textContent = `
  * { box-sizing: border-box; }
  html, body { width:100%; height:100%; margin:0; overflow:hidden; background:#08111a; color:#e4f2ff; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; }
  #app { position:fixed; inset:0; }
  canvas { display:block; width:100%; height:100%; }
  .hud { position:absolute; z-index:2; inset:0 0 auto; height:78px; display:flex; align-items:center; gap:32px; padding:0 28px; background:linear-gradient(180deg,rgba(5,13,21,.96),rgba(5,13,21,.72)); border-bottom:1px solid #234158; }
  .brand { display:flex; align-items:center; gap:12px; min-width:235px; }
  .brand-mark { color:#4edbff; font-size:31px; text-shadow:0 0 14px #36cfff; }
  .brand strong { display:block; font-size:23px; letter-spacing:3px; color:#effaff; }
  .brand small { display:block; color:#65869a; font-size:11px; letter-spacing:2px; }
  .status { color:#8bb2c5; font-size:14px; letter-spacing:1px; }
  .live-dot { display:inline-block; width:7px; height:7px; margin-right:8px; border-radius:50%; background:#45e5ad; box-shadow:0 0 10px #45e5ad; }
  .resources { margin-left:auto; display:flex; align-items:center; gap:10px; color:#80a0b5; font-size:13px; letter-spacing:2px; }
  .resources strong { color:#ffe28b; font-size:25px; letter-spacing:1px; }
  .resource-icon { color:#4edbff; font-size:22px; }
  .left-panel { position:absolute; z-index:2; top:100px; left:22px; width:245px; padding:16px; background:rgba(7,17,26,.83); border:1px solid #28506a; border-left:2px solid #42cfee; box-shadow:0 10px 30px #0005; }
  .panel-heading { display:flex; justify-content:space-between; padding-bottom:11px; margin-bottom:8px; border-bottom:1px solid #20394b; color:#d9f4ff; font-weight:700; letter-spacing:2px; }
  .panel-heading span { color:#4d778c; font-size:10px; letter-spacing:1px; }
  .stat-row { display:flex; justify-content:space-between; padding:6px 0; color:#89a5b4; font-size:14px; }
  .stat-row strong { color:#d8effa; font-size:17px; }
  .selected-info { min-height:46px; padding:10px 0 0; margin-top:8px; border-top:1px solid #20394b; color:#6f94a7; font-size:12px; line-height:1.55; }
  .bottom-panel { position:absolute; z-index:2; left:50%; bottom:20px; width:min(680px,calc(100% - 32px)); transform:translateX(-50%); padding:10px 12px 8px; background:rgba(6,16,25,.91); border:1px solid #31536a; box-shadow:0 10px 36px #0008; }
  .orders { display:flex; justify-content:center; gap:8px; }
  .orders button { display:flex; align-items:center; gap:9px; min-width:190px; padding:9px 11px; color:#d8edf6; text-align:left; cursor:pointer; background:linear-gradient(135deg,#102636,#0b1a27); border:1px solid #29485d; transition:.15s; }
  .orders button:hover { border-color:#4ad8ff; background:#17364a; transform:translateY(-2px); }
  .orders kbd { align-self:flex-start; color:#62d8f5; font-size:12px; }
  .unit-icon { color:#6fdcff; font-size:24px; text-shadow:0 0 10px currentColor; }
  .medium-icon { color:#ffd56f; } .heavy-icon { color:#ff8a72; }
  .orders b,.orders small { display:block; } .orders b { font-size:14px; } .orders small { margin-top:3px; color:#7898a9; font-size:11px; }
  .controls { padding-top:8px; color:#7293a4; text-align:center; font-size:11px; letter-spacing:1px; }
  .selection-box { position:absolute; z-index:3; display:none; border:1px solid #5be3ff; background:#35cfff1a; pointer-events:none; }
  .toast { position:absolute; z-index:4; top:94px; left:50%; transform:translateX(-50%); padding:9px 18px; color:#d9f8ff; background:#071722e8; border:1px solid #39748c; opacity:0; transition:opacity .2s; pointer-events:none; }
  .toast.show { opacity:1; }
  @media(max-width:700px) { .hud { padding:0 12px; gap:12px; } .brand { min-width:0; } .brand strong { font-size:18px; } .status { display:none; } .left-panel { top:88px; left:10px; width:190px; } .orders button { min-width:0; flex:1; padding:7px 5px; gap:4px; } .orders small { display:none; } .unit-icon { display:none; } .controls { font-size:9px; } }
`;
document.head.appendChild(style);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07111a);
scene.fog = new THREE.Fog(0x07111a, 95, 175);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 250);
camera.position.set(0, 105, 65);
camera.lookAt(0, 0, 0);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
app.prepend(renderer.domElement);

scene.add(new THREE.HemisphereLight(0x9ecfff, 0x1b3328, 2));
const sun = new THREE.DirectionalLight(0xd4eeff, 2.4);
sun.position.set(-35, 60, 20);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

const ground = buildTerrain(scene);
const grid = new THREE.GridHelper(120, 30, 0x45b6d3, 0x274653);
grid.position.y = 0.08;
(grid.material as THREE.Material).transparent = true;
(grid.material as THREE.Material).opacity = 0.18;
scene.add(grid);

function makeBase(team: 'blue' | 'red', z: number) {
  const group = new THREE.Group();
  const color = team === 'blue' ? 0x19b9e8 : 0xea514f;
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 8, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: team === 'blue' ? 0x164e70 : 0x632a32, metalness: 0.6, roughness: 0.35 }),
  );
  base.position.y = 1;
  base.castShadow = true;
  group.add(base);
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(3.2),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8, metalness: 0.3, roughness: 0.2 }),
  );
  core.position.y = 5;
  core.castShadow = true;
  group.add(core);
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(5, 0.18, 8, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.72 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.3;
  group.add(ring);
  group.position.set(0, 0, z);
  scene.add(group);
}
makeBase('blue', 48);
makeBase('red', -48);

const selected = new Set<TankData>();
const selectionMarkers = new Map<TankData, THREE.Mesh>();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const selectionBox = document.querySelector<HTMLDivElement>('#selection-box')!;
const status = document.querySelector<HTMLSpanElement>('#status')!;
const creditsLabel = document.querySelector<HTMLElement>('#credits')!;
const toast = document.querySelector<HTMLDivElement>('#toast')!;
const info = document.querySelector<HTMLDivElement>('#selected-info')!;
let credits = 1200;
let toastTimer = 0;
let enemyWaveTimer = 18;
let destroyedObstacles = 0;
let gameEnded = false;
let dragStart: { x: number; y: number } | null = null;
let dragMoved = false;
let cameraTarget = new THREE.Vector3();
const heldKeys = new Set<string>();
const clock = new THREE.Timer();

function showToast(message: string) {
  toast.textContent = message;
  toast.classList.add('show');
  toastTimer = 2.2;
}

function updatePointer(event: PointerEvent) {
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
}

function groundPosition(event: PointerEvent) {
  updatePointer(event);
  const point = new THREE.Vector3();
  return raycaster.ray.intersectPlane(groundPlane, point) ? point : null;
}

function tankAtPointer(event: PointerEvent) {
  updatePointer(event);
  const all = [...playerTanks, ...enemyTanks].filter(tank => tank.hp > 0);
  const intersections = raycaster.intersectObjects(all.map(tank => tank.group), true);
  const id = intersections[0]?.object.userData.tankId;
  return all.find(tank => tank.id === id) ?? null;
}

function addSelectionMarker(tank: TankData) {
  let marker = selectionMarkers.get(tank);
  if (!marker) {
    marker = new THREE.Mesh(
      new THREE.RingGeometry(1.4, 1.58, 32),
      new THREE.MeshBasicMaterial({ color: 0x4de4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.12;
    tank.group.add(marker);
    selectionMarkers.set(tank, marker);
  }
  marker.visible = selected.has(tank);
}

function updateSelectionDisplay() {
  for (const tank of playerTanks) {
    tank.isSelected = selected.has(tank);
    addSelectionMarker(tank);
  }
  if (!selected.size) {
    info.textContent = '左键选择战车，右键下达移动 / 攻击指令';
    return;
  }
  const hp = [...selected].reduce((sum, tank) => sum + tank.hp, 0);
  info.textContent = `已选中 ${selected.size} 辆战车 · 当前总耐久 ${hp}`;
}

function selectOnly(tank: TankData | null) {
  selected.clear();
  if (tank && !tank.isEnemy && tank.hp > 0) selected.add(tank);
  updateSelectionDisplay();
}

function spawnTank(type: TankTypeId, enemy = false, x?: number, z?: number) {
  const spawnX = x ?? (Math.random() - 0.5) * 12;
  const spawnZ = z ?? (enemy ? -39 : 39);
  createTank(enemy, spawnX, spawnZ, scene, ground, type);
  const tanks = enemy ? enemyTanks : playerTanks;
  const tank = tanks[tanks.length - 1];
  tank.group.traverse(object => { object.userData.tankId = tank.id; });
  return tank;
}

function makeInitialForces() {
  spawnTank('medium', false, -4, 36);
  spawnTank('light', false, 0, 39);
  spawnTank('light', false, 4, 42);
  spawnTank('medium', true, -3, -37);
  spawnTank('light', true, 3, -40);
  for (const enemy of enemyTanks) enemy.targetPos.set(0, 0, 0);
}
makeInitialForces();

for (const tank of playerTanks) {
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(1.4, 1.58, 32),
    new THREE.MeshBasicMaterial({ color: 0x4de4ff, side: THREE.DoubleSide, transparent: true }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = 0.12;
  marker.visible = false;
  tank.group.add(marker);
  selectionMarkers.set(tank, marker);
}

function setOrder(event: PointerEvent) {
  if (!selected.size) return;
  const updatePoint = (point: THREE.Vector3) => {
    for (const tank of selected) tank.targetPos.copy(point);
  };
  const all = [...playerTanks, ...enemyTanks].filter(tank => tank.hp > 0);
  updatePointer(event);
  const intersections = raycaster.intersectObjects(all.map(tank => tank.group), true);
  const id = intersections[0]?.object.userData.tankId;
  const target = all.find(tank => tank.id === id);
  const point = groundPosition(event);
  if (!point) return;
  updatePoint(target?.isEnemy ? target.group.position : point);
  showToast(target?.isEnemy ? '攻击指令已下达' : '移动指令已下达');
}

renderer.domElement.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  dragStart = { x: event.clientX, y: event.clientY };
  dragMoved = false;
  renderer.domElement.setPointerCapture(event.pointerId);
});

renderer.domElement.addEventListener('pointermove', event => {
  if (!dragStart) return;
  const left = Math.min(dragStart.x, event.clientX);
  const top = Math.min(dragStart.y, event.clientY);
  const width = Math.abs(event.clientX - dragStart.x);
  const height = Math.abs(event.clientY - dragStart.y);
  dragMoved ||= width + height > 8;
  if (!dragMoved) return;
  selectionBox.style.display = 'block';
  selectionBox.style.left = `${left}px`;
  selectionBox.style.top = `${top}px`;
  selectionBox.style.width = `${width}px`;
  selectionBox.style.height = `${height}px`;
});

renderer.domElement.addEventListener('pointerup', event => {
  if (!dragStart) return;
  if (dragMoved) {
    const left = Math.min(dragStart.x, event.clientX);
    const right = Math.max(dragStart.x, event.clientX);
    const top = Math.min(dragStart.y, event.clientY);
    const bottom = Math.max(dragStart.y, event.clientY);
    selected.clear();
    for (const tank of playerTanks) {
      if (tank.hp <= 0) continue;
      const projected = tank.group.position.clone().project(camera);
      const x = (projected.x + 1) * window.innerWidth / 2;
      const y = (1 - projected.y) * window.innerHeight / 2;
      if (x >= left && x <= right && y >= top && y <= bottom) selected.add(tank);
    }
    updateSelectionDisplay();
  } else {
    selectOnly(tankAtPointer(event));
  }
  selectionBox.style.display = 'none';
  dragStart = null;
});

renderer.domElement.addEventListener('contextmenu', event => {
  event.preventDefault();
  setOrder(event);
});

function recruit(type: TankTypeId) {
  if (gameEnded) return;
  const cost = type === 'light' ? 300 : type === 'medium' ? 450 : 650;
  if (credits < cost) {
    showToast('能源不足，无法生产');
    return;
  }
  credits -= cost;
  creditsLabel.textContent = String(credits);
  const offset = (playerTanks.length % 5 - 2) * 3;
  const tank = spawnTank(type, false, offset, 40 + Math.floor(playerTanks.length / 5) * 3);
  selected.clear();
  selected.add(tank);
  updateSelectionDisplay();
  showToast(`${tank.type.name} 已部署`);
}

document.querySelectorAll<HTMLButtonElement>('[data-unit]').forEach(button => {
  button.addEventListener('click', () => recruit(button.dataset.unit as TankTypeId));
});
window.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (['w', 'a', 's', 'd', '1', '2', '3'].includes(key)) event.preventDefault();
  heldKeys.add(key);
  if (event.repeat) return;
  if (key === '1') recruit('light');
  if (key === '2') recruit('medium');
  if (key === '3') recruit('heavy');
});
window.addEventListener('keyup', event => heldKeys.delete(event.key.toLowerCase()));

renderer.domElement.addEventListener('wheel', event => {
  event.preventDefault();
  const direction = camera.position.clone().sub(cameraTarget).normalize();
  const distance = THREE.MathUtils.clamp(camera.position.distanceTo(cameraTarget) + event.deltaY * 0.045, 45, 135);
  camera.position.copy(cameraTarget).add(direction.multiplyScalar(distance));
}, { passive: false });

function nearestLivingEnemy(tank: TankData) {
  const enemies = tank.isEnemy ? playerTanks : enemyTanks;
  let nearest: TankData | null = null;
  let distance = 78;
  for (const other of enemies) {
    if (other.hp <= 0) continue;
    const current = tank.group.position.distanceTo(other.group.position);
    if (current < distance) {
      distance = current;
      nearest = other;
    }
  }
  return nearest;
}

function fireIfReady(tank: TankData, delta: number) {
  tank.fireCooldown = Math.max(0, tank.fireCooldown - delta);
  const target = nearestLivingEnemy(tank);
  if (!target || tank.fireCooldown > 0) return;
  if (tank.group.position.distanceTo(target.group.position) > 58) return;
  fireBullet(tank, target.group.position, tank.isEnemy, scene);
  tank.fireCooldown = tank.isEnemy ? 1.45 : 1.05;
}

function updateProjectiles(delta: number) {
  for (let index = bullets.length - 1; index >= 0; index--) {
    const bullet = bullets[index];
    bullet.elapsed += delta;
    const progress = THREE.MathUtils.clamp(bullet.elapsed / bullet.duration, 0, 1);
    bullet.mesh.position.copy(bullet.startPos).lerp(bullet.targetPos, progress);
    bullet.mesh.position.y += Math.sin(progress * Math.PI) * 4.5;
    const obstacleHit = findObstacleHit(bullet.startPos, bullet.mesh.position);
    if (obstacleHit) {
      damageObstacle(obstacleHit.obstacle, 1);
      if (obstacleHit.obstacle.destroyed) {
        const obstacleIndex = terrainObstacles.indexOf(obstacleHit.obstacle);
        if (obstacleIndex >= 0) terrainObstacles.splice(obstacleIndex, 1);
      }
      createExplosion(obstacleHit.point, scene);
      scene.remove(bullet.mesh);
      bullet.mesh.geometry.dispose();
      (bullet.mesh.material as THREE.Material).dispose();
      bullets.splice(index, 1);
      continue;
    }
    if (progress < 1) continue;

    const targets = bullet.isEnemy ? playerTanks : enemyTanks;
    const impact = bullet.targetPos;
    let hit: TankData | null = null;
    let hitDistance = 3.6;
    for (const target of targets) {
      if (target.hp <= 0) continue;
      const distance = Math.hypot(target.group.position.x - impact.x, target.group.position.z - impact.z);
      if (distance < hitDistance) {
        hit = target;
        hitDistance = distance;
      }
    }
    if (hit) {
      hit.hp = Math.max(0, hit.hp - 1);
      if (hit.hp <= 0) {
        hit.group.visible = false;
        selected.delete(hit);
        updateSelectionDisplay();
      }
    }
    createExplosion(bullet.mesh.position, scene);
    scene.remove(bullet.mesh);
    bullet.mesh.geometry.dispose();
    (bullet.mesh.material as THREE.Material).dispose();
    bullets.splice(index, 1);
  }
}

function updateCamera(delta: number) {
  const move = new THREE.Vector3(
    Number(heldKeys.has('d')) - Number(heldKeys.has('a')),
    0,
    Number(heldKeys.has('s')) - Number(heldKeys.has('w')),
  );
  if (move.lengthSq()) {
    move.normalize().multiplyScalar(delta * 38);
    cameraTarget.add(move);
    cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, -48, 48);
    cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, -52, 52);
    camera.position.add(move);
  }
  camera.lookAt(cameraTarget);
}

function updateHUD() {
  document.querySelector('#army-count')!.textContent = String(playerTanks.filter(tank => tank.hp > 0).length);
  document.querySelector('#enemy-count')!.textContent = String(enemyTanks.filter(tank => tank.hp > 0).length);
  const destroyed = terrainObstacles.filter(obstacle => obstacle.destroyed).length;
  destroyedObstacles = destroyed;
  document.querySelector('#obstacle-count')!.textContent = String(destroyedObstacles);
  const remainingEnemy = enemyTanks.filter(tank => tank.hp > 0).length;
  if (!remainingEnemy && !gameEnded) {
    gameEnded = true;
    status.textContent = '敌军已被击退';
    showToast('战场胜利！敌军已被击退');
  } else if (!playerTanks.some(tank => tank.hp > 0) && !gameEnded) {
    gameEnded = true;
    status.textContent = '我方部队全灭';
    showToast('战斗失败，所有战车已损失');
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
  const delta = Math.min(clock.getDelta(), 0.05);
  updateCamera(delta);

  enemyWaveTimer -= delta;
  if (enemyWaveTimer <= 0 && !gameEnded) {
    const alive = enemyTanks.filter(tank => tank.hp > 0).length;
    if (alive < 8) {
      const type: TankTypeId = Math.random() > 0.6 ? 'medium' : 'light';
      const enemy = spawnTank(type, true, (Math.random() - 0.5) * 18, -42);
      enemy.targetPos.set(0, 0, 0);
      showToast('侦测到敌方增援');
    }
    enemyWaveTimer = 24;
  }

  const allTanks = [...playerTanks, ...enemyTanks];
  for (const tank of allTanks) {
    if (tank.hp <= 0) continue;
    if (tank.isEnemy && Math.random() < delta * 0.8) {
      const target = nearestLivingEnemy(tank);
      if (target) tank.targetPos.copy(target.group.position);
    }
    updateTank(tank, allTanks, delta, ground);
    fireIfReady(tank, delta);
  }
  updateProjectiles(delta);
  if (toastTimer > 0) {
    toastTimer -= delta;
    if (toastTimer <= 0) toast.classList.remove('show');
  }
  updateHUD();
  renderer.render(scene, camera);
}
animate();
