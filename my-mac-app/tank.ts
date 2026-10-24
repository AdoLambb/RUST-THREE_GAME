import * as THREE from 'three';
import { getGroundHeight, TANK_BOUNDARY } from './terrain';

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
  rotors: THREE.Group[];
  isSelected: boolean;
  targetPos: THREE.Vector3;
  fireCooldown: number;
  machineGunCooldown: number;
  flightPhase: number;
  isEnemy: boolean;
  hp: number;
}

export const playerTanks: TankData[] = [];
export const enemyTanks: TankData[] = [];
let tankIdCounter = 0;

function buildTankMesh(bodyColor: number, emissiveColor: number, modelScale: number) {
  const group = new THREE.Group();
  const armor = new THREE.MeshStandardMaterial({
    color: 0x10111a,
    emissive: emissiveColor,
    metalness: 0.72,
    roughness: 0.28,
  });
  const laserBlue = new THREE.MeshBasicMaterial({ color: bodyColor, toneMapped: false });
  const laserPurple = new THREE.MeshBasicMaterial({ color: 0x9b53ff, toneMapped: false });
  const canopyMaterial = new THREE.MeshStandardMaterial({
    color: 0x102532,
    emissive: bodyColor,
    emissiveIntensity: 0.65,
    metalness: 0.45,
    roughness: 0.2,
  });
  const addMesh = (
    parent: THREE.Object3D,
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    position: THREE.Vector3,
  ) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };

  const hull = addMesh(
    group,
    new THREE.CapsuleGeometry(0.58, 2.1, 4, 8),
    armor,
    new THREE.Vector3(0, 0, 0),
  );
  hull.rotation.x = Math.PI / 2;
  const crossArm = addMesh(
    group,
    new THREE.BoxGeometry(4.1, 0.2, 0.62),
    armor,
    new THREE.Vector3(0, -0.06, 0),
  );
  crossArm.rotation.y = -0.08;
  addMesh(
    group,
    new THREE.BoxGeometry(3.8, 0.05, 0.08),
    laserBlue,
    new THREE.Vector3(0, -0.13, 0.35),
  );
  addMesh(
    group,
    new THREE.BoxGeometry(3.5, 0.05, 0.06),
    laserPurple,
    new THREE.Vector3(0, -0.16, -0.3),
  );
  addMesh(
    group,
    new THREE.SphereGeometry(0.45, 12, 10),
    canopyMaterial,
    new THREE.Vector3(0, 0.45, -0.1),
  ).scale.set(0.82, 0.64, 1.2);

  for (const side of [-1, 1]) {
    const arm = addMesh(
      group,
      new THREE.BoxGeometry(0.11, 0.14, 2.3),
      armor,
      new THREE.Vector3(side * 1.45, -0.02, 0.02),
    );
    arm.rotation.y = side * -0.12;
    addMesh(
      group,
      new THREE.BoxGeometry(0.07, 0.055, 1.85),
      side === -1 ? laserBlue : laserPurple,
      new THREE.Vector3(side * 1.45, -0.12, 0.05),
    ).rotation.y = side * -0.12;
  }

  const turretGroup = new THREE.Group();
  turretGroup.position.set(0, 0.62, 0);
  group.add(turretGroup);
  addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.36, 0.44, 0.18, 8),
    armor,
    new THREE.Vector3(0, 0, 0),
  );
  const barrel = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.1, 0.14, 1.35, 8),
    laserBlue,
    new THREE.Vector3(0, 0.13, -0.82),
  );
  barrel.rotation.x = -Math.PI / 2;
  addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.19, 0.24, 0.25, 8),
    armor,
    new THREE.Vector3(0, 0.13, -0.2),
  ).rotation.x = -Math.PI / 2;

  const gun = addMesh(
    turretGroup,
    new THREE.CylinderGeometry(0.035, 0.045, 0.9, 6),
    armor,
    new THREE.Vector3(0.32, 0.17, -0.65),
  );
  gun.rotation.x = -Math.PI / 2;

  const rotors: THREE.Group[] = [];
  for (const x of [-1, 1]) {
    for (const z of [-0.9, 0.9]) {
      const rotor = new THREE.Group();
      rotor.position.set(x * 1.35, -0.42, z);
      group.add(rotor);
      addMesh(
        group,
        new THREE.CylinderGeometry(0.07, 0.1, 0.38, 8),
        armor,
        new THREE.Vector3(x * 1.35, -0.38, z),
      );
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.48, 0.018, 5, 20),
        laserPurple,
      );
      ring.rotation.x = Math.PI / 2;
      ring.position.y = -0.11;
      rotor.add(ring);
      for (let bladeIndex = 0; bladeIndex < 4; bladeIndex++) {
        const blade = new THREE.Mesh(
          new THREE.BoxGeometry(0.1, 0.035, 0.8),
          bladeIndex % 2 === 0 ? armor : laserBlue,
        );
        blade.position.y = -0.23;
        blade.rotation.y = bladeIndex * Math.PI / 2;
        blade.castShadow = true;
        rotor.add(blade);
      }
      rotors.push(rotor);
    }
  }
  group.scale.setScalar(modelScale);
  return { group, turretGroup, barrel, rotors };
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
  const color = isEnemy ? 0xff52dc : 0x46dfff;
  const emissive = isEnemy ? 0x350a2c : 0x07333d;
  const { group, turretGroup, barrel, rotors } = buildTankMesh(color, emissive, type.modelScale);
  
  group.position.set(x, getGroundHeight(x, z, ground) + 7, z);
  if (isEnemy) turretGroup.rotation.y = Math.random() * Math.PI;
  scene.add(group);
  
  const data: TankData = {
    id: tankIdCounter++,
    type,
    group,
    turretGroup,
    barrel,
    rotors,
    isSelected: false,
    targetPos: group.position.clone(),
    fireCooldown: isEnemy ? 1.2 : 0,
    machineGunCooldown: Math.random() * 0.18,
    flightPhase: Math.random() * Math.PI * 2,
    isEnemy,
    hp: type.maxHp,
  };
  if (isEnemy) enemyTanks.push(data); else playerTanks.push(data);
}

