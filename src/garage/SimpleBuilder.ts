import * as THREE from 'three';
import { BLOCK_DEFS, BLOCK_SIZE, BlockType, BlueprintBlock } from '../blocks/BlockTypes';
import {
  KingTigerTrackAssembly,
  TrackTension,
  createKingTigerTrackMesh,
  findTrackSegments,
} from '../vehicle/KingTigerTrack';
import {
  LegoShape,
  LEGO_SHAPE_DEFS,
  getLegoShapeGeometry,
  createLegoMesh,
  createV12EngineMesh,
} from '../blocks/LegoShapes';

export interface BuilderStats {
  mass: number;
  blockCount: number;
  engineCount: number;
  trackCount: number;
  weaponCount: number;
  hasCockpit: boolean;
  centerOfMass: THREE.Vector3;
}

export class SimpleBuilder {
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Grid bounds (13 x 7 x 17 blocks = 6.5m x 3.5m x 8.5m at 0.5m scale)
  public readonly minX = -6;
  public readonly maxX = 6;
  public readonly minY = 0;
  public readonly maxY = 6;
  public readonly minZ = -8;
  public readonly maxZ = 8;

  public selectedBlockType: BlockType = 'CHASSIS';
  public activeShape: LegoShape = 'CUBE';
  public activeRotationX = 0; // 0=0°, 1=90°, 2=180°, 3=270° (Pitch: ก้ม/เงย/หงายขึ้น)
  public activeRotationY = 0; // 0=0°, 1=90°, 2=180°, 3=270° (Yaw: ซ้าย/ขวา)
  public activeRotationZ = 0; // 0=0°, 1=90°, 2=180°, 3=270° (Roll: เอียง)
  public symmetryEnabled = true;

  // Configurable King Tiger II track length (in 0.5m blocks: default 13 blocks = 6.5m)
  public trackLength = 13;

  // Configurable King Tiger track tension mode: 'TAUT' | 'REALISTIC' | 'SLACK'
  public trackTension: TrackTension = 'REALISTIC';

  // Configurable Grid Snapping: 0.5 (Standard 1x), 0.25 (Fine 1/2x), 0.125 (Micro 1/4x)
  public gridSnap = 0.5;
  private subGridHelper: THREE.GridHelper | null = null;

  // Active Garage Tool: 'PLACE' (Build & Place) | 'SELECT' (Select, Move, Rotate, Stretch)
  public toolMode: 'PLACE' | 'SELECT' = 'PLACE';
  public selectedKey: string | null = null;

  private blocks = new Map<string, BlueprintBlock>();
  private blockMeshes = new Map<string, THREE.Object3D>();
  private trackSegmentMeshes = new Map<string, THREE.Group>();

  public readonly garageGroup = new THREE.Group();
  private gridGroup = new THREE.Group();
  private grid3DGroup = new THREE.Group();
  public is3DGridEnabled = true;
  private lastGrid3DCacheKey = '';
  private lastHoverCell: THREE.Vector3 | null = null;
  private localGridMeshMajor: THREE.LineSegments | null = null;
  private localGridMeshMinor: THREE.LineSegments | null = null;
  private localGridBoxMesh: THREE.LineSegments | null = null;
  private ghostGroup = new THREE.Group();
  private selectionGroup = new THREE.Group();
  private selectionBoxMesh: THREE.LineSegments;
  private ghostMesh: THREE.Mesh;
  private ghostMirrorMesh: THREE.Mesh;
  private ghostFloorMesh: THREE.Mesh;
  private engineGhostMesh: THREE.Group;
  private engineGhostMirrorMesh: THREE.Group;
  private trackGhostAssembly: KingTigerTrackAssembly | null = null;
  private trackGhostMirrorAssembly: KingTigerTrackAssembly | null = null;
  private comMarker: THREE.Group;

  private raycaster = new THREE.Raycaster();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

