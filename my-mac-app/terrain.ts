import * as THREE from 'three';

export const MAP_SIZE = 120;
export const MAP_HALF_SIZE = MAP_SIZE / 2;
export const TANK_BOUNDARY = MAP_HALF_SIZE - 3;

export type TerrainObstacle = {
  x: number;
  z: number;
  type: 'tree' | 'house';
  group: THREE.Group;
  groundY: number;
  health: number;
  maxHealth: number;
  destroyed: boolean;
};

export const terrainObstacles: TerrainObstacle[] = [];
const TANK_COLLISION_RADIUS = 1.35;
let terrainRandomState = 0x51f15e;
const TANK_SPAWN_ZONES = [
  { x: 0, z: 42 },
  { x: 0, z: -42 },
];

function isNearTankSpawn(x: number, z: number) {
  return TANK_SPAWN_ZONES.some(spawn => Math.hypot(x - spawn.x, z - spawn.z) < 8);
}

function terrainRandom() {
  terrainRandomState = (terrainRandomState * 1664525 + 1013904223) >>> 0;
  return terrainRandomState / 0x100000000;
}

export function buildTerrain(scene: THREE.Scene) {
  terrainRandomState = 0x51f15e;
  const groundGeo = new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE, 80, 80);
  groundGeo.rotateX(-Math.PI / 2);

  const positionAttribute = groundGeo.attributes.position;
  const vertex = new THREE.Vector3();
  for (let i = 0; i < positionAttribute.count; i++) {
    vertex.fromBufferAttribute(positionAttribute, i);
    const height = Math.sin(vertex.x * 0.08) * Math.cos(vertex.z * 0.08) * 0.35
                 + Math.sin(vertex.x * 0.22) * Math.cos(vertex.z * 0.22) * 0.1;
    positionAttribute.setY(i, height);
  }
  groundGeo.computeVertexNormals(); 

  const groundMat = new THREE.MeshStandardMaterial({ color: 0x3b7a40, roughness: 0.9, flatShading: true });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const edge = MAP_HALF_SIZE - 1;
  const boundary = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-edge, 0.65, -edge),
      new THREE.Vector3(edge, 0.65, -edge),
      new THREE.Vector3(edge, 0.65, edge),
      new THREE.Vector3(-edge, 0.65, edge),
    ]),
    new THREE.LineBasicMaterial({ color: 0xffd45c }),
  );
  scene.add(boundary);

  for(let i=0; i<40; i++) {
    const x = (terrainRandom() - 0.5) * (MAP_SIZE - 16);
    const z = (terrainRandom() - 0.5) * (MAP_SIZE - 16);
    if (
      Math.sqrt(x*x + z*z) > 15 &&
      Math.hypot(x, z + 32) > 5 &&
      !isNearTankSpawn(x, z)
    ) createTree(x, z, scene, ground);
  }
  for(let i=0; i<10; i++) {
    const x = (terrainRandom() - 0.5) * (MAP_SIZE - 20);
    const z = (terrainRandom() - 0.5) * (MAP_SIZE - 20);
    if (
      Math.sqrt(x*x + z*z) > 20 &&
      Math.hypot(x, z + 32) > 7 &&
      !isNearTankSpawn(x, z)
    ) createHouse(x, z, scene, ground);
  }

  return ground; 
}

export function getGroundHeight(x: number, z: number, ground: THREE.Mesh): number {
  const localX = (x - ground.position.x) / ground.scale.x;
  const localZ = (z - ground.position.z) / ground.scale.z;
  const height = Math.sin(localX * 0.08) * Math.cos(localZ * 0.08) * 0.35
    + Math.sin(localX * 0.22) * Math.cos(localZ * 0.22) * 0.1;
  return ground.position.y + height * ground.scale.y;
}

export function getGroundNormal(
  x: number,
  z: number,
  ground: THREE.Mesh,
  target = new THREE.Vector3(),
) {
  const localX = (x - ground.position.x) / ground.scale.x;
  const localZ = (z - ground.position.z) / ground.scale.z;
  const dx = 0.028 * Math.cos(localX * 0.08) * Math.cos(localZ * 0.08)
    + 0.022 * Math.cos(localX * 0.22) * Math.cos(localZ * 0.22);
  const dz = -0.028 * Math.sin(localX * 0.08) * Math.sin(localZ * 0.08)
    - 0.022 * Math.sin(localX * 0.22) * Math.sin(localZ * 0.22);
  return target.set(-dx / ground.scale.x, 1 / ground.scale.y, -dz / ground.scale.z).normalize();
}

export function moveTank(
  position: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
  collisionRadius = TANK_COLLISION_RADIUS,
  allowSlide = true,
) {
  const stepCount = Math.max(1, Math.ceil(Math.abs(distance) / 0.25));
  const stepDistance = distance / stepCount;

  for (let i = 0; i < stepCount; i++) {
    const nextX = THREE.MathUtils.clamp(
      position.x + direction.x * stepDistance,
      -TANK_BOUNDARY,
      TANK_BOUNDARY,
    );
    const nextZ = THREE.MathUtils.clamp(
      position.z + direction.z * stepDistance,
      -TANK_BOUNDARY,
      TANK_BOUNDARY,
    );

    if (!isTankPositionBlocked(nextX, nextZ, collisionRadius)) {
      position.x = nextX;
      position.z = nextZ;
    } else if (allowSlide) {
      if (!isTankPositionBlocked(nextX, position.z, collisionRadius)) position.x = nextX;
      if (!isTankPositionBlocked(position.x, nextZ, collisionRadius)) position.z = nextZ;
    }
  }
}

