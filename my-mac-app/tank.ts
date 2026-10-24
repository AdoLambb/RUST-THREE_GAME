import * as THREE from 'three';
import { getGroundHeight, moveTank, TANK_BOUNDARY } from './terrain';

export type TankTypeId = 'light' | 'medium' | 'heavy';

export interface TankDefinition {
  id: TankTypeId;
  name: string;
  maxHp: number;
  modelScale: number;
  playerSpeed: number;
  aiSpeed: number;
  driveAcceleration: number;
  rotationSpeed: number;
  turretRotationSpeed: number;
  reloadTime: number;
  projectileSpeed: number;
  collisionRadius: number;
}

export const TANK_DEFINITIONS: Record<TankTypeId, TankDefinition> = {
  light: {
    id: 'light',
    name: '轻型坦克',
    maxHp: 3,
    modelScale: 1,
    playerSpeed: 3.8,
    aiSpeed: 4.8,
    driveAcceleration: 3.8,
    rotationSpeed: 0.95,
    turretRotationSpeed: 0.72,
    reloadTime: 1.15,
    projectileSpeed: 72,
    collisionRadius: 1.1,
  },
  medium: {
    id: 'medium',
    name: '中型坦克',
    maxHp: 4,
    modelScale: 1.25,
    playerSpeed: 3,
    aiSpeed: 3.8,
    driveAcceleration: 2.6,
    rotationSpeed: 0.72,
    turretRotationSpeed: 0.56,
    reloadTime: 1.55,
    projectileSpeed: 64,
    collisionRadius: 1.35,
  },
  heavy: {
    id: 'heavy',
    name: '重型坦克',
    maxHp: 6,
    modelScale: 1.55,
    playerSpeed: 2.4,
    aiSpeed: 2.8,
    driveAcceleration: 1.8,
    rotationSpeed: 0.5,
    turretRotationSpeed: 0.39,
    reloadTime: 2.1,
    projectileSpeed: 56,
    collisionRadius: 1.7,
  },
};

export interface TankData {
  id: number;
  type: TankDefinition;
  group: THREE.Group;
  turretGroup: THREE.Group;
  barrel: THREE.Mesh;
  barrelGroup: THREE.Group;
  nextBarrelSide: number;
  recoilAmount: number;
  hullRecoil: number;
  effectUniform: { value: number };
  laserGlowMaterial: THREE.MeshBasicMaterial;
  turretTargetAngle: number;
  isSelected: boolean;
  targetPos: THREE.Vector3;
  currentDriveSpeed: number;
  leftTrackSpeed: number;
  rightTrackSpeed: number;
  leftTrackDistance: number;
  rightTrackDistance: number;
  trackLinks: Array<{ mesh: THREE.Mesh; side: number; index: number }>;
  trackWheels: Array<{ mesh: THREE.Group; side: number; index: number }>;
  fireCooldown: number;
  isEnemy: boolean;
  hp: number;
}

export const playerTanks: TankData[] = [];
export const enemyTanks: TankData[] = [];
let tankIdCounter = 0;