  constructor(scene: THREE.Scene, camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.camera = camera;

    this.scene.add(this.garageGroup);
    this.garageGroup.add(this.gridGroup);
    this.garageGroup.add(this.ghostGroup);
    this.garageGroup.add(this.selectionGroup);

    this.buildPlatformGrid();

    // Selection Bounding Box Indicator
    const selBoxGeo = new THREE.BoxGeometry(1, 1, 1);
    const selBoxEdges = new THREE.EdgesGeometry(selBoxGeo);
    const selBoxMat = new THREE.LineBasicMaterial({
      color: 0x2ce6ff,
      linewidth: 3,
      depthTest: false,
    });
    this.selectionBoxMesh = new THREE.LineSegments(selBoxEdges, selBoxMat);
    this.selectionBoxMesh.renderOrder = 999;
    this.selectionGroup.add(this.selectionBoxMesh);
    this.selectionGroup.visible = false;

    // Standard Block Ghost Meshes
    const ghostGeo = new THREE.BoxGeometry(BLOCK_SIZE, BLOCK_SIZE, BLOCK_SIZE);
    const ghostMat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.45,
    });
    this.ghostMesh = new THREE.Mesh(ghostGeo, ghostMat);
    this.ghostMirrorMesh = new THREE.Mesh(ghostGeo, ghostMat.clone());
    this.ghostGroup.add(this.ghostMesh);
    this.ghostGroup.add(this.ghostMirrorMesh);

    // 2x3 Maybach V12 Engine Ghost Meshes
    this.engineGhostMesh = createV12EngineMesh(0, true);
    this.engineGhostMirrorMesh = createV12EngineMesh(0, true);
    this.engineGhostMesh.visible = false;
    this.engineGhostMirrorMesh.visible = false;
    this.ghostGroup.add(this.engineGhostMesh);
    this.ghostGroup.add(this.engineGhostMirrorMesh);

    // Auto-Floor Bridging Ghost Mesh
    const ghostFloorGeo = new THREE.BoxGeometry(1, 1, 1);
    const ghostFloorMat = new THREE.MeshBasicMaterial({
      color: 0x38e578,
      transparent: true,
      opacity: 0.35,
    });
    this.ghostFloorMesh = new THREE.Mesh(ghostFloorGeo, ghostFloorMat);
    this.ghostFloorMesh.visible = false;
    this.ghostGroup.add(this.ghostFloorMesh);

    // Build King Tiger ghost previews
    this.rebuildGhost();
    this.ghostGroup.visible = false;

    // CoM Marker
    this.comMarker = this.createComMarker();
    this.garageGroup.add(this.comMarker);
  }

  public setToolMode(mode: 'PLACE' | 'SELECT'): void {
    this.toolMode = mode;
    if (mode === 'SELECT') {
      this.ghostGroup.visible = false;
      if (!this.selectedKey) {
        this.hideFocused3DGrid();
      }
    } else {
      this.selectBlock(null);
    }
  }

  public setGridSnap(snap: number): void {
    const valid = [0.5, 0.25, 0.125];
    this.gridSnap = valid.includes(snap) ? snap : 0.5;
    this.lastGrid3DCacheKey = '';
    this.updateSubGrid();
    if (this.selectedKey) {
      const b = this.blocks.get(this.selectedKey);
      if (b) {
        this.updateFocused3DGrid(new THREE.Vector3(b.x, b.y, b.z));
      }
    } else if (this.lastHoverCell) {
      this.updateFocused3DGrid(this.lastHoverCell);
    }
  }

  public cycleGridSnap(): number {
    if (this.gridSnap === 0.5) {
      this.setGridSnap(0.25);
    } else if (this.gridSnap === 0.25) {
      this.setGridSnap(0.125);
    } else {
      this.setGridSnap(0.5);
    }
    return this.gridSnap;
  }

  public setTrackLength(length: number): void {
    const maxLen = this.maxZ - this.minZ + 1; // 17 blocks
    const clamped = Math.max(2, Math.min(maxLen, Math.round(length)));
    if (this.trackLength !== clamped) {
      const oldBlock = this.selectedKey ? this.blocks.get(this.selectedKey) : null;
      const trackX = oldBlock?.type === 'TRACK_UNIT' ? oldBlock.x : null;
      const trackZ = oldBlock?.z ?? 0;

      this.trackLength = clamped;
      this.rebuildGhost();
      this.resizeExistingTracks(clamped);

      if (trackX !== null) {
        const trackBlocks = Array.from(this.blocks.values()).filter(
          (b) => b.type === 'TRACK_UNIT' && b.x === trackX
        );
        if (trackBlocks.length > 0) {
          const minZ = Math.min(...trackBlocks.map((b) => b.z));
          const maxZ = Math.max(...trackBlocks.map((b) => b.z));
          const targetZ = Math.max(minZ, Math.min(maxZ, Math.round(trackZ)));
          this.selectBlock(SimpleBuilder.key(trackX, 0, targetZ));
        }
      }
    }
  }

  public setTrackTension(tension: TrackTension): void {
    if (this.trackTension !== tension) {
      this.trackTension = tension;
      this.rebuildGhost();
      this.rebuildTrackVisuals();
    }
  }

  public rebuildGhost(): void {
    if (this.trackGhostAssembly) {
      this.ghostGroup.remove(this.trackGhostAssembly.group);
      this.trackGhostAssembly = null;
    }
    if (this.trackGhostMirrorAssembly) {
      this.ghostGroup.remove(this.trackGhostMirrorAssembly.group);
      this.trackGhostMirrorAssembly = null;
    }

    this.trackGhostAssembly = createKingTigerTrackMesh(this.trackLength, true, true, this.trackTension);
    this.trackGhostMirrorAssembly = createKingTigerTrackMesh(this.trackLength, false, true, this.trackTension);

    this.ghostGroup.add(this.trackGhostAssembly.group);
    this.ghostGroup.add(this.trackGhostMirrorAssembly.group);
    this.trackGhostAssembly.group.visible = false;
    this.trackGhostMirrorAssembly.group.visible = false;
  }

  public setActiveShape(shape: LegoShape): void {
    this.activeShape = shape;
    this.selectedBlockType = LEGO_SHAPE_DEFS[shape].defaultType;
    this.updateGhostGeometry();
  }

  public setSelectedBlockType(type: BlockType): void {
    this.selectedBlockType = type;
    if (type === 'COCKPIT') {
      this.activeShape = 'CUBE';
    } else if (type === 'ENGINE') {
      this.activeShape = 'CUBE';
    } else if (type === 'WEAPON') {
      this.activeShape = 'FLAK_44';
    } else if (type === 'TURRET') {
      this.activeShape = 'TURRET_RING';
    }
    this.updateGhostGeometry();
  }

  public rotateActiveShape(axis: 'x' | 'y' | 'z' = 'y'): { x: number; y: number; z: number } {
    if (axis === 'x') {
      this.activeRotationX = (this.activeRotationX + 1) % 4;
    } else if (axis === 'y') {
      this.activeRotationY = (this.activeRotationY + 1) % 4;
    } else if (axis === 'z') {
      this.activeRotationZ = (this.activeRotationZ + 1) % 4;
    }
    this.updateGhostGeometry();
    return {
      x: this.activeRotationX * 90,
      y: this.activeRotationY * 90,
      z: this.activeRotationZ * 90,
    };
  }

  public flipActiveShape(): { x: number; y: number; z: number } {
    // 180° flip on X axis (หงายขึ้น / คว่ำลง)
    this.activeRotationX = (this.activeRotationX + 2) % 4;
    this.updateGhostGeometry();
    return {
      x: this.activeRotationX * 90,
      y: this.activeRotationY * 90,
      z: this.activeRotationZ * 90,
    };
  }

  public updateGhostGeometry(): void {
    const geo = getLegoShapeGeometry(this.activeShape);
    this.ghostMesh.geometry = geo;
    this.ghostMirrorMesh.geometry = geo;

    const rx = this.activeRotationX * (Math.PI / 2);
    const ry = this.activeRotationY * (Math.PI / 2);
    const rz = this.activeRotationZ * (Math.PI / 2);
    this.ghostMesh.rotation.set(rx, ry, rz);

    const mirrorRotX = rx;
    const mirrorRotY = ((4 - this.activeRotationY) % 4) * (Math.PI / 2);
    const mirrorRotZ = ((4 - this.activeRotationZ) % 4) * (Math.PI / 2);
    this.ghostMirrorMesh.rotation.set(mirrorRotX, mirrorRotY, mirrorRotZ);
  }

  private createComMarker(): THREE.Group {
    const g = new THREE.Group();
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff00aa, depthTest: false })
    );
    sphere.renderOrder = 999;
    g.add(sphere);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.15, 0.19, 24),
      new THREE.MeshBasicMaterial({ color: 0x2ce6ff, side: THREE.DoubleSide, depthTest: false })
    );
    ring.renderOrder = 999;
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    return g;
  }

  private buildPlatformGrid(): void {
    const size = 17 * BLOCK_SIZE; // 8.5m spacious build platform

    // 1. Heavy-duty Elevated Hydraulic Lift Deck (Top surface sits at y = -0.025m so track cleats rest cleanly on deck)
    const deckThickness = 0.35;
    const floorGeo = new THREE.BoxGeometry(size * 1.05, deckThickness, size * 1.05);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.72,
      metalness: 0.28,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.025 - deckThickness * 0.5;
    floor.receiveShadow = true;
    this.gridGroup.add(floor);

    // Beveled industrial pedestal skirt beneath the lift deck
    const skirtGeo = new THREE.BoxGeometry(size * 1.12, 0.45, size * 1.12);
    const skirtMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.85,
      metalness: 0.20,
    });
    const skirt = new THREE.Mesh(skirtGeo, skirtMat);
    skirt.position.y = floor.position.y - deckThickness * 0.5 - 0.225;
    skirt.receiveShadow = true;
    this.gridGroup.add(skirt);

    // Platform perimeter edge glow lines (High-tech cyan workshop border)
    const rimEdgeGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size * 1.05, 0.02, size * 1.05));
    const rimEdgeMat = new THREE.LineBasicMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.65 });
    const rimLines = new THREE.LineSegments(rimEdgeGeo, rimEdgeMat);
    rimLines.position.y = -0.025;
    this.gridGroup.add(rimLines);

    // 4 Corner Hydraulic Lift Pillars (Industrial workshop lift jacks)
    const columnPositions = [
      [-size * 0.48, -size * 0.48],
      [size * 0.48, -size * 0.48],
      [-size * 0.48, size * 0.48],
      [size * 0.48, size * 0.48],
    ];
    const sleeveGeo = new THREE.CylinderGeometry(0.16, 0.20, 1.1, 16);
    const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6, metalness: 0.35 });
    const pistonGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.75, 16);
    const pistonMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.22, metalness: 0.85 });
    const footGeo = new THREE.BoxGeometry(0.52, 0.10, 0.52);

    for (const [cx, cz] of columnPositions) {
      const sleeve = new THREE.Mesh(sleeveGeo, sleeveMat);
      sleeve.position.set(cx, -1.05, cz);
      this.gridGroup.add(sleeve);

      const piston = new THREE.Mesh(pistonGeo, pistonMat);
      piston.position.set(cx, -0.48, cz);
      this.gridGroup.add(piston);

      const foot = new THREE.Mesh(footGeo, sleeveMat);
      foot.position.set(cx, -1.60, cz);
      this.gridGroup.add(foot);
    }

    // Platform Base Floor Grid (Resting flush at y = -0.020, underneath track cleats)
    const grid = new THREE.GridHelper(size, 17, 0xff9033, 0x475569);
    grid.position.y = -0.020;
    (grid.material as THREE.Material).depthWrite = false;
    this.gridGroup.add(grid);

    // Forward Direction Arrow Indicator (+Z is FRONT)
    const arrowGeo = new THREE.ConeGeometry(0.25, 0.55, 12);
    arrowGeo.rotateX(Math.PI / 2);
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0xff7b1c });
    const arrow = new THREE.Mesh(arrowGeo, arrowMat);
    arrow.position.set(0, 0.00, size * 0.5 + 0.35);
    this.gridGroup.add(arrow);

    // Center Symmetry Line along X=0
    const symGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, -0.015, -size * 0.5),
      new THREE.Vector3(0, -0.015, size * 0.5),
    ]);
    const symMat = new THREE.LineBasicMaterial({ color: 0x2ce6ff, transparent: true, opacity: 0.75 });
    this.gridGroup.add(new THREE.LineSegments(symGeo, symMat));

    this.updateSubGrid();
    this.gridGroup.add(this.grid3DGroup);
    this.grid3DGroup.visible = false;
  }

  private updateSubGrid(): void {
    if (this.subGridHelper) {
      this.gridGroup.remove(this.subGridHelper);
      this.subGridHelper.geometry.dispose();
      this.subGridHelper = null;
    }

    if (this.gridSnap < 0.5) {
      const size = 17 * BLOCK_SIZE; // 8.5m
      const divisions = Math.round(size / this.gridSnap); // 34 for 0.25m, 68 for 0.125m
      this.subGridHelper = new THREE.GridHelper(size, divisions, 0x2ce6ff, 0x2d435d);
      this.subGridHelper.position.y = -0.018;
      (this.subGridHelper.material as THREE.Material).transparent = true;
      (this.subGridHelper.material as THREE.Material).opacity = 0.65;
      (this.subGridHelper.material as THREE.Material).depthWrite = false;
      this.gridGroup.add(this.subGridHelper);
    }
  }

  /**
   * Generates a focused, localized 3D spatial voxel grid centered directly where the mouse cursor points on an object.
   * Dynamically subdivides lines based on active gridSnap (0.5m, 0.25m, 0.125m) across all 3 axes (X, Y, Z).
   */
  public updateFocused3DGrid(focusCell: THREE.Vector3): void {
    if (!this.is3DGridEnabled || !this.garageGroup.visible) {
      this.grid3DGroup.visible = false;
      return;
    }

    const step = this.gridSnap;
    const cacheKey = `${step}_${focusCell.x}_${focusCell.y}_${focusCell.z}`;
    if (this.lastGrid3DCacheKey === cacheKey && this.grid3DGroup.visible) {
      return;
    }
    this.lastGrid3DCacheKey = cacheKey;

    const s = BLOCK_SIZE; // 0.5m
    const cx = focusCell.x * s;
    const cy = focusCell.y * s + s * 0.5;
    const cz = focusCell.z * s;

    // Focused local box around mouse cursor: span 1.0m horizontally and 0.75m vertically
    const spanXZ = 1.0;
    const spanY = 0.75;

    const xMin = Math.max(this.minX * s, Math.floor((cx - spanXZ) / step) * step);
    const xMax = Math.min(this.maxX * s, Math.ceil((cx + spanXZ) / step) * step);
    const zMin = Math.max(this.minZ * s, Math.floor((cz - spanXZ) / step) * step);
    const zMax = Math.min(this.maxZ * s, Math.ceil((cz + spanXZ) / step) * step);
    const yMin = Math.max(0, Math.floor((cy - spanY) / step) * step);
    const yMax = Math.min((this.maxY + 1) * s, Math.ceil((cy + spanY) / step) * step);

    const majorPoints: number[] = [];
    const minorPoints: number[] = [];

    const isMajor = (v: number) => {
      const rem = Math.abs(v % 0.5);
      return rem < 0.005 || rem > 0.495;
    };

    // 1. Horizontal lines along X (at each Y and Z, stepped by gridSnap)
    for (let y = yMin; y <= yMax + 0.0001; y += step) {
      const yR = Math.round(y * 1000) / 1000;
      for (let z = zMin; z <= zMax + 0.0001; z += step) {
        const zR = Math.round(z * 1000) / 1000;
        const targetArr = isMajor(yR) && isMajor(zR) ? majorPoints : minorPoints;
        targetArr.push(xMin, yR, zR, xMax, yR, zR);
      }
    }

    // 2. Horizontal lines along Z (at each Y and X, stepped by gridSnap)
    for (let y = yMin; y <= yMax + 0.0001; y += step) {
      const yR = Math.round(y * 1000) / 1000;
      for (let x = xMin; x <= xMax + 0.0001; x += step) {
        const xR = Math.round(x * 1000) / 1000;
        const targetArr = isMajor(yR) && isMajor(xR) ? majorPoints : minorPoints;
        targetArr.push(xR, yR, zMin, xR, yR, zMax);
      }
    }

    // 3. Vertical lines along Y (from yMin to yMax at each X and Z intersection, stepped by gridSnap)
    for (let x = xMin; x <= xMax + 0.0001; x += step) {
      const xR = Math.round(x * 1000) / 1000;
      for (let z = zMin; z <= zMax + 0.0001; z += step) {
        const zR = Math.round(z * 1000) / 1000;
        const targetArr = isMajor(xR) && isMajor(zR) ? majorPoints : minorPoints;
        targetArr.push(xR, yMin, zR, xR, yMax, zR);
      }
    }

    // Major 0.5m grid lines (Bright cyan)
    if (!this.localGridMeshMajor) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      });
      this.localGridMeshMajor = new THREE.LineSegments(geo, mat);
      this.localGridMeshMajor.renderOrder = 2;
      this.grid3DGroup.add(this.localGridMeshMajor);
    }
    this.localGridMeshMajor.geometry.dispose();
    this.localGridMeshMajor.geometry = new THREE.BufferGeometry();
    this.localGridMeshMajor.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(majorPoints, 3)
    );

    // Minor subdivision grid lines (0.25m / 0.125m subtle cyan)
    if (!this.localGridMeshMinor) {
      const geo = new THREE.BufferGeometry();
      const mat = new THREE.LineBasicMaterial({
        color: 0x0ea5e9,
        transparent: true,
        opacity: 0.20,
        depthWrite: false,
      });
      this.localGridMeshMinor = new THREE.LineSegments(geo, mat);
      this.localGridMeshMinor.renderOrder = 1;
      this.grid3DGroup.add(this.localGridMeshMinor);
    }
    this.localGridMeshMinor.geometry.dispose();
    this.localGridMeshMinor.geometry = new THREE.BufferGeometry();
    this.localGridMeshMinor.geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(minorPoints, 3)
    );

    // Focused Block Cell Box Frame
    if (!this.localGridBoxMesh) {
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const edges = new THREE.EdgesGeometry(geo);
      const mat = new THREE.LineBasicMaterial({
        color: 0x2ce6ff,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      });
      this.localGridBoxMesh = new THREE.LineSegments(edges, mat);
      this.localGridBoxMesh.renderOrder = 3;
      this.grid3DGroup.add(this.localGridBoxMesh);
    }
    const aabb = this.getBlockAABB(
      focusCell.x,
      focusCell.y,
      focusCell.z,
      this.selectedBlockType,
      this.activeRotationY,
      this.activeShape,
      false,
      this.activeRotationX,
      this.activeRotationZ
    );
    const boxSize = new THREE.Vector3();
    const boxCenter = new THREE.Vector3();
    aabb.getSize(boxSize);
    aabb.getCenter(boxCenter);
    this.localGridBoxMesh.position.copy(boxCenter);
    this.localGridBoxMesh.scale.copy(boxSize);

    this.grid3DGroup.visible = true;
  }

  public hideFocused3DGrid(): void {
    this.grid3DGroup.visible = false;
    this.lastGrid3DCacheKey = '';
  }

  public set3DGridVisible(visible: boolean): void {
    this.is3DGridEnabled = visible;
    if (!visible) {
      this.hideFocused3DGrid();
    } else if (this.selectedKey) {
      const b = this.blocks.get(this.selectedKey);
      if (b) this.updateFocused3DGrid(new THREE.Vector3(b.x, b.y, b.z));
    } else if (this.lastHoverCell) {
      this.updateFocused3DGrid(this.lastHoverCell);
    }
  }

  public is3DGridVisible(): boolean {
    return this.is3DGridEnabled;
  }

  public toggle3DGrid(): boolean {
    this.is3DGridEnabled = !this.is3DGridEnabled;
    if (!this.is3DGridEnabled) {
      this.hideFocused3DGrid();
    } else if (this.selectedKey) {
      const b = this.blocks.get(this.selectedKey);
      if (b) this.updateFocused3DGrid(new THREE.Vector3(b.x, b.y, b.z));
    } else if (this.lastHoverCell) {
      this.updateFocused3DGrid(this.lastHoverCell);
    }
    return this.is3DGridEnabled;
  }

  /**
   * Shifts all blocks across the entire vehicle up (+Y) or down (-Y) by dy blocks.
   * Enables lifting the vehicle for undercarriage inspection or adjusting clearance.
   */
  public shiftAllBlocks(dy: number): { success: boolean; reason?: string } {
    if (this.blocks.size === 0) {
      return { success: false, reason: 'ไม่มีบล็อกในแท่นประกอบ' };
    }

    this.syncAutoChassisFloor();
    const currentBlocks = Array.from(this.blocks.values());

    for (const b of currentBlocks) {
      const newY = b.y + dy;
      if (newY < this.minY || newY > this.maxY) {
        return {
          success: false,
          reason:
            dy > 0
              ? '⚠️ ไม่สามารถยกขึ้นได้: บล็อกส่วนบนสุดชนเพดานกริดแล้ว!'
              : '⚠️ ไม่สามารถลดระดับลงได้: บล็อกส่วนล่างสุดติดพื้นแท่นแล้ว!',
        };
      }
    }

    const updatedBlocks: BlueprintBlock[] = currentBlocks.map((b) => ({
      ...b,
      y: b.y + dy,
    }));

    this.loadBlueprint(updatedBlocks);

    if (this.selectedKey) {
      const parts = this.selectedKey.split(',');
      if (parts.length === 3) {
        const sx = parseFloat(parts[0]);
        const sy = parseFloat(parts[1]) + dy;
        const sz = parseFloat(parts[2]);
        this.selectBlock(SimpleBuilder.key(sx, sy, sz));
      }
    }

    return { success: true };
  }

  public setVisible(visible: boolean): void {
    this.garageGroup.visible = visible;
    if (!visible) {
      this.ghostGroup.visible = false;
      this.hideFocused3DGrid();
      this.lastHoverCell = null;
    }
  }

  public loadBlueprint(blueprintBlocks: BlueprintBlock[]): void {
    this.clearAll();
    for (const b of blueprintBlocks) {
      this.rawSetBlock(
        b.x,
        b.y,
        b.z,
        b.type,
        b.shape ?? 'CUBE',
        b.rotationY ?? 0,
        b.isAutoFloor ?? false,
        b.rotationX ?? 0,
        b.rotationZ ?? 0
      );
    }
    this.syncAutoChassisFloor();
    this.rebuildTrackVisuals();
    this.updateCoM();
  }

  public clearAll(): void {
    for (const mesh of this.blockMeshes.values()) {
      this.garageGroup.remove(mesh);
    }
    for (const tGroup of this.trackSegmentMeshes.values()) {
      this.garageGroup.remove(tGroup);
    }
    this.blocks.clear();
    this.blockMeshes.clear();
    this.trackSegmentMeshes.clear();
    this.selectBlock(null);
    this.hideFocused3DGrid();
    this.lastHoverCell = null;
    this.updateCoM();
  }

  public getBlueprint(): BlueprintBlock[] {
    return Array.from(this.blocks.values());
  }

  public getBlockAABB(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    rotationY = 0,
    shape?: LegoShape,
    isAutoFloor = false,
    rotationX = 0,
    rotationZ = 0
  ): THREE.Box3 {
    const s = BLOCK_SIZE;
    const center = new THREE.Vector3(x * s, y * s + s * 0.5, z * s);

    if (type === 'ENGINE') {
      const isRot = (rotationY % 2) !== 0;
      const hx = isRot ? 1.48 : 0.98;
      const hy = 0.82;
      const hz = isRot ? 0.98 : 1.48;
      const min = new THREE.Vector3(center.x - hx * 0.5, y * s, center.z - hz * 0.5);
      const max = new THREE.Vector3(center.x + hx * 0.5, y * s + hy, center.z + hz * 0.5);
      return new THREE.Box3(min, max);
    }

    if (type === 'TRACK_UNIT') {
      const min = new THREE.Vector3(center.x - 0.24, center.y - 0.26, center.z - 0.25);
      const max = new THREE.Vector3(center.x + 0.24, center.y + 0.26, center.z + 0.25);
      return new THREE.Box3(min, max);
    }

    const half = s * 0.5;

    // 8cm thin chassis floor plate (sits flush at top of cell y)
    if (isAutoFloor) {
      const plateH = 0.08;
      const topY = y * s + s;
      const min = new THREE.Vector3(center.x - half, topY - plateH, center.z - half);
      const max = new THREE.Vector3(center.x + half, topY, center.z + half);
      return new THREE.Box3(min, max);
    }

    if (shape === 'PLATE' || shape === 'PLATE_25' || shape === 'PLATE_12') {
      const plateH = shape === 'PLATE_25' ? s * 0.5 : (shape === 'PLATE_12' ? s * 0.25 : 0.08);
      const halfW = half;
      const rx = rotationX * (Math.PI / 2);
      const ry = rotationY * (Math.PI / 2);
      const rz = rotationZ * (Math.PI / 2);
      const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
      const box = new THREE.Box3();
      const localMin = new THREE.Vector3(-halfW, -half, -halfW);
      const localMax = new THREE.Vector3(halfW, -half + plateH, halfW);
      const corners = [
        new THREE.Vector3(localMin.x, localMin.y, localMin.z),
        new THREE.Vector3(localMax.x, localMin.y, localMin.z),
        new THREE.Vector3(localMin.x, localMax.y, localMin.z),
        new THREE.Vector3(localMax.x, localMax.y, localMin.z),
        new THREE.Vector3(localMin.x, localMin.y, localMax.z),
        new THREE.Vector3(localMax.x, localMin.y, localMax.z),
        new THREE.Vector3(localMin.x, localMax.y, localMax.z),
        new THREE.Vector3(localMax.x, localMax.y, localMax.z),
      ];
      for (const c of corners) {
        c.applyEuler(euler).add(center);
        box.expandByPoint(c);
      }
      return box;
    }

    const min = new THREE.Vector3(center.x - half, center.y - half, center.z - half);
    const max = new THREE.Vector3(center.x + half, center.y + half, center.z + half);
    return new THREE.Box3(min, max);
  }

  public static boxesOverlap(boxA: THREE.Box3, boxB: THREE.Box3, margin = 0.015): boolean {
    const xOverlap = boxA.min.x < boxB.max.x - margin && boxA.max.x > boxB.min.x + margin;
    const yOverlap = boxA.min.y < boxB.max.y - margin && boxA.max.y > boxB.min.y + margin;
    const zOverlap = boxA.min.z < boxB.max.z - margin && boxA.max.z > boxB.min.z + margin;
    return xOverlap && yOverlap && zOverlap;
  }

  public checkOverlap(box: THREE.Box3, ignoreKeys: string[] = []): boolean {
    const ignoreSet = new Set(ignoreKeys);

    for (const [k, b] of this.blocks.entries()) {
      if (ignoreSet.has(k)) continue;

      const otherBox = this.getBlockAABB(
        b.x,
        b.y,
        b.z,
        b.type,
        b.rotationY ?? 0,
        b.shape,
        b.isAutoFloor,
        b.rotationX ?? 0,
        b.rotationZ ?? 0
      );
      if (SimpleBuilder.boxesOverlap(box, otherBox)) {
        return true; // Overlap detected!
      }
    }
    return false;
  }

  public canPlaceBlock(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    rotationY = 0,
    ignoreKeys: string[] = [],
    shape?: LegoShape,
    isAutoFloor = false,
    rotationX = 0,
    rotationZ = 0
  ): boolean {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY || z < this.minZ || z > this.maxZ) {
      return false;
    }
    const box = this.getBlockAABB(x, y, z, type, rotationY, shape, isAutoFloor, rotationX, rotationZ);
    return !this.checkOverlap(box, ignoreKeys);
  }

  public getSelectedBlock(): BlueprintBlock | null {
    if (!this.selectedKey) return null;
    return this.blocks.get(this.selectedKey) ?? null;
  }

  public selectBlock(key: string | null): BlueprintBlock | null {
    if (!key) {
      this.selectedKey = null;
      this.selectionGroup.visible = false;
      this.hideFocused3DGrid();
      return null;
    }

    const b = this.blocks.get(key);
    if (!b) {
      this.selectedKey = null;
      this.selectionGroup.visible = false;
      this.hideFocused3DGrid();
      return null;
    }

    this.selectedKey = key;
    this.updateFocused3DGrid(new THREE.Vector3(b.x, b.y, b.z));

    if (b.type === 'TRACK_UNIT') {
      const trackBlocks = Array.from(this.blocks.values()).filter((tb) => tb.type === 'TRACK_UNIT' && tb.x === b.x);
      const minZ = Math.min(...trackBlocks.map((tb) => tb.z));
      const maxZ = Math.max(...trackBlocks.map((tb) => tb.z));
      const trackLength = maxZ - minZ + 1;
      const centerZ = ((minZ + maxZ) / 2) * BLOCK_SIZE;
      const centerY = b.y * BLOCK_SIZE + BLOCK_SIZE * 0.5 + 0.16;
      const totalLenMeters = trackLength * BLOCK_SIZE;

      this.selectionBoxMesh.scale.set(0.52, 0.88, totalLenMeters + 0.04);
      this.selectionBoxMesh.position.set(b.x * BLOCK_SIZE, centerY, centerZ);
      this.selectionGroup.visible = true;
      return b;
    }

    const aabb = this.getBlockAABB(
      b.x,
      b.y,
      b.z,
      b.type,
      b.rotationY ?? 0,
      b.shape,
      b.isAutoFloor,
      b.rotationX ?? 0,
      b.rotationZ ?? 0
    );
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    aabb.getSize(size);
    aabb.getCenter(center);

    this.selectionBoxMesh.scale.set(size.x + 0.03, size.y + 0.03, size.z + 0.03);
    this.selectionBoxMesh.position.copy(center);
    this.selectionGroup.visible = true;

    return b;
  }

  public selectBlockAtPointer(clientX: number, clientY: number): BlueprintBlock | null {
    const mouseNdc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(mouseNdc, this.camera);

    const checkObjects: THREE.Object3D[] = [
      ...Array.from(this.blockMeshes.values()),
      ...Array.from(this.trackSegmentMeshes.values()),
    ];
    const intersects = this.raycaster.intersectObjects(checkObjects, true);
    if (intersects.length === 0) {
      this.selectBlock(null);
      return null;
    }

    let cur: THREE.Object3D | null = intersects[0].object;
    while (cur && !cur.userData.blockType && cur.parent && cur.parent !== this.garageGroup) {
      cur = cur.parent;
    }

    if (cur && cur.userData.gridX !== undefined) {
      const gx = cur.userData.gridX as number;
      const gy = cur.userData.gridY as number;
      let gz = cur.userData.gridZ as number;
      if (cur.userData.isTrackSegment) {
        const minZ = (cur.userData.minZ as number) ?? this.minZ;
        const maxZ = (cur.userData.maxZ as number) ?? this.maxZ;
        const rawZ = Math.round(intersects[0].point.z / BLOCK_SIZE);
        gz = Math.max(minZ, Math.min(maxZ, rawZ));
      }
      const key = SimpleBuilder.key(gx, gy, gz);
      return this.selectBlock(key);
    }

    this.selectBlock(null);
    return null;
  }

  public moveSelectedBlock(dx: number, dy: number, dz: number): { success: boolean; reason?: string } {
    if (!this.selectedKey) return { success: false, reason: 'ไม่ได้เลือกบล็อก' };
    const b = this.blocks.get(this.selectedKey);
    if (!b) return { success: false, reason: 'ไม่พบบล็อกที่เลือก' };

    // 1. Special Handling for TRACK_UNIT: Move the entire track assembly together!
    if (b.type === 'TRACK_UNIT') {
      const primaryTracks = Array.from(this.blocks.values()).filter(
        (tb) => tb.type === 'TRACK_UNIT' && tb.x === b.x && tb.y === b.y
      );
      if (primaryTracks.length === 0) return { success: false, reason: 'ไม่พบชุดล้อ' };

      // Tracks are ALWAYS paired symmetrically across left and right
      const hasMirror = b.x !== 0;
      const mirrorDx = -dx; // Mirrored bilateral X displacement
      const mirrorDy = dy;
      const mirrorDz = dz;

      const mirrorTracks = hasMirror
        ? Array.from(this.blocks.values()).filter(
            (tb) => tb.type === 'TRACK_UNIT' && tb.x === -b.x && tb.y === b.y
          )
        : [];

      const ignoreKeys = [
        ...primaryTracks.map((tb) => SimpleBuilder.key(tb.x, tb.y, tb.z)),
        ...mirrorTracks.map((tb) => SimpleBuilder.key(tb.x, tb.y, tb.z)),
      ];

      // Prevent tracks from crossing center line or colliding with each other
      const targetPrimaryX = Math.round((b.x + dx) * 1000) / 1000;
      if (hasMirror) {
        const targetMirrorX = Math.round((-b.x + mirrorDx) * 1000) / 1000;
        if (b.x > 0 && targetPrimaryX <= targetMirrorX) {
          return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: ล้อซ้ายและขวาชนกันตรงกลาง!' };
        }
        if (b.x < 0 && targetPrimaryX >= targetMirrorX) {
          return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: ล้อซ้ายและขวาชนกันตรงกลาง!' };
        }
      }

      // Check bounds & collisions for primary tracks
      for (const tb of primaryTracks) {
        const nx = Math.round((tb.x + dx) * 1000) / 1000;
        const ny = Math.max(0, Math.round((tb.y + dy) * 1000) / 1000);
        const nz = Math.round((tb.z + dz) * 1000) / 1000;
        if (nx < this.minX || nx > this.maxX || ny < this.minY || ny > this.maxY || nz < this.minZ || nz > this.maxZ) {
          return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: หลุดขอบแท่น!' };
        }
        const box = this.getBlockAABB(nx, ny, nz, 'TRACK_UNIT');
        if (this.checkOverlap(box, ignoreKeys)) {
          return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: ติดบล็อกอื่น!' };
        }
      }

      // Check bounds & collisions for mirror tracks
      if (hasMirror) {
        for (const tb of mirrorTracks) {
          const nx = Math.round((tb.x + mirrorDx) * 1000) / 1000;
          const ny = Math.max(0, Math.round((tb.y + mirrorDy) * 1000) / 1000);
          const nz = Math.round((tb.z + mirrorDz) * 1000) / 1000;
          if (nx < this.minX || nx > this.maxX || ny < this.minY || ny > this.maxY || nz < this.minZ || nz > this.maxZ) {
            return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: หลุดขอบแท่น!' };
          }
          const box = this.getBlockAABB(nx, ny, nz, 'TRACK_UNIT');
          if (this.checkOverlap(box, ignoreKeys)) {
            return { success: false, reason: '⚠️ ไม่สามารถเลื่อนชุดล้อได้: ติดบล็อกอื่น!' };
          }
        }
      }

      // Execute track movement
      for (const tb of [...primaryTracks, ...mirrorTracks]) {
        this.removeBlock(tb.x, tb.y, tb.z, false);
      }

      for (const tb of primaryTracks) {
        const nx = Math.round((tb.x + dx) * 1000) / 1000;
        const ny = Math.max(0, Math.round((tb.y + dy) * 1000) / 1000);
        const nz = Math.round((tb.z + dz) * 1000) / 1000;
        this.rawSetBlock(nx, ny, nz, 'TRACK_UNIT');
      }

      if (hasMirror) {
        for (const tb of mirrorTracks) {
          const nx = Math.round((tb.x + mirrorDx) * 1000) / 1000;
          const ny = Math.max(0, Math.round((tb.y + mirrorDy) * 1000) / 1000);
          const nz = Math.round((tb.z + mirrorDz) * 1000) / 1000;
          this.rawSetBlock(nx, ny, nz, 'TRACK_UNIT');
        }
      }

      this.syncAutoChassisFloor();
      this.rebuildTrackVisuals();
      this.updateCoM();

      const newTargetX = Math.round((b.x + dx) * 1000) / 1000;
      const newTargetY = Math.max(0, Math.round((b.y + dy) * 1000) / 1000);
      const newTargetZ = Math.round((b.z + dz) * 1000) / 1000;
      this.selectBlock(SimpleBuilder.key(newTargetX, newTargetY, newTargetZ));
      return { success: true };
    }

    // 2. Standard Block Move (with bilateral symmetry support)
    const hasMirror = this.symmetryEnabled && b.x !== 0;
    const mirrorBlockKey = hasMirror ? SimpleBuilder.key(-b.x, b.y, b.z) : null;
    const mirrorBlock = mirrorBlockKey ? this.blocks.get(mirrorBlockKey) : null;
    const isSymmetricPair = mirrorBlock && mirrorBlock.type === b.type;

    const targetX = Math.round((b.x + dx) * 1000) / 1000;
    const targetY = Math.max(0, Math.round((b.y + dy) * 1000) / 1000);
    const targetZ = Math.round((b.z + dz) * 1000) / 1000;

    const ignoreKeys = [this.selectedKey];
    if (isSymmetricPair && mirrorBlockKey) {
      ignoreKeys.push(mirrorBlockKey);
    }

    if (!this.canPlaceBlock(targetX, targetY, targetZ, b.type, b.rotationY ?? 0, ignoreKeys, b.shape, b.isAutoFloor)) {
      return { success: false, reason: '⚠️ ไม่สามารถเลื่อนได้: ติดบล็อกอื่นหรือหลุดขอบแท่น!' };
    }

    let mirrorTargetX = 0;
    let mirrorTargetY = 0;
    let mirrorTargetZ = 0;
    if (isSymmetricPair && mirrorBlock) {
      mirrorTargetX = Math.round((-b.x - dx) * 1000) / 1000;
      mirrorTargetY = targetY;
      mirrorTargetZ = targetZ;
      const mirrorRotY = (4 - (b.rotationY ?? 0)) % 4;
      const mirrorRotX = b.rotationX ?? 0;
      const mirrorRotZ = (4 - (b.rotationZ ?? 0)) % 4;
      if (!this.canPlaceBlock(mirrorTargetX, mirrorTargetY, mirrorTargetZ, mirrorBlock.type, mirrorRotY, ignoreKeys, mirrorBlock.shape, mirrorBlock.isAutoFloor, mirrorRotX, mirrorRotZ)) {
        return { success: false, reason: '⚠️ ไม่สามารถเลื่อนบล็อกคู่สมมาตรได้: ติดบล็อกอื่นหรือหลุดขอบแท่น!' };
      }
      const pBox = this.getBlockAABB(targetX, targetY, targetZ, b.type, b.rotationY ?? 0, b.shape, b.isAutoFloor, b.rotationX ?? 0, b.rotationZ ?? 0);
      const mBox = this.getBlockAABB(mirrorTargetX, mirrorTargetY, mirrorTargetZ, mirrorBlock.type, mirrorRotY, mirrorBlock.shape, mirrorBlock.isAutoFloor, mirrorRotX, mirrorRotZ);
      if (SimpleBuilder.boxesOverlap(pBox, mBox)) {
        return { success: false, reason: '⚠️ ไม่สามารถเลื่อนได้: บล็อกสมมาตรชนกันเอง!' };
      }
    }

    const oldBlock = { ...b };
    this.removeBlock(oldBlock.x, oldBlock.y, oldBlock.z, false);
    if (isSymmetricPair && mirrorBlock) {
      this.removeBlock(mirrorBlock.x, mirrorBlock.y, mirrorBlock.z, false);
    }

    this.rawSetBlock(targetX, targetY, targetZ, oldBlock.type, oldBlock.shape, oldBlock.rotationY, oldBlock.isAutoFloor, oldBlock.rotationX ?? 0, oldBlock.rotationZ ?? 0);
    if (isSymmetricPair && mirrorBlock) {
      const mirrorRotY = (4 - (oldBlock.rotationY ?? 0)) % 4;
      const mirrorRotX = oldBlock.rotationX ?? 0;
      const mirrorRotZ = (4 - (oldBlock.rotationZ ?? 0)) % 4;
      this.rawSetBlock(mirrorTargetX, mirrorTargetY, mirrorTargetZ, mirrorBlock.type, mirrorBlock.shape, mirrorRotY, mirrorBlock.isAutoFloor, mirrorRotX, mirrorRotZ);
    }

    const newKey = SimpleBuilder.key(targetX, targetY, targetZ);
    this.selectBlock(newKey);
    this.updateCoM();
    return { success: true };
  }

  public rotateSelectedBlock(axis: 'x' | 'y' | 'z'): { success: boolean; reason?: string } {
    if (!this.selectedKey) return { success: false, reason: 'ไม่ได้เลือกบล็อก' };
    const b = this.blocks.get(this.selectedKey);
    if (!b) return { success: false, reason: 'ไม่พบบล็อกที่เลือก' };

    // Requirement 2.1: "(ยกเว้นชุดล้อที่ห้ามหมุน)"
    if (b.type === 'TRACK_UNIT') {
      return { success: false, reason: '🔒 ชุดล้อสายพานล็อกแนวขนานตัวถัง (ห้ามหมุน)' };
    }

    let newRotX = b.rotationX ?? 0;
    let newRotY = b.rotationY ?? 0;
    let newRotZ = b.rotationZ ?? 0;

    if (axis === 'x') {
      newRotX = (newRotX + 1) % 4;
    } else if (axis === 'y') {
      newRotY = (newRotY + 1) % 4;
    } else if (axis === 'z') {
      newRotZ = (newRotZ + 1) % 4;
    }

    const isSymmetricPair = this.symmetryEnabled && b.x !== 0;
    const mirrorBlockKey = isSymmetricPair ? SimpleBuilder.key(-b.x, b.y, b.z) : null;
    const mirrorBlock = mirrorBlockKey ? this.blocks.get(mirrorBlockKey) : null;
    const ignoreKeys = [this.selectedKey];
    if (isSymmetricPair && mirrorBlockKey) ignoreKeys.push(mirrorBlockKey);

    if (!this.canPlaceBlock(b.x, b.y, b.z, b.type, newRotY, ignoreKeys, b.shape, b.isAutoFloor, newRotX, newRotZ)) {
      return { success: false, reason: '⚠️ ไม่สามารถหมุนได้: ติดบล็อกอื่น!' };
    }

    const mirrorRotX = newRotX;
    const mirrorRotY = (4 - newRotY) % 4;
    const mirrorRotZ = (4 - newRotZ) % 4;

    if (isSymmetricPair && mirrorBlock) {
      if (!this.canPlaceBlock(mirrorBlock.x, mirrorBlock.y, mirrorBlock.z, mirrorBlock.type, mirrorRotY, ignoreKeys, mirrorBlock.shape, mirrorBlock.isAutoFloor, mirrorRotX, mirrorRotZ)) {
        return { success: false, reason: '⚠️ ไม่สามารถหมุนบล็อกคู่สมมาตรได้: ติดบล็อกอื่น!' };
      }
    }

    b.rotationX = newRotX;
    b.rotationY = newRotY;
    b.rotationZ = newRotZ;

    const existing = this.blockMeshes.get(this.selectedKey);
    if (existing) {
      this.garageGroup.remove(existing);
      this.blockMeshes.delete(this.selectedKey);
    }
    const mesh = this.createBlockMesh(b.type, b.shape, b.rotationY, b.isAutoFloor, b.y, b.rotationX, b.rotationZ);
    mesh.position.set(b.x * BLOCK_SIZE, b.y * BLOCK_SIZE + BLOCK_SIZE * 0.5, b.z * BLOCK_SIZE);
    mesh.userData = { gridX: b.x, gridY: b.y, gridZ: b.z, blockType: b.type, shape: b.shape, rotationY: b.rotationY, rotationX: b.rotationX, rotationZ: b.rotationZ, isAutoFloor: b.isAutoFloor };
    this.garageGroup.add(mesh);
    this.blockMeshes.set(this.selectedKey, mesh);

    if (isSymmetricPair && mirrorBlock) {
      mirrorBlock.rotationX = mirrorRotX;
      mirrorBlock.rotationY = mirrorRotY;
      mirrorBlock.rotationZ = mirrorRotZ;

      const mExisting = this.blockMeshes.get(mirrorBlockKey!);
      if (mExisting) {
        this.garageGroup.remove(mExisting);
        this.blockMeshes.delete(mirrorBlockKey!);
      }
      const mMesh = this.createBlockMesh(mirrorBlock.type, mirrorBlock.shape, mirrorBlock.rotationY, mirrorBlock.isAutoFloor, mirrorBlock.y, mirrorBlock.rotationX, mirrorBlock.rotationZ);
      mMesh.position.set(mirrorBlock.x * BLOCK_SIZE, mirrorBlock.y * BLOCK_SIZE + BLOCK_SIZE * 0.5, mirrorBlock.z * BLOCK_SIZE);
      mMesh.userData = { gridX: mirrorBlock.x, gridY: mirrorBlock.y, gridZ: mirrorBlock.z, blockType: mirrorBlock.type, shape: mirrorBlock.shape, rotationY: mirrorBlock.rotationY, rotationX: mirrorBlock.rotationX, rotationZ: mirrorBlock.rotationZ, isAutoFloor: mirrorBlock.isAutoFloor };
      this.garageGroup.add(mMesh);
      this.blockMeshes.set(mirrorBlockKey!, mMesh);
    }

    this.selectBlock(this.selectedKey);
    this.updateCoM();
    return { success: true };
  }

  public stretchSelectedBlock(dir: 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'): { success: boolean; reason?: string } {
    if (!this.selectedKey) return { success: false, reason: 'ไม่ได้เลือกบล็อก' };
    const b = this.blocks.get(this.selectedKey);
    if (!b) return { success: false, reason: 'ไม่พบบล็อกที่เลือก' };

    if (b.type === 'TRACK_UNIT') {
      if (dir === 'z+' || dir === 'z-') {
        const delta = dir === 'z+' ? 1 : -1;
        const res = this.resizeSelectedTrack(delta);
        return res.success ? { success: true } : { success: false, reason: '⚠️ ถึงขีดจำกัดความยาวสายพานแล้ว' };
      }
      return { success: false, reason: 'ℹ️ ปรับขนาดสายพานด้วยปุ่ม [+ ยืดล้อ] / [− หดล้อ] หรือยืดหน้า/หลัง' };
    }
    if (b.type === 'ENGINE') {
      return { success: false, reason: 'เครื่องยนต์ V12 เป็นโมดูล 2x3 บล็อก' };
    }

    // Offset in grid steps (1 block = 1.0 grid unit)
    const dx = dir === 'x+' ? 1 : dir === 'x-' ? -1 : 0;
    const dy = dir === 'y+' ? 1 : dir === 'y-' ? -1 : 0;
    const dz = dir === 'z+' ? 1 : dir === 'z-' ? -1 : 0;

    const targetX = Math.round((b.x + dx) * 1000) / 1000;
    const targetY = Math.max(0, Math.round((b.y + dy) * 1000) / 1000);
    const targetZ = Math.round((b.z + dz) * 1000) / 1000;

    if (!this.canPlaceBlock(targetX, targetY, targetZ, b.type, b.rotationY ?? 0, [], b.shape, b.isAutoFloor, b.rotationX ?? 0, b.rotationZ ?? 0)) {
      return { success: false, reason: '⚠️ ไม่สามารถยืดได้: มีบล็อกอื่นขวางอยู่หรือหลุดขอบแท่น!' };
    }

    this.rawSetBlock(targetX, targetY, targetZ, b.type, b.shape, b.rotationY, b.isAutoFloor, b.rotationX ?? 0, b.rotationZ ?? 0);
    const newKey = SimpleBuilder.key(targetX, targetY, targetZ);
    this.selectBlock(newKey);
    this.updateCoM();
    return { success: true };
  }

  public resizeSelectedTrack(delta: number): { success: boolean; newLength: number } {
    const maxLen = this.maxZ - this.minZ + 1; // 17 blocks
    const newLen = Math.max(2, Math.min(maxLen, this.trackLength + delta));
    if (newLen !== this.trackLength) {
      const oldBlock = this.selectedKey ? this.blocks.get(this.selectedKey) : null;
      const trackX = oldBlock?.type === 'TRACK_UNIT' ? oldBlock.x : null;
      const trackZ = oldBlock?.z ?? 0;

      this.setTrackLength(newLen);

      if (trackX !== null) {
        const trackBlocks = Array.from(this.blocks.values()).filter(
          (b) => b.type === 'TRACK_UNIT' && b.x === trackX
        );
        if (trackBlocks.length > 0) {
          const minZ = Math.min(...trackBlocks.map((b) => b.z));
          const maxZ = Math.max(...trackBlocks.map((b) => b.z));
          const targetZ = Math.max(minZ, Math.min(maxZ, Math.round(trackZ)));
          this.selectBlock(SimpleBuilder.key(trackX, 0, targetZ));
        }
      }
      return { success: true, newLength: newLen };
    }
    return { success: false, newLength: this.trackLength };
  }

  public deleteSelectedBlock(): boolean {
    if (!this.selectedKey) return false;
    const b = this.blocks.get(this.selectedKey);
    if (!b) return false;

    if (b.type === 'TRACK_UNIT') {
      const primaryTracks = Array.from(this.blocks.values()).filter(
        (tb) => tb.type === 'TRACK_UNIT' && tb.x === b.x && tb.y === b.y
      );
      // Tracks are always paired: delete both sides
      const mirrorTracks = b.x !== 0
        ? Array.from(this.blocks.values()).filter(
            (tb) => tb.type === 'TRACK_UNIT' && tb.x === -b.x && tb.y === b.y
          )
        : [];

      for (const tb of [...primaryTracks, ...mirrorTracks]) {
        this.removeBlock(tb.x, tb.y, tb.z, false);
      }
      this.syncAutoChassisFloor();
      this.rebuildTrackVisuals();
      this.updateCoM();
      this.selectBlock(null);
      return true;
    }

    this.removeBlock(b.x, b.y, b.z, true);
    if (this.symmetryEnabled && b.x !== 0) {
      this.removeBlock(-b.x, b.y, b.z, true);
    }
    this.selectBlock(null);
    return true;
  }

  private static key(x: number, y: number, z: number): string {
    return `${Number(x.toFixed(3))},${Number(y.toFixed(3))},${Number(z.toFixed(3))}`;
  }

  private rawSetBlock(
    x: number,
    y: number,
    z: number,
    type: BlockType,
    shape: LegoShape = 'CUBE',
    rotationY = 0,
    isAutoFloor = false,
    rotationX = 0,
    rotationZ = 0
  ): void {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY || z < this.minZ || z > this.maxZ) {
      return;
    }
    const key = SimpleBuilder.key(x, y, z);
    const existing = this.blockMeshes.get(key);
    if (existing) {
      this.garageGroup.remove(existing);
      this.blockMeshes.delete(key);
    }

    this.blocks.set(key, { x, y, z, type, shape, rotationY, rotationX, rotationZ, isAutoFloor });

    if (type !== 'TRACK_UNIT') {
      const mesh = this.createBlockMesh(type, shape, rotationY, isAutoFloor, y, rotationX, rotationZ);
      mesh.position.set(x * BLOCK_SIZE, y * BLOCK_SIZE + BLOCK_SIZE * 0.5, z * BLOCK_SIZE);
      mesh.userData = { gridX: x, gridY: y, gridZ: z, blockType: type, shape, rotationY, rotationX, rotationZ, isAutoFloor };
      this.garageGroup.add(mesh);
      this.blockMeshes.set(key, mesh);
    }
  }

  public setBlock(
    x: number,
    y: number,
    z: number,
    type: BlockType = this.selectedBlockType,
    updateCom = true,
    shape: LegoShape = this.activeShape,
    rotationY = this.activeRotationY,
    isAutoFloor = false,
    rotationX = this.activeRotationX,
    rotationZ = this.activeRotationZ
  ): boolean {
    if (x < this.minX || x > this.maxX || y < this.minY || y > this.maxY || z < this.minZ || z > this.maxZ) {
      return false;
    }

    if (!isAutoFloor && !this.canPlaceBlock(x, y, z, type, rotationY, [], shape, isAutoFloor, rotationX, rotationZ)) {
      return false;
    }

    this.rawSetBlock(x, y, z, type, shape, rotationY, isAutoFloor, rotationX, rotationZ);

    if (type === 'TRACK_UNIT') {
      this.syncAutoChassisFloor();
      this.rebuildTrackVisuals();
    }

    if (updateCom) {
      this.updateCoM();
    }
    return true;
  }

  public removeBlock(x: number, y: number, z: number, updateCom = true): boolean {
    const key = SimpleBuilder.key(x, y, z);
    const block = this.blocks.get(key);
    if (!block) return false;

    const existingMesh = this.blockMeshes.get(key);
    if (existingMesh) {
      this.garageGroup.remove(existingMesh);
      this.blockMeshes.delete(key);
    }

    this.blocks.delete(key);

    if (block.type === 'TRACK_UNIT') {
      this.rebuildTrackVisuals();
    }

    if (updateCom) {
      this.updateCoM();
    }
    return true;
  }

  /**
   * Groups contiguous track blocks on each X,Y column and renders unified King Tiger II assemblies.
   */
  public rebuildTrackVisuals(): void {
    for (const group of this.trackSegmentMeshes.values()) {
      this.garageGroup.remove(group);
    }
    this.trackSegmentMeshes.clear();

    const segments = findTrackSegments(Array.from(this.blocks.values()));
    for (const seg of segments) {
      const isLeft = seg.x > 0;
      const assembly = createKingTigerTrackMesh(seg.length, isLeft, false, this.trackTension);

      const centerX = seg.x * BLOCK_SIZE;
      const centerY = seg.y * BLOCK_SIZE + BLOCK_SIZE * 0.5;
      const centerZ = ((seg.minZ + seg.maxZ) / 2) * BLOCK_SIZE;

      assembly.group.position.set(centerX, centerY, centerZ);
      assembly.group.userData = {
        gridX: seg.x,
        gridY: seg.y,
        minZ: seg.minZ,
        maxZ: seg.maxZ,
        length: seg.length,
        blockType: 'TRACK_UNIT',
        isTrackSegment: true,
      };

      // Raycast helper box spanning the entire segment (scaled to fit 0.48m track unit)
      const hitBoxGeo = new THREE.BoxGeometry(
        0.48,
        0.82,
        seg.length * BLOCK_SIZE * 0.98
      );
      const hitBoxMat = new THREE.MeshBasicMaterial({ visible: false });
      const hitBox = new THREE.Mesh(hitBoxGeo, hitBoxMat);
      hitBox.position.y = 0.16;
      hitBox.userData = assembly.group.userData;
      assembly.group.add(hitBox);

      this.garageGroup.add(assembly.group);
      this.trackSegmentMeshes.set(`${seg.x},${seg.y},${seg.minZ}`, assembly.group);
    }
  }

  /**
   * Automatically stretches or shrinks the chassis belly floor (y=1)
   * to bridge between left and right tracks across their full Z-length.
   */
  public syncAutoChassisFloor(): void {
    const trackBlocks = Array.from(this.blocks.values()).filter((b) => b.type === 'TRACK_UNIT');
    if (trackBlocks.length === 0) {
      // No tracks: only clear auto-floor blocks that have NO components sitting directly above them
      const toRemove: BlueprintBlock[] = [];
      for (const b of this.blocks.values()) {
        if (b.isAutoFloor) {
          const hasBlockAbove = Array.from(this.blocks.values()).some((other) => {
            if (other.isAutoFloor || other.type === 'TRACK_UNIT') return false;
            if (other.y < b.y + 0.8 || other.y > b.y + 1.2) return false;
            const aabb = this.getBlockAABB(other.x, other.y, other.z, other.type, other.rotationY ?? 0, other.shape, other.isAutoFloor);
            const floorAabb = this.getBlockAABB(b.x, b.y, b.z, b.type, b.rotationY ?? 0, b.shape, b.isAutoFloor);
            return floorAabb.min.x < aabb.max.x - 0.02 && floorAabb.max.x > aabb.min.x + 0.02 &&
                   floorAabb.min.z < aabb.max.z - 0.02 && floorAabb.max.z > aabb.min.z + 0.02;
          });
          if (!hasBlockAbove) {
            toRemove.push(b);
          }
        }
      }
      for (const b of toRemove) {
        this.removeBlock(b.x, b.y, b.z, false);
      }
      return;
    }

    const leftTracks = trackBlocks.filter((b) => b.x > 0);
    const rightTracks = trackBlocks.filter((b) => b.x < 0);

    // If tracks are missing on either side, do not bridge
    if (leftTracks.length === 0 || rightTracks.length === 0) {
      return;
    }

    const leftX = Math.min(...leftTracks.map((b) => b.x));
    const rightX = Math.max(...rightTracks.map((b) => b.x));

    if (leftX - 1 < rightX + 1) {
      return;
    }

    const trackMinZ = Math.min(...trackBlocks.map((b) => b.z));
    const trackMaxZ = Math.max(...trackBlocks.map((b) => b.z));
    const trackMinY = Math.min(...trackBlocks.map((b) => b.y));

    // Floor span encompasses both track span AND any placed vehicle modules (Engine, Cockpit, etc.)
    const moduleBlocks = Array.from(this.blocks.values()).filter(
      (b) => b.type !== 'TRACK_UNIT' && !b.isAutoFloor
    );
    let effectiveMinZ = trackMinZ;
    let effectiveMaxZ = trackMaxZ;
    for (const mb of moduleBlocks) {
      if (mb.type === 'ENGINE') {
        effectiveMinZ = Math.min(effectiveMinZ, mb.z - 2);
        effectiveMaxZ = Math.max(effectiveMaxZ, mb.z + 2);
      } else {
        effectiveMinZ = Math.min(effectiveMinZ, mb.z);
        effectiveMaxZ = Math.max(effectiveMaxZ, mb.z);
      }
    }

    const minZ = Math.max(this.minZ, Math.round(effectiveMinZ));
    const maxZ = Math.min(this.maxZ, Math.round(effectiveMaxZ));
    const yFloor = trackMinY;

    const startX = Math.ceil(rightX + 0.9);
    const endX = Math.floor(leftX - 0.9);

    const validKeys = new Set<string>();

    for (let x = startX; x <= endX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const key = SimpleBuilder.key(x, yFloor, z);
        validKeys.add(key);
        const existing = this.blocks.get(key);
        if (!existing) {
          this.rawSetBlock(x, yFloor, z, 'CHASSIS', 'PLATE', 0, true);
        }
      }
    }

    // Prune auto-floor blocks outside active span or at an orphaned Y level
    const toPrune: BlueprintBlock[] = [];
    for (const b of this.blocks.values()) {
      if (b.isAutoFloor) {
        if (b.y !== yFloor) {
          toPrune.push(b);
          continue;
        }
        const key = SimpleBuilder.key(b.x, b.y, b.z);
        if (!validKeys.has(key)) {
          const hasBlockAbove = Array.from(this.blocks.values()).some((other) => {
            if (other.isAutoFloor || other.type === 'TRACK_UNIT') return false;
            if (other.y < b.y + 0.8 || other.y > b.y + 1.2) return false;
            const aabb = this.getBlockAABB(other.x, other.y, other.z, other.type, other.rotationY ?? 0, other.shape, other.isAutoFloor);
            const floorAabb = this.getBlockAABB(b.x, b.y, b.z, b.type, b.rotationY ?? 0, b.shape, b.isAutoFloor);
            return floorAabb.min.x < aabb.max.x - 0.02 && floorAabb.max.x > aabb.min.x + 0.02 &&
                   floorAabb.min.z < aabb.max.z - 0.02 && floorAabb.max.z > aabb.min.z + 0.02;
          });
          if (!hasBlockAbove) {
            toPrune.push(b);
          }
        }
      }
    }
    for (const b of toPrune) {
      this.removeBlock(b.x, b.y, b.z, false);
    }
  }

  /**
   * Resizes existing tracks on the grid platform to the new length
   * and dynamically stretches or shrinks the chassis belly floor.
   */
  public resizeExistingTracks(newLength: number): void {
    const trackBlocks = Array.from(this.blocks.values()).filter((b) => b.type === 'TRACK_UNIT');
    if (trackBlocks.length === 0) return;

    const xColumns = new Set<number>();
    for (const b of trackBlocks) {
      xColumns.add(b.x);
    }

    const minZ = Math.min(...trackBlocks.map((b) => b.z));
    const maxZ = Math.max(...trackBlocks.map((b) => b.z));
    const centerZ = Math.round((minZ + maxZ) / 2);

    const halfSpan = Math.floor((newLength - 1) / 2);
    let newMinZ = centerZ - halfSpan;
    let newMaxZ = newMinZ + newLength - 1;

    if (newMinZ < this.minZ) {
      newMaxZ += this.minZ - newMinZ;
      newMinZ = this.minZ;
    }
    if (newMaxZ > this.maxZ) {
      newMinZ -= newMaxZ - this.maxZ;
      newMaxZ = this.maxZ;
    }
    newMinZ = Math.max(this.minZ, newMinZ);
    newMaxZ = Math.min(this.maxZ, newMaxZ);

    // Track selection preservation
    const oldBlock = this.selectedKey ? this.blocks.get(this.selectedKey) : null;
    const trackX = oldBlock?.type === 'TRACK_UNIT' ? oldBlock.x : null;
    const trackZ = oldBlock?.z ?? centerZ;

    // Remove existing track blocks
    for (const b of trackBlocks) {
      const key = SimpleBuilder.key(b.x, b.y, b.z);
      const mesh = this.blockMeshes.get(key);
      if (mesh) {
        this.garageGroup.remove(mesh);
        this.blockMeshes.delete(key);
      }
      this.blocks.delete(key);
    }

    // Add resized track blocks
    for (const x of xColumns) {
      for (let z = newMinZ; z <= newMaxZ; z++) {
        this.rawSetBlock(x, 0, z, 'TRACK_UNIT');
      }
    }

    // Restore track selection
    if (trackX !== null && xColumns.has(trackX)) {
      const targetZ = Math.max(newMinZ, Math.min(newMaxZ, Math.round(trackZ)));
      this.selectBlock(SimpleBuilder.key(trackX, 0, targetZ));
    }

    this.syncAutoChassisFloor();
    this.rebuildTrackVisuals();
    this.updateCoM();
  }

  private createBlockMesh(
    type: BlockType,
    shape: LegoShape = 'CUBE',
    rotationY = 0,
    isAutoFloor = false,
    y = 1,
    rotationX = 0,
    rotationZ = 0
  ): THREE.Group {
    const s = BLOCK_SIZE;

    if (isAutoFloor) {
      const group = new THREE.Group();
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

      // Subtle edge line around the 8cm plate so tile boundaries and seams are distinct
      const edgeGeo = new THREE.EdgesGeometry(floorGeo);
      const edgeMat = new THREE.LineBasicMaterial({
        color: 0x111827,
        transparent: true,
        opacity: 0.40,
      });
      const edges = new THREE.LineSegments(edgeGeo, edgeMat);
      edges.raycast = () => {};
      floorMesh.add(edges);

      // Top tread border rim
      const rimGeo = new THREE.BoxGeometry(s, 0.006, s);
      const rimMat = new THREE.MeshStandardMaterial({
        color: 0x4f6074,
        roughness: 0.55,
        metalness: 0.08,
      });
      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      rimMesh.position.y = (s * 0.5) + 0.003;
      rimMesh.raycast = () => {};
      group.add(rimMesh);

      group.rotation.set(0, rotationY * (Math.PI / 2), 0);
      return group;
    }

    if (shape !== 'CUBE' || type === 'WEAPON' || type === 'TURRET') {
      return createLegoMesh(type, shape, rotationY, false, rotationX, rotationZ);
    }

    if (type === 'ENGINE') {
      return createV12EngineMesh(rotationY, false);
    }

    const group = new THREE.Group();
    const def = BLOCK_DEFS[type];

    switch (type) {
      case 'COCKPIT': {
        const bodyGeo = new THREE.BoxGeometry(s, s, s);
        const bodyMat = new THREE.MeshStandardMaterial({
          color: def.color,
          roughness: 0.50,
          metalness: 0.08,
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(bodyMesh);

        const edgeGeo = new THREE.EdgesGeometry(bodyGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          transparent: true,
          opacity: 0.45,
        });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.raycast = () => {};
        bodyMesh.add(edges);

        // Visor window
        const visorGeo = new THREE.BoxGeometry(s * 0.75, s * 0.3, s * 0.15);
        const visorMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0ea5e9,
          emissiveIntensity: 0.9,
          roughness: 0.2,
          metalness: 0.1,
        });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, s * 0.1, s * 0.45);
        group.add(visor);
        group.rotation.set(
          rotationX * (Math.PI / 2),
          rotationY * (Math.PI / 2),
          rotationZ * (Math.PI / 2)
        );
        break;
      }

      case 'TRACK_UNIT': {
        // Fallback single block unit if rendered outside assembly
        const treadGeo = new THREE.BoxGeometry(s, s * 0.75, s);
        const treadMat = new THREE.MeshStandardMaterial({
          color: 0x27272a,
          roughness: 0.70,
          metalness: 0.10,
        });
        const treadMesh = new THREE.Mesh(treadGeo, treadMat);
        group.add(treadMesh);
        break;
      }

      case 'CHASSIS':
      default: {
        const boxGeo = new THREE.BoxGeometry(s, s, s);
        const boxMat = new THREE.MeshStandardMaterial({
          color: def.color,
          roughness: 0.60,
          metalness: 0.05,
        });
        const boxMesh = new THREE.Mesh(boxGeo, boxMat);
        group.add(boxMesh);

        const edgeGeo = new THREE.EdgesGeometry(boxGeo);
        const edgeMat = new THREE.LineBasicMaterial({
          color: 0x0f172a,
          transparent: true,
          opacity: 0.45,
        });
        const edges = new THREE.LineSegments(edgeGeo, edgeMat);
        edges.raycast = () => {};
        boxMesh.add(edges);
        group.rotation.set(
          rotationX * (Math.PI / 2),
          rotationY * (Math.PI / 2),
          rotationZ * (Math.PI / 2)
        );
        break;
      }
    }

    return group;
  }

  private updateCoM(): void {
    let totalMass = 0;
    const weightedSum = new THREE.Vector3();

    const center = new THREE.Vector3();
    for (const b of this.blocks.values()) {
      const shapeMass = b.shape ? LEGO_SHAPE_DEFS[b.shape]?.mass : undefined;
      const m = b.isAutoFloor ? 157 : (shapeMass ?? BLOCK_DEFS[b.type].mass);
      totalMass += m;
      const aabb = this.getBlockAABB(
        b.x,
        b.y,
        b.z,
        b.type,
        b.rotationY ?? 0,
        b.shape,
        b.isAutoFloor,
        b.rotationX ?? 0,
        b.rotationZ ?? 0
      );
      aabb.getCenter(center);
      weightedSum.addScaledVector(center, m);
    }

    if (totalMass > 0) {
      this.comMarker.position.copy(weightedSum.divideScalar(totalMass));
      this.comMarker.visible = true;
    } else {
      this.comMarker.visible = false;
    }
  }

  public getStats(): BuilderStats {
    let mass = 0;
    let engineCount = 0;
    let trackCount = 0;
    let weaponCount = 0;
    let hasCockpit = false;

    for (const b of this.blocks.values()) {
      const shapeMass = b.shape ? LEGO_SHAPE_DEFS[b.shape]?.mass : undefined;
      mass += b.isAutoFloor ? 157 : (shapeMass ?? BLOCK_DEFS[b.type].mass);
      if (b.type === 'COCKPIT') hasCockpit = true;
      if (b.type === 'ENGINE') engineCount++;
      if (b.type === 'TRACK_UNIT') trackCount++;
      if (b.type === 'WEAPON' || b.shape === 'FLAK_44' || b.shape === 'FLAK_41') weaponCount++;
    }

    return {
      mass,
      blockCount: this.blocks.size,
      engineCount,
      trackCount,
      weaponCount,
      hasCockpit,
      centerOfMass: this.comMarker.position.clone(),
    };
  }

  public updateHover(clientX: number, clientY: number): { gridPos: THREE.Vector3; isOccupied: boolean } | null {
    if (!this.garageGroup.visible || this.toolMode === 'SELECT') {
      this.ghostGroup.visible = false;
      if (!this.garageGroup.visible || (this.toolMode === 'SELECT' && !this.selectedKey)) {
        this.hideFocused3DGrid();
      }
      return null;
    }

    const mouseNdc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(mouseNdc, this.camera);

    const checkObjects: THREE.Object3D[] = [
      ...Array.from(this.blockMeshes.values()),
      ...Array.from(this.trackSegmentMeshes.values()),
    ];
    const intersects = this.raycaster.intersectObjects(checkObjects, true);

    let targetCell: THREE.Vector3 | null = null;
    let isOccupied = false;

    const testBox = this.getBlockAABB(
      0,
      0,
      0,
      this.selectedBlockType,
      this.activeRotationY,
      this.activeShape,
      false,
      this.activeRotationX,
      this.activeRotationZ
    );

    const step = this.gridSnap;

    if (intersects.length > 0) {
      const hit = intersects.find((h) => h.object instanceof THREE.Mesh && h.face);
      if (hit) {
        let cur: THREE.Object3D | null = hit.object;
        while (cur && !cur.userData.blockType && cur.parent && cur.parent !== this.garageGroup) {
          cur = cur.parent;
        }

        if (cur && cur.userData.gridX !== undefined) {
          const hitX = cur.userData.gridX as number;
          const hitY = cur.userData.gridY as number;
          // For track segments, derive hitZ from the world intersection point
          let hitZ = cur.userData.gridZ as number;
          if (cur.userData.isTrackSegment) {
            hitZ = Math.round(hit.point.z / BLOCK_SIZE);
          }

          if (hit.face) {
            const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();

            const hitAABB = cur.userData.isTrackSegment
              ? new THREE.Box3(
                  new THREE.Vector3(hitX * BLOCK_SIZE - 0.24, hitY * BLOCK_SIZE, (hitZ - 0.5) * BLOCK_SIZE),
                  new THREE.Vector3(hitX * BLOCK_SIZE + 0.24, hitY * BLOCK_SIZE + 0.82, (hitZ + 0.5) * BLOCK_SIZE)
                )
              : this.getBlockAABB(
                  hitX,
                  hitY,
                  hitZ,
                  cur.userData.blockType,
                  cur.userData.rotationY ?? 0,
                  cur.userData.shape,
                  cur.userData.isAutoFloor,
                  cur.userData.rotationX ?? 0,
                  cur.userData.rotationZ ?? 0
                );

            let targetX = hitX;
            let targetY = hitY;
            let targetZ = hitZ;

            if (normal.y > 0.5) {
              targetY = Number(((hitAABB.max.y - testBox.min.y) / BLOCK_SIZE).toFixed(3));
              if (step >= 0.5) {
                targetX = Math.round(hitX);
                targetZ = Math.round(hitZ);
              } else {
                const snappedWorldX = Math.round((hit.point.x - (testBox.min.x + testBox.max.x) * 0.5) / step) * step;
                const snappedWorldZ = Math.round((hit.point.z - (testBox.min.z + testBox.max.z) * 0.5) / step) * step;
                targetX = Number((snappedWorldX / BLOCK_SIZE).toFixed(3));
                targetZ = Number((snappedWorldZ / BLOCK_SIZE).toFixed(3));
              }
            } else if (normal.y < -0.5) {
              const bottomY = hitAABB.min.y - testBox.max.y;
              targetY = Math.max(0, Number((bottomY / BLOCK_SIZE).toFixed(3)));
              if (step >= 0.5) {
                targetX = Math.round(hitX);
                targetZ = Math.round(hitZ);
              } else {
                const snappedWorldX = Math.round((hit.point.x - (testBox.min.x + testBox.max.x) * 0.5) / step) * step;
                const snappedWorldZ = Math.round((hit.point.z - (testBox.min.z + testBox.max.z) * 0.5) / step) * step;
                targetX = Number((snappedWorldX / BLOCK_SIZE).toFixed(3));
                targetZ = Number((snappedWorldZ / BLOCK_SIZE).toFixed(3));
              }
            } else if (Math.abs(normal.x) > 0.5) {
              if (normal.x > 0.5) {
                targetX = Number(((hitAABB.max.x - testBox.min.x) / BLOCK_SIZE).toFixed(3));
              } else {
                targetX = Number(((hitAABB.min.x - testBox.max.x) / BLOCK_SIZE).toFixed(3));
              }
              if (step >= 0.5) {
                targetY = hitY;
                targetZ = Math.round(hitZ);
              } else {
                const snappedWorldBottomY = Math.floor((hit.point.y + 0.001) / step) * step;
                targetY = Math.max(0, Number(((snappedWorldBottomY - testBox.min.y) / BLOCK_SIZE).toFixed(3)));
                const snappedWorldZ = Math.round((hit.point.z - (testBox.min.z + testBox.max.z) * 0.5) / step) * step;
                targetZ = Number((snappedWorldZ / BLOCK_SIZE).toFixed(3));
              }
            } else if (Math.abs(normal.z) > 0.5) {
              if (normal.z > 0.5) {
                targetZ = Number(((hitAABB.max.z - testBox.min.z) / BLOCK_SIZE).toFixed(3));
              } else {
                targetZ = Number(((hitAABB.min.z - testBox.max.z) / BLOCK_SIZE).toFixed(3));
              }
              if (step >= 0.5) {
                targetY = hitY;
                targetX = Math.round(hitX);
              } else {
                const snappedWorldBottomY = Math.floor((hit.point.y + 0.001) / step) * step;
                targetY = Math.max(0, Number(((snappedWorldBottomY - testBox.min.y) / BLOCK_SIZE).toFixed(3)));
                const snappedWorldX = Math.round((hit.point.x - (testBox.min.x + testBox.max.x) * 0.5) / step) * step;
                targetX = Number((snappedWorldX / BLOCK_SIZE).toFixed(3));
              }
            }

            targetCell = new THREE.Vector3(targetX, targetY, targetZ);
          } else {
            targetCell = new THREE.Vector3(hitX, hitY, hitZ);
            isOccupied = true;
          }
        }
      }
    }

    // Fallback raycast onto platform floor plane (Y=0)
    if (!targetCell) {
      const planeIntersect = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(this.floorPlane, planeIntersect)) {
        let gx: number;
        let gz: number;
        if (step >= 0.5) {
          gx = Math.round(planeIntersect.x / BLOCK_SIZE);
          gz = Math.round(planeIntersect.z / BLOCK_SIZE);
        } else {
          const wx = Math.round((planeIntersect.x - (testBox.min.x + testBox.max.x) * 0.5) / step) * step;
          const wz = Math.round((planeIntersect.z - (testBox.min.z + testBox.max.z) * 0.5) / step) * step;
          gx = Number((wx / BLOCK_SIZE).toFixed(3));
          gz = Number((wz / BLOCK_SIZE).toFixed(3));
        }
        if (gx >= this.minX && gx <= this.maxX && gz >= this.minZ && gz <= this.maxZ) {
          targetCell = new THREE.Vector3(gx, 0, gz);
        }
      }
    }

    if (!targetCell) {
      this.ghostGroup.visible = false;
      this.hideFocused3DGrid();
      this.lastHoverCell = null;
      return null;
    }

    const inBounds =
      targetCell.x >= this.minX &&
      targetCell.x <= this.maxX &&
      targetCell.y >= this.minY &&
      targetCell.y <= this.maxY &&
      targetCell.z >= this.minZ &&
      targetCell.z <= this.maxZ;

    if (!inBounds) {
      this.ghostGroup.visible = false;
      this.hideFocused3DGrid();
      this.lastHoverCell = null;
      return null;
    }

    this.lastHoverCell = targetCell.clone();
    this.updateFocused3DGrid(targetCell);
    this.ghostGroup.visible = inBounds;

    if (this.selectedBlockType === 'TRACK_UNIT') {
      // King Tiger Track Multi-Block Ghost
      this.ghostMesh.visible = false;
      this.ghostMirrorMesh.visible = false;
      this.engineGhostMesh.visible = false;
      this.engineGhostMirrorMesh.visible = false;

      const halfSpan = Math.floor((this.trackLength - 1) / 2);
      let zStart = targetCell.z - halfSpan;
      let zEnd = zStart + this.trackLength - 1;

      if (zStart < this.minZ) {
        zEnd += this.minZ - zStart;
        zStart = this.minZ;
      }
      if (zEnd > this.maxZ) {
        zStart -= zEnd - this.maxZ;
        zEnd = this.maxZ;
      }
      zStart = Math.max(this.minZ, zStart);
      zEnd = Math.min(this.maxZ, zEnd);

      // Tracks MUST be placed as a pair (left & right) - cannot be placed on centerline
      if (Math.abs(targetCell.x) < 1) {
        isOccupied = true;
      }

      if (!isOccupied) {
        for (let z = zStart; z <= zEnd; z++) {
          const boxLeft = this.getBlockAABB(targetCell.x, targetCell.y, z, 'TRACK_UNIT');
          if (this.checkOverlap(boxLeft)) {
            isOccupied = true;
            break;
          }
          // Validate mirror counterpart always
          const boxRight = this.getBlockAABB(-targetCell.x, targetCell.y, z, 'TRACK_UNIT');
          if (this.checkOverlap(boxRight) || SimpleBuilder.boxesOverlap(boxLeft, boxRight)) {
            isOccupied = true;
            break;
          }
        }
      }

      const centerZ = ((zStart + zEnd) / 2) * BLOCK_SIZE;
      const centerY = targetCell.y * BLOCK_SIZE + BLOCK_SIZE * 0.5;

      const trackGhostColor = !inBounds || isOccupied ? 0xff384c : 0x38e578;
      if (this.trackGhostAssembly) {
        this.trackGhostAssembly.group.visible = inBounds;
        this.trackGhostAssembly.group.position.set(
          targetCell.x * BLOCK_SIZE,
          centerY,
          centerZ
        );
        this.trackGhostAssembly.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material && 'color' in c.material) {
            (c.material as THREE.MeshBasicMaterial).color?.setHex(trackGhostColor);
          }
        });
      }

      // Mirror track ghost is ALWAYS visible for paired wheel placement
      if (targetCell.x !== 0 && this.trackGhostMirrorAssembly) {
        this.trackGhostMirrorAssembly.group.visible = inBounds;
        this.trackGhostMirrorAssembly.group.position.set(
          -targetCell.x * BLOCK_SIZE,
          centerY,
          centerZ
        );
        this.trackGhostMirrorAssembly.group.traverse((c) => {
          if (c instanceof THREE.Mesh && c.material && 'color' in c.material) {
            (c.material as THREE.MeshBasicMaterial).color?.setHex(trackGhostColor);
          }
        });

        // Preview bridging auto-chassis floor between tracks
        const leftX = Math.abs(targetCell.x);
        const rightX = -leftX;
        const floorWidthBlocks = (leftX - 1) - (rightX + 1) + 1;
        if (floorWidthBlocks > 0) {
          const floorWidthMeters = floorWidthBlocks * BLOCK_SIZE;
          const floorLengthMeters = (zEnd - zStart + 1) * BLOCK_SIZE;
          const plateH = 0.08;
          const floorCenterY = 0 * BLOCK_SIZE + BLOCK_SIZE - plateH * 0.5;

          this.ghostFloorMesh.visible = inBounds;
          this.ghostFloorMesh.scale.set(floorWidthMeters * 0.98, plateH, floorLengthMeters * 0.98);
          this.ghostFloorMesh.position.set(0, floorCenterY, centerZ);
          (this.ghostFloorMesh.material as THREE.MeshBasicMaterial).color?.setHex(trackGhostColor);
        } else {
          this.ghostFloorMesh.visible = false;
        }
      } else {
        if (this.trackGhostMirrorAssembly) this.trackGhostMirrorAssembly.group.visible = false;
        this.ghostFloorMesh.visible = false;
      }
    } else if (this.selectedBlockType === 'ENGINE') {
      // 2x3 Maybach V12 Engine Multi-Block Ghost
      this.ghostMesh.visible = false;
      this.ghostMirrorMesh.visible = false;
      this.ghostFloorMesh.visible = false;
      if (this.trackGhostAssembly) this.trackGhostAssembly.group.visible = false;
      if (this.trackGhostMirrorAssembly) this.trackGhostMirrorAssembly.group.visible = false;

      const primaryBox = this.getBlockAABB(targetCell.x, targetCell.y, targetCell.z, 'ENGINE', this.activeRotationY);
      isOccupied = !inBounds || this.checkOverlap(primaryBox);

      if (!isOccupied && this.symmetryEnabled && targetCell.x !== 0) {
        const mirrorRot = (4 - this.activeRotationY) % 4;
        const mirrorBox = this.getBlockAABB(-targetCell.x, targetCell.y, targetCell.z, 'ENGINE', mirrorRot);
        if (this.checkOverlap(mirrorBox) || SimpleBuilder.boxesOverlap(primaryBox, mirrorBox)) {
          isOccupied = true;
        }
      }

      const ghostColor = !inBounds || isOccupied ? 0xff384c : 0x38e578;
      this.engineGhostMesh.visible = inBounds;
      this.engineGhostMesh.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material) {
          (child.material as THREE.MeshBasicMaterial).color?.setHex(ghostColor);
        }
      });
      this.engineGhostMesh.position.set(
        targetCell.x * BLOCK_SIZE,
        targetCell.y * BLOCK_SIZE + BLOCK_SIZE * 0.5,
        targetCell.z * BLOCK_SIZE
      );
      this.engineGhostMesh.rotation.y = this.activeRotationY * (Math.PI / 2);

      if (this.symmetryEnabled && targetCell.x !== 0) {
        this.engineGhostMirrorMesh.visible = inBounds;
        this.engineGhostMirrorMesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            (child.material as THREE.MeshBasicMaterial).color?.setHex(ghostColor);
          }
        });
        this.engineGhostMirrorMesh.position.set(
          -targetCell.x * BLOCK_SIZE,
          targetCell.y * BLOCK_SIZE + BLOCK_SIZE * 0.5,
          targetCell.z * BLOCK_SIZE
        );
        const mirrorRot = (4 - this.activeRotationY) % 4;
        this.engineGhostMirrorMesh.rotation.y = mirrorRot * (Math.PI / 2);
      } else {
        this.engineGhostMirrorMesh.visible = false;
      }
    } else {
      this.ghostFloorMesh.visible = false;
      this.engineGhostMesh.visible = false;
      this.engineGhostMirrorMesh.visible = false;
      if (this.trackGhostAssembly) this.trackGhostAssembly.group.visible = false;
      if (this.trackGhostMirrorAssembly) this.trackGhostMirrorAssembly.group.visible = false;

      const rx = this.activeRotationX * (Math.PI / 2);
      const ry = this.activeRotationY * (Math.PI / 2);
      const rz = this.activeRotationZ * (Math.PI / 2);
      const mirrorRotX = rx;
      const mirrorRotY = ((4 - this.activeRotationY) % 4) * (Math.PI / 2);
      const mirrorRotZ = ((4 - this.activeRotationZ) % 4) * (Math.PI / 2);

      const mirrorRotYInt = (4 - this.activeRotationY) % 4;
      const mirrorRotZInt = (4 - this.activeRotationZ) % 4;

      const primaryBox = this.getBlockAABB(
        targetCell.x,
        targetCell.y,
        targetCell.z,
        this.selectedBlockType,
        this.activeRotationY,
        this.activeShape,
        false,
        this.activeRotationX,
        this.activeRotationZ
      );
      isOccupied = !inBounds || this.checkOverlap(primaryBox);

      if (!isOccupied && this.symmetryEnabled && targetCell.x !== 0) {
        const mirrorBox = this.getBlockAABB(
          -targetCell.x,
          targetCell.y,
          targetCell.z,
          this.selectedBlockType,
          mirrorRotYInt,
          this.activeShape,
          false,
          this.activeRotationX,
          mirrorRotZInt
        );
        if (this.checkOverlap(mirrorBox) || SimpleBuilder.boxesOverlap(primaryBox, mirrorBox)) {
          isOccupied = true;
        }
      }

      this.ghostMesh.visible = inBounds;
      const ghostColor = !inBounds || isOccupied ? 0xff384c : 0x38e578;
      (this.ghostMesh.material as THREE.MeshBasicMaterial).color.setHex(ghostColor);
      (this.ghostMirrorMesh.material as THREE.MeshBasicMaterial).color.setHex(ghostColor);

      this.ghostMesh.position.set(
        targetCell.x * BLOCK_SIZE,
        targetCell.y * BLOCK_SIZE + BLOCK_SIZE * 0.5,
        targetCell.z * BLOCK_SIZE
      );
      this.ghostMesh.rotation.set(rx, ry, rz);

      if (this.symmetryEnabled && targetCell.x !== 0) {
        this.ghostMirrorMesh.visible = true;
        this.ghostMirrorMesh.position.set(
          -targetCell.x * BLOCK_SIZE,
          targetCell.y * BLOCK_SIZE + BLOCK_SIZE * 0.5,
          targetCell.z * BLOCK_SIZE
        );
        this.ghostMirrorMesh.rotation.set(mirrorRotX, mirrorRotY, mirrorRotZ);
      } else {
        this.ghostMirrorMesh.visible = false;
      }
    }

    return { gridPos: targetCell, isOccupied };
  }

  public placeAtHover(clientX: number, clientY: number): boolean {
    if (this.toolMode === 'SELECT') {
      const selected = this.selectBlockAtPointer(clientX, clientY);
      return selected !== null;
    }

    const hover = this.updateHover(clientX, clientY);
    if (!hover || hover.isOccupied) return false;

    const p = hover.gridPos;

    if (this.selectedBlockType === 'TRACK_UNIT') {
      // Tracks CANNOT be placed at center line x = 0 (must be a bilateral pair)
      if (Math.abs(p.x) < 1) return false;

      // Place King Tiger continuous track run of length `trackLength`
      const halfSpan = Math.floor((this.trackLength - 1) / 2);
      let zStart = p.z - halfSpan;
      let zEnd = zStart + this.trackLength - 1;

      if (zStart < this.minZ) {
        zEnd += this.minZ - zStart;
        zStart = this.minZ;
      }
      if (zEnd > this.maxZ) {
        zStart -= zEnd - this.maxZ;
        zEnd = this.maxZ;
      }
      zStart = Math.max(this.minZ, zStart);
      zEnd = Math.min(this.maxZ, zEnd);

      // Validate non-overlapping on BOTH primary and mirror tracks unconditionally
      for (let z = zStart; z <= zEnd; z++) {
        const boxLeft = this.getBlockAABB(p.x, p.y, z, 'TRACK_UNIT');
        if (this.checkOverlap(boxLeft)) return false;
        const boxRight = this.getBlockAABB(-p.x, p.y, z, 'TRACK_UNIT');
        if (this.checkOverlap(boxRight) || SimpleBuilder.boxesOverlap(boxLeft, boxRight)) {
          return false;
        }
      }

      // Always place paired tracks on both sides (+x and -x)
      for (let z = zStart; z <= zEnd; z++) {
        this.rawSetBlock(p.x, p.y, z, 'TRACK_UNIT');
        this.rawSetBlock(-p.x, p.y, z, 'TRACK_UNIT');
      }
      this.syncAutoChassisFloor();
      this.rebuildTrackVisuals();
      this.updateCoM();
      return true;
    } else {
      const mirrorRotX = this.activeRotationX;
      const mirrorRotY = (4 - this.activeRotationY) % 4;
      const mirrorRotZ = (4 - this.activeRotationZ) % 4;

      const primaryBox = this.getBlockAABB(
        p.x,
        p.y,
        p.z,
        this.selectedBlockType,
        this.activeRotationY,
        this.activeShape,
        false,
        this.activeRotationX,
        this.activeRotationZ
      );
      if (this.checkOverlap(primaryBox)) return false;

      if (this.symmetryEnabled && p.x !== 0) {
        const mirrorBox = this.getBlockAABB(
          -p.x,
          p.y,
          p.z,
          this.selectedBlockType,
          mirrorRotY,
          this.activeShape,
          false,
          mirrorRotX,
          mirrorRotZ
        );
        if (this.checkOverlap(mirrorBox) || SimpleBuilder.boxesOverlap(primaryBox, mirrorBox)) {
          return false;
        }
      }

      this.rawSetBlock(
        p.x,
        p.y,
        p.z,
        this.selectedBlockType,
        this.activeShape,
        this.activeRotationY,
        false,
        this.activeRotationX,
        this.activeRotationZ
      );
      if (this.symmetryEnabled && p.x !== 0) {
        this.rawSetBlock(
          -p.x,
          p.y,
          p.z,
          this.selectedBlockType,
          this.activeShape,
          mirrorRotY,
          false,
          mirrorRotX,
          mirrorRotZ
        );
      }
    }
    this.updateCoM();
    return true;
  }

  public deleteAtPointer(clientX: number, clientY: number): boolean {
    const mouseNdc = new THREE.Vector2(
      (clientX / window.innerWidth) * 2 - 1,
      -(clientY / window.innerHeight) * 2 + 1
    );
    this.raycaster.setFromCamera(mouseNdc, this.camera);

    const checkObjects: THREE.Object3D[] = [
      ...Array.from(this.blockMeshes.values()),
      ...Array.from(this.trackSegmentMeshes.values()),
    ];
    const intersects = this.raycaster.intersectObjects(checkObjects, true);
    if (intersects.length === 0) return false;

    let cur: THREE.Object3D | null = intersects[0].object;
    while (cur && !cur.userData.blockType && cur.parent && cur.parent !== this.garageGroup) {
      cur = cur.parent;
    }

    if (cur && cur.userData.gridX !== undefined) {
      const gx = cur.userData.gridX as number;
      const gy = cur.userData.gridY as number;
      let gz = cur.userData.gridZ as number;

      if (cur.userData.isTrackSegment || cur.userData.blockType === 'TRACK_UNIT') {
        // Tracks are ALWAYS deleted as a paired assembly on both left and right
        const tracksToDelete = Array.from(this.blocks.values()).filter(
          (tb) => tb.type === 'TRACK_UNIT' && (tb.x === gx || tb.x === -gx)
        );
        for (const tb of tracksToDelete) {
          this.removeBlock(tb.x, tb.y, tb.z, false);
        }
        this.syncAutoChassisFloor();
        this.rebuildTrackVisuals();
        this.updateCoM();
        return true;
      }

      this.removeBlock(gx, gy, gz, false);
      if (this.symmetryEnabled && gx !== 0) {
        this.removeBlock(-gx, gy, gz, false);
      }
      this.syncAutoChassisFloor();
      this.rebuildTrackVisuals();
      this.updateCoM();
      return true;
    }
    return false;
  }
}
