import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK_SIZE, BlockType } from './BlockTypes';

export type LegoShape =
  | 'CUBE'
  | 'PLATE'
  | 'PLATE_25'
  | 'PLATE_12'
  | 'SLOPE_45'
  | 'SLOPE_30'
  | 'CORNER_WEDGE'
  | 'BEAM'
  | 'TURRET_RING'
  | 'FLAK_44'
  | 'FLAK_41';

export interface LegoShapeDef {
  shape: LegoShape;
  label: string;
  category: 'STRUCTURE' | 'ARMOR' | 'MECHANISM' | 'WEAPON' | 'DRIVE' | 'CORE';
  defaultType: BlockType;
  mass: number; // kg
  description: string;
}

export const LEGO_SHAPE_DEFS: Record<LegoShape, LegoShapeDef> = {
  CUBE: {
    shape: 'CUBE',
    label: 'Cube 50cm',
    category: 'STRUCTURE',
    defaultType: 'CHASSIS',
    mass: 981, // 0.125 m³ x 7,850 kg/m³ = 981.25 kg
    description: 'บล็อกลูกบาศก์เหล็กเกราะมาตรฐาน 50x50x50 cm (เหล็ก RHA 7,850 kg/m³)',
  },
  PLATE_25: {
    shape: 'PLATE_25',
    label: 'Plate ½ (25cm)',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 491, // 0.0625 m³ x 7,850 kg/m³ = 490.63 kg (แผ่นหนา 250 mm RHA)
    description: 'แผ่นเกราะ 50x50 cm หนา 25 cm (250 mm RHA 491 kg) สเปกเกราะซูเปอร์เฮฟวี่',
  },
  PLATE_12: {
    shape: 'PLATE_12',
    label: 'Plate ¼ (12.5cm)',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 245, // 0.03125 m³ x 7,850 kg/m³ = 245.31 kg (แผ่นหนา 125 mm RHA)
    description: 'แผ่นเกราะ 50x50 cm หนา 12.5 cm (125 mm RHA 245 kg) สเปกเกราะหน้ารถถังหนัก',
  },
  PLATE: {
    shape: 'PLATE',
    label: 'Plate 8cm',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 157, // 0.020 m³ x 7,850 kg/m³ = 157 kg (แผ่นหนา 80 mm RHA)
    description: 'แผ่นเกราะ 50x50 cm หนา 8 cm (80 mm RHA 157 kg) สเปกเกราะรถถังกลางและแผ่นท้อง',
  },
  SLOPE_45: {
    shape: 'SLOPE_45',
    label: 'Slope 45°',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 491, // 0.0625 m³ x 7,850 kg/m³ = 490.63 kg
    description: 'ลิ่มเกราะลาดเอียง 45 องศา เหล็กเกราะ RHA น้ำหนักตามปริมาตร 491 kg',
  },
  SLOPE_30: {
    shape: 'SLOPE_30',
    label: 'Slope 30°',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 285, // 0.03625 m³ x 7,850 kg/m³ = 284.56 kg
    description: 'เกราะลาดเอียง 30 องศา สเปก Tiger II / Panther Glacis plate (285 kg)',
  },
  CORNER_WEDGE: {
    shape: 'CORNER_WEDGE',
    label: 'Corner Wedge',
    category: 'ARMOR',
    defaultType: 'CHASSIS',
    mass: 165, // 0.021 m³ x 7,850 kg/m³ = 164.85 kg
    description: 'ลิ่มมุมพีระมิดเหล็กกล้าเกราะ สำหรับมุมป้อมและไหล่ตัวถัง (165 kg)',
  },
  BEAM: {
    shape: 'BEAM',
    label: 'Chassis Beam',
    category: 'STRUCTURE',
    defaultType: 'CHASSIS',
    mass: 245, // 0.03125 m³ x 7,850 kg/m³ = 245.31 kg
    description: 'คานเหล็กกล้าโครงสร้างแชสซี 25x25x50 cm เสริมความแข็งแกร่ง (245 kg)',
  },
  TURRET_RING: {
    shape: 'TURRET_RING',
    label: 'Turret Ring',
    category: 'MECHANISM',
    defaultType: 'TURRET',
    mass: 650, // 650 kg heavy forged steel ball-bearing race ring
    description: 'วงแหวนรางหมุนป้อมปืนเหล็กหล่อฟอร์จหนาพิเศษ (650 kg)',
  },
  FLAK_44: {
    shape: 'FLAK_44',
    label: '3.7cm Flakzwilling 44',
    category: 'WEAPON',
    defaultType: 'WEAPON',
    mass: 950, // 950 kg complete twin AA autocannon mount + gun shield
    description: 'ปืนใหญ่ต่อสู้อากาศยานลำกล้องคู่ 3.7cm Flak 44 พร้อมเกราะกำบัง (950 kg)',
  },
  FLAK_41: {
    shape: 'FLAK_41',
    label: '8.8cm Flak 41 (L/74)',
    category: 'WEAPON',
    defaultType: 'WEAPON',
    mass: 2600, // 2,600 kg (8.8 cm FlaK 41 L/74 heavy gun)
    description: 'ปืนใหญ่ต่อสู้อากาศยานและต่อสู้รถถังหนัก 8.8cm Flak 41 ลำกล้องยาว L/74 ขนาด 6.51 เมตร อำนาจทำลายล้างมหาศาล (2,600 kg)',
  },
};

// Geometry Caches
const geoCache = new Map<LegoShape, THREE.BufferGeometry>();

/**
 * Creates a triangular prism (wedge) sloping down in Z from back-top to front-bottom.
 */
