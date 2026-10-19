import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { BLOCK_DEFS, BLOCK_SIZE, BlockType, BlueprintBlock } from '../blocks/BlockTypes';
import {
  KingTigerTrackAssembly,
  TrackTension,
  createKingTigerTrackMesh,
  findTrackSegments,
} from './KingTigerTrack';
import {
  LEGO_SHAPE_DEFS,
  getLegoShapeGeometry,
  createLegoMesh,
  createV12EngineMesh,
  Flak44Rig,
  Flak41Rig,
} from '../blocks/LegoShapes';

export interface CruiseSpec {
  stage: number; // -2 = R2, -1 = R1, 0 = MAN (Manual/Off), 1 = CC1, 2 = CC2, 3 = MAX
  label: string;
  speedFraction: number; // fraction of top speed
  isReverse?: boolean;
}

export const CRUISE_STAGES: CruiseSpec[] = [
  { stage: -2, label: 'R2', speedFraction: 0.70, isReverse: true },
  { stage: -1, label: 'R1', speedFraction: 0.35, isReverse: true },
  { stage: 0, label: 'MAN', speedFraction: 0.00 },
  { stage: 1, label: 'CC1', speedFraction: 0.35 },
  { stage: 2, label: 'CC2', speedFraction: 0.70 },
  { stage: 3, label: 'MAX', speedFraction: 1.00 },
];

export interface GearSpec {
  stage: number; // -2 = R2, -1 = R1, 0 = N, 1 = D1, 2 = D2, 3 = D3, 4 = D4, 5 = D5
  label: string;
  speedRatio: number;
  torqueRatio: number;
  isReverse?: boolean;
  isNeutral?: boolean;
}

export const GEAR_STAGES: GearSpec[] = [
  { stage: -2, label: 'R2', speedRatio: 0.50, torqueRatio: 1.20, isReverse: true },
  { stage: -1, label: 'R1', speedRatio: 0.25, torqueRatio: 2.50, isReverse: true },
  { stage: 0, label: 'N', speedRatio: 0.00, torqueRatio: 0.00, isNeutral: true },
  { stage: 1, label: 'D1', speedRatio: 0.28, torqueRatio: 3.00 },
  { stage: 2, label: 'D2', speedRatio: 0.48, torqueRatio: 2.20 },
  { stage: 3, label: 'D3', speedRatio: 0.70, torqueRatio: 1.60 },
  { stage: 4, label: 'D4', speedRatio: 0.88, torqueRatio: 1.20 },
  { stage: 5, label: 'D5', speedRatio: 1.00, torqueRatio: 0.95 },
];

export interface FlakWeaponRuntime {
  rig: Flak44Rig;
  block: BlueprintBlock;
  localPos: THREE.Vector3;
  currentYaw: number;
  currentPitch: number;
  targetYaw: number;
  targetPitch: number;
  fireCooldown: number;
  nextBarrelLeft: boolean;
  recoilL: number;
  recoilR: number;
  flashTimerL: number;
  flashTimerR: number;
}

export interface Flak41WeaponRuntime {
  rig: Flak41Rig;
  block: BlueprintBlock;
  localPos: THREE.Vector3;
  currentYaw: number;
  currentPitch: number;
  targetYaw: number;
  targetPitch: number;
  fireCooldown: number;
  recoil: number;
  flashTimer: number;
}

export interface FireResult {
  fired: boolean;
  count: number;
  fired44: boolean;
  fired41: boolean;
}

interface Projectile {
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  isHeavy88?: boolean;
}

interface TrackUnitRuntime {
  block: BlueprintBlock;
  localAnchor: THREE.Vector3;
  isLeft: boolean; // true = Left (+X), false = Right (-X)
  prevSuspLength: number;
  currSuspLength: number;
  prevWheelSpin: number;
  currWheelSpin: number;
  isGrounded: boolean;
  compression: number;
}

export class TrackedVehicle {
  public readonly body: RAPIER.RigidBody;
  public readonly rootGroup: THREE.Group;

  // Visual sub-frame interpolation
  public readonly renderPosition = new THREE.Vector3();
  public readonly renderQuaternion = new THREE.Quaternion();
  private readonly prevPosition = new THREE.Vector3();
  private readonly currPosition = new THREE.Vector3();
  private readonly prevQuaternion = new THREE.Quaternion();
  private readonly currQuaternion = new THREE.Quaternion();

  private scene: THREE.Scene;
  private world: RAPIER.World;

  public flakWeapons: FlakWeaponRuntime[] = [];
  public flak41Weapons: Flak41WeaponRuntime[] = [];
  private projectiles: Projectile[] = [];
  private projectilePool: THREE.BufferGeometry | null = null;
  private projectileMat: THREE.Material | null = null;
  private shell88Geo: THREE.BufferGeometry | null = null;
  private shell88Mat: THREE.Material | null = null;

  private trackUnits: TrackUnitRuntime[] = [];
  private kingTigerAssemblies: KingTigerTrackAssembly[] = [];
  private leftSpinAngle = 0;
  private rightSpinAngle = 0;
  public totalPowerWatts = 0;
  public engineCount = 0;

  // Cruise Control / Speed Lock State (Index 2 is 'MAN' / Manual)
  public cruiseIndex = 2;

  // Automatic Load-Sensing Transmission State (Index 3 is 'D1')
  public autoGearIndex = 3;
  private shiftCooldown = 0;
  public onGearShift?: (newGear: GearSpec, isUp: boolean) => void;

  // Driving Telemetry
  public currentSpeedKmh = 0;
  public signedSpeedKmh = 0;
  public leftTrackPower = 0;
  public rightTrackPower = 0;
  public isAutoBraking = false;

  // Suspension settings (Tuned for 0.5m standard blocks, resting directly on ground)
  private readonly suspRestLength = 0.40;
  private readonly suspStiffness = 28.0;
  private readonly suspDampingRatio = 0.95;
  private maxTrackZ = 0;
  private minTrackZ = 0;

  public trackTension: TrackTension = 'REALISTIC';
  public maxLocalY = 1.2;

  constructor(
    blueprintBlocks: BlueprintBlock[],
    spawnPos: THREE.Vector3,
    scene: THREE.Scene,
    world: RAPIER.World,
    tension: TrackTension = 'REALISTIC'
  ) {
    this.trackTension = tension;
    this.scene = scene;
    this.world = world;

    this.rootGroup = new THREE.Group();
    this.rootGroup.position.copy(spawnPos);
    this.scene.add(this.rootGroup);

    this.prevPosition.copy(spawnPos);
    this.currPosition.copy(spawnPos);
    this.renderPosition.copy(spawnPos);

    // Create Rapier RigidBody
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(spawnPos.x, spawnPos.y, spawnPos.z)
      .setLinearDamping(0.2)
      .setAngularDamping(0.8)
      .setCanSleep(false);

    this.body = this.world.createRigidBody(bodyDesc);
    this.body.setAdditionalSolverIterations(4);

    this.buildVehicle(blueprintBlocks);
  }