export interface Bullet {
  id: number;
  mesh: THREE.Group;
  ownerTankId: number;
  startPos: THREE.Vector3;
  targetPos: THREE.Vector3;
  damage: number;
  isLaser: boolean;
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
  isLaser = true,
  damage = 1,
) {
  const color = isEnemy ? 0xff52dc : 0x46dfff;
  const bulletMesh = new THREE.Group();
  const startPos = new THREE.Vector3(0.08, 0.15, isLaser ? -1.58 : -1.16);
  tank.turretGroup.updateWorldMatrix(true, false);
  tank.turretGroup.localToWorld(startPos);
  bulletMesh.position.copy(startPos);
  const direction = targetPos.clone().sub(startPos).normalize();
  bulletMesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), direction);
  if (isLaser) {
    const trail = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.17, 4.2, 8, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.48,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    trail.rotation.x = -Math.PI / 2;
    trail.position.z = 2.1;
    bulletMesh.add(trail);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.075, 3.9, 6, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xc5fcff,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      }),
    );
    beam.rotation.x = -Math.PI / 2;
    beam.position.z = 1.95;
    bulletMesh.add(beam);
    const bolt = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2, 1),
      new THREE.MeshBasicMaterial({ color: 0xf4ffff, toneMapped: false }),
    );
    bolt.scale.set(0.85, 0.85, 1.9);
    bulletMesh.add(bolt);
  } else {
    const tracer = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 6, 5),
      new THREE.MeshBasicMaterial({
        color: isEnemy ? 0xff92cb : 0x96faff,
        toneMapped: false,
      }),
    );
    tracer.scale.z = 1.8;
    bulletMesh.add(tracer);
  }
  scene.add(bulletMesh);
  const flightDistance = Math.hypot(targetPos.x - startPos.x, targetPos.z - startPos.z);
  bullets.push({
    id: bulletIdCounter++,
    mesh: bulletMesh,
    ownerTankId: tank.id,
    startPos,
    targetPos: targetPos.clone(),
    damage,
    isLaser,
    elapsed: 0,
    duration: THREE.MathUtils.clamp(flightDistance / (isLaser ? 150 : 90), 0.08, 0.75),
    isEnemy,
  });
}

export function createExplosion(position: THREE.Vector3, scene: THREE.Scene) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0x6deaff,
    transparent: true,
    opacity: 1,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 1), mat);
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

export interface FlightControls {
  throttle: number;
  turn: number;
  strafe: number;
  boost: number;
}

export function updateTank(
  tank: TankData,
  allTanks: TankData[],
  delta: number,
  ground: THREE.Mesh,
  movementDirection?: THREE.Vector3,
  movementMultiplier = 1,
  directMovement = false,
  flightControls?: FlightControls,
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
    if (tank.isEnemy) {
      tank.turretGroup.rotation.y = lerpAngle(
        tank.turretGroup.rotation.y,
        turretAngle,
        tank.type.turretRotationSpeed * delta,
      );
    }
  } else if (tank.isEnemy) {
    tank.turretGroup.rotation.y = lerpAngle(tank.turretGroup.rotation.y, 0, 4 * delta);
  }

  if (flightControls) {
    tank.group.rotation.y += flightControls.turn * tank.type.rotationSpeed * delta;
    const yaw = tank.group.rotation.y;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const speed = tank.type.playerSpeed * flightControls.boost;
    tank.group.position.x += (
      forwardX * flightControls.throttle + rightX * flightControls.strafe
    ) * speed * delta;
    tank.group.position.z += (
      forwardZ * flightControls.throttle + rightZ * flightControls.strafe
    ) * speed * delta;
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
        tank.group.position.addScaledVector(
          movementDirection,
          tank.type.playerSpeed * movementMultiplier * delta,
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
      let speed = tank.type.aiSpeed;
      if (distance < 4) speed *= 0.5;
      tank.group.position.addScaledVector(direction, speed * delta);
    }
  } else if (distance > 0.1) {
    tank.targetPos.copy(tank.group.position);
  }

  tank.group.position.x = THREE.MathUtils.clamp(tank.group.position.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.group.position.z = THREE.MathUtils.clamp(tank.group.position.z, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.x = THREE.MathUtils.clamp(tank.targetPos.x, -TANK_BOUNDARY, TANK_BOUNDARY);
  tank.targetPos.z = THREE.MathUtils.clamp(tank.targetPos.z, -TANK_BOUNDARY, TANK_BOUNDARY);

  const currentGroundY = getGroundHeight(tank.group.position.x, tank.group.position.z, ground);
  tank.flightPhase += delta;
  tank.group.position.y = currentGroundY + 7 + Math.sin(tank.flightPhase * 2.2) * 0.16;
  tank.group.rotation.x = Math.sin(tank.flightPhase * 1.1) * 0.025;
  tank.group.rotation.z = Math.sin(tank.flightPhase * 1.7) * 0.035;
  for (let index = 0; index < tank.rotors.length; index++) {
    tank.rotors[index].rotation.y += delta * (index % 2 === 0 ? 38 : -38);
  }
}