function createPrismGeometry(width = 0.5, height = 0.5, depth = 0.5): THREE.BufferGeometry {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const hd = depth * 0.5;

  const positions = [
    // Bottom quad (y = -hh):
    -hw, -hh, -hd,   hw, -hh, -hd,   hw, -hh,  hd,
    -hw, -hh, -hd,   hw, -hh,  hd,  -hw, -hh,  hd,

    // Back vertical quad (z = -hd):
    -hw, -hh, -hd,  -hw,  hh, -hd,   hw,  hh, -hd,
    -hw, -hh, -hd,   hw,  hh, -hd,   hw, -hh, -hd,

    // Sloped quad (from z = -hd, y = +hh down to z = +hd, y = -hh):
    -hw,  hh, -hd,  -hw, -hh,  hd,   hw, -hh,  hd,
    -hw,  hh, -hd,   hw, -hh,  hd,   hw,  hh, -hd,

    // Left triangle face (x = -hw):
    -hw, -hh, -hd,  -hw, -hh,  hd,  -hw,  hh, -hd,

    // Right triangle face (x = +hw):
     hw, -hh, -hd,   hw,  hh, -hd,   hw, -hh,  hd,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

/**
 * Creates a corner wedge sloping down towards both +X and +Z.
 */
function createCornerWedgeGeometry(s = 0.5): THREE.BufferGeometry {
  const hs = s * 0.5;

  // Vertices:
  // V0: (-hs, -hs, -hs) back-left-bottom
  // V1: (+hs, -hs, -hs) back-right-bottom
  // V2: (-hs, -hs, +hs) front-left-bottom
  // V3: (-hs, +hs, -hs) peak at back-left-top
  const positions = [
    // Bottom triangle (y = -hs): V0, V1, V2
    -hs, -hs, -hs,   hs, -hs, -hs,  -hs, -hs,  hs,

    // Back vertical triangle (z = -hs): V0, V3, V1
    -hs, -hs, -hs,  -hs,  hs, -hs,   hs, -hs, -hs,

    // Left vertical triangle (x = -hs): V0, V2, V3
    -hs, -hs, -hs,  -hs, -hs,  hs,  -hs,  hs, -hs,

    // Sloped compound face: V3, V2, V1
    -hs,  hs, -hs,  -hs, -hs,  hs,   hs, -hs, -hs,
  ];

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.computeVertexNormals();
  return geom;
}

export function getLegoShapeGeometry(shape: LegoShape, s = BLOCK_SIZE): THREE.BufferGeometry {
  const cached = geoCache.get(shape);
  if (cached) return cached;

  let geom: THREE.BufferGeometry;

  switch (shape) {
    case 'CUBE':
      geom = new THREE.BoxGeometry(s, s, s);
      break;

    case 'PLATE_25': {
      // Full 50x50 cm slab, 1/2 block thickness (25 cm) resting flush on bottom face
      const plateH = s * 0.5; // 0.25m = 25 cm
      geom = new THREE.BoxGeometry(s, plateH, s);
      geom.translate(0, -s * 0.5 + plateH * 0.5, 0);
      break;
    }

    case 'PLATE_12': {
      // Full 50x50 cm slab, 1/4 block thickness (12.5 cm) resting flush on bottom face
      const plateH = s * 0.25; // 0.125m = 12.5 cm
      geom = new THREE.BoxGeometry(s, plateH, s);
      geom.translate(0, -s * 0.5 + plateH * 0.5, 0);
      break;
    }

    case 'PLATE': {
      // Full 50x50 cm thin plate (8 cm) resting flush on bottom face
      const plateH = 0.08;
      geom = new THREE.BoxGeometry(s, plateH, s);
      geom.translate(0, -s * 0.5 + plateH * 0.5, 0);
      break;
    }

    case 'SLOPE_45':
      geom = createPrismGeometry(s, s, s);
      break;

    case 'SLOPE_30':
      // 30-degree shallow slope: height = s * tan(30 deg) = s * 0.577 ~ 0.288m
      geom = createPrismGeometry(s, s * 0.58, s);
      geom.translate(0, -s * 0.5 + (s * 0.58) * 0.5, 0);
      break;

    case 'CORNER_WEDGE':
      geom = createCornerWedgeGeometry(s);
      break;

    case 'BEAM':
      geom = new THREE.BoxGeometry(s * 0.5, s * 0.5, s);
      break;

    case 'TURRET_RING': {
      // Circular traversing race ring with center socket
      const ringOuter = new THREE.CylinderGeometry(s * 0.48, s * 0.48, 0.08, 32);
      const ringInner = new THREE.CylinderGeometry(s * 0.32, s * 0.32, 0.09, 24);
      ringInner.translate(0, 0.005, 0);

      const basePlate = new THREE.BoxGeometry(s, 0.04, s);
      basePlate.translate(0, -0.04, 0);

      geom = BufferGeometryUtils.mergeGeometries([ringOuter, basePlate]);
      break;
    }

    case 'FLAK_44': {
      // Simplified representation for geometry cache (full Flak 44 is an animated Group)
      const mount = new THREE.CylinderGeometry(0.22, 0.24, 0.12, 16);
      const shield = new THREE.BoxGeometry(0.44, 0.35, 0.04);
      shield.translate(0, 0.25, 0.12);
      shield.rotateX(0.2);

      const b1 = new THREE.CylinderGeometry(0.022, 0.024, 0.75, 8);
      b1.rotateX(Math.PI / 2);
      b1.translate(-0.065, 0.25, 0.42);

      const b2 = new THREE.CylinderGeometry(0.022, 0.024, 0.75, 8);
      b2.rotateX(Math.PI / 2);
      b2.translate(0.065, 0.25, 0.42);

      geom = BufferGeometryUtils.mergeGeometries([mount, shield, b1, b2]);
      break;
    }

    case 'FLAK_41': {
      // Authentic representation for geometry cache (heavy 8.8cm Flak 41 L/74, 6.512m barrel)
      const mount = new THREE.CylinderGeometry(0.44, 0.46, 0.16, 20);
      mount.translate(0, -0.15, 0);

      const shield = new THREE.BoxGeometry(1.22, 0.82, 0.04);
      shield.translate(0, 0.35, 0.25);
      shield.rotateX(0.20);

      const cheekL = new THREE.BoxGeometry(0.38, 0.76, 0.035);
      cheekL.rotateY(0.42);
      cheekL.translate(-0.68, 0.35, 0.12);

      const cheekR = new THREE.BoxGeometry(0.38, 0.76, 0.035);
      cheekR.rotateY(-0.42);
      cheekR.translate(0.68, 0.35, 0.12);

      const breech = new THREE.BoxGeometry(0.36, 0.38, 0.85);
      breech.translate(0, 0.38, -0.42);

      // 6.512m barrel tube (88mm * 74 = 6.512m)
      const barrel = new THREE.CylinderGeometry(0.065, 0.088, 6.512, 16);
      barrel.rotateX(Math.PI / 2);
      barrel.translate(0, 0.38, 3.256);

      const sleeve = new THREE.CylinderGeometry(0.105, 0.125, 1.85, 16);
      sleeve.rotateX(Math.PI / 2);
      sleeve.translate(0, 0.38, 0.925);

      const recuperator = new THREE.CylinderGeometry(0.070, 0.070, 2.6, 12);
      recuperator.rotateX(Math.PI / 2);
      recuperator.translate(0, 0.58, 1.30);

      const muzzleBrake = new THREE.CylinderGeometry(0.13, 0.13, 0.65, 14);
      muzzleBrake.rotateX(Math.PI / 2);
      muzzleBrake.translate(0, 0.38, 6.78);

      geom = BufferGeometryUtils.mergeGeometries([
        mount,
        shield,
        cheekL,
        cheekR,
        breech,
        barrel,
        sleeve,
        recuperator,
        muzzleBrake,
      ]);
      break;
    }

    default:
      geom = new THREE.BoxGeometry(s, s, s);
      break;
  }

  geoCache.set(shape, geom);
  return geom;
}

export interface Flak44Rig {
  root: THREE.Group;
  yawPivot: THREE.Group;
  pitchPivot: THREE.Group;
  leftBarrel: THREE.Object3D;
  rightBarrel: THREE.Object3D;
  muzzleFlashL: THREE.PointLight;
  muzzleFlashR: THREE.PointLight;
  flashMeshL: THREE.Mesh;
  flashMeshR: THREE.Mesh;
}

/**
 * Creates an authentic, highly detailed 3.7cm Flakzwilling 44 Anti-Aircraft Autocannon
 * with independent yaw traversal (360°) and pitch elevation (-8° to +85°).
 */
export function createFlak44Mesh(isGhost = false): Flak44Rig {
  const root = new THREE.Group();

  let metalMat: THREE.Material;
  let barrelMat: THREE.Material;
  let bronzeMat: THREE.Material;
  let flashMat: THREE.Material;

  if (isGhost) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.45,
    });
    metalMat = ghostMat;
    barrelMat = ghostMat;
    bronzeMat = ghostMat;
    flashMat = ghostMat;
  } else {
    metalMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      roughness: 0.60,
      metalness: 0.08,
    });
    barrelMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.55,
      metalness: 0.12,
    });
    bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.45,
      metalness: 0.15,
    });
    flashMat = new THREE.MeshBasicMaterial({
      color: 0xffea75,
      transparent: true,
      opacity: 0,
    });
  }

  // 1. Static base ring
  const baseRingGeo = new THREE.CylinderGeometry(0.24, 0.25, 0.06, 24);
  const baseRing = new THREE.Mesh(baseRingGeo, metalMat);
  baseRing.position.y = -0.21;
  root.add(baseRing);

  // 2. Yaw Pivot (Rotates Left/Right 360°)
  const yawPivot = new THREE.Group();
  yawPivot.position.y = -0.18;
  root.add(yawPivot);

  // Turntable platform
  const tableGeo = new THREE.CylinderGeometry(0.22, 0.23, 0.05, 20);
  const table = new THREE.Mesh(tableGeo, metalMat);
  yawPivot.add(table);

  // Twin vertical trunnion stanchions (forks)
  const stanchionL = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.14), metalMat);
  stanchionL.position.set(-0.13, 0.14, 0);
  yawPivot.add(stanchionL);

  const stanchionR = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.26, 0.14), metalMat);
  stanchionR.position.set(0.13, 0.14, 0);
  yawPivot.add(stanchionR);

  // Gunner platform & seat details
  const seatGeo = new THREE.BoxGeometry(0.12, 0.03, 0.12);
  const seat = new THREE.Mesh(seatGeo, metalMat);
  seat.position.set(0, 0.06, -0.18);
  yawPivot.add(seat);

  // 3. Pitch Pivot (Elevates/Depresses Gun Cradle: -8° to +85°)
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(0, 0.22, 0);
  yawPivot.add(pitchPivot);

  // Central gun cradle & trunnion pins
  const pinGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.32, 12);
  pinGeo.rotateZ(Math.PI / 2);
  const pinMesh = new THREE.Mesh(pinGeo, metalMat);
  pitchPivot.add(pinMesh);

  // Angled Front Schutzschild (Armor Gun Shield)
  const shieldMainGeo = new THREE.BoxGeometry(0.42, 0.32, 0.024);
  const shieldMain = new THREE.Mesh(shieldMainGeo, metalMat);
  shieldMain.position.set(0, 0.06, 0.11);
  shieldMain.rotation.x = 0.22; // sloped armor shield
  pitchPivot.add(shieldMain);

  // Twin Receiver Breech Blocks (Housing the 3.7cm Flak 44 mechanisms)
  const breechGeo = new THREE.BoxGeometry(0.065, 0.09, 0.26);
  const breechL = new THREE.Mesh(breechGeo, metalMat);
  breechL.position.set(-0.065, 0.01, 0.02);
  pitchPivot.add(breechL);

  const breechR = new THREE.Mesh(breechGeo, metalMat);
  breechR.position.set(0.065, 0.01, 0.02);
  pitchPivot.add(breechR);

  // Ammo feed clip guides
  const clipL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.06), bronzeMat);
  clipL.position.set(-0.11, 0.02, 0.02);
  pitchPivot.add(clipL);

  const clipR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.06), bronzeMat);
  clipR.position.set(0.11, 0.02, 0.02);
  pitchPivot.add(clipR);

  // Optical Gunsight & Range Ring
  const sightGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.18, 8);
  sightGeo.rotateX(Math.PI / 2);
  const sight = new THREE.Mesh(sightGeo, metalMat);
  sight.position.set(-0.065, 0.12, 0.08);
  pitchPivot.add(sight);

  // 4. Moving Recoil Barrels (Left and Right)
  const barrelLen = 0.85;
  const barrelGeo = new THREE.CylinderGeometry(0.016, 0.022, barrelLen, 12);
  barrelGeo.rotateX(Math.PI / 2);
  // Perforated conical muzzle flash suppressor
  const muzzleGeo = new THREE.ConeGeometry(0.034, 0.10, 10);
  muzzleGeo.rotateX(-Math.PI / 2);
  muzzleGeo.translate(0, 0, barrelLen * 0.5 + 0.05);

  const fullBarrelGeo = BufferGeometryUtils.mergeGeometries([barrelGeo, muzzleGeo]);

  const leftBarrel = new THREE.Mesh(fullBarrelGeo, barrelMat);
  leftBarrel.position.set(-0.065, 0.01, barrelLen * 0.5 + 0.12);
  pitchPivot.add(leftBarrel);

  const rightBarrel = new THREE.Mesh(fullBarrelGeo, barrelMat);
  rightBarrel.position.set(0.065, 0.01, barrelLen * 0.5 + 0.12);
  pitchPivot.add(rightBarrel);

  // Muzzle Flash Lights & Glow Meshes
  const muzzleFlashL = new THREE.PointLight(0xffaa22, 0, 8);
  muzzleFlashL.position.set(-0.065, 0.01, barrelLen + 0.22);
  pitchPivot.add(muzzleFlashL);

  const muzzleFlashR = new THREE.PointLight(0xffaa22, 0, 8);
  muzzleFlashR.position.set(0.065, 0.01, barrelLen + 0.22);
  pitchPivot.add(muzzleFlashR);

  const flashGeo = new THREE.SphereGeometry(0.06, 8, 8);
  const flashMeshL = new THREE.Mesh(flashGeo, flashMat);
  flashMeshL.position.copy(muzzleFlashL.position);
  pitchPivot.add(flashMeshL);

  const flashMeshR = new THREE.Mesh(flashGeo, flashMat);
  flashMeshR.position.copy(muzzleFlashR.position);
  pitchPivot.add(flashMeshR);

  return {
    root,
    yawPivot,
    pitchPivot,
    leftBarrel,
    rightBarrel,
    muzzleFlashL,
    muzzleFlashR,
    flashMeshL,
    flashMeshR,
  };
}