function buildTankMesh(
  bodyColor: number,
  emissiveColor: number,
  accentColor: number,
  modelScale: number,
) {
  const group = new THREE.Group();
  const effectUniform = { value: 0 };
  const laserGlowMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const laserBandMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true,
    toneMapped: false,
    side: THREE.DoubleSide,
  });
  const trackLinks: Array<{ mesh: THREE.Mesh; side: number; index: number }> = [];
  const trackWheels: Array<{ mesh: THREE.Group; side: number; index: number }> = [];
  const armorMaterial = new THREE.MeshStandardMaterial({
    color: bodyColor,
    emissive: emissiveColor,
    emissiveIntensity: 0.06,
    metalness: 0.32,
    roughness: 0.76,
  });
  const darkArmorMaterial = new THREE.MeshStandardMaterial({
    color: 0x090910,
    metalness: 0.28,
    roughness: 0.84,
  });
  const trimMaterial = new THREE.MeshStandardMaterial({
    color: accentColor,
    emissive: accentColor,
    emissiveIntensity: 0.48,
    metalness: 0.18,
    roughness: 0.4,
  });

  function addBox(
    parent: THREE.Object3D,
    geometry: THREE.BoxGeometry,
    material: THREE.Material,
    position: THREE.Vector3Tuple,
    rotation?: THREE.Vector3Tuple,
  ) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  function addLaserBand(
    parent: THREE.Object3D,
    halfWidth: number,
    halfDepth: number,
    y: number,
    bandHeight: number,
  ) {
    const palette = [
      new THREE.Color(0x36dfff),
      new THREE.Color(0x356bff),
      new THREE.Color(0x7745ff),
      new THREE.Color(0xb54cff),
      new THREE.Color(0x7745ff),
      new THREE.Color(0x356bff),
      new THREE.Color(0x36dfff),
    ];
    const corner = Math.min(halfWidth, halfDepth) * 0.13;
    const points: Array<[number, number]> = [
      [-halfWidth + corner, -halfDepth],
      [halfWidth - corner, -halfDepth],
      [halfWidth, -halfDepth + corner],
      [halfWidth, halfDepth - corner],
      [halfWidth - corner, halfDepth],
      [-halfWidth + corner, halfDepth],
      [-halfWidth, halfDepth - corner],
      [-halfWidth, -halfDepth + corner],
    ];
    const perimeter = points.reduce((total, [x, z], index) => {
      const [nextX, nextZ] = points[(index + 1) % points.length];
      return total + Math.hypot(nextX - x, nextZ - z);
    }, 0);
    const positions: number[] = [];
    const colors: number[] = [];
    const indices: number[] = [];
    let traveled = 0;

    function sampleColor(position: number) {
      const palettePosition = position * (palette.length - 1);
      const paletteIndex = Math.min(palette.length - 2, Math.floor(palettePosition));
      return palette[paletteIndex].clone().lerp(
        palette[paletteIndex + 1],
        palettePosition - paletteIndex,
      );
    }

    for (let index = 0; index < points.length; index++) {
      const [x, z] = points[index];
      const [nextX, nextZ] = points[(index + 1) % points.length];
      const length = Math.hypot(nextX - x, nextZ - z);
      const startColor = sampleColor(traveled / perimeter);
      const endColor = sampleColor((traveled + length) / perimeter);
      const vertexStart = positions.length / 3;
      const bottom = y - bandHeight / 2;
      const top = y + bandHeight / 2;
      positions.push(x, bottom, z, x, top, z, nextX, top, nextZ, nextX, bottom, nextZ);
      for (const color of [startColor, startColor, endColor, endColor]) {
        colors.push(color.r, color.g, color.b);
      }
      indices.push(
        vertexStart, vertexStart + 1, vertexStart + 2,
        vertexStart, vertexStart + 2, vertexStart + 3,
      );
      traveled += length;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const glowPositions = positions.slice();
    for (let vertex = 0; vertex < glowPositions.length; vertex += 3) {
      const length = Math.hypot(glowPositions[vertex], glowPositions[vertex + 2]);
      const scale = (length + 0.035) / Math.max(length, 0.0001);
      glowPositions[vertex] *= scale;
      glowPositions[vertex + 2] *= scale;
      glowPositions[vertex + 1] = y + (glowPositions[vertex + 1] - y) * 1.45;
    }
    const glowGeometry = new THREE.BufferGeometry();
    glowGeometry.setAttribute('position', new THREE.Float32BufferAttribute(glowPositions, 3));
    glowGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    glowGeometry.setIndex(indices);
    glowGeometry.computeVertexNormals();

    const glow = new THREE.Mesh(glowGeometry, laserGlowMaterial);
    const band = new THREE.Mesh(geometry, laserBandMaterial);
    parent.add(glow, band);
  }

  for (const side of [-1, 1]) {
    const trackPath = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.94, 0.17, -1.1),
      new THREE.Vector3(side * 0.94, 0.17, 1.1),
      new THREE.Vector3(side * 0.94, 0.51, 1.44),
      new THREE.Vector3(side * 0.94, 0.85, 1.1),
      new THREE.Vector3(side * 0.94, 0.85, -1.1),
      new THREE.Vector3(side * 0.94, 0.51, -1.44),
    ], true, 'centripetal');
    const trackBelt = new THREE.Mesh(
      new THREE.TubeGeometry(trackPath, 72, 0.1, 8, true),
      darkArmorMaterial,
    );
    trackBelt.castShadow = true;
    trackBelt.receiveShadow = true;
    group.add(trackBelt);

    for (let index = 0; index < 5; index++) {
      const wheelPivot = new THREE.Group();
      wheelPivot.position.set(side * 1.28, 0.52, -0.94 + index * 0.47);
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.27, 0.27, 0.13, 12),
        darkArmorMaterial,
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      wheelPivot.add(wheel);

      const hub = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.145, 10),
        darkArmorMaterial,
      );
      hub.rotation.z = Math.PI / 2;
      hub.position.x = side * 0.06;
      wheelPivot.add(hub);
      group.add(wheelPivot);
      trackWheels.push({ mesh: wheelPivot, side, index });
    }

    const trackLength = 4.4 + Math.PI * 0.68;
    const trackLinkCount = Math.ceil(trackLength / 0.24);
    for (let index = 0; index < trackLinkCount; index++) {
      const link = new THREE.Mesh(
        new THREE.BoxGeometry(0.66, 0.1, trackLength / trackLinkCount * 0.88),
        index % 4 === 0 ? armorMaterial : darkArmorMaterial,
      );
      link.castShadow = true;
      group.add(link);
      trackLinks.push({ mesh: link, side, index });
    }

  }

  addBox(group, new THREE.BoxGeometry(1.72, 0.56, 2.55), armorMaterial, [0, 1.02, 0]);
  addBox(group, new THREE.BoxGeometry(1.43, 0.42, 1.75), armorMaterial, [0, 1.48, 0.18]);
  addBox(
    group,
    new THREE.BoxGeometry(1.32, 0.18, 0.78),
    armorMaterial,
    [0, 1.42, -0.94],
    [-0.2, 0, 0],
  );
  addLaserBand(group, 1.39, 1.5, 0.98, 0.34);

  const turretGroup = new THREE.Group();
  turretGroup.position.y = 1.65;
  const turretRing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.8, 0.18, 12),
    darkArmorMaterial,
  );
  turretRing.position.y = 0.1;
  turretRing.castShadow = true;
  turretGroup.add(turretRing);

  const turretRingLight = new THREE.Mesh(
    new THREE.TorusGeometry(0.66, 0.035, 6, 24),
    trimMaterial,
  );
  turretRingLight.rotation.x = Math.PI / 2;
  turretRingLight.position.y = 0.2;
  turretGroup.add(turretRingLight);

  addBox(turretGroup, new THREE.BoxGeometry(1.16, 0.23, 1.18), darkArmorMaterial, [0, 0.26, 0.12]);
  addLaserBand(turretGroup, 0.63, 0.64, 0.47, 0.22);
  addBox(turretGroup, new THREE.BoxGeometry(1.1, 0.2, 1.12), armorMaterial, [0, 0.665, 0.12]);
  for (const side of [-1, 1]) {
    addBox(
      turretGroup,
      new THREE.BoxGeometry(0.018, 0.022, 0.4),
      trimMaterial,
      [side * 0.596, 0.43, 0.2],
    );
  }

  const barrelGroup = new THREE.Group();
  barrelGroup.position.set(0, 0.48, 0);
  let barrel!: THREE.Mesh;
  for (const side of [-1, 1]) {
    const barrelMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.095, 0.135, 1.9, 10),
      darkArmorMaterial,
    );
    barrelMesh.rotation.x = Math.PI / 2;
    barrelMesh.position.set(side * 0.19, 0, -1.14);
    barrelMesh.castShadow = true;
    barrelGroup.add(barrelMesh);
    if (side < 0) barrel = barrelMesh;

    const barrelLaser = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.04, 1.42, 8),
      trimMaterial,
    );
    barrelLaser.rotation.x = Math.PI / 2;
    barrelLaser.position.set(side * 0.19, 0, -1.38);
    barrelGroup.add(barrelLaser);

    const muzzle = new THREE.Mesh(
      new THREE.TorusGeometry(0.105, 0.025, 6, 16),
      trimMaterial,
    );
    muzzle.position.set(side * 0.19, 0, -2.12);
    barrelGroup.add(muzzle);
  }
  turretGroup.add(barrelGroup);

  const turretHatch = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.27, 0.16, 8),
    darkArmorMaterial,
  );
  turretHatch.scale.z = 1.45;
  turretHatch.position.set(0, 0.76, 0.45);
  turretHatch.castShadow = true;
  turretGroup.add(turretHatch);

  const hatchLight = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.025, 6, 16),
    trimMaterial,
  );
  hatchLight.rotation.x = Math.PI / 2;
  hatchLight.scale.y = 1.55;
  hatchLight.position.set(0, 0.85, 0.45);
  turretGroup.add(hatchLight);

  group.add(turretGroup);
  group.scale.setScalar(modelScale);
  return {
    group,
    turretGroup,
    barrel,
    barrelGroup,
    nextBarrelSide: -1,
    effectUniform,
    laserGlowMaterial,
    trackLinks,
    trackWheels,
  };
}