export function findObstacleHit(
  from: THREE.Vector3,
  to: THREE.Vector3,
  ignoredObstacle?: TerrainObstacle,
) {
  const deltaX = to.x - from.x;
  const deltaY = to.y - from.y;
  const deltaZ = to.z - from.z;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  const steps = Math.max(1, Math.ceil(distance / 0.2));
  for (let step = 1; step <= steps; step++) {
    const progress = step / steps;
    const x = from.x + deltaX * progress;
    const y = from.y + deltaY * progress;
    const z = from.z + deltaZ * progress;
    for (const obstacle of terrainObstacles) {
      if (obstacle.destroyed || obstacle === ignoredObstacle) continue;
      if (isProjectileInsideObstacleAt(x, y, z, obstacle)) {
        return { obstacle, point: new THREE.Vector3(x, y, z) };
      }
    }
  }
  return null;
}

export function damageObstacle(obstacle: TerrainObstacle, amount: number) {
  if (obstacle.destroyed) return;
  obstacle.health = Math.max(0, obstacle.health - amount);
  if (obstacle.health > 0) return;

  obstacle.destroyed = true;
  obstacle.group.parent?.remove(obstacle.group);
  obstacle.group.traverse(object => {
    if (object instanceof THREE.Mesh) {
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach(material => material.dispose());
    }
  });
}

function isProjectileInsideObstacleAt(
  x: number,
  y: number,
  z: number,
  obstacle: TerrainObstacle,
) {
  const relativeHeight = y - obstacle.groundY;
  if (obstacle.type === 'tree') {
    if (relativeHeight < 0 || relativeHeight > 5) return false;
    return Math.hypot(x - obstacle.x, z - obstacle.z) <= 1.45;
  }

  const relativeX = x - obstacle.x;
  const relativeZ = z - obstacle.z;
  if (relativeHeight >= 3.8 && relativeHeight <= 6.9) {
    return Math.hypot(relativeX, relativeZ) <= 3.25;
  }
  if (relativeHeight < 0 || relativeHeight > 3.9) return false;

  const onXWall = Math.abs(Math.abs(relativeX) - 2.6) <= 0.2 &&
    Math.abs(relativeZ) <= 2.6;
  const onZWall = Math.abs(Math.abs(relativeZ) - 2.6) <= 0.2 &&
    Math.abs(relativeX) <= 2.6;
  if (!onXWall && !onZWall) return false;

  const withinWindowHeight = relativeHeight >= 1.7 && relativeHeight <= 3;
  const withinXWindow = onZWall && Math.abs(relativeX) <= 0.72;
  const withinZWindow = onXWall && Math.abs(relativeZ) <= 0.72;
  if (withinWindowHeight && (withinXWindow || withinZWindow)) return false;

  return true;
}

function isTankPositionBlocked(x: number, z: number, collisionRadius: number) {
  return terrainObstacles.some(obstacle => {
    if (obstacle.destroyed) return false;
    if (obstacle.type === 'tree') {
      return Math.hypot(x - obstacle.x, z - obstacle.z) < collisionRadius + 0.65;
    }

    const distanceX = Math.max(Math.abs(x - obstacle.x) - 2.6, 0);
    const distanceZ = Math.max(Math.abs(z - obstacle.z) - 2.6, 0);
    return distanceX * distanceX + distanceZ * distanceZ < collisionRadius * collisionRadius;
  });
}

function createTree(x: number, z: number, scene: THREE.Scene, ground: THREE.Mesh) {
  const treeGroup = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.5, 2, 8), new THREE.MeshStandardMaterial({ color: 0x5c4033 }));
  trunk.position.y = 1; trunk.castShadow = true; treeGroup.add(trunk);
  const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.8, 4, 8), new THREE.MeshStandardMaterial({ color: 0x2e8b57, flatShading: true }));
  leaf.position.y = 3; leaf.castShadow = true; treeGroup.add(leaf);
  treeGroup.position.set(x, getGroundHeight(x, z, ground), z);
  scene.add(treeGroup);
  const health = 3 + Math.floor(terrainRandom() * 3);
  terrainObstacles.push({
    x, z, type: 'tree', group: treeGroup, groundY: treeGroup.position.y,
    health, maxHealth: health, destroyed: false,
  });
}

function createHouse(x: number, z: number, scene: THREE.Scene, ground: THREE.Mesh) {
  const houseGroup = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 4), new THREE.MeshStandardMaterial({ color: 0xdeb887 }));
  base.position.y = 1.5; base.castShadow = true; base.receiveShadow = true; houseGroup.add(base);
  const windowMaterial = new THREE.MeshStandardMaterial({
    color: 0x315f73,
    emissive: 0x122a36,
    metalness: 0.25,
    roughness: 0.35,
  });
  const frontWindow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.9, 0.05), windowMaterial);
  frontWindow.position.set(0, 1.8, 2.02);
  frontWindow.castShadow = true;
  houseGroup.add(frontWindow);
  const backWindow = frontWindow.clone();
  backWindow.position.z = -2.02;
  houseGroup.add(backWindow);
  const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.9, 1.1), windowMaterial);
  sideWindow.position.set(2.02, 1.8, 0);
  sideWindow.castShadow = true;
  houseGroup.add(sideWindow);
  const oppositeWindow = sideWindow.clone();
  oppositeWindow.position.x = -2.02;
  houseGroup.add(oppositeWindow);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x8b0000, flatShading: true }));
  roof.position.y = 4; roof.rotation.y = Math.PI / 4; roof.castShadow = true; houseGroup.add(roof);
  houseGroup.position.set(x, getGroundHeight(x, z, ground), z);
  houseGroup.scale.setScalar(1.3);
  scene.add(houseGroup);
  terrainObstacles.push({
    x, z, type: 'house', group: houseGroup, groundY: houseGroup.position.y,
    health: 20, maxHealth: 20, destroyed: false,
  });
}