export interface Flak41Rig {
  root: THREE.Group;
  yawPivot: THREE.Group;
  pitchPivot: THREE.Group;
  barrelAssembly: THREE.Group;
  muzzleFlash: THREE.PointLight;
  flashMesh: THREE.Mesh;
  sight?: THREE.Object3D;
}

/**
 * Creates an authentic, highly detailed 8.8cm FlaK 41 Heavy Anti-Aircraft / Anti-Tank Gun
 * with independent yaw traversal (360°) and pitch elevation (-5° to +85°).
 */
export function createFlak41Mesh(isGhost = false): Flak41Rig {
  const root = new THREE.Group();

  let metalMat: THREE.Material;
  let barrelMat: THREE.Material;
  let bronzeMat: THREE.Material;
  let flashMat: THREE.Material;

  if (isGhost) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.45,
    });
    metalMat = ghostMat;
    barrelMat = ghostMat;
    bronzeMat = ghostMat;
    flashMat = ghostMat;
  } else {
    metalMat = new THREE.MeshStandardMaterial({
      color: 0x475569, // Panzergrau ordnance grey
      roughness: 0.58,
      metalness: 0.12,
    });
    barrelMat = new THREE.MeshStandardMaterial({
      color: 0x1e2633, // Blackened gun tube
      roughness: 0.45,
      metalness: 0.25,
    });
    bronzeMat = new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.40,
      metalness: 0.20,
    });
    flashMat = new THREE.MeshBasicMaterial({
      color: 0xffaa22,
      transparent: true,
      opacity: 0,
    });
  }