export function createTank(
  isEnemy: boolean,
  x: number,
  z: number,
  scene: THREE.Scene,
  ground: THREE.Mesh,
  typeId: TankTypeId = 'medium',
) {
  const type = TANK_DEFINITIONS[typeId];
  const color = 0x111019;
  const emissive = isEnemy ? 0x190818 : 0x10091e;
  const accent = isEnemy ? 0xff52dc : 0xb34dff;
  const {
    group,
    turretGroup,
    barrel,
    barrelGroup,
    effectUniform,
    laserGlowMaterial,
    trackLinks,
    trackWheels,
  } = buildTankMesh(color, emissive, accent, type.modelScale);
  group.rotation.order = 'YXZ';
  
  group.position.set(x, getGroundHeight(x, z, ground), z);
  if (isEnemy) turretGroup.rotation.y = Math.random() * Math.PI;
  scene.add(group);
  
  const data: TankData = {
    id: tankIdCounter++,
    type,
    group,
    turretGroup,
    barrel,
    barrelGroup,
    effectUniform,
    laserGlowMaterial,
    nextBarrelSide: -1,
    recoilAmount: 0,
    hullRecoil: 0,
    turretTargetAngle: turretGroup.rotation.y,
    isSelected: false,
    targetPos: group.position.clone(),
    currentDriveSpeed: 0,
    leftTrackSpeed: 0,
    rightTrackSpeed: 0,
    leftTrackDistance: 0,
    rightTrackDistance: 0,
    trackLinks,
    trackWheels,
    fireCooldown: isEnemy ? type.reloadTime : 0,
    isEnemy,
    hp: type.maxHp,
  };
  updateTrackVisuals(data, 0, 0, 0);
  if (isEnemy) enemyTanks.push(data); else playerTanks.push(data);
}

