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
  rotationSpeed: number;
  turretRotationSpeed: number;
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
    aiSpeed: 5.5,
    rotationSpeed: 10,
    turretRotationSpeed: 9,
    projectileSpeed: 36,
    collisionRadius: 1.1,
  },
  medium: {
    id: 'medium',
    name: '中型坦克',
    maxHp: 4,
    modelScale: 1.25,
    playerSpeed: 3,
    aiSpeed: 4.5,
    rotationSpeed: 8,
    turretRotationSpeed: 8,
    projectileSpeed: 32,
    collisionRadius: 1.35,
  },
  heavy: {
    id: 'heavy',
    name: '重型坦克',
    maxHp: 6,
    modelScale: 1.55,
    playerSpeed: 2.4,
    aiSpeed: 3.5,
    rotationSpeed: 5.5,
    turretRotationSpeed: 6,
    projectileSpeed: 27,
    collisionRadius: 1.7,
  },
};

export interface TankData {
  id: number;
  type: TankDefinition;
  group: THREE.Group;
  turretGroup: THREE.Group;
  barrel: THREE.Mesh;
  isSelected: boolean;
  targetPos: THREE.Vector3;
  fireCooldown: number;
  isEnemy: boolean;
  hp: number;
}

export const playerTanks: TankData[] = [];
export const enemyTanks: TankData[] = [];
let tankIdCounter = 0;

function buildTankMesh(bodyColor: number, emissiveColor: number, modelScale: number) {
  const group = new THREE.Group();
  const track = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.6, 2.8), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  track.position.y = 0.5; track.castShadow = true; group.add(track);

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.6, 2.2), new THREE.MeshStandardMaterial({ color: bodyColor, emissive: emissiveColor }));
  body.position.y = 1.0; body.castShadow = true; group.add(body);

  const turretGroup = new THREE.Group();
  turretGroup.position.y = 1.4; 
  const turretBase = new THREE.Mesh(new THREE.BoxGeometry(1, 0.5, 1), new THREE.MeshStandardMaterial({ color: 0xeeeeee }));
  turretBase.castShadow = true; turretGroup.add(turretBase);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.8), new THREE.MeshStandardMaterial({ color: 0x555555 }));
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0, -1.2); barrel.castShadow = true; turretGroup.add(barrel);

  group.add(turretGroup);
  group.scale.setScalar(modelScale);
  return { group, turretGroup, barrel };
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
  const color = isEnemy ? 0xff3333 : 0x3366ff;
  const emissive = isEnemy ? 0x550000 : 0x112244;
  const { group, turretGroup, barrel } = buildTankMesh(color, emissive, type.modelScale);
  
  group.position.set(x, getGroundHeight(x, z, ground), z);
  if (isEnemy) turretGroup.rotation.y = Math.random() * Math.PI;
  scene.add(group);
  
  const data: TankData = {
    id: tankIdCounter++,
    type,
    group,
    turretGroup,
    barrel,
    isSelected: false,
    targetPos: group.position.clone(),
    fireCooldown: isEnemy ? 1.2 : 0,
    isEnemy,
    hp: type.maxHp,
  };
  if (isEnemy) enemyTanks.push(data); else playerTanks.push(data);
}

export interface Bullet {
  id: number;
  mesh: THREE.Mesh;
  ownerTankId: number;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  elapsed: number;
  duration: number;
  isEnemy: boolean;
}
export const bullets: Bullet[] = [];
let bulletIdCounter = 0;
export interface Explosion { mesh: THREE.Mesh; life: number; }
export const explosions: Explosion[] = [];