// 1. Static base turntable ring
  const baseRingGeo = new THREE.CylinderGeometry(0.44, 0.46, 0.14, 24);
  const baseRing = new THREE.Mesh(baseRingGeo, metalMat);
  baseRing.position.y = -0.17;
  root.add(baseRing);

  // 2. Yaw Pivot (360° Horizontal Traversal)
  const yawPivot = new THREE.Group();
  yawPivot.position.y = -0.10;
  root.add(yawPivot);

  // Turntable platform
  const tableGeo = new THREE.CylinderGeometry(0.42, 0.44, 0.08, 24);
  const table = new THREE.Mesh(tableGeo, metalMat);
  yawPivot.add(table);

  // Heavy trunnion side stanchions (thick cast steel uprights)
  const stanchionGeo = new THREE.BoxGeometry(0.10, 0.68, 0.45);
  const stanchionL = new THREE.Mesh(stanchionGeo, metalMat);
  stanchionL.position.set(-0.28, 0.34, 0);
  yawPivot.add(stanchionL);

  const stanchionR = new THREE.Mesh(stanchionGeo, metalMat);
  stanchionR.position.set(0.28, 0.34, 0);
  yawPivot.add(stanchionR);

  // Circular trunnion caps
  const capGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 16);
  capGeo.rotateZ(Math.PI / 2);
  const capL = new THREE.Mesh(capGeo, metalMat);
  capL.position.set(-0.33, 0.52, 0);
  yawPivot.add(capL);

  const capR = new THREE.Mesh(capGeo, metalMat);
  capR.position.set(0.33, 0.52, 0);
  yawPivot.add(capR);

  // Gunner platform, folding seat, elevation handwheels
  const gunnerPlatform = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.04, 0.52), metalMat);
  gunnerPlatform.position.set(-0.36, 0.04, -0.32);
  yawPivot.add(gunnerPlatform);

  const gunnerSeat = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.22), metalMat);
  gunnerSeat.position.set(-0.36, 0.26, -0.42);
  yawPivot.add(gunnerSeat);

  const seatLeg = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.22, 8), metalMat);
  seatLeg.position.set(-0.36, 0.15, -0.42);
  yawPivot.add(seatLeg);

  const wheelGeo = new THREE.TorusGeometry(0.08, 0.012, 8, 18);
  const wheelL = new THREE.Mesh(wheelGeo, bronzeMat);
  wheelL.position.set(-0.32, 0.46, -0.16);
  wheelL.rotation.y = Math.PI / 2;
  yawPivot.add(wheelL);

  // 3. Pitch Pivot (Elevates/Depresses Gun: -5° to +85°)
  const pitchPivot = new THREE.Group();
  pitchPivot.position.set(0, 0.52, 0);
  yawPivot.add(pitchPivot);

  // Central trunnion axle
  const axleGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.64, 16);
  axleGeo.rotateZ(Math.PI / 2);
  pitchPivot.add(new THREE.Mesh(axleGeo, metalMat));

  // Multi-faceted Armored Gun Shield (Schutzschild)
  const shieldCenterGeo = new THREE.BoxGeometry(1.26, 0.88, 0.04);
  const shieldCenter = new THREE.Mesh(shieldCenterGeo, metalMat);
  shieldCenter.position.set(0, 0.18, 0.32);
  shieldCenter.rotation.x = 0.20; // sloped
  pitchPivot.add(shieldCenter);

  // Angled side cheek armor wings (Seitenflügel)
  const cheekGeo = new THREE.BoxGeometry(0.42, 0.82, 0.035);
  const cheekL = new THREE.Mesh(cheekGeo, metalMat);
  cheekL.position.set(-0.72, 0.18, 0.16);
  cheekL.rotation.y = 0.45;
  pitchPivot.add(cheekL);

  const cheekR = new THREE.Mesh(cheekGeo, metalMat);
  cheekR.position.set(0.72, 0.18, 0.16);
  cheekR.rotation.y = -0.45;
  pitchPivot.add(cheekR);

  // Optical sighting telescope housing on shield
  const sightGeo = new THREE.CylinderGeometry(0.024, 0.026, 0.45, 8);
  sightGeo.rotateX(Math.PI / 2);
  const sight = new THREE.Mesh(sightGeo, metalMat);
  sight.position.set(-0.24, 0.42, 0.35);
  pitchPivot.add(sight);

  // Heavy Breech Cradle & Recoil Guide Rails (Fixed to pitchPivot)
  const cradleGeo = new THREE.BoxGeometry(0.36, 0.34, 1.55);
  const cradle = new THREE.Mesh(cradleGeo, metalMat);
  cradle.position.set(0, 0.02, 0.30);
  pitchPivot.add(cradle);

  // Top Hydro-pneumatic Recuperator Cylinder (Vorholzylinder)
  const recuperatorGeo = new THREE.CylinderGeometry(0.075, 0.075, 2.75, 16);
  recuperatorGeo.rotateX(Math.PI / 2);
  const recuperator = new THREE.Mesh(recuperatorGeo, metalMat);
  recuperator.position.set(0, 0.24, 1.35);
  pitchPivot.add(recuperator);

  // Twin Equilibrator balancing cylinders (Ausgleicher)
  for (const side of [-0.22, 0.22]) {
    const eqGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.65, 12);
    eqGeo.rotateX(Math.PI / 3.5);
    const eq = new THREE.Mesh(eqGeo, metalMat);
    eq.position.set(side, -0.06, 0.12);
    pitchPivot.add(eq);
  }

  // 4. Moving Barrel Assembly (Recoils on Firing)
  const barrelAssembly = new THREE.Group();
  barrelAssembly.position.set(0, 0.02, 0);
  pitchPivot.add(barrelAssembly);

  // Heavy sliding breech block & semi-automatic vertical wedge (Counterweight behind trunnion)
  const breechGeo = new THREE.BoxGeometry(0.34, 0.36, 0.95);
  const breech = new THREE.Mesh(breechGeo, metalMat);
  breech.position.set(0, 0.02, -0.48);
  barrelAssembly.add(breech);

  // Rear shell loading tray & ejection chute
  const trayGeo = new THREE.BoxGeometry(0.24, 0.05, 0.35);
  const tray = new THREE.Mesh(trayGeo, metalMat);
  tray.position.set(0, -0.08, -1.02);
  barrelAssembly.add(tray);

  // Rear reinforced barrel jacket sleeve (spans Z = 0 to 1.85m)
  const sleeveGeo = new THREE.CylinderGeometry(0.105, 0.125, 1.85, 20);
  sleeveGeo.rotateX(Math.PI / 2);
  const sleeve = new THREE.Mesh(sleeveGeo, barrelMat);
  sleeve.position.set(0, 0.02, 0.925);
  barrelAssembly.add(sleeve);

  // Authentic 8.8cm L/74 Rifled Barrel Tube: 88mm * 74 = 6.512 meters total!
  // Main exposed tube spans from Z = 1.85m to Z = 6.512m (length = 4.662m)
  const barrelTubeGeo = new THREE.CylinderGeometry(0.065, 0.088, 4.662, 20);
  barrelTubeGeo.rotateX(Math.PI / 2);
  const barrelTube = new THREE.Mesh(barrelTubeGeo, barrelMat);
  barrelTube.position.set(0, 0.02, 4.181);
  barrelAssembly.add(barrelTube);

  // Heavy Multi-Baffle Muzzle Brake (spans Z = 6.512m to Z = 7.162m, length = 0.65m)
  const brakeGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.65, 18);
  brakeGeo.rotateX(Math.PI / 2);
  const brake = new THREE.Mesh(brakeGeo, barrelMat);
  brake.position.set(0, 0.02, 6.837);
  barrelAssembly.add(brake);

  // Deflector baffle rings on muzzle brake
  const baffleGeo = new THREE.TorusGeometry(0.14, 0.022, 8, 20);
  for (const zOffset of [6.62, 6.84, 7.06]) {
    const baffle = new THREE.Mesh(baffleGeo, metalMat);
    baffle.position.set(0, 0.02, zOffset);
    barrelAssembly.add(baffle);
  }

  // Side gas discharge vent ports on muzzle brake
  const ventGeo = new THREE.BoxGeometry(0.28, 0.05, 0.12);
  for (const zOffset of [6.72, 6.96]) {
    const vent = new THREE.Mesh(ventGeo, bronzeMat);
    vent.position.set(0, 0.02, zOffset);
    barrelAssembly.add(vent);
  }

  // 5. Muzzle Flash PointLight & Blast Glow Mesh (Positioned at Z = 7.20m)
  const muzzleFlash = new THREE.PointLight(0xff7711, 0, 22);
  muzzleFlash.position.set(0, 0.02, 7.20);
  barrelAssembly.add(muzzleFlash);

  const flashGeo = new THREE.SphereGeometry(0.28, 10, 10);
  const flashMesh = new THREE.Mesh(flashGeo, flashMat);
  flashMesh.position.copy(muzzleFlash.position);
  barrelAssembly.add(flashMesh);

  return {
    root,
    yawPivot,
    pitchPivot,
    barrelAssembly,
    muzzleFlash,
    flashMesh,
    sight,
  };
}