export function disposeTank(tank: TankData) {
  tank.group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach(material => material.dispose());
  });
}

export interface Bullet {
  id: number;
  mesh: THREE.Group;
  ownerTankId: number;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  velocity: THREE.Vector3;
  gravity: number;
  airDrag: number;
  maxRange: number;
  traveledDistance: number;
  elapsed: number;
  duration: number;
  isEnemy: boolean;
  canDamageUnit: boolean;
}
export const bullets: Bullet[] = [];
let bulletIdCounter = 0;
const projectileForward = new THREE.Vector3(0, 0, 1);
const muzzleForward = new THREE.Vector3();
const muzzleWorldQuaternion = new THREE.Quaternion();
const localMuzzleForward = new THREE.Vector3(0, 0, -1);
export interface Explosion {
  mesh: THREE.Group;
  life: number;
  maxLife: number;
  rings: THREE.Mesh[];
  core: THREE.Mesh;
  sparks: Array<{ mesh: THREE.Mesh; velocity: THREE.Vector3 }>;
}
export const explosions: Explosion[] = [];

const MIN_SHOT_SPEED_FACTOR = 0.55;
const MAX_SHOT_SPEED_FACTOR = 1.25;

export function disposeGroup(group: THREE.Group) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
}

function predictImpact(
  start: THREE.Vector3,
  initialVelocity: THREE.Vector3,
  ground: THREE.Mesh,
  rangeLimit: number,
) {
  const point = start.clone();
  const velocity = initialVelocity.clone();
  const step = 1 / 120;
  let elapsed = 0;
  let traveledDistance = 0;

  while (elapsed < 8 && traveledDistance < rangeLimit) {
    const nextVelocity = velocity.clone().multiplyScalar(Math.exp(-0.42 * step));
    nextVelocity.y -= 9.81 * step;
    const stepVelocity = velocity.clone().add(nextVelocity).multiplyScalar(0.5);
    const previous = point.clone();
    point.addScaledVector(stepVelocity, step);
    velocity.copy(nextVelocity);
    elapsed += step;
    traveledDistance += Math.hypot(point.x - previous.x, point.z - previous.z);
    const groundHeight = getGroundHeight(point.x, point.z, ground);
    if (point.y <= groundHeight) {
      point.y = groundHeight;
      break;
    }
  }

  return { point, elapsed };
}

export function getShotRangeBounds(tank: TankData, target: THREE.Vector3, ground: THREE.Mesh) {
  const direction = target.clone().sub(tank.group.position).setY(0).normalize();
  if (direction.lengthSq() === 0) direction.set(0, 0, -1);
  const scale = tank.type.modelScale;
  const start = tank.group.position.clone()
    .addScaledVector(direction, 2.24 * scale)
    .add(new THREE.Vector3(0, 2.13 * scale, 0));
  const left = new THREE.Vector3(-direction.z, 0, direction.x);
  const muzzleStart = start.addScaledVector(left, tank.nextBarrelSide * 0.19 * scale);
  const baseSpeed = tank.type.projectileSpeed * 1.35;
  const makeImpact = (factor: number) => predictImpact(
    muzzleStart,
    direction.clone().multiplyScalar(baseSpeed * factor),
    ground,
    120,
  ).point;

  return {
    nearest: makeImpact(MIN_SHOT_SPEED_FACTOR),
    farthest: makeImpact(MAX_SHOT_SPEED_FACTOR),
  };
}