  private buildVehicle(blueprintBlocks: BlueprintBlock[]): void {
    const half = BLOCK_SIZE * 0.5;

    for (const b of blueprintBlocks) {
      const def = BLOCK_DEFS[b.type];
      const shapeMass = b.shape ? LEGO_SHAPE_DEFS[b.shape]?.mass : undefined;
      const mass = b.isAutoFloor ? 157 : (shapeMass ?? def.mass);

      const localPos = new THREE.Vector3(
        b.x * BLOCK_SIZE,
        b.y * BLOCK_SIZE + BLOCK_SIZE * 0.5,
        b.z * BLOCK_SIZE
      );

      // Collider generation: handles slopes (convex hull), plates, turret rings, weapons, and standard blocks
      let colDesc: RAPIER.ColliderDesc | null = null;
      if (b.type === 'TRACK_UNIT') {
        // Track sponson collider: raised up, leaving lower section open for wheels and ground contact
        const hx = half * 0.90;
        const hy = half * 0.40;
        const hz = half * 0.90;
        const offsetY = 0.10;
        colDesc = RAPIER.ColliderDesc.roundCuboid(hx, hy, hz, 0.03)
          .setTranslation(localPos.x, localPos.y + offsetY, localPos.z)
          .setMass(mass)
          .setFriction(0.2)
          .setRestitution(0.0);
      } else if (b.isAutoFloor) {
        const plateH = 0.08;
        const colCenterY = localPos.y + (BLOCK_SIZE * 0.5) - plateH * 0.5;
        colDesc = RAPIER.ColliderDesc.cuboid(half, plateH * 0.5, half)
          .setTranslation(localPos.x, colCenterY, localPos.z)
          .setMass(mass)
          .setFriction(0.2)
          .setRestitution(0.0);
      } else if (b.shape === 'PLATE' || b.shape === 'PLATE_25' || b.shape === 'PLATE_12') {
        const geom = getLegoShapeGeometry(b.shape);
        const posAttr = geom.getAttribute('position');
        const rotAngleX = (b.rotationX ?? 0) * (Math.PI / 2);
        const rotAngleY = (b.rotationY ?? 0) * (Math.PI / 2);
        const rotAngleZ = (b.rotationZ ?? 0) * (Math.PI / 2);
        const euler = new THREE.Euler(rotAngleX, rotAngleY, rotAngleZ, 'XYZ');

        const hullPoints = new Float32Array(posAttr.count * 3);
        const tmpV = new THREE.Vector3();
        for (let i = 0; i < posAttr.count; i++) {
          tmpV.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyEuler(euler);
          hullPoints[i * 3 + 0] = tmpV.x;
          hullPoints[i * 3 + 1] = tmpV.y;
          hullPoints[i * 3 + 2] = tmpV.z;
        }
        colDesc = RAPIER.ColliderDesc.convexHull(hullPoints);
        if (colDesc) {
          colDesc
            .setTranslation(localPos.x, localPos.y, localPos.z)
            .setMass(mass)
            .setFriction(0.2)
            .setRestitution(0.0);
        }
      } else if (b.shape === 'TURRET_RING' || b.type === 'TURRET') {
        colDesc = RAPIER.ColliderDesc.cylinder(0.05, half * 0.92)
          .setTranslation(localPos.x, localPos.y - half + 0.05, localPos.z)
          .setMass(mass)
          .setFriction(0.2)
          .setRestitution(0.0);
      } else if (b.shape === 'FLAK_44' || b.type === 'WEAPON') {
        colDesc = RAPIER.ColliderDesc.cuboid(half * 0.75, half * 0.75, half * 0.75)
          .setTranslation(localPos.x, localPos.y + 0.1, localPos.z)
          .setMass(mass)
          .setFriction(0.2)
          .setRestitution(0.0);
      } else if (b.shape === 'SLOPE_45' || b.shape === 'SLOPE_30' || b.shape === 'CORNER_WEDGE') {
        try {
          const geom = getLegoShapeGeometry(b.shape);
          const posAttr = geom.getAttribute('position');
          const rotAngleX = (b.rotationX ?? 0) * (Math.PI / 2);
          const rotAngleY = (b.rotationY ?? 0) * (Math.PI / 2);
          const rotAngleZ = (b.rotationZ ?? 0) * (Math.PI / 2);
          const euler = new THREE.Euler(rotAngleX, rotAngleY, rotAngleZ, 'XYZ');

          const hullPoints = new Float32Array(posAttr.count * 3);
          const tmpV = new THREE.Vector3();
          for (let i = 0; i < posAttr.count; i++) {
            tmpV.set(posAttr.getX(i), posAttr.getY(i), posAttr.getZ(i)).applyEuler(euler);
            hullPoints[i * 3 + 0] = tmpV.x;
            hullPoints[i * 3 + 1] = tmpV.y;
            hullPoints[i * 3 + 2] = tmpV.z;
          }
          colDesc = RAPIER.ColliderDesc.convexHull(hullPoints);
          if (colDesc) {
            colDesc
              .setTranslation(localPos.x, localPos.y, localPos.z)
              .setMass(mass)
              .setFriction(0.2)
              .setRestitution(0.0);
          }
        } catch {
          colDesc = null;
        }
      }

      if (!colDesc) {
        if (b.type === 'ENGINE') {
          const isTransverse = ((b.rotationY ?? 0) % 2) !== 0;
          const hx = isTransverse ? 0.72 : 0.48;
          const hy = 0.40;
          const hz = isTransverse ? 0.48 : 0.72;
          const offsetY = 0.15;
          colDesc = RAPIER.ColliderDesc.roundCuboid(hx, hy, hz, 0.03)
            .setTranslation(localPos.x, localPos.y + offsetY, localPos.z)
            .setMass(mass)
            .setFriction(0.2)
            .setRestitution(0.0);
        } else if (b.y <= 0) {
          // Bottom hull belly & tracks
          const isFrontTrack = b.type === 'TRACK_UNIT' && b.z === this.maxTrackZ;
          const isRearTrack = b.type === 'TRACK_UNIT' && b.z === this.minTrackZ;
          const hx = half * 0.86;
          const hy = half * 0.38;
          const hz = half * (isFrontTrack || isRearTrack ? 0.74 : 0.88);
          const offsetY = isFrontTrack || isRearTrack ? 0.10 : 0.08;
          const prowRoundness = isFrontTrack || isRearTrack ? 0.14 : 0.04;
          colDesc = RAPIER.ColliderDesc.roundCuboid(hx, hy, hz, prowRoundness)
            .setTranslation(localPos.x, localPos.y + offsetY, localPos.z)
            .setMass(mass)
            .setFriction(0.04) // Low friction prevents belly high-centering on obstacles
            .setRestitution(0.0);
        } else {
          colDesc = RAPIER.ColliderDesc.cuboid(half, half, half)
            .setTranslation(localPos.x, localPos.y, localPos.z)
            .setMass(mass)
            .setFriction(0.2)
            .setRestitution(0.0);
        }
      }

      this.world.createCollider(colDesc, this.body);

      // Tally Engine Power
      if (b.type === 'ENGINE') {
        this.engineCount++;
        this.totalPowerWatts += def.powerWatts ?? 90000;
      }

      // Track unit setup
      if (b.type === 'TRACK_UNIT') {
        const isLeft = b.x > 0; // +X is Left, -X is Right
        this.trackUnits.push({
          block: b,
          localAnchor: localPos.clone(),
          isLeft,
          prevSuspLength: this.suspRestLength,
          currSuspLength: this.suspRestLength,
          prevWheelSpin: 0,
          currWheelSpin: 0,
          isGrounded: false,
          compression: 0,
        });
      } else {
        // Visual mesh for non-track blocks
        let mesh: THREE.Group;
        if (b.isAutoFloor) {
          mesh = this.createBlockMesh(b.type, b.rotationY ?? 0, true, b.rotationX ?? 0, b.rotationZ ?? 0);
        } else if ((b.shape && b.shape !== 'CUBE') || b.type === 'WEAPON' || b.type === 'TURRET') {
          mesh = createLegoMesh(b.type, b.shape ?? 'CUBE', b.rotationY ?? 0, false, b.rotationX ?? 0, b.rotationZ ?? 0);
          if (mesh.userData.flakRig) {
            this.flakWeapons.push({
              rig: mesh.userData.flakRig,
              block: b,
              localPos: localPos.clone(),
              currentYaw: (b.rotationY ?? 0) * (Math.PI / 2),
              currentPitch: 0,
              targetYaw: (b.rotationY ?? 0) * (Math.PI / 2),
              targetPitch: 0,
              fireCooldown: 0,
              nextBarrelLeft: true,
              recoilL: 0,
              recoilR: 0,
              flashTimerL: 0,
              flashTimerR: 0,
            });
          }
          if (mesh.userData.flak41Rig) {
            this.flak41Weapons.push({
              rig: mesh.userData.flak41Rig,
              block: b,
              localPos: localPos.clone(),
              currentYaw: (b.rotationY ?? 0) * (Math.PI / 2),
              currentPitch: 0,
              targetYaw: (b.rotationY ?? 0) * (Math.PI / 2),
              targetPitch: 0,
              fireCooldown: 0,
              recoil: 0,
              flashTimer: 0,
            });
          }
        } else {
          mesh = this.createBlockMesh(b.type, b.rotationY ?? 0, b.isAutoFloor, b.rotationX ?? 0, b.rotationZ ?? 0);
        }
        mesh.position.copy(localPos);
        this.rootGroup.add(mesh);
      }
    }

    // Build King Tiger II track assemblies for all contiguous track segments
    const trackSegments = findTrackSegments(blueprintBlocks);
    for (const seg of trackSegments) {
      const isLeft = seg.x > 0;
      const assembly = createKingTigerTrackMesh(seg.length, isLeft, false, this.trackTension);
      const centerX = seg.x * BLOCK_SIZE;
      const centerY = seg.y * BLOCK_SIZE + BLOCK_SIZE * 0.5;
      const centerZ = ((seg.minZ + seg.maxZ) / 2) * BLOCK_SIZE;

      assembly.group.position.set(centerX, centerY, centerZ);
      this.rootGroup.add(assembly.group);
      this.kingTigerAssemblies.push(assembly);
    }

    const trackZs = this.trackUnits.map((t) => t.block.z);
    this.maxTrackZ = trackZs.length > 0 ? Math.max(...trackZs) : 0;
    this.minTrackZ = trackZs.length > 0 ? Math.min(...trackZs) : 0;

    // Calculate highest point of vehicle in local coordinates (including tall weapon mounts)
    let maxY = 0.5;
    for (const b of blueprintBlocks) {
      let blockTop = b.y * BLOCK_SIZE + BLOCK_SIZE;
      if (b.type === 'WEAPON') {
        blockTop = b.y * BLOCK_SIZE + 1.55; // Tall Flak 41/44 mounts reach +1.55m
      }
      if (blockTop > maxY) maxY = blockTop;
    }
    this.maxLocalY = maxY;

    // Default engine power if none placed
    if (this.totalPowerWatts === 0) {
      this.totalPowerWatts = 120000;
    }
  }

  private createBlockMesh(
    type: BlockType,
    rotationY = 0,
    isAutoFloor = false,
    rotationX = 0,
    rotationZ = 0
  ): THREE.Group {
    const group = new THREE.Group();
    const def = BLOCK_DEFS[type];
    const s = BLOCK_SIZE;

    if (isAutoFloor) {
      const plateH = 0.08; // 8cm thin armored deck plate
      const floorGeo = new THREE.BoxGeometry(s, plateH, s);
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x3b4758,
        roughness: 0.60,
        metalness: 0.05,
      });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      // Position plate at top of cell y so its top surface sits flush at +s * 0.5 (y = 0.5m)
      floorMesh.position.y = (s * 0.5) - (plateH * 0.5);
      group.add(floorMesh);