/**
 * Helper to build custom 3D Mesh for any LEGO shape with rotation applied.
 */
export function createLegoMesh(
  type: BlockType,
  shape: LegoShape = 'CUBE',
  rotationY = 0,
  isGhost = false,
  rotationX = 0,
  rotationZ = 0
): THREE.Group {
  const group = new THREE.Group();

  if (shape === 'FLAK_44') {
    const rig = createFlak44Mesh(isGhost);
    group.add(rig.root);
    group.userData.flakRig = rig;
    group.rotation.set(
      rotationX * (Math.PI / 2),
      rotationY * (Math.PI / 2),
      rotationZ * (Math.PI / 2)
    );
    return group;
  }

  if (shape === 'FLAK_41') {
    const rig = createFlak41Mesh(isGhost);
    group.add(rig.root);
    group.userData.flak41Rig = rig;
    group.rotation.set(
      rotationX * (Math.PI / 2),
      rotationY * (Math.PI / 2),
      rotationZ * (Math.PI / 2)
    );
    return group;
  }

  const geom = getLegoShapeGeometry(shape);
  const color =
    type === 'COCKPIT' ? 0x2563eb : type === 'ENGINE' ? 0xea580c : 0x475569;

  let mat: THREE.Material;
  if (isGhost) {
    mat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.45,
    });
  } else {
    mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.60,
      metalness: 0.05,
    });
  }

  const mesh = new THREE.Mesh(geom, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  if (!isGhost) {
    const edgeGeo = new THREE.EdgesGeometry(geom, 22);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x0f172a,
      transparent: true,
      opacity: 0.38,
    });
    const edges = new THREE.LineSegments(edgeGeo, edgeMat);
    edges.raycast = () => {};
    group.add(edges);
  }

  group.rotation.set(
    rotationX * (Math.PI / 2),
    rotationY * (Math.PI / 2),
    rotationZ * (Math.PI / 2)
  );

  return group;
}