export function fireBullet(
  tank: TankData,
  isEnemy: boolean,
  scene: THREE.Scene,
  ground: THREE.Mesh,
  canDamageUnit = true,
  maxRange = Number.POSITIVE_INFINITY,
  desiredRange?: number,
) {
  const color = isEnemy ? 0xff52dc : 0xb34dff;
  const bulletMesh = new THREE.Group();
  const outerTrail = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.42, 6.2, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  outerTrail.rotation.x = Math.PI / 2;
  outerTrail.position.z = -3.15;
  bulletMesh.add(outerTrail);
  const laserCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.13, 5.5, 8, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0x9dfaff,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    }),
  );
  laserCore.rotation.x = Math.PI / 2;
  laserCore.position.z = -2.8;
  bulletMesh.add(laserCore);
  const bolt = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.24, 1),
    new THREE.MeshBasicMaterial({
      color: 0xecffff,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );
  bolt.scale.set(0.8, 0.8, 2.4);
  bulletMesh.add(bolt);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 12, 10),
    new THREE.MeshBasicMaterial({
      color: 0x62dcff,
      transparent: true,
      opacity: 0.68,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.set(1, 1, 1.8);
  bulletMesh.add(halo);
  const startPos = new THREE.Vector3();
  tank.barrelGroup.updateWorldMatrix(true, false);
  tank.barrelGroup.localToWorld(startPos.set(tank.nextBarrelSide * 0.19, 0, -2.24));
  tank.nextBarrelSide *= -1;
  const baseSpeed = tank.type.projectileSpeed * 1.35;
  let speed = baseSpeed;
  if (desiredRange !== undefined) {
    let low = baseSpeed * MIN_SHOT_SPEED_FACTOR;
    let high = baseSpeed * MAX_SHOT_SPEED_FACTOR;
    const desired = THREE.MathUtils.clamp(desiredRange, 0, maxRange);
    for (let iteration = 0; iteration < 12; iteration++) {
      speed = (low + high) / 2;
      const predicted = predictImpact(
        startPos,
        muzzleForward.copy(localMuzzleForward)
          .applyQuaternion(tank.barrelGroup.getWorldQuaternion(muzzleWorldQuaternion))
          .normalize()
          .multiplyScalar(speed),
        ground,
        Number.isFinite(maxRange) ? maxRange : 120,
      );
      const predictedRange = Math.hypot(
        predicted.point.x - startPos.x,
        predicted.point.z - startPos.z,
      );
      if (predictedRange < desired) low = speed;
      else high = speed;
    }
  }
  const gravity = 9.81;
  const airDrag = 0.42;
  const rangeLimit = Number.isFinite(maxRange) ? maxRange : 120;
  tank.barrelGroup.getWorldQuaternion(muzzleWorldQuaternion);
  const velocity = muzzleForward.copy(localMuzzleForward)
    .applyQuaternion(muzzleWorldQuaternion)
    .normalize()
    .multiplyScalar(speed);
  const prediction = predictImpact(startPos, velocity, ground, rangeLimit);
  const shotTarget = prediction.point;
  const duration = prediction.elapsed;

  bulletMesh.position.copy(startPos);
  bulletMesh.quaternion.setFromUnitVectors(projectileForward, velocity.clone().normalize());
  scene.add(bulletMesh);
  tank.recoilAmount = 0.78;
  tank.hullRecoil = tank.type.id === 'heavy' ? 0.075 : 0.055;
  bullets.push({
    id: bulletIdCounter++,
    mesh: bulletMesh,
    ownerTankId: tank.id,
    startPos,
    targetPos: shotTarget,
    velocity,
    gravity,
    airDrag,
    maxRange: rangeLimit,
    traveledDistance: 0,
    elapsed: 0,
    duration,
    isEnemy,
    canDamageUnit,
  });
}

export function createExplosion(
  position: THREE.Vector3,
  scene: THREE.Scene,
  impactDirection = projectileForward,
) {
  const mesh = new THREE.Group();
  mesh.position.copy(position);
  const core = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.7, 1),
    new THREE.MeshBasicMaterial({
      color: 0xf5fdff,
      transparent: true,
      opacity: 1,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    }),
  );
  core.position.y = 0.75;
  mesh.add(core);

  const rings = [0x56eaff, 0xbd42ff, 0xff45d4].map((color, index) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72 + index * 0.12, 0.045, 8, 40),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12 + index * 0.035;
    mesh.add(ring);
    return ring;
  });

  const palette = [0x5ceaff, 0xa94dff, 0xff4bd8, 0xf2fbff];
  const sparks: Explosion['sparks'] = [];
  const forward = impactDirection.clone().normalize();
  for (let index = 0; index < 36; index++) {
    const direction = new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0.12 + Math.random() * 1.1,
      (Math.random() - 0.5) * 2,
    ).normalize();
    direction.lerp(forward, 0.12).normalize();
    const material = new THREE.MeshBasicMaterial({
      color: palette[index % palette.length],
      transparent: true,
      opacity: 1,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const spark = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.025, 1, 5, 1, true),
      material,
    );
    spark.position.y = 0.7;
    spark.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction);
    spark.scale.y = 0.7 + Math.random() * 0.8;
    mesh.add(spark);
    sparks.push({
      mesh: spark,
      velocity: direction.multiplyScalar(4 + Math.random() * 7),
    });
  }
  scene.add(mesh);
  explosions.push({
    mesh,
    life: 1.15,
    maxLife: 1.15,
    rings,
    core,
    sparks,
  });
}