export function fireBullet(
  tank: TankData,
  targetPos: THREE.Vector3,
  isEnemy: boolean,
  scene: THREE.Scene,
) {
  const color = isEnemy ? 0xff0000 : 0xffaa00;
  const bulletMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshBasicMaterial({ color }));
  const startPos = new THREE.Vector3(0, 0, -2.2);
  tank.turretGroup.updateWorldMatrix(true, false);
  tank.turretGroup.localToWorld(startPos);
  bulletMesh.position.copy(startPos);
  scene.add(bulletMesh);
  const flightDistance = Math.hypot(targetPos.x - startPos.x, targetPos.z - startPos.z);
  bullets.push({
    id: bulletIdCounter++,
    mesh: bulletMesh,
    ownerTankId: tank.id,
    startPos,
    targetPos: targetPos.clone(),
    elapsed: 0,
    duration: THREE.MathUtils.clamp(flightDistance / tank.type.projectileSpeed, 0.3, 2.8),
    isEnemy,
  });
}

export function createExplosion(position: THREE.Vector3, scene: THREE.Scene) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xff5500, transparent: true, opacity: 1 });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat);
  mesh.position.copy(position);
  scene.add(mesh);
  explosions.push({ mesh, life: 0.8 });
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

export function updateTank(
  tank: TankData,
  allTanks: TankData[],
  delta: number,
  ground: THREE.Mesh,
  movementDirection?: THREE.Vector3,
  movementMultiplier = 1,
  directMovement = false,
) {
  const distance = tank.group.position.distanceTo(tank.targetPos);
  
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

  if (nearestEnemy) {
    const turretAngle = getAngle(tank.group.position, nearestEnemy.group.position) - tank.group.rotation.y;
    tank.turretGroup.rotation.y = lerpAngle(
      tank.turretGroup.rotation.y,
      turretAngle,
      tank.type.turretRotationSpeed * delta,
    );
  } else {
    tank.turretGroup.rotation.y = lerpAngle(tank.turretGroup.rotation.y, 0, 4 * delta);
  }

  if (movementDirection !== undefined) {
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
    tank.group.rotation.y = lerpAngle(
      tank.group.rotation.y,
      targetAngle,
      tank.type.rotationSpeed * 0.5 * delta,
    );

    let angleDiff = targetAngle - tank.group.rotation.y;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    if (Math.abs(angleDiff) < 0.8) {
      const direction = new THREE.Vector3().subVectors(tank.targetPos, tank.group.position).setY(0).normalize();
      const frontPos = tank.group.position.clone().add(direction.clone().multiplyScalar(2));
      const slope = getGroundHeight(frontPos.x, frontPos.z, ground) - tank.group.position.y;

      let speed = tank.type.aiSpeed;
      if (slope > 0.2) speed = 2;
      else if (slope < -0.2) speed = 7;
      if (distance < 4) speed *= 0.5;

      moveTank(tank.group.position, direction, speed * delta, tank.type.collisionRadius);
    }
  } else if (distance > 0.1) {
    tank.targetPos.copy(tank.group.position);
  }

  tank.group.position.x = THREE.MathUtils.clamp(tank.group.position.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.group.position.z = THREE.MathUtils.clamp(tank.group.position.z, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.x = THREE.MathUtils.clamp(tank.targetPos.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.z = THREE.MathUtils.clamp(tank.targetPos.z, -TANK_BOUNDARY, TANK_BOUNDARY);

  const currentGroundY = getGroundHeight(tank.group.position.x, tank.group.position.z, ground);
  tank.group.position.y = THREE.MathUtils.lerp(tank.group.position.y, currentGroundY, 10 * delta);

  const forward = new THREE.Vector3(0, 0, -2).applyEuler(tank.group.rotation);
  const right = new THREE.Vector3(2, 0, 0).applyEuler(tank.group.rotation);
  const hForward = getGroundHeight(tank.group.position.x + forward.x, tank.group.position.z + forward.z, ground);
  const hRight = getGroundHeight(tank.group.position.x + right.x, tank.group.position.z + right.z, ground);

  const pitch = Math.atan2(hForward - currentGroundY, 2); 
  const roll = Math.atan2(hRight - currentGroundY, 2);
  tank.group.rotation.x = THREE.MathUtils.lerp(tank.group.rotation.x, -pitch, 10 * delta);
  tank.group.rotation.z = THREE.MathUtils.lerp(tank.group.rotation.z, roll, 10 * delta);
}