/**
 * Creates an authentic Maybach HL 230 V-12 Tank Engine Block:
 * - 60° V-cylinder banks with twin overhead finned valve covers in brushed aluminum
 * - Heavy ribbed cast engine crankcase and finned oil pan
 * - Dual cyclone air filter canisters on the central intake manifold
 * - Outer 6-cylinder exhaust headers
 * - Front mechanical radiator fan, drive belt, and dual camshaft pulleys (when isFront)
 * - Rear heavy flywheel / transmission bellhousing and exhaust collector flanges (when isRear)
 */
export function createV12EngineMesh(
  rotationY = 0,
  isGhost = false
): THREE.Group {
  const group = new THREE.Group();
  const s = BLOCK_SIZE; // 0.5m (footprint: 2 blocks wide = 1.0m, 3 blocks long = 1.5m)

  let blockMat: THREE.Material;
  let valveMat: THREE.Material;
  let headerMat: THREE.Material;
  let accentMat: THREE.Material;
  let glowMat: THREE.Material;
  let beltMat: THREE.Material;

  if (isGhost) {
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.45,
    });
    blockMat = ghostMat;
    valveMat = ghostMat;
    headerMat = ghostMat;
    accentMat = ghostMat;
    glowMat = ghostMat;
    beltMat = ghostMat;
  } else {
    blockMat = new THREE.MeshStandardMaterial({
      color: 0x334155, // clean cast iron slate engine block
      roughness: 0.60,
      metalness: 0.08,
    });
    valveMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8, // bright cast aluminum valve covers
      roughness: 0.45,
      metalness: 0.12,
    });
    headerMat = new THREE.MeshStandardMaterial({
      color: 0x785a44, // burnt steel exhaust headers
      roughness: 0.55,
      metalness: 0.08,
    });
    accentMat = new THREE.MeshStandardMaterial({
      color: 0xd97706, // copper ignition conduit & fittings
      roughness: 0.40,
      metalness: 0.15,
    });
    glowMat = new THREE.MeshStandardMaterial({
      color: 0xea580c,
      emissive: 0xff5500,
      emissiveIntensity: 0.8,
      roughness: 0.5,
      metalness: 0.05,
    });
    beltMat = new THREE.MeshStandardMaterial({
      color: 0x1e242d,
      roughness: 0.85,
      metalness: 0.05,
    });
  }

  // 1. Lower Crankcase & Finned Sump (Spans 1.42m x 0.70m)
  const crankGeo = new THREE.BoxGeometry(0.70, 0.34, 1.42);
  const crankMesh = new THREE.Mesh(crankGeo, blockMat);
  crankMesh.position.y = -0.06;
  crankMesh.castShadow = true;
  group.add(crankMesh);

  // Bottom finned oil sump pan
  const panGeo = new THREE.BoxGeometry(0.50, 0.07, 1.32);
  const panMesh = new THREE.Mesh(panGeo, blockMat);
  panMesh.position.y = -0.22;
  group.add(panMesh);

  // Transverse cooling ribs along oil pan bottom
  const sumpRibGeo = new THREE.BoxGeometry(0.48, 0.015, 0.02);
  for (let z = -0.55; z <= 0.55; z += 0.11) {
    const sRib = new THREE.Mesh(sumpRibGeo, blockMat);
    sRib.position.set(0, -0.26, z);
    group.add(sRib);
  }

  // Crankcase side strengthening ribs
  const sideRibGeo = new THREE.BoxGeometry(0.018, 0.018, 1.36);
  for (const side of [-1, 1]) {
    for (let r = 0; r < 2; r++) {
      const rib = new THREE.Mesh(sideRibGeo, blockMat);
      rib.position.set(side * (0.35 + 0.005), -(0.02 + r * 0.11), 0);
      group.add(rib);
    }
  }

  // 2. Twin Angled 60° V-Cylinder Banks (12 Cylinders, 6 per bank)
  const bankAngle = Math.PI / 6; // 30 degrees tilt (60 deg V-angle)
  const bankGeo = new THREE.BoxGeometry(0.28, 0.35, 1.36);
  const valveCoverGeo = new THREE.BoxGeometry(0.26, 0.05, 1.34);
  const finGeo = new THREE.BoxGeometry(0.012, 0.015, 1.30);
  const conduitGeo = new THREE.BoxGeometry(0.016, 0.016, 1.26);

  // Left Bank (-X, tilted -30°)
  const leftBank = new THREE.Group();
  leftBank.position.set(-0.24, 0.18, 0);
  leftBank.rotation.z = -bankAngle;

  const leftCylinder = new THREE.Mesh(bankGeo, blockMat);
  leftBank.add(leftCylinder);

  const leftCover = new THREE.Mesh(valveCoverGeo, valveMat);
  leftCover.position.y = 0.19;
  leftBank.add(leftCover);

  for (let f = -1; f <= 1; f++) {
    const fin = new THREE.Mesh(finGeo, valveMat);
    fin.position.set(f * 0.065, 0.22, 0);
    leftBank.add(fin);
  }

  const leftConduit = new THREE.Mesh(conduitGeo, accentMat);
  leftConduit.position.set(-0.09, 0.16, 0);
  leftBank.add(leftConduit);

  // 6 Spark plug boots
  for (let z = -0.52; z <= 0.52; z += 0.21) {
    const bootGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.035, 8);
    const boot = new THREE.Mesh(bootGeo, blockMat);
    boot.position.set(-0.06, 0.20, z);
    leftBank.add(boot);
  }
  group.add(leftBank);

  // Right Bank (+X, tilted +30°)
  const rightBank = new THREE.Group();
  rightBank.position.set(0.24, 0.18, 0);
  rightBank.rotation.z = bankAngle;

  const rightCylinder = new THREE.Mesh(bankGeo, blockMat);
  rightBank.add(rightCylinder);

  const rightCover = new THREE.Mesh(valveCoverGeo, valveMat);
  rightCover.position.y = 0.19;
  rightBank.add(rightCover);

  for (let f = -1; f <= 1; f++) {
    const fin = new THREE.Mesh(finGeo, valveMat);
    fin.position.set(f * 0.065, 0.22, 0);
    rightBank.add(fin);
  }

  const rightConduit = new THREE.Mesh(conduitGeo, accentMat);
  rightConduit.position.set(0.09, 0.16, 0);
  rightBank.add(rightConduit);

  for (let z = -0.52; z <= 0.52; z += 0.21) {
    const bootGeo = new THREE.CylinderGeometry(0.012, 0.012, 0.035, 8);
    const boot = new THREE.Mesh(bootGeo, blockMat);
    boot.position.set(0.06, 0.20, z);
    rightBank.add(boot);
  }
  group.add(rightBank);

  // 3. Central V-Valley: Intake Manifold, Combustion Core & Quad Cyclone Cleaners
  const intakeGeo = new THREE.BoxGeometry(0.24, 0.16, 1.30);
  const intakeMesh = new THREE.Mesh(intakeGeo, blockMat);
  intakeMesh.position.set(0, 0.12, 0);
  group.add(intakeMesh);

  // Glowing combustion core inside valley
  const glowCoreGeo = new THREE.BoxGeometry(0.16, 0.08, 1.20);
  const glowCore = new THREE.Mesh(glowCoreGeo, glowMat);
  glowCore.position.set(0, 0.17, 0);
  group.add(glowCore);

  // 4 Iconic Maybach Cyclone Air Cleaner Canisters
  const cleanerZPositions = [-0.45, -0.15, 0.15, 0.45];
  for (const zOffset of cleanerZPositions) {
    const cleanerGeo = new THREE.CylinderGeometry(0.075, 0.075, 0.13, 16);
    const cleanerMesh = new THREE.Mesh(cleanerGeo, blockMat);
    cleanerMesh.position.set(0, 0.32, zOffset);
    group.add(cleanerMesh);

    const capGeo = new THREE.CylinderGeometry(0.082, 0.082, 0.024, 16);
    const capMesh = new THREE.Mesh(capGeo, valveMat);
    capMesh.position.set(0, 0.39, zOffset);
    group.add(capMesh);

    // Intake connecting flange
    const neckGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12);
    const neckMesh = new THREE.Mesh(neckGeo, blockMat);
    neckMesh.position.set(0, 0.23, zOffset);
    group.add(neckMesh);
  }

  // 4. Exhaust Headers on outer banks (12 Runners: 6 per bank)
  const pipeGeo = new THREE.CylinderGeometry(0.026, 0.026, 1.34, 12);
  pipeGeo.rotateX(Math.PI / 2);

  const leftPipe = new THREE.Mesh(pipeGeo, headerMat);
  leftPipe.position.set(-0.44, 0.10, 0);
  group.add(leftPipe);

  const rightPipe = new THREE.Mesh(pipeGeo, headerMat);
  rightPipe.position.set(0.44, 0.10, 0);
  group.add(rightPipe);

  const runnerGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.14, 8);
  runnerGeo.rotateZ(Math.PI / 2.8);

  for (let z = -0.55; z <= 0.55; z += 0.22) {
    const lRun = new THREE.Mesh(runnerGeo, headerMat);
    lRun.position.set(-0.36, 0.14, z);
    group.add(lRun);

    const rRun = new THREE.Mesh(runnerGeo.clone().rotateZ(-Math.PI / 1.4), headerMat);
    rRun.position.set(0.36, 0.14, z);
    group.add(rRun);
  }

  // 5. Front Accessories: Twin Radiator Cooling Fans & Belt Drive (+Z = +0.72m)
  const frontZ = 0.72;

  // Crankshaft balancer pulley (bottom center)
  const crankPulleyGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.040, 20);
  crankPulleyGeo.rotateX(Math.PI / 2);
  const crankPulley = new THREE.Mesh(crankPulleyGeo, valveMat);
  crankPulley.position.set(0, -0.06, frontZ);
  group.add(crankPulley);

  // Twin Camshaft pulleys
  const camPulleyGeo = new THREE.CylinderGeometry(0.050, 0.050, 0.035, 16);
  camPulleyGeo.rotateX(Math.PI / 2);

  const lCam = new THREE.Mesh(camPulleyGeo, valveMat);
  lCam.position.set(-0.24, 0.24, frontZ);
  group.add(lCam);

  const rCam = new THREE.Mesh(camPulleyGeo, valveMat);
  rCam.position.set(0.24, 0.24, frontZ);
  group.add(rCam);

  // Double serpentine rubber drive belts
  const beltGeo = new THREE.TorusGeometry(0.18, 0.014, 8, 28);
  const belt = new THREE.Mesh(beltGeo, beltMat);
  belt.position.set(0, 0.08, frontZ + 0.015);
  group.add(belt);

  // Twin 6-Blade Mechanical Radiator Cooling Fans (Left & Right)
  for (const side of [-1, 1]) {
    const fanHubX = side * 0.22;
    const fanHubY = 0.16;

    // Fan shroud ring
    const shroudGeo = new THREE.TorusGeometry(0.15, 0.012, 8, 24);
    const shroud = new THREE.Mesh(shroudGeo, blockMat);
    shroud.position.set(fanHubX, fanHubY, frontZ + 0.020);
    group.add(shroud);

    // Fan hub
    const fanHubGeo = new THREE.CylinderGeometry(0.040, 0.040, 0.028, 14);
    fanHubGeo.rotateX(Math.PI / 2);
    const fanHub = new THREE.Mesh(fanHubGeo, valveMat);
    fanHub.position.set(fanHubX, fanHubY, frontZ + 0.025);

    for (let b = 0; b < 6; b++) {
      const bAngle = (b / 6) * Math.PI * 2;
      const bladeGeo = new THREE.BoxGeometry(0.024, 0.10, 0.007);
      bladeGeo.rotateZ(bAngle);
      bladeGeo.rotateY(0.35);
      const blade = new THREE.Mesh(bladeGeo, valveMat);
      blade.position.set(Math.cos(bAngle) * 0.075, Math.sin(bAngle) * 0.075, 0);
      fanHub.add(blade);
    }
    group.add(fanHub);
  }

  // 6. Rear Transmission Bellhousing & Starter Motor (-Z = -0.72m)
  const rearZ = -0.72;

  // Massive circular cast bellhousing
  const bellGeo = new THREE.CylinderGeometry(0.36, 0.38, 0.06, 28);
  bellGeo.rotateX(Math.PI / 2);
  const bellMesh = new THREE.Mesh(bellGeo, blockMat);
  bellMesh.position.set(0, 0.02, rearZ);
  group.add(bellMesh);

  // Output drive coupling
  const shaftGeo = new THREE.CylinderGeometry(0.055, 0.055, 0.070, 18);
  shaftGeo.rotateX(Math.PI / 2);
  const shaft = new THREE.Mesh(shaftGeo, valveMat);
  shaft.position.set(0, 0.02, rearZ - 0.035);
  group.add(shaft);

  // Electric starter motor on lower right flank
  const starterGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 16);
  starterGeo.rotateX(Math.PI / 2);
  const starterMesh = new THREE.Mesh(starterGeo, blockMat);
  starterMesh.position.set(0.28, -0.10, rearZ + 0.08);
  group.add(starterMesh);

  // Twin rear exhaust collector flanges
  for (const side of [-1, 1]) {
    const flangeGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.045, 14);
    flangeGeo.rotateX(Math.PI / 2);
    const flange = new THREE.Mesh(flangeGeo, headerMat);
    flange.position.set(side * 0.44, 0.10, rearZ - 0.025);
    group.add(flange);
  }

  group.rotation.y = rotationY * (Math.PI / 2);
  return group;
}