      const edgeGeo = new THREE.EdgesGeometry(floorGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x111827,
        transparent: true,
        opacity: 0.40,
      });
      floorMesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

      // Top tread border rim
      const rimGeo = new THREE.BoxGeometry(s, 0.006, s);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x4f6074,
        roughness: 0.55,
        metalness: 0.08,
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = (s * 0.5) + 0.003;
      group.add(rimMesh);

      group.rotation.y = rotationY * (Math.PI / 2);
      return group;
    }

    if (type === 'ENGINE') {
      return createV12EngineMesh(rotationY, false);
    }

    if (type === 'COCKPIT') {
      const bGeo = new THREE.BoxGeometry(s, s, s);
      const bMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.50, metalness: 0.08 });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      group.add(bMesh);

      const edgeGeo = new THREE.EdgesGeometry(bGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.45,
      });
      bMesh.add(new THREE.LineSegments(edgeGeo, edgeMat));

      const vGeo = new THREE.BoxGeometry(s * 0.75, s * 0.3, s * 0.15);
      const vMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0ea5e9,
        emissiveIntensity: 0.9,
      });
      const visor = new THREE.Mesh(vGeo, vMat);
      visor.position.set(0, s * 0.1, s * 0.45);
      group.add(visor);
    } else {
      const bGeo = new THREE.BoxGeometry(s * 0.94, s * 0.94, s * 0.94);
      const bMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.60, metalness: 0.05 });
      const bMesh = new THREE.Mesh(bGeo, bMat);
      group.add(bMesh);

      const edgeGeo = new THREE.EdgesGeometry(bGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x0f172a,
        transparent: true,
        opacity: 0.45,
      });
      bMesh.add(new THREE.LineSegments(edgeGeo, edgeMat));
    }
    group.rotation.set(
      rotationX * (Math.PI / 2),
      rotationY * (Math.PI / 2),
      rotationZ * (Math.PI / 2)
    );
    return group;
  }

  public stepCruise(delta: -1 | 1): CruiseSpec {
    this.cruiseIndex = Math.max(0, Math.min(CRUISE_STAGES.length - 1, this.cruiseIndex + delta));
    return CRUISE_STAGES[this.cruiseIndex];
  }

  public clearCruise(): void {
    this.cruiseIndex = 2; // MAN (Manual)
  }

  public getCruiseSpec(): CruiseSpec {
    return CRUISE_STAGES[this.cruiseIndex];
  }

  public getGearSpec(): GearSpec {
    return GEAR_STAGES[this.autoGearIndex];
  }

  public getMaxVehicleSpeedKmh(): number {
    if (this.totalPowerWatts <= 0) return 0;
    const hpPerTon = this.getPowerToWeightHpPerTon();
    // Authentic tank dynamics based on actual power-to-weight ratio:
    // ~42 km/h for heavy tanks like King Tiger (~10-12 HP/t), ~58 km/h for medium tanks (~15-18 HP/t),
    // and up to ~88 km/h for light fast tanks or twin-engine builds.
    return Math.min(88, Math.max(12, 12 + 3.0 * hpPerTon));
  }

  public getGearMaxSpeedKmh(): number {
    return this.getMaxVehicleSpeedKmh() * this.getGearSpec().speedRatio;
  }

  public getPowerToWeightHpPerTon(): number {
    const massTon = Math.max(0.1, this.body.mass() / 1000);
    const totalHp = (this.totalPowerWatts * 1.341) / 1000;
    return totalHp / massTon;
  }

  // Backward-compatibility aliases
  public get gearIndex(): number {
    return this.autoGearIndex;
  }
  public set gearIndex(val: number) {
    this.autoGearIndex = val;
  }
  public shiftGear(delta: -1 | 1): GearSpec {
    this.autoGearIndex = Math.max(0, Math.min(GEAR_STAGES.length - 1, this.autoGearIndex + delta));
    return GEAR_STAGES[this.autoGearIndex];
  }

  private updateAutomaticGear(
    fixedDt: number,
    effectiveThrottle: number,
    forwardSpeed: number,
    maxVehSpeedKmh: number
  ): void {
    if (this.shiftCooldown > 0) {
      this.shiftCooldown -= fixedDt;
    }

    const currentSpeedKmh = Math.abs(forwardSpeed) * 3.6;
    const vMaxSafe = Math.max(5, maxVehSpeedKmh);
    const speedRatio = currentSpeedKmh / vMaxSafe; // 0.0 to 1.0

    // Reverse Gear Management (S key when stopped/reversing or R cruise)
    if (effectiveThrottle < -0.05 || (forwardSpeed < -0.35 && effectiveThrottle <= 0.05)) {
      let targetGearIndex = 1; // R1 (Crawler reverse: Index 1)
      if (currentSpeedKmh > 12.0) {
        targetGearIndex = 0; // R2 (Fast reverse: Index 0)
      } else if (currentSpeedKmh < 8.5) {
        targetGearIndex = 1; // R1
      }

      if (targetGearIndex !== this.autoGearIndex && this.shiftCooldown <= 0) {
        const isUp = targetGearIndex < this.autoGearIndex;
        this.autoGearIndex = targetGearIndex;
        this.shiftCooldown = 0.35;
        this.onGearShift?.(GEAR_STAGES[this.autoGearIndex], isUp);
      }
      return;
    }

    // Stopped / Idle: Keep primed in D1 for immediate launch torque
    if (Math.abs(effectiveThrottle) < 0.05 && currentSpeedKmh < 0.6) {
      if (this.autoGearIndex !== 3 && this.shiftCooldown <= 0) {
        this.autoGearIndex = 3; // D1
        this.shiftCooldown = 0.2;
      }
      return;
    }

    // Forward Gears (D1 to D5): Load-Sensing Automatic Gearbox
    // Load sensing: Heavy throttle (> 0.75) or struggling against slope = demand power (hold low gears)
    // Light throttle or steady cruising = upshift early to cruise smoothly ("ไหลยาว")
    const throttleDemand = Math.abs(effectiveThrottle);
    const isDemandingPower = throttleDemand > 0.75;

    let targetForwardGear = 1; // 1 to 5
    const currentGearStage = GEAR_STAGES[this.autoGearIndex].stage;

    // Shift thresholds with hysteresis:
    // Upshifts (accelerating):
    // 1 -> 2: ratio 0.17 (normal) / 0.21 (power)
    // 2 -> 3: ratio 0.34 (normal) / 0.40 (power)
    // 3 -> 4: ratio 0.54 (normal) / 0.61 (power)
    // 4 -> 5: ratio 0.72 (normal) / 0.81 (power) [Overdrive "ไหลยาว"]
    //
    // Downshifts (climbing hill / slowing / kickdown):
    // 5 -> 4: ratio 0.66 (normal) / 0.75 (power)
    // 4 -> 3: ratio 0.47 (normal) / 0.54 (power)
    // 3 -> 2: ratio 0.28 (normal) / 0.34 (power)
    // 2 -> 1: ratio 0.12 (normal) / 0.16 (power)

    if (currentGearStage === 1) {
      const upThresh = isDemandingPower ? 0.16 : 0.13;
      targetForwardGear = speedRatio >= upThresh ? 2 : 1;
    } else if (currentGearStage === 2) {
      const downThresh = isDemandingPower ? 0.11 : 0.08;
      const upThresh = isDemandingPower ? 0.35 : 0.30;
      if (speedRatio < downThresh) targetForwardGear = 1;
      else if (speedRatio >= upThresh) targetForwardGear = 3;
      else targetForwardGear = 2;
    } else if (currentGearStage === 3) {
      const downThresh = isDemandingPower ? 0.26 : 0.21;
      const upThresh = isDemandingPower ? 0.57 : 0.52;
      if (speedRatio < downThresh) targetForwardGear = 2;
      else if (speedRatio >= upThresh) targetForwardGear = 4;
      else targetForwardGear = 3;
    } else if (currentGearStage === 4) {
      const downThresh = isDemandingPower ? 0.48 : 0.43;
      const upThresh = isDemandingPower ? 0.77 : 0.72;
      if (speedRatio < downThresh) targetForwardGear = 3;
      else if (speedRatio >= upThresh) targetForwardGear = 5;
      else targetForwardGear = 4;
    } else if (currentGearStage === 5) {
      const downThresh = isDemandingPower ? 0.69 : 0.63;
      targetForwardGear = speedRatio < downThresh ? 4 : 5;
    } else {
      // Coming from Reverse or Neutral
      targetForwardGear = 1;
    }

    const newIndex = targetForwardGear + 2; // stage 1 is index 3, stage 5 is index 7
    if (newIndex !== this.autoGearIndex && this.shiftCooldown <= 0) {
      const isUp = newIndex > this.autoGearIndex;
      this.autoGearIndex = newIndex;
      this.shiftCooldown = 0.35; // 350ms delay between shifts for smooth tactile feel
      this.onGearShift?.(GEAR_STAGES[this.autoGearIndex], isUp);
    }
  }

  public stepPhysics(fixedDt: number, manualThrottle: number, steer: number): void {
    const rawPos = this.body.translation();
    const rawRot = this.body.rotation();
    const bodyPos = new THREE.Vector3(rawPos.x, rawPos.y, rawPos.z);
    const bodyQuat = new THREE.Quaternion(rawRot.x, rawRot.y, rawRot.z, rawRot.w);

    const fwdVec = new THREE.Vector3(0, 0, 1).applyQuaternion(bodyQuat).normalize();
    const upVec = new THREE.Vector3(0, 1, 0).applyQuaternion(bodyQuat).normalize();
    const rightVec = new THREE.Vector3(-1, 0, 0).applyQuaternion(bodyQuat).normalize(); // -X is Right

    // Linear velocity & Speed
    const linVel = this.body.linvel();
    const worldVel = new THREE.Vector3(linVel.x, linVel.y, linVel.z);
    const forwardSpeed = worldVel.dot(fwdVec);
    this.signedSpeedKmh = forwardSpeed * 3.6;
    this.currentSpeedKmh = Math.abs(this.signedSpeedKmh);

    const maxVehSpeedKmh = this.getMaxVehicleSpeedKmh();
    const cruise = this.getCruiseSpec();

    let effectiveThrottle = 0;
    let isServiceBraking = false;

    const hasManualThrottle = Math.abs(manualThrottle) > 0.05;

    if (hasManualThrottle) {
      // Manual WASD input
      if (cruise.stage > 0 && manualThrottle < -0.05) {
        // Tapping S while cruise is forward cancels cruise!
        this.cruiseIndex = 2; // MAN
        if (forwardSpeed > 0.15) {
          isServiceBraking = true;
        } else {
          effectiveThrottle = manualThrottle;
        }
      } else {
        effectiveThrottle = manualThrottle;
      }
    } else if (cruise.stage !== 0) {
      // Cruise Control / Speed Lock is Active
      const targetSpeedKmh = cruise.speedFraction * (cruise.isReverse ? maxVehSpeedKmh * 0.65 : maxVehSpeedKmh);
      const targetSpeedMs = (cruise.isReverse ? -1 : 1) * (targetSpeedKmh / 3.6);
      const speedDiff = targetSpeedMs - forwardSpeed;

      // Proportional speed-lock controller
      effectiveThrottle = THREE.MathUtils.clamp(speedDiff * 1.8, -1.0, 1.0);
    }

    // Update Automatic Gear based on vehicle speed, throttle load, and power demand
    this.updateAutomaticGear(fixedDt, effectiveThrottle, forwardSpeed, maxVehSpeedKmh);
    const gear = this.getGearSpec();
    const gearMaxSpeedKmh = maxVehSpeedKmh * gear.speedRatio;
    const gearMaxSpeedMs = gearMaxSpeedKmh / 3.6;

    // Determine auto-braking and service braking
    if (!hasManualThrottle && cruise.stage === 0 && Math.abs(steer) < 0.05) {
      // User has released all controls and cruise is OFF -> Auto-brake!
      this.isAutoBraking = true;
    } else if (hasManualThrottle && manualThrottle < -0.05 && forwardSpeed > 0.20) {
      // Pressing S while moving forward fast -> Service brake!
      isServiceBraking = true;
      this.isAutoBraking = false;
    } else {
      this.isAutoBraking = false;
    }

    // High-speed Coasting Steer mode: user has released throttle at speed and is steering
    const isCoastingSteer = Math.abs(effectiveThrottle) <= 0.05 && Math.abs(steer) > 0.05 && Math.abs(forwardSpeed) > 0.8;

    // Track Differential Drive calculations
    if (this.isAutoBraking || isServiceBraking) {
      this.leftTrackPower = 0;
      this.rightTrackPower = 0;
    } else if (Math.abs(effectiveThrottle) > 0.05) {
      if (effectiveThrottle > 0) {
        // Forward driving: Clutch-Brake Steering
        if (steer > 0) {
          this.leftTrackPower = effectiveThrottle;
          this.rightTrackPower = effectiveThrottle * Math.max(-0.75, 1.0 - steer * 2.0);
        } else if (steer < 0) {
          const sAbs = Math.abs(steer);
          this.rightTrackPower = effectiveThrottle;
          this.leftTrackPower = effectiveThrottle * Math.max(-0.75, 1.0 - sAbs * 2.0);
        } else {
          this.leftTrackPower = effectiveThrottle;
          this.rightTrackPower = effectiveThrottle;
        }
      } else {
        // Reverse driving (effectiveThrottle < 0)
        if (steer > 0) {
          this.rightTrackPower = effectiveThrottle;
          this.leftTrackPower = effectiveThrottle * Math.max(-0.75, 1.0 - steer * 2.0);
        } else if (steer < 0) {
          const sAbs = Math.abs(steer);
          this.leftTrackPower = effectiveThrottle;
          this.rightTrackPower = effectiveThrottle * Math.max(-0.75, 1.0 - sAbs * 2.0);
        } else {
          this.leftTrackPower = effectiveThrottle;
          this.rightTrackPower = effectiveThrottle;
        }
      }
    } else if (isCoastingSteer) {
      // High-speed Coasting Skid Turn (ปล่อย W ขณะวิ่งเร็วแล้วกดเลี้ยว)
      // Carves decisively into the turn with rolling outer power and effective inner brake
      const sAbs = Math.abs(steer);
      const outerRollingPower = Math.min(0.85, 0.40 + (Math.abs(forwardSpeed) / Math.max(1.0, gearMaxSpeedMs)) * 0.45) * sAbs;
      const innerBrakeFactor = -0.70 * sAbs;

      if (forwardSpeed > 0.8) {
        // Forward coasting turn
        if (steer > 0) {
          // Turning Right: Left track rolls forward, Right track brakes
          this.leftTrackPower = outerRollingPower;
          this.rightTrackPower = innerBrakeFactor;
        } else {
          // Turning Left: Right track rolls forward, Left track brakes
          this.rightTrackPower = outerRollingPower;
          this.leftTrackPower = innerBrakeFactor;
        }
      } else {
        // Reverse coasting turn
        if (steer > 0) {
          this.rightTrackPower = -outerRollingPower;
          this.leftTrackPower = -innerBrakeFactor;
        } else {
          this.leftTrackPower = -outerRollingPower;
          this.rightTrackPower = -innerBrakeFactor;
        }
      }
    } else if (Math.abs(steer) > 0.05) {
      // Stopped / Low-speed: High-torque Neutral Pivot Turn (หมุนตัวอยู่กับที่)
      const pivotPwr = 1.45;
      if (steer > 0) {
        this.leftTrackPower = steer * pivotPwr;
        this.rightTrackPower = -steer * pivotPwr;
      } else {
        const sAbs = Math.abs(steer);
        this.leftTrackPower = -sAbs * pivotPwr;
        this.rightTrackPower = sAbs * pivotPwr;
      }
    }

    // Ground raycast for each Track Unit
    const mass = this.body.mass();
    const trackCount = Math.max(1, this.trackUnits.length);
    const weightPerTrack = (mass * 9.81) / trackCount;
    const maxTractionPerTrack = weightPerTrack * 1.35;

    // Drive Propulsion Force governed by Total Engine Power, Total Mass, and Gear Ratio
    const vRef = 4.5; // Reference launch speed (m/s)
    const nominalDriveForce = this.totalPowerWatts > 0
      ? (this.totalPowerWatts / vRef) * gear.torqueRatio
      : 0;
    // Physical track friction traction limit (mu * mass * g)
    const maxTractionTotal = mass * 9.81 * 1.35;
    const totalAvailableThrust = Math.min(maxTractionTotal, nominalDriveForce);
    const baseThrustPerTrack = totalAvailableThrust / trackCount;

    // Speed governor factor for the active gear:
    // Full engine thrust throughout operating rev range, smooth governor roll-off at gear redline
    const currentSpeedAbs = Math.abs(forwardSpeed);
    let speedFactor = 1.0;
    if (gearMaxSpeedMs > 0.1) {
      const speedRatioInGear = currentSpeedAbs / gearMaxSpeedMs;
      if (speedRatioInGear > 0.88) {
        speedFactor = Math.max(0.0, 1.0 - (speedRatioInGear - 0.88) / 0.12);
      }
    }

    let groundedCount = 0;

    for (const t of this.trackUnits) {
      t.prevSuspLength = t.currSuspLength;
      t.prevWheelSpin = t.currWheelSpin;

      const worldAnchor = t.localAnchor.clone().applyQuaternion(bodyQuat).add(bodyPos);
      const downDir = upVec.clone().negate();

      // Cast ray downwards
      const ray = new RAPIER.Ray(
        { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
        { x: downDir.x, y: downDir.y, z: downDir.z }
      );

      const hit = this.world.castRayAndGetNormal(
        ray,
        this.suspRestLength,
        true,
        undefined,
        undefined,
        undefined,
        this.body
      );

      if (hit && hit.timeOfImpact > 0.03) {
        t.isGrounded = true;
        groundedCount++;
        const currentLength = hit.timeOfImpact;
        t.currSuspLength = currentLength;
        const compression = Math.max(0, this.suspRestLength - currentLength);
        t.compression = compression / this.suspRestLength;

        // Suspension Spring & Damping Force (Harmonic critically damped)
        const pointVel = this.getPointVelocity(worldAnchor, bodyPos);
        const suspSpeed = pointVel.dot(downDir); // positive = compressing
        const k = this.suspStiffness * weightPerTrack;
        const c = 2.0 * this.suspDampingRatio * Math.sqrt(k * (mass / trackCount));

        const springForceN = Math.max(0, compression * k + suspSpeed * c);
        const normalForce = upVec.clone().multiplyScalar(springForceN * fixedDt);
        this.body.applyImpulseAtPoint(
          { x: normalForce.x, y: normalForce.y, z: normalForce.z },
          { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
          true
        );

        // Lateral friction across tracks: allows skid-steer sliding when steering
        const lateralSpeed = pointVel.dot(rightVec);
        const isSteering = Math.abs(steer) > 0.05;

        // Decouple chassis side-drift from yaw rotation scrub during steering
        const chassisLatVel = worldVel.dot(rightVec);
        const yawLatVel = lateralSpeed - chassisLatVel;

        let effectiveLatSpeed = lateralSpeed;
        if (isSteering) {
          // When actively steering, allow track treads to slide along yaw arc (controlled scrub)
          // while retaining lateral grip against chassis side-sliding
          const speedMag = Math.abs(forwardSpeed);
          const yawScrubFactor = Math.max(0.08, 0.25 - speedMag * 0.012);
          const driftGripFactor = Math.max(0.55, 0.80 - speedMag * 0.018);
          effectiveLatSpeed = chassisLatVel * driftGripFactor + yawLatVel * yawScrubFactor;
        }

        const latImpulse = rightVec.clone().multiplyScalar(-effectiveLatSpeed * (mass / trackCount) * 0.85);
        this.body.applyImpulseAtPoint(
          { x: latImpulse.x, y: latImpulse.y, z: latImpulse.z },
          { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
          true
        );

        const forwardSpeedAtPoint = pointVel.dot(fwdVec);

        if (this.isAutoBraking) {
          // Automatic Braking: apply realistic track friction with momentum slide (natural inertia)
          const maxBrakeN = weightPerTrack * 0.95;
          const brakeImpulseVal = Math.min(Math.abs(forwardSpeedAtPoint) * (mass / trackCount), maxBrakeN * fixedDt);
          const brakeVec = fwdVec.clone().multiplyScalar(-Math.sign(forwardSpeedAtPoint) * brakeImpulseVal);
          this.body.applyImpulseAtPoint(
            { x: brakeVec.x, y: brakeVec.y, z: brakeVec.z },
            { x: bodyPos.x, y: worldAnchor.y, z: worldAnchor.z },
            true
          );

          // Spin road wheels visually while slowing down (authentic 760mm / R=0.38m drive sprocket)
          const spinDelta = (forwardSpeedAtPoint / 0.38) * fixedDt;
          t.currWheelSpin += spinDelta;
        } else if (isServiceBraking) {
          // Active Service Braking (Holding S in forward gear or W while reversing)
          // Apply balanced longitudinal braking along vehicle centerline to prevent asymmetric yaw spinout
          const maxBrakeN = weightPerTrack * 2.0;
          const brakeImpulseVal = Math.min(Math.abs(forwardSpeedAtPoint) * (mass / trackCount), maxBrakeN * fixedDt);
          const brakeVec = fwdVec.clone().multiplyScalar(-Math.sign(forwardSpeedAtPoint) * brakeImpulseVal);
          this.body.applyImpulseAtPoint(
            { x: brakeVec.x, y: brakeVec.y, z: brakeVec.z },
            { x: bodyPos.x, y: worldAnchor.y, z: worldAnchor.z },
            true
          );

          const spinDelta = (forwardSpeedAtPoint / 0.38) * fixedDt;
          t.currWheelSpin += spinDelta;
        } else {
          // Drive Propulsion Force with gear speed governor and power-to-weight scaling
          const trackPwr = t.isLeft ? this.leftTrackPower : this.rightTrackPower;
          let driveForceN = 0;
          if (Math.abs(effectiveThrottle) > 0.05) {
            driveForceN = baseThrustPerTrack * trackPwr * speedFactor;
          } else if (isCoastingSteer) {
            // High-speed coasting turn:
            // Outer track maintains forward rolling drive, inner track applies dynamic braking against forward velocity!
            if (forwardSpeed > 0.8) {
              if (trackPwr > 0) {
                driveForceN = baseThrustPerTrack * trackPwr * speedFactor;
              } else {
                const maxBrakeN = weightPerTrack * 1.8 * Math.abs(trackPwr);
                driveForceN = -Math.sign(forwardSpeedAtPoint) * Math.min(Math.abs(forwardSpeedAtPoint) * (mass / trackCount), maxBrakeN);
              }
            } else {
              // Reverse coasting
              if (trackPwr < 0) {
                driveForceN = baseThrustPerTrack * trackPwr * speedFactor;
              } else {
                const maxBrakeN = weightPerTrack * 1.8 * Math.abs(trackPwr);
                driveForceN = -Math.sign(forwardSpeedAtPoint) * Math.min(Math.abs(forwardSpeedAtPoint) * (mass / trackCount), maxBrakeN);
              }
            }
          } else {
            // Neutral / Stationary Pivot Turn torque
            driveForceN = (maxTractionPerTrack * 0.90) * trackPwr;
          }

          const driveImpulse = fwdVec.clone().multiplyScalar(driveForceN * fixedDt);
          this.body.applyImpulseAtPoint(
            { x: driveImpulse.x, y: driveImpulse.y, z: driveImpulse.z },
            { x: worldAnchor.x, y: worldAnchor.y, z: worldAnchor.z },
            true
          );

          // Spin road wheels visually (authentic 760mm / R=0.38m drive sprocket)
          const spinDelta = (forwardSpeedAtPoint / 0.38) * fixedDt;
          t.currWheelSpin += spinDelta;
        }
      } else {
        t.isGrounded = false;
        t.currSuspLength = this.suspRestLength;
        t.compression = 0;
      }

      const myTrackPower = t.isLeft ? this.leftTrackPower : this.rightTrackPower;

      // Front Obstacle & Step Climbing (Authentic 860mm Sprocket & Grouser Track Bite)
      // Allows tank to crawl over vertical steps, rocks, and obstacles up to 0.85m in low gears!
      if (t.block.z === this.maxTrackZ && myTrackPower > 0.05) {
        const frontBase = worldAnchor.clone().addScaledVector(fwdVec, 0.40);
        // 1. Low-mid raycast (detects bumps, logs, curbs: 0.15m to 0.45m)
        const frontLow = frontBase.clone().addScaledVector(upVec, 0.12);
        const dirLow = fwdVec.clone().addScaledVector(downDir, 0.45).normalize();
        const hitLow = this.world.castRayAndGetNormal(
          new RAPIER.Ray({ x: frontLow.x, y: frontLow.y, z: frontLow.z }, { x: dirLow.x, y: dirLow.y, z: dirLow.z }),
          0.50,
          true,
          undefined,
          undefined,
          undefined,
          this.body
        );

        // 2. High-step raycast (detects vertical steps, boulders, ledges: 0.45m to 0.85m)
        const frontHigh = frontBase.clone().addScaledVector(upVec, 0.46);
        const dirHigh = fwdVec.clone().addScaledVector(downDir, 0.20).normalize();
        const hitHigh = this.world.castRayAndGetNormal(
          new RAPIER.Ray({ x: frontHigh.x, y: frontHigh.y, z: frontHigh.z }, { x: dirHigh.x, y: dirHigh.y, z: dirHigh.z }),
          0.55,
          true,
          undefined,
          undefined,
          undefined,
          this.body
        );

        const climbHit = hitHigh ?? hitLow;
        if (climbHit && climbHit.normal) {
          const normalVec = new THREE.Vector3(climbHit.normal.x, climbHit.normal.y, climbHit.normal.z);
          // Only trigger if surface is an OBSTACLE facing against vehicle nose
          if (normalVec.dot(fwdVec) < -0.15) {
            const torqueMult = Math.max(1.0, Math.min(3.2, gear.torqueRatio));
            const climbPower = Math.min(1.0, Math.abs(myTrackPower));

            // Sized to lift the tank's nose over vertical steps up to 0.85m
            const liftForceN = (mass * 9.81 * 0.88 * torqueMult * climbPower) / 2;
            const liftImpulse = upVec.clone().multiplyScalar(liftForceN * fixedDt);
            this.body.applyImpulseAtPoint(
              { x: liftImpulse.x, y: liftImpulse.y, z: liftImpulse.z },
              { x: frontHigh.x, y: frontHigh.y, z: frontHigh.z },
              true
            );

            // Forward grouser traction pulling vehicle over lip
            const pullForceN = (mass * 9.81 * 1.15 * torqueMult * climbPower) / 2;
            const pullImpulse = fwdVec.clone().multiplyScalar(pullForceN * fixedDt);
            this.body.applyImpulseAtPoint(
              { x: pullImpulse.x, y: pullImpulse.y, z: pullImpulse.z },
              { x: frontHigh.x, y: frontHigh.y, z: frontHigh.z },
              true
            );
          }
        }
      }

      // Rear Obstacle Climbing (Reversing over obstacles with 660mm idler)
      if (t.block.z === this.minTrackZ && myTrackPower < -0.05) {
        const rearBase = worldAnchor.clone().addScaledVector(fwdVec, -0.32);
        const rearLow = rearBase.clone().addScaledVector(upVec, 0.12);
        const dirRearLow = fwdVec.clone().negate().addScaledVector(downDir, 0.45).normalize();
        const hitLow = this.world.castRayAndGetNormal(
          new RAPIER.Ray({ x: rearLow.x, y: rearLow.y, z: rearLow.z }, { x: dirRearLow.x, y: dirRearLow.y, z: dirRearLow.z }),
          0.48,
          true,
          undefined,
          undefined,
          undefined,
          this.body
        );

        const rearHigh = rearBase.clone().addScaledVector(upVec, 0.44);
        const dirRearHigh = fwdVec.clone().negate().addScaledVector(downDir, 0.20).normalize();
        const hitHigh = this.world.castRayAndGetNormal(
          new RAPIER.Ray({ x: rearHigh.x, y: rearHigh.y, z: rearHigh.z }, { x: dirRearHigh.x, y: dirRearHigh.y, z: dirRearHigh.z }),
          0.52,
          true,
          undefined,
          undefined,
          undefined,
          this.body
        );

        const climbHit = hitHigh ?? hitLow;
        if (climbHit && climbHit.normal) {
          const normalVec = new THREE.Vector3(climbHit.normal.x, climbHit.normal.y, climbHit.normal.z);
          if (normalVec.dot(fwdVec) > 0.15) {
            const torqueMult = Math.max(1.0, Math.min(3.2, gear.torqueRatio));
            const climbPower = Math.min(1.0, Math.abs(myTrackPower));

            const liftForceN = (mass * 9.81 * 0.88 * torqueMult * climbPower) / 2;
            const liftImpulse = upVec.clone().multiplyScalar(liftForceN * fixedDt);
            this.body.applyImpulseAtPoint(
              { x: liftImpulse.x, y: liftImpulse.y, z: liftImpulse.z },
              { x: rearHigh.x, y: rearHigh.y, z: rearHigh.z },
              true
            );

            const pullForceN = (mass * 9.81 * 1.15 * torqueMult * climbPower) / 2;
            const pullImpulse = fwdVec.clone().multiplyScalar(-pullForceN * fixedDt);
            this.body.applyImpulseAtPoint(
              { x: pullImpulse.x, y: pullImpulse.y, z: pullImpulse.z },
              { x: rearHigh.x, y: rearHigh.y, z: rearHigh.z },
              true
            );
          }
        }
      }
    }

    // Anti-High-Centering Belly Crawl:
    // If the vehicle is straddling a log, ridge crest, or bump, and road wheels are partially unweighted,
    // continuous track treads and grousers still contact the obstacle and propel the vehicle forward!
    if (groundedCount < 4 && Math.abs(effectiveThrottle) > 0.05) {
      const downDir = upVec.clone().negate();
      const bellyRay = new RAPIER.Ray(
        { x: bodyPos.x, y: bodyPos.y + 0.15, z: bodyPos.z },
        { x: downDir.x, y: downDir.y, z: downDir.z }
      );
      const bellyHit = this.world.castRayAndGetNormal(bellyRay, 0.65, true, undefined, undefined, undefined, this.body);
      if (bellyHit) {
        const crawlPower = Math.sign(effectiveThrottle);
        const crawlImpulse = fwdVec.clone().multiplyScalar(mass * 9.81 * 0.85 * crawlPower * fixedDt);
        this.body.applyImpulse({ x: crawlImpulse.x, y: crawlImpulse.y, z: crawlImpulse.z }, true);
      }
    }

    // Straight-line service braking stabilization: actively damp unwanted yaw rotation
    if (isServiceBraking && Math.abs(steer) < 0.05) {
      const currentAngVel = this.body.angvel();
      const stabTorque = -currentAngVel.y * mass * 0.85;
      const stabImpulse = upVec.clone().multiplyScalar(stabTorque * fixedDt);
      this.body.applyTorqueImpulse({ x: stabImpulse.x, y: stabImpulse.y, z: stabImpulse.z }, true);
    }

    // Direct yaw assist torque for crisp, agile tankette handling
    if (Math.abs(steer) > 0.05 && groundedCount >= 1) {
      // Steer > 0 is turning RIGHT (negative Y angular impulse in Three/Rapier)
      // Steer < 0 is turning LEFT (positive Y angular impulse)
      const speedMag = Math.abs(forwardSpeed);
      const isCoasting = Math.abs(effectiveThrottle) <= 0.05 && speedMag > 0.8;

      // Dynamic speed scaling: higher forward speed = faster and more responsive turn entry
      const speedYawMultiplier = isCoasting
        ? Math.min(2.5, 1.2 + speedMag * 0.12)
        : Math.min(2.0, 1.0 + speedMag * 0.08);

      const baseTorque = isCoasting ? 16.0 : 14.0;
      const yawTorqueN = -steer * mass * (baseTorque * speedYawMultiplier);
      const yawImpulse = upVec.clone().multiplyScalar(yawTorqueN * fixedDt);

      // Yaw rate governor: ensures snappy rotation while preventing uncontrollable spinouts
      const currentAngVel = this.body.angvel();
      const currentYawRate = currentAngVel.y;
      const maxYawRate = isCoasting ? 2.6 : 2.4; // rad/s (~138 - 150 deg/s)

      const isTurningRight = steer > 0;
      if ((isTurningRight && currentYawRate > -maxYawRate) || (!isTurningRight && currentYawRate < maxYawRate)) {
        this.body.applyTorqueImpulse({ x: yawImpulse.x, y: yawImpulse.y, z: yawImpulse.z }, true);
      }
    }

    // Hill-hold: engage when vehicle has smoothly coasted down to near-stop (< 0.6 km/h)
    // Firmly locks vehicle in place on hills and slopes so it doesn't roll away
    if (this.isAutoBraking && groundedCount >= 4 && Math.abs(forwardSpeed) < 0.18) {
      const lv = this.body.linvel();
      this.body.setLinvel({ x: lv.x * 0.65, y: lv.y, z: lv.z * 0.65 }, true);
    }
  }

  private getPointVelocity(worldPoint: THREE.Vector3, comWorld: THREE.Vector3): THREE.Vector3 {
    const lv = this.body.linvel();
    const av = this.body.angvel();
    const r = worldPoint.clone().sub(comWorld);
    const omega = new THREE.Vector3(av.x, av.y, av.z);
    const tangential = new THREE.Vector3().crossVectors(omega, r);
    return new THREE.Vector3(lv.x, lv.y, lv.z).add(tangential);
  }

  public captureCurrentTransform(): void {
    this.prevPosition.copy(this.currPosition);
    this.prevQuaternion.copy(this.currQuaternion);

    const pos = this.body.translation();
    const rot = this.body.rotation();
    this.currPosition.set(pos.x, pos.y, pos.z);
    this.currQuaternion.set(rot.x, rot.y, rot.z, rot.w);
  }

  public syncVisuals(alpha = 1.0): void {
    this.renderPosition.lerpVectors(this.prevPosition, this.currPosition, alpha);
    this.renderQuaternion.slerpQuaternions(this.prevQuaternion, this.currQuaternion, alpha);

    this.rootGroup.position.copy(this.renderPosition);
    this.rootGroup.quaternion.copy(this.renderQuaternion);

    // Calculate interpolated wheel spin for left and right track assemblies
    const leftUnits = this.trackUnits.filter((t) => t.isLeft);
    const rightUnits = this.trackUnits.filter((t) => !t.isLeft);

    let leftSpin = 0;
    if (leftUnits.length > 0) {
      let sum = 0;
      for (const u of leftUnits) {
        sum += THREE.MathUtils.lerp(u.prevWheelSpin, u.currWheelSpin, alpha);
      }
      leftSpin = sum / leftUnits.length;
    }

    let rightSpin = 0;
    if (rightUnits.length > 0) {
      let sum = 0;
      for (const u of rightUnits) {
        sum += THREE.MathUtils.lerp(u.prevWheelSpin, u.currWheelSpin, alpha);
      }
      rightSpin = sum / rightUnits.length;
    }

    for (const assembly of this.kingTigerAssemblies) {
      if (assembly.isLeft) {
        assembly.setSpin(leftSpin);
        assembly.setSuspension((localZ) => {
          const bodyZ = assembly.group.position.z + localZ;
          return this.getSuspensionTravelAtZ(true, bodyZ, alpha);
        });
      } else {
        assembly.setSpin(rightSpin);
        assembly.setSuspension((localZ) => {
          const bodyZ = assembly.group.position.z + localZ;
          return this.getSuspensionTravelAtZ(false, bodyZ, alpha);
        });
      }
    }
  }

  private getSuspensionTravelAtZ(isLeft: boolean, zCoord: number, alpha = 1.0): number {
    const units = this.trackUnits.filter((t) => t.isLeft === isLeft);
    if (units.length === 0) return 0;

    units.sort((a, b) => a.localAnchor.z - b.localAnchor.z);

    if (zCoord <= units[0].localAnchor.z) {
      const u = units[0];
      const curLen = THREE.MathUtils.lerp(u.prevSuspLength, u.currSuspLength, alpha);
      return this.suspRestLength - curLen;
    }

    if (zCoord >= units[units.length - 1].localAnchor.z) {
      const u = units[units.length - 1];
      const curLen = THREE.MathUtils.lerp(u.prevSuspLength, u.currSuspLength, alpha);
      return this.suspRestLength - curLen;
    }

    for (let i = 0; i < units.length - 1; i++) {
      const u0 = units[i];
      const u1 = units[i + 1];
      if (zCoord >= u0.localAnchor.z && zCoord <= u1.localAnchor.z) {
        const span = u1.localAnchor.z - u0.localAnchor.z;
        const t = span > 0.001 ? (zCoord - u0.localAnchor.z) / span : 0;
        const len0 = THREE.MathUtils.lerp(u0.prevSuspLength, u0.currSuspLength, alpha);
        const len1 = THREE.MathUtils.lerp(u1.prevSuspLength, u1.currSuspLength, alpha);
        const travel0 = this.suspRestLength - len0;
        const travel1 = this.suspRestLength - len1;
        return THREE.MathUtils.lerp(travel0, travel1, t);
      }
    }

    const curLen = THREE.MathUtils.lerp(units[0].prevSuspLength, units[0].currSuspLength, alpha);
    return this.suspRestLength - curLen;
  }

  private lastAtLimit = false;

  public setAimTarget(worldAimPoint: THREE.Vector3): void {
    const invVehicleQuat = this.rootGroup.quaternion.clone().invert();
    let atLimit = false;

    // Aim 3.7cm Flak 44 autocannons
    for (const flak of this.flakWeapons) {
      const worldWeaponPos = this.rootGroup.localToWorld(flak.localPos.clone());
      const worldAimDir = worldAimPoint.clone().sub(worldWeaponPos);
      const localAimDir = worldAimDir.applyQuaternion(invVehicleQuat);

      flak.targetYaw = Math.atan2(localAimDir.x, localAimDir.z);
      const horizDist = Math.hypot(localAimDir.x, localAimDir.z);
      const rawPitch = Math.atan2(localAimDir.y, horizDist);
      if (rawPitch < -0.14 || rawPitch > 1.48) {
        atLimit = true;
      }
      flak.targetPitch = THREE.MathUtils.clamp(rawPitch, -0.14, 1.48);
    }

    // Aim 8.8cm Flak 41 heavy cannons (-5° to +85° elevation)
    for (const flak of this.flak41Weapons) {
      const worldWeaponPos = this.rootGroup.localToWorld(flak.localPos.clone());
      const worldAimDir = worldAimPoint.clone().sub(worldWeaponPos);
      const localAimDir = worldAimDir.applyQuaternion(invVehicleQuat);

      flak.targetYaw = Math.atan2(localAimDir.x, localAimDir.z);
      const horizDist = Math.hypot(localAimDir.x, localAimDir.z);
      const rawPitch = Math.atan2(localAimDir.y, horizDist);
      if (rawPitch < -0.087 || rawPitch > 1.48) {
        atLimit = true;
      }
      flak.targetPitch = THREE.MathUtils.clamp(rawPitch, -0.087, 1.48);
    }

    this.lastAtLimit = atLimit;
  }

  public fireWeapons(): FireResult {
    let firedAny = false;
    let count = 0;
    let fired44 = false;
    let fired41 = false;

    // 1. Fire Flak 44 autocannons (high cyclic rate)
    for (const flak of this.flakWeapons) {
      if (flak.fireCooldown > 0) continue;

      flak.fireCooldown = 0.11; // ~540 RPM cyclic rate
      firedAny = true;
      fired44 = true;
      count++;

      const isLeft = flak.nextBarrelLeft;
      flak.nextBarrelLeft = !flak.nextBarrelLeft;

      // Recoil active barrel & ignite muzzle flash
      if (isLeft) {
        flak.recoilL = -0.14;
        flak.flashTimerL = 0.05;
        flak.rig.muzzleFlashL.intensity = 18;
        (flak.rig.flashMeshL.material as THREE.MeshBasicMaterial).opacity = 0.95;
      } else {
        flak.recoilR = -0.14;
        flak.flashTimerR = 0.05;
        flak.rig.muzzleFlashR.intensity = 18;
        (flak.rig.flashMeshR.material as THREE.MeshBasicMaterial).opacity = 0.95;
      }

      // Compute muzzle world origin and firing vector
      const muzzleObj = isLeft ? flak.rig.muzzleFlashL : flak.rig.muzzleFlashR;
      const muzzleWorldPos = new THREE.Vector3();
      muzzleObj.getWorldPosition(muzzleWorldPos);

      const fireDir = new THREE.Vector3(0, 0, 1);
      flak.rig.pitchPivot.getWorldDirection(fireDir);

      this.spawnTracer(muzzleWorldPos, fireDir);
    }

    // 2. Fire 8.8cm Flak 41 heavy cannons (massive single punch, physical chassis recoil)
    for (const flak of this.flak41Weapons) {
      if (flak.fireCooldown > 0) continue;

      flak.fireCooldown = 1.25; // Authentic heavy semi-automatic reload
      firedAny = true;
      fired41 = true;
      count++;

      // Recoil heavy sliding barrel assembly into cradle & ignite massive muzzle blast
      flak.recoil = -0.55; // 55cm deep authentic recoil stroke
      flak.flashTimer = 0.14;
      flak.rig.muzzleFlash.intensity = 45;
      (flak.rig.flashMesh.material as THREE.MeshBasicMaterial).opacity = 1.0;

      // Get muzzle world position and firing direction
      const muzzleWorldPos = new THREE.Vector3();
      flak.rig.muzzleFlash.getWorldPosition(muzzleWorldPos);

      const fireDir = new THREE.Vector3(0, 0, 1);
      flak.rig.pitchPivot.getWorldDirection(fireDir);

      // Physical Chassis Recoil Impulse:
      // Pushes the entire tank backwards and compresses front suspension!
      const recoilImpulseN = 3200; // N*s for 8.8cm heavy punch
      const recoilVec = fireDir.clone().negate().multiplyScalar(recoilImpulseN);
      this.body.applyImpulseAtPoint(
        { x: recoilVec.x, y: recoilVec.y, z: recoilVec.z },
        { x: muzzleWorldPos.x, y: muzzleWorldPos.y, z: muzzleWorldPos.z },
        true
      );

      // Spawn 88mm high-velocity heavy shell
      this.spawnHeavy88Shell(muzzleWorldPos, fireDir);
    }

    return { fired: firedAny, count, fired44, fired41 };
  }

  private spawnTracer(origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (!this.projectilePool) {
      // 37mm tracer shell geometry
      const tracerGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.45, 6);
      tracerGeo.rotateX(Math.PI / 2);
      this.projectilePool = tracerGeo;
      this.projectileMat = new THREE.MeshBasicMaterial({
        color: 0xffe066,
      });
    }

    const mesh = new THREE.Mesh(this.projectilePool, this.projectileMat!);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(mesh);

    const muzzleVel = 160; // 160 m/s tracer velocity
    this.projectiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(muzzleVel),
      life: 1.4,
      isHeavy88: false,
    });
  }

  private spawnHeavy88Shell(origin: THREE.Vector3, dir: THREE.Vector3): void {
    if (!this.shell88Geo) {
      // 88mm heavy projectile geometry
      const shellGeo = new THREE.CylinderGeometry(0.048, 0.052, 0.72, 8);
      shellGeo.rotateX(Math.PI / 2);
      this.shell88Geo = shellGeo;
      this.shell88Mat = new THREE.MeshBasicMaterial({
        color: 0xff5511, // Glowing high-explosive armor-piercing core
      });
    }

    const mesh = new THREE.Mesh(this.shell88Geo, this.shell88Mat!);
    mesh.position.copy(origin);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    this.scene.add(mesh);

    const muzzleVel = 320; // 320 m/s high-velocity heavy shell
    this.projectiles.push({
      mesh,
      pos: origin.clone(),
      vel: dir.clone().multiplyScalar(muzzleVel),
      life: 2.5,
      isHeavy88: true,
    });
  }

  /**
   * War Thunder Slewing Kinematics:
   * Moves an angle towards target using shortest path wraparound [-PI, PI] and realistic angular speed (rad/s)
   */
  private stepSlewAngle(current: number, target: number, speedRadPerSec: number, dt: number): { angle: number; isMoving: boolean; diff: number } {
    let diff = target - current;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;

    const absDiff = Math.abs(diff);
    if (absDiff < 0.0006) {
      return { angle: target, isMoving: false, diff: 0 };
    }

    // Smooth mechanical ease-out when within 3 degrees
    const ease = absDiff < 0.052 ? Math.max(0.18, absDiff / 0.052) : 1.0;
    const maxStep = Math.max(0.0015, speedRadPerSec * ease * dt);

    if (absDiff <= maxStep) {
      return { angle: target, isMoving: false, diff: 0 };
    } else {
      const nextAngle = current + Math.sign(diff) * maxStep;
      return { angle: nextAngle, isMoving: true, diff: absDiff - maxStep };
    }
  }

  private stepSlewPitch(current: number, target: number, speedRadPerSec: number, dt: number): { pitch: number; isMoving: boolean; diff: number } {
    const diff = target - current;
    const absDiff = Math.abs(diff);
    if (absDiff < 0.0006) {
      return { pitch: target, isMoving: false, diff: 0 };
    }

    const ease = absDiff < 0.035 ? Math.max(0.18, absDiff / 0.035) : 1.0;
    const maxStep = Math.max(0.0015, speedRadPerSec * ease * dt);

    if (absDiff <= maxStep) {
      return { pitch: target, isMoving: false, diff: 0 };
    } else {
      const nextPitch = current + Math.sign(diff) * maxStep;
      return { pitch: nextPitch, isMoving: true, diff: Math.abs(target - nextPitch) };
    }
  }

  public updateWeapons(dt: number): { isTraversing: boolean; isAligned: boolean; diffDeg: number; isAtLimit: boolean } {
    let isAnyTraversing = false;
    let maxDiffRad = 0;

    // 1. Update 3.7cm Flak 44 slewing (Traverse: 48°/s = 0.838 rad/s, Elevation: 36°/s = 0.628 rad/s)
    const flak44TraverseSpeed = 0.838;
    const flak44ElevationSpeed = 0.628;

    for (const flak of this.flakWeapons) {
      if (flak.fireCooldown > 0) {
        flak.fireCooldown -= dt;
      }

      const yawRes = this.stepSlewAngle(flak.currentYaw, flak.targetYaw, flak44TraverseSpeed, dt);
      const pitchRes = this.stepSlewPitch(flak.currentPitch, flak.targetPitch, flak44ElevationSpeed, dt);

      flak.currentYaw = yawRes.angle;
      flak.currentPitch = pitchRes.pitch;

      if (yawRes.isMoving || pitchRes.isMoving) {
        isAnyTraversing = true;
      }
      const pairDiff = Math.hypot(yawRes.diff, pitchRes.diff);
      if (pairDiff > maxDiffRad) maxDiffRad = pairDiff;

      flak.rig.yawPivot.rotation.y = flak.currentYaw;
      flak.rig.pitchPivot.rotation.x = -flak.currentPitch;

      // Recoil spring recovery
      flak.recoilL = THREE.MathUtils.damp(flak.recoilL, 0, 18, dt);
      flak.recoilR = THREE.MathUtils.damp(flak.recoilR, 0, 18, dt);

      const barrelBaseZ = 0.85 * 0.5 + 0.12;
      flak.rig.leftBarrel.position.z = barrelBaseZ + flak.recoilL;
      flak.rig.rightBarrel.position.z = barrelBaseZ + flak.recoilR;

      // Flash timer decay
      if (flak.flashTimerL > 0) {
        flak.flashTimerL -= dt;
        if (flak.flashTimerL <= 0) {
          flak.rig.muzzleFlashL.intensity = 0;
          (flak.rig.flashMeshL.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      }
      if (flak.flashTimerR > 0) {
        flak.flashTimerR -= dt;
        if (flak.flashTimerR <= 0) {
          flak.rig.muzzleFlashR.intensity = 0;
          (flak.rig.flashMeshR.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      }
    }

    // 2. Update 8.8cm Flak 41 slewing (Heavy Ordnance: Traverse: 22°/s = 0.384 rad/s, Elevation: 12°/s = 0.209 rad/s)
    const flak41TraverseSpeed = 0.384;
    const flak41ElevationSpeed = 0.209;

    for (const flak of this.flak41Weapons) {
      if (flak.fireCooldown > 0) {
        flak.fireCooldown -= dt;
      }

      const yawRes = this.stepSlewAngle(flak.currentYaw, flak.targetYaw, flak41TraverseSpeed, dt);
      const pitchRes = this.stepSlewPitch(flak.currentPitch, flak.targetPitch, flak41ElevationSpeed, dt);

      flak.currentYaw = yawRes.angle;
      flak.currentPitch = pitchRes.pitch;

      if (yawRes.isMoving || pitchRes.isMoving) {
        isAnyTraversing = true;
      }
      const pairDiff = Math.hypot(yawRes.diff, pitchRes.diff);
      if (pairDiff > maxDiffRad) maxDiffRad = pairDiff;

      flak.rig.yawPivot.rotation.y = flak.currentYaw;
      flak.rig.pitchPivot.rotation.x = -flak.currentPitch;

      // Hydro-pneumatic recuperator recovery to battery
      flak.recoil = THREE.MathUtils.damp(flak.recoil, 0, 5.5, dt);
      flak.rig.barrelAssembly.position.z = flak.recoil;

      // Flash timer decay
      if (flak.flashTimer > 0) {
        flak.flashTimer -= dt;
        if (flak.flashTimer <= 0) {
          flak.rig.muzzleFlash.intensity = 0;
          (flak.rig.flashMesh.material as THREE.MeshBasicMaterial).opacity = 0;
        }
      }
    }



    // 3. Update projectile physics, ballistics & collision with physical objects
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const stepDist = p.vel.length() * dt;
      const dir = p.vel.clone().normalize();

      // Rapier raycast to detect hit against crates, barrels, targets, walls
      const ray = new RAPIER.Ray(
        { x: p.pos.x, y: p.pos.y, z: p.pos.z },
        { x: dir.x, y: dir.y, z: dir.z }
      );
      const hit = this.world.castRayAndGetNormal(
        ray,
        stepDist,
        true,
        undefined,
        undefined,
        undefined,
        this.body
      );

      if (hit) {
        const hitPoint = {
          x: p.pos.x + dir.x * hit.timeOfImpact,
          y: p.pos.y + dir.y * hit.timeOfImpact,
          z: p.pos.z + dir.z * hit.timeOfImpact,
        };
        const collider = hit.collider;
        const rigidBody = collider.parent();

        if (p.isHeavy88) {
          // 88mm devastating APHE kinetic punch (2,400 N)
          const impulseStrength = 2400;
          if (rigidBody && rigidBody.isDynamic() && rigidBody !== this.body) {
            rigidBody.applyImpulseAtPoint(
              {
                x: dir.x * impulseStrength,
                y: (dir.y + 0.45) * impulseStrength,
                z: dir.z * impulseStrength,
              },
              hitPoint,
              true
            );
          }

          // Explosive shockwave pushing all nearby dynamic bodies outward in 4.0m radius
          const blastRadius = 4.0;
          const hitVec = new THREE.Vector3(hitPoint.x, hitPoint.y, hitPoint.z);
          this.world.forEachRigidBody((otherBody) => {
            if (!otherBody.isDynamic() || otherBody === this.body || otherBody === rigidBody) return;
            const bPos = otherBody.translation();
            const objPos = new THREE.Vector3(bPos.x, bPos.y, bPos.z);
            const dist = objPos.distanceTo(hitVec);
            if (dist < blastRadius && dist > 0.05) {
              const blastFactor = 1.0 - (dist / blastRadius);
              const blastDir = objPos.clone().sub(hitVec).normalize();
              blastDir.y += 0.35;
              const blastImpulse = blastDir.multiplyScalar(impulseStrength * 0.45 * blastFactor);
              otherBody.applyImpulse(
                { x: blastImpulse.x, y: blastImpulse.y, z: blastImpulse.z },
                true
              );
            }
          });
        } else {
          // 37mm autocannon kinetic punch (320 N)
          if (rigidBody && rigidBody.isDynamic() && rigidBody !== this.body) {
            const impulseStrength = 320;
            rigidBody.applyImpulseAtPoint(
              {
                x: dir.x * impulseStrength,
                y: (dir.y + 0.35) * impulseStrength,
                z: dir.z * impulseStrength,
              },
              hitPoint,
              true
            );
          }
        }

        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);
      // Ballistic gravity drop
      p.vel.y -= 9.81 * 0.5 * dt;
      p.mesh.position.copy(p.pos);
      p.life -= dt;

      // Ground or life expiration check
      if (p.life <= 0 || p.pos.y <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    const diffDeg = maxDiffRad * (180 / Math.PI);
    return {
      isTraversing: isAnyTraversing,
      isAligned: diffDeg < 1.0,
      diffDeg,
      isAtLimit: this.lastAtLimit,
    };
  }

  /**
   * Retrieves world positions and orientations for War Thunder mouse-aim HUD and Sniper View.
   */
  public getPrimaryWeaponState(): {
    hasWeapon: boolean;
    muzzleWorldPos: THREE.Vector3;
    gunWorldDir: THREE.Vector3;
    sightWorldPos: THREE.Vector3;
    isTraversing: boolean;
    isAligned: boolean;
    isAtLimit: boolean;
    diffDeg: number;
    weaponName: string;
  } {
    if (this.flak41Weapons.length > 0) {
      const flak = this.flak41Weapons[0];
      const muzzleWorldPos = new THREE.Vector3();
      flak.rig.muzzleFlash.getWorldPosition(muzzleWorldPos);

      const gunWorldDir = new THREE.Vector3(0, 0, 1);
      flak.rig.pitchPivot.getWorldDirection(gunWorldDir);

      const sightWorldPos = new THREE.Vector3();
      if (flak.rig.sight) {
        flak.rig.sight.getWorldPosition(sightWorldPos);
      } else {
        flak.rig.pitchPivot.getWorldPosition(sightWorldPos);
        sightWorldPos.y += 0.45;
      }

      let yawDiff = flak.targetYaw - flak.currentYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const pitchDiff = flak.targetPitch - flak.currentPitch;
      const diffDeg = Math.hypot(yawDiff, pitchDiff) * (180 / Math.PI);

      return {
        hasWeapon: true,
        muzzleWorldPos,
        gunWorldDir,
        sightWorldPos,
        isTraversing: diffDeg > 0.45,
        isAligned: diffDeg < 1.0,
        isAtLimit: this.lastAtLimit,
        diffDeg,
        weaponName: '8.8cm Flak 41 L/74',
      };
    } else if (this.flakWeapons.length > 0) {
      const flak = this.flakWeapons[0];
      const muzzleWorldPos = new THREE.Vector3();
      flak.rig.muzzleFlashL.getWorldPosition(muzzleWorldPos);

      const gunWorldDir = new THREE.Vector3(0, 0, 1);
      flak.rig.pitchPivot.getWorldDirection(gunWorldDir);

      const sightWorldPos = new THREE.Vector3();
      flak.rig.pitchPivot.getWorldPosition(sightWorldPos);
      sightWorldPos.y += 0.38; // Periscope sight elevation above trunnion

      let yawDiff = flak.targetYaw - flak.currentYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;
      const pitchDiff = flak.targetPitch - flak.currentPitch;
      const diffDeg = Math.hypot(yawDiff, pitchDiff) * (180 / Math.PI);

      return {
        hasWeapon: true,
        muzzleWorldPos,
        gunWorldDir,
        sightWorldPos,
        isTraversing: diffDeg > 0.45,
        isAligned: diffDeg < 1.0,
        isAtLimit: this.lastAtLimit,
        diffDeg,
        weaponName: '3.7cm Flakzwilling 44',
      };
    }

    return {
      hasWeapon: false,
      muzzleWorldPos: new THREE.Vector3(),
      gunWorldDir: new THREE.Vector3(0, 0, 1),
      sightWorldPos: new THREE.Vector3(0, 1.5, 0),
      isTraversing: false,
      isAligned: true,
      isAtLimit: false,
      diffDeg: 0,
      weaponName: 'No Weapon',
    };
  }

  public resetPose(spawnPos: THREE.Vector3): void {
    this.body.setTranslation({ x: spawnPos.x, y: spawnPos.y, z: spawnPos.z }, true);
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.clearCruise();

    this.prevPosition.copy(spawnPos);
    this.currPosition.copy(spawnPos);
    this.renderPosition.copy(spawnPos);
    this.prevQuaternion.identity();
    this.currQuaternion.identity();
    this.renderQuaternion.identity();
  }

  public setTrackTension(tension: TrackTension): void {
    this.trackTension = tension;
    for (const assembly of this.kingTigerAssemblies) {
      assembly.setTension(tension);
    }
  }

  public getTrackTension(): TrackTension {
    return this.trackTension;
  }

  public destroy(): void {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
    }
    this.projectiles = [];
    this.scene.remove(this.rootGroup);
    this.world.removeRigidBody(this.body);
    this.kingTigerAssemblies = [];
    this.flakWeapons = [];
    this.flak41Weapons = [];
  }
}