function getAngle(from: THREE.Vector3, to: THREE.Vector3) {
  return Math.atan2(to.x - from.x, to.z - from.z) + Math.PI; 
}

function lerpAngle(current: number, target: number, speed: number) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * speed;
}

function updateTrackVisuals(tank: TankData, leftTravel: number, rightTravel: number, delta: number) {
  const straightLength = 2.2;
  const radius = 0.34;
  const arcLength = Math.PI * radius;
  const trackLength = straightLength * 2 + arcLength * 2;
  const linkCount = Math.ceil(trackLength / 0.24);
  const linkPitch = trackLength / linkCount;

  for (const { mesh, side, index } of tank.trackLinks) {
    const travel = side < 0 ? leftTravel : rightTravel;
    let distance = THREE.MathUtils.euclideanModulo(
      index * linkPitch + travel / tank.type.modelScale,
      trackLength,
    );
    let y: number;
    let z: number;
    let tangentY: number;
    let tangentZ: number;

    if (distance < straightLength) {
      y = 0.17;
      z = -1.1 + distance;
      tangentY = 0;
      tangentZ = 1;
    } else if ((distance -= straightLength) < arcLength) {
      const angle = -Math.PI / 2 + distance / radius;
      y = 0.51 + radius * Math.sin(angle);
      z = 1.1 + radius * Math.cos(angle);
      tangentY = Math.cos(angle);
      tangentZ = -Math.sin(angle);
    } else if ((distance -= arcLength) < straightLength) {
      y = 0.85;
      z = 1.1 - distance;
      tangentY = 0;
      tangentZ = -1;
    } else {
      distance -= straightLength;
      const angle = Math.PI / 2 + distance / radius;
      y = 0.51 + radius * Math.sin(angle);
      z = -1.1 + radius * Math.cos(angle);
      tangentY = Math.cos(angle);
      tangentZ = -Math.sin(angle);
    }

    mesh.position.set(side * 0.94, y, z);
    mesh.rotation.x = Math.atan2(-tangentY, tangentZ);
  }

  for (const { mesh, side, index } of tank.trackWheels) {
    const speed = side < 0 ? tank.leftTrackSpeed : tank.rightTrackSpeed;
    mesh.rotateX(-speed / tank.type.modelScale / 0.27 * delta);
    const trackDistance = side < 0 ? leftTravel : rightTravel;
    mesh.position.y = 0.52 + Math.sin(trackDistance / tank.type.modelScale / 0.47 + index * Math.PI) * 0.025;
  }
}

function approachSpeed(current: number, target: number, maxChange: number) {
  return current + THREE.MathUtils.clamp(target - current, -maxChange, maxChange);
}

