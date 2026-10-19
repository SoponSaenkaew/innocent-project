import type { LegoShape } from './LegoShapes';

export type BlockType = 'COCKPIT' | 'CHASSIS' | 'ENGINE' | 'TRACK_UNIT' | 'WEAPON' | 'TURRET';

export interface BlockDefinition {
  type: BlockType;
  label: string;
  mass: number;       // kg
  color: number;
  emissive?: number;
  isTrack?: boolean;
  powerWatts?: number;
}

/**
 * World Standard Scale:
 * 1 World Unit = 1.0 Meter
 * Subdividing 1 cubic meter (1m x 1m x 1m) into 8 blocks (2 x 2 x 2 Octree):
 * Each standard vehicle block = 0.5m x 0.5m x 0.5m (Volume: 0.125 m³)
 */
export const WORLD_UNIT_METERS = 1.0;
export const SUBDIVISIONS_PER_METER = 2; // 2x2x2 = 8 blocks per cubic meter
export const BLOCK_SIZE = WORLD_UNIT_METERS / SUBDIVISIONS_PER_METER; // Exactly 0.5 meters (50 cm)

export const BLOCK_DEFS: Record<BlockType, BlockDefinition> = {
  COCKPIT: {
    type: 'COCKPIT',
    label: 'Command Cockpit',
    mass: 350, // 350 kg (armored driver station with cast armor hood)
    color: 0x2563eb,
    emissive: 0x0ea5e9,
  },
  CHASSIS: {
    type: 'CHASSIS',
    label: 'Armored Chassis',
    mass: 981, // 981.25 kg (0.125 m³ solid military RHA steel at 7,850 kg/m³)
    color: 0x475569,
  },
  ENGINE: {
    type: 'ENGINE',
    label: 'Maybach HL 230 V-12 Engine (2x3)',
    mass: 1200, // 1,200 kg authentic Maybach V-12 engine dry mass
    color: 0xea580c,
    emissive: 0xff5500,
    powerWatts: 525000, // 525 kW / 704 HP (714 PS) Maybach HL 230 P30 V12 Engine
  },
  TRACK_UNIT: {
    type: 'TRACK_UNIT',
    label: 'Caterpillar Track Unit',
    mass: 180, // 180 kg per block segment (King Tiger steel road wheel station + 800mm track shoes)
    color: 0x27272a,
    isTrack: true,
  },
  TURRET: {
    type: 'TURRET',
    label: 'Turret Traverse Ring',
    mass: 650, // 650 kg heavy forged steel ball-bearing race ring
    color: 0x64748b,
  },
  WEAPON: {
    type: 'WEAPON',
    label: '3.7cm Flakzwilling 44',
    mass: 950, // 950 kg complete twin AA autocannon mount + gun shield
    color: 0x334155,
    emissive: 0xffaa22,
  },
};

export interface BlueprintBlock {
  x: number; // grid x (-6..+6)
  y: number; // grid y (0..6)
  z: number; // grid z (-8..+8), +Z is forward
  type: BlockType;
  shape?: LegoShape;
  rotationY?: number; // 0=0°, 1=90°, 2=180°, 3=270° (Yaw: ซ้าย/ขวา)
  rotationX?: number; // 0=0°, 1=90°, 2=180°, 3=270° (Pitch: ก้ม/เงย/หงายขึ้น)
  rotationZ?: number; // 0=0°, 1=90°, 2=180°, 3=270° (Roll: เอียง)
  isAutoFloor?: boolean;
}

/**
 * Modular Rolling Chassis Starter Platform (แชสซีเริ่มต้นแบบแท่นเปลือย):
 * - Caterpillar Tracks: Tiger II Running Gear (Left +X=3, Right -X=-3, Length 13 blocks / 6.5m)
 * - Chassis Floor: Flatbed floor tub (y = 1, Width 5 blocks x = -2..+2, Length 13 blocks z = -6..+6)
 * - Powertrain: Heavy Diesel Engine blocks mounted at the rear floor (y = 2, z = -4..-2)
 * - Command Seat: Driver Cockpit mounted at the front floor (y = 2, z = 2)
 * - Complete creative freedom to build sloped armor, side sponsons, or turrets on top!
 */
export const DEFAULT_TANK_BLUEPRINT: BlueprintBlock[] = [
  // -------------------------------------------------------------
  // 1. CATERPILLAR RUNNING GEAR (Tiger II Tracks)
  // Left (+X = 3) and Right (-X = -3) continuous 13-block runs
  // -------------------------------------------------------------
  // Left Track (+X = 3)
  { x: 3, y: 0, z: -6, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: -5, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: -4, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: -3, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: -2, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: -1, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 0, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 1, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 2, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 3, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 4, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 5, type: 'TRACK_UNIT' },
  { x: 3, y: 0, z: 6, type: 'TRACK_UNIT' },

  // Right Track (-X = -3)
  { x: -3, y: 0, z: -6, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: -5, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: -4, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: -3, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: -2, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: -1, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 0, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 1, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 2, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 3, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 4, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 5, type: 'TRACK_UNIT' },
  { x: -3, y: 0, z: 6, type: 'TRACK_UNIT' },

  // -------------------------------------------------------------
  // 2. FLATBED CHASSIS FLOOR (y = 0, x = -2..+2, z = -6..+6)
  // 8cm armored plate floor lowered to the wheel center level (belly tub)
  // -------------------------------------------------------------
  // Center Floor (x = 0)
  { x: 0, y: 0, z: -6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: -5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: -4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: -3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: -2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: -1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 0, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 0, y: 0, z: 6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },

  // Inner Left Floor (x = 1)
  { x: 1, y: 0, z: -6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: -5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: -4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: -3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: -2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: -1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 0, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 1, y: 0, z: 6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },

  // Inner Right Floor (x = -1)
  { x: -1, y: 0, z: -6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: -5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: -4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: -3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: -2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: -1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 0, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -1, y: 0, z: 6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },

  // Outer Left Track Sponson Floor (x = 2)
  { x: 2, y: 0, z: -6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: -5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: -4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: -3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: -2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: -1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 0, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: 2, y: 0, z: 6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },

  // Outer Right Track Sponson Floor (x = -2)
  { x: -2, y: 0, z: -6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: -5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: -4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: -3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: -2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: -1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 0, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 1, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 2, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 3, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 4, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 5, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },
  { x: -2, y: 0, z: 6, type: 'CHASSIS', shape: 'PLATE', isAutoFloor: true },

  // -------------------------------------------------------------
  // 3. POWERTRAIN & DRIVER (Mounted on the Floor at y = 1)
  // -------------------------------------------------------------
  // Maybach HL 230 V-12 Engine (2x3 blocks: 1.0m x 1.5m, 700 HP)
  { x: 0, y: 1, z: -3, type: 'ENGINE' },

  // Driver Cockpit (Front)
  { x: 0, y: 1, z: 2, type: 'COCKPIT' },
];