export function updateTank(
  tank: TankData,
  allTanks: TankData[],
  delta: number,
  ground: THREE.Mesh,
  movementDirection?: THREE.Vector3,
  movementMultiplier = 1,
  directMovement = false,
) {
  tank.effectUniform.value += delta;
  tank.laserGlowMaterial.opacity = 0.26 + (Math.sin(tank.effectUniform.value * 2) + 1) * 0.08;
  const distance = tank.group.position.distanceTo(tank.targetPos);
  const previousSpeed = tank.currentDriveSpeed;
  const previousYaw = tank.group.rotation.y;
  
  let nearestEnemy: TankData | null = null;
  let minDist = 80;
  for (const other of allTanks) {
    if (other.id === tank.id || other.hp <= 0 || other.isEnemy === tank.isEnemy) continue;
    const d = tank.group.position.distanceTo(other.group.position);
    if (d < minDist) {
      minDist = d;
      nearestEnemy = other;
    }
  }

  if (tank.isEnemy && nearestEnemy) {
    tank.turretTargetAngle = getAngle(tank.group.position, nearestEnemy.group.position) - tank.group.rotation.y;
  } else if (tank.isEnemy) {
    tank.turretTargetAngle = 0;
  }
  const turretAngleDifference = THREE.MathUtils.euclideanModulo(
    tank.turretTargetAngle - tank.turretGroup.rotation.y + Math.PI,
    Math.PI * 2,
  ) - Math.PI;
  tank.turretGroup.rotation.y += THREE.MathUtils.clamp(
    turretAngleDifference,
    -tank.type.turretRotationSpeed * delta,
    tank.type.turretRotationSpeed * delta,
  );
  tank.recoilAmount *= Math.exp(-18 * delta);
  tank.barrelGroup.position.z = tank.recoilAmount;
  tank.hullRecoil *= Math.exp(-24 * delta);
  tank.fireCooldown = Math.max(0, tank.fireCooldown - delta);
  if (directMovement) {
    const steering = THREE.MathUtils.clamp(movementDirection?.x ?? 0, -1, 1);
    const throttle = THREE.MathUtils.clamp(movementDirection?.z ?? 0, -1, 1);
    const forward = new THREE.Vector3(-Math.sin(tank.group.rotation.y), 0, -Math.cos(tank.group.rotation.y));
    const travelDirection = forward.clone().multiplyScalar(throttle < 0 ? -1 : 1);
    const uphillProbe = tank.group.position.clone().addScaledVector(travelDirection, 2);
    const heightChange = getGroundHeight(uphillProbe.x, uphillProbe.z, ground) - tank.group.position.y;
    const slopeFactor = THREE.MathUtils.clamp(1 - heightChange * 0.18, 0.72, 1.16);
    const baseSpeed = throttle * tank.type.playerSpeed * movementMultiplier * slopeFactor;
    const trackDifferential = steering * Math.abs(throttle)
      * tank.type.playerSpeed * movementMultiplier * 0.68 * slopeFactor;
    const targetLeftSpeed = baseSpeed + trackDifferential;
    const targetRightSpeed = baseSpeed - trackDifferential;
    const acceleration = tank.type.driveAcceleration;
    const leftAcceleration = Math.abs(targetLeftSpeed) < 0.01
      ? acceleration * 0.75
      : tank.leftTrackSpeed * targetLeftSpeed < 0 ? acceleration * 2 : acceleration;
    const rightAcceleration = Math.abs(targetRightSpeed) < 0.01
      ? acceleration * 0.75
      : tank.rightTrackSpeed * targetRightSpeed < 0 ? acceleration * 2 : acceleration;
    tank.leftTrackSpeed = approachSpeed(
      tank.leftTrackSpeed,
      targetLeftSpeed,
      leftAcceleration * delta,
    );
    tank.rightTrackSpeed = approachSpeed(
      tank.rightTrackSpeed,
      targetRightSpeed,
      rightAcceleration * delta,
    );
    tank.currentDriveSpeed = (tank.leftTrackSpeed + tank.rightTrackSpeed) / 2;

    if (Math.abs(tank.currentDriveSpeed) > 0.01) {
      const previousPosition = tank.group.position.clone();
      const trackWidth = 1.88 * tank.type.modelScale;
      const yawDelta = (tank.rightTrackSpeed - tank.leftTrackSpeed) / trackWidth * delta;
      const middleYaw = tank.group.rotation.y + yawDelta * 0.5;
      forward.set(-Math.sin(middleYaw), 0, -Math.cos(middleYaw));
      moveTank(
        tank.group.position,
        forward,
        tank.currentDriveSpeed * delta,
        tank.type.collisionRadius,
        false,
      );
      tank.group.rotation.y += yawDelta;
      const actualTravel = tank.group.position.distanceTo(previousPosition);
      const requestedTravel = Math.abs(tank.currentDriveSpeed * delta);
      const travelScale = requestedTravel > 0 ? actualTravel / requestedTravel : 0;
      tank.leftTrackDistance += tank.leftTrackSpeed * delta * travelScale;
      tank.rightTrackDistance += tank.rightTrackSpeed * delta * travelScale;
    } else {
      tank.leftTrackSpeed = 0;
      tank.rightTrackSpeed = 0;
    }
    updateTrackVisuals(tank, tank.leftTrackDistance, tank.rightTrackDistance, delta);
    tank.targetPos.copy(tank.group.position);
  } else if (movementDirection !== undefined) {
    if (movementDirection.lengthSq() > 0) {
      const targetAngle = getAngle(tank.group.position, tank.group.position.clone().add(movementDirection));
      tank.group.rotation.y = lerpAngle(
        tank.group.rotation.y,
        targetAngle,
        tank.type.rotationSpeed * delta,
      );

      let angleDiff = targetAngle - tank.group.rotation.y;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

      if (directMovement || Math.abs(angleDiff) < 0.8) {
        moveTank(
          tank.group.position,
          movementDirection,
          tank.type.playerSpeed * movementMultiplier * delta,
          tank.type.collisionRadius,
        );
      }
    }
    tank.targetPos.copy(tank.group.position);
  } else if (distance > 2.5) {
    const targetAngle = getAngle(tank.group.position, tank.targetPos);
    const headingError = THREE.MathUtils.euclideanModulo(
      targetAngle - tank.group.rotation.y + Math.PI,
      Math.PI * 2,
    ) - Math.PI;
    const intendedDirection = new THREE.Vector3(-Math.sin(targetAngle), 0, -Math.cos(targetAngle));
    const uphillProbe = tank.group.position.clone().addScaledVector(intendedDirection, 2);
    const slope = getGroundHeight(uphillProbe.x, uphillProbe.z, ground) - tank.group.position.y;
    let baseSpeed = tank.type.aiSpeed * THREE.MathUtils.clamp(1 - slope * 0.18, 0.65, 1.2);
    if (Math.abs(headingError) > 1) baseSpeed *= 0.6;
    if (distance < 4) baseSpeed *= 0.5;
    const trackWidth = 1.88 * tank.type.modelScale;
    const differential = THREE.MathUtils.clamp(
      headingError * tank.type.rotationSpeed * trackWidth * 0.5,
      -baseSpeed * 0.55,
      baseSpeed * 0.55,
    );
    tank.leftTrackSpeed = approachSpeed(tank.leftTrackSpeed, baseSpeed - differential, tank.type.driveAcceleration * delta);
    tank.rightTrackSpeed = approachSpeed(tank.rightTrackSpeed, baseSpeed + differential, tank.type.driveAcceleration * delta);
    const averageSpeed = (tank.leftTrackSpeed + tank.rightTrackSpeed) / 2;
    const previousPosition = tank.group.position.clone();
    const yawDelta = (tank.rightTrackSpeed - tank.leftTrackSpeed) / trackWidth * delta;
    const middleYaw = tank.group.rotation.y + yawDelta * 0.5;
    const forward = new THREE.Vector3(-Math.sin(middleYaw), 0, -Math.cos(middleYaw));
    moveTank(tank.group.position, forward, averageSpeed * delta, tank.type.collisionRadius);
    tank.group.rotation.y += yawDelta;
    const actualTravel = tank.group.position.distanceTo(previousPosition);
    const requestedTravel = Math.abs(averageSpeed * delta);
    const travelScale = requestedTravel > 0 ? actualTravel / requestedTravel : 0;
    tank.leftTrackDistance += tank.leftTrackSpeed * delta * travelScale;
    tank.rightTrackDistance += tank.rightTrackSpeed * delta * travelScale;
    tank.currentDriveSpeed = averageSpeed;
  } else {
    if (distance > 0.1) tank.targetPos.copy(tank.group.position);
    tank.leftTrackSpeed = approachSpeed(tank.leftTrackSpeed, 0, tank.type.driveAcceleration * delta);
    tank.rightTrackSpeed = approachSpeed(tank.rightTrackSpeed, 0, tank.type.driveAcceleration * delta);
  }

  tank.group.position.x = THREE.MathUtils.clamp(tank.group.position.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.group.position.z = THREE.MathUtils.clamp(tank.group.position.z, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.x = THREE.MathUtils.clamp(tank.targetPos.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.z = THREE.MathUtils.clamp(tank.targetPos.z, -TANK_BOUNDARY, TANK_BOUNDARY);

  const currentGroundY = getGroundHeight(tank.group.position.x, tank.group.position.z, ground);
  tank.group.position.y = currentGroundY;

  const forward = new THREE.Vector3(0, 0, -2).applyAxisAngle(new THREE.Vector3(0, 1, 0), tank.group.rotation.y);
  const right = new THREE.Vector3(2, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), tank.group.rotation.y);
  const hForward = getGroundHeight(tank.group.position.x + forward.x, tank.group.position.z + forward.z, ground);
  const hBack = getGroundHeight(tank.group.position.x - forward.x, tank.group.position.z - forward.z, ground);
  const hRight = getGroundHeight(tank.group.position.x + right.x, tank.group.position.z + right.z, ground);
  const hLeft = getGroundHeight(tank.group.position.x - right.x, tank.group.position.z - right.z, ground);

  const pitch = Math.atan2(hForward - hBack, 4);
  const roll = Math.atan2(hRight - hLeft, 4);
  const longitudinalAcceleration = delta > 0 ? (tank.currentDriveSpeed - previousSpeed) / delta : 0;
  const yawRate = delta > 0 ? (tank.group.rotation.y - previousYaw) / delta : 0;
  const accelerationPitch = THREE.MathUtils.clamp(-longitudinalAcceleration * 0.012, -0.075, 0.075);
  const corneringRoll = THREE.MathUtils.clamp(
    -yawRate * tank.currentDriveSpeed * 0.014,
    -0.07,
    0.07,
  );
  const slopeBlend = 1 - Math.exp(-7 * delta);
  tank.group.rotation.x = THREE.MathUtils.lerp(
    tank.group.rotation.x,
    pitch + accelerationPitch + tank.hullRecoil,
    slopeBlend,
  );
  tank.group.rotation.z = THREE.MathUtils.lerp(
    tank.group.rotation.z,
    roll + corneringRoll,
    slopeBlend,
  );
  if (!directMovement) {
    updateTrackVisuals(tank, tank.leftTrackDistance, tank.rightTrackDistance, delta);
  }
}