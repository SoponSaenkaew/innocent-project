import { BlockType, BLOCK_DEFS } from '../blocks/BlockTypes';
import { LegoShape, LEGO_SHAPE_DEFS } from '../blocks/LegoShapes';
import { SimpleBuilder } from '../garage/SimpleBuilder';
import { TrackTension } from '../vehicle/KingTigerTrack';
import { TrackedVehicle } from '../vehicle/TrackedVehicle';
import { TelemetryHUD } from './TelemetryHUD';

export interface GarageUIOptions {
  simpleBuilder: SimpleBuilder;
  telemetryHUD: TelemetryHUD;
  getTrackedVehicle: () => TrackedVehicle | null;
  onBlueprintModified: () => void;
  getCurrentMode: () => 'GARAGE' | 'DRIVE';
}

export class GarageUI {
  private simpleBuilder: SimpleBuilder;
  private telemetryHUD: TelemetryHUD;
  private getTrackedVehicle: () => TrackedVehicle | null;
  private onBlueprintModified: () => void;
  private getCurrentMode: () => 'GARAGE' | 'DRIVE';

  // Category & Palette Elements
  private catTabs: NodeListOf<Element>;
  private btnModePlace: HTMLElement | null;
  private btnModeSelect: HTMLElement | null;
  private btnRotateShape: HTMLElement | null;
  private shapeRotVal: HTMLElement | null;
  private btnPitchShape: HTMLElement | null;
  private shapePitchVal: HTMLElement | null;
  private btnRollShape: HTMLElement | null;
  private shapeRollVal: HTMLElement | null;
  private btnFlipShape: HTMLElement | null;
  private btnSymmetry: HTMLElement | null;
  private symStatus: HTMLElement | null;

  // Track Length & Tension Elements
  private btnTrackLenDec: HTMLElement | null;
  private btnTrackLenInc: HTMLElement | null;
  private elTrackLenVal: HTMLElement | null;
  private trackChips: NodeListOf<Element>;
  private tensionChips: NodeListOf<Element>;
  private gridChips: NodeListOf<Element>;
  private btnHudTension: HTMLElement | null;
  private elHudTensionVal: HTMLElement | null;
  private btnToggle3DGrid: HTMLElement | null;
  private btn3DGridText: HTMLElement | null;
  private btnLiftVehicle: HTMLElement | null;
  private btnLowerVehicle: HTMLElement | null;

  // Inspector Elements
  private elInspector: HTMLElement | null;
  private elInspectorName: HTMLElement | null;
  private elInspectorCoords: HTMLElement | null;
  private btnInspectorClose: HTMLElement | null;
  private elInspectorRotateControls: HTMLElement | null;
  private elInspectorRotateLocked: HTMLElement | null;
  private elInspectorTrackSec: HTMLElement | null;
  private elInspTrackLenVal: HTMLElement | null;
  private btnInspTrackDec: HTMLElement | null;
  private btnInspTrackInc: HTMLElement | null;
  private btnInspectorDelete: HTMLElement | null;

  // Inspector Move buttons
  private btnMoveLeft: HTMLElement | null;
  private btnMoveRight: HTMLElement | null;
  private btnMoveFwd: HTMLElement | null;
  private btnMoveBack: HTMLElement | null;
  private btnMoveUp: HTMLElement | null;
  private btnMoveDown: HTMLElement | null;

  // Inspector Rotate buttons
  private btnRotYaw: HTMLElement | null;
  private btnRotPitch: HTMLElement | null;
  private btnRotRoll: HTMLElement | null;

  // Inspector Stretch buttons
  private btnStretchLeft: HTMLElement | null;
  private btnStretchRight: HTMLElement | null;
  private btnStretchFwd: HTMLElement | null;
  private btnStretchBack: HTMLElement | null;
  private btnStretchUp: HTMLElement | null;
  private btnStretchDown: HTMLElement | null;

  private currentCategory = 'ARMOR';
  private readonly TENSION_CYCLE: TrackTension[] = ['TAUT', 'REALISTIC', 'SLACK'];

  constructor(options: GarageUIOptions) {
    this.simpleBuilder = options.simpleBuilder;
    this.telemetryHUD = options.telemetryHUD;
    this.getTrackedVehicle = options.getTrackedVehicle;
    this.onBlueprintModified = options.onBlueprintModified;
    this.getCurrentMode = options.getCurrentMode;

    // Category & Tools
    this.catTabs = document.querySelectorAll('.cat-tab');
    this.btnModePlace = document.getElementById('btn-mode-place');
    this.btnModeSelect = document.getElementById('btn-mode-select');
    this.btnRotateShape = document.getElementById('btn-rotate-shape');
    this.shapeRotVal = document.getElementById('shape-rot-val');
    this.btnPitchShape = document.getElementById('btn-pitch-shape');
    this.shapePitchVal = document.getElementById('shape-pitch-val');
    this.btnRollShape = document.getElementById('btn-roll-shape');
    this.shapeRollVal = document.getElementById('shape-roll-val');
    this.btnFlipShape = document.getElementById('btn-flip-shape');
    this.btnSymmetry = document.getElementById('btn-symmetry');
    this.symStatus = document.getElementById('sym-status');

    // Track & Grid Config
    this.btnTrackLenDec = document.getElementById('btn-track-len-dec');
    this.btnTrackLenInc = document.getElementById('btn-track-len-inc');
    this.elTrackLenVal = document.getElementById('track-len-val');
    this.trackChips = document.querySelectorAll('.track-chip');
    this.tensionChips = document.querySelectorAll('.track-tension-chip');
    this.gridChips = document.querySelectorAll('.grid-chip');
    this.btnHudTension = document.getElementById('hud-tension-btn');
    this.elHudTensionVal = document.getElementById('hud-tension-val');
    this.btnToggle3DGrid = document.getElementById('btn-toggle-3dgrid');
    this.btn3DGridText = document.getElementById('btn-3dgrid-text');
    this.btnLiftVehicle = document.getElementById('btn-lift-vehicle');
    this.btnLowerVehicle = document.getElementById('btn-lower-vehicle');

    // Inspector
    this.elInspector = document.getElementById('block-inspector');
    this.elInspectorName = document.getElementById('inspector-name');
    this.elInspectorCoords = document.getElementById('inspector-coords');
    this.btnInspectorClose = document.getElementById('btn-inspector-close');
    this.elInspectorRotateControls = document.getElementById('inspector-rotate-controls');
    this.elInspectorRotateLocked = document.getElementById('inspector-rotate-locked');
    this.elInspectorTrackSec = document.getElementById('inspector-track-sec');
    this.elInspTrackLenVal = document.getElementById('insp-track-len-val');
    this.btnInspTrackDec = document.getElementById('btn-insp-track-dec');
    this.btnInspTrackInc = document.getElementById('btn-insp-track-inc');
    this.btnInspectorDelete = document.getElementById('btn-inspector-delete');

    this.btnMoveLeft = document.getElementById('btn-move-left');
    this.btnMoveRight = document.getElementById('btn-move-right');
    this.btnMoveFwd = document.getElementById('btn-move-fwd');
    this.btnMoveBack = document.getElementById('btn-move-back');
    this.btnMoveUp = document.getElementById('btn-move-up');
    this.btnMoveDown = document.getElementById('btn-move-down');

    this.btnRotYaw = document.getElementById('btn-rot-yaw');
    this.btnRotPitch = document.getElementById('btn-rot-pitch');
    this.btnRotRoll = document.getElementById('btn-rot-roll');

    this.btnStretchLeft = document.getElementById('btn-stretch-left');
    this.btnStretchRight = document.getElementById('btn-stretch-right');
    this.btnStretchFwd = document.getElementById('btn-stretch-fwd');
    this.btnStretchBack = document.getElementById('btn-stretch-back');
    this.btnStretchUp = document.getElementById('btn-stretch-up');
    this.btnStretchDown = document.getElementById('btn-stretch-down');

    this.bindEvents();
    this.syncInitialUI();
  }

  public syncInitialUI(): void {
    this.updateTrackLengthUI();
    this.updateTensionUI(this.simpleBuilder.trackTension);
    this.updateGridSnapUI(this.simpleBuilder.gridSnap);
    this.sync3DGridBtn();
  }

  public selectCategory(catName: string): void {
    this.currentCategory = catName;
    this.catTabs.forEach((tab) => {
      const el = tab as HTMLElement;
      el.classList.toggle('active', el.dataset.cat === catName);
    });

    let firstTile: HTMLElement | null = null;
    document.querySelectorAll('.block-tile').forEach((tile) => {
      const el = tile as HTMLElement;
      const isMatch = el.dataset.cat === catName;
      el.classList.toggle('hidden', !isMatch);
      if (isMatch && !firstTile) {
        firstTile = el;
      }
    });

    if (firstTile) {
      this.selectPaletteItem(firstTile);
    }
  }

  public selectPaletteItem(tileEl: HTMLElement): void {
    const shape = tileEl.dataset.shape as LegoShape | undefined;
    const type = tileEl.dataset.type as BlockType;

    if (shape) {
      this.simpleBuilder.setActiveShape(shape);
      if (type) this.simpleBuilder.selectedBlockType = type;
    } else if (type) {
      this.simpleBuilder.setSelectedBlockType(type);
    }

    document.querySelectorAll('.block-tile').forEach((tile) => {
      tile.classList.toggle('active', tile === tileEl);
    });

    const label = shape ? LEGO_SHAPE_DEFS[shape]?.label ?? shape : type;
    if (type === 'TRACK_UNIT') {
      this.telemetryHUD.showToast(`Selected: King Tiger II Track (ชุดล้อสายพานคู่ซ้าย-ขวา ${this.simpleBuilder.trackLength} บล็อก / ${Math.round(this.simpleBuilder.trackLength * 50)} cm)`);
    } else if (type === 'ENGINE') {
      this.telemetryHUD.showToast('Selected: Maybach HL 230 V-12 Engine (700 HP, 2x3 Footprint)');
    } else {
      this.telemetryHUD.showToast(`Selected: ${label}`);
    }
  }

  public selectPaletteByIndex(idx: number): void {
    const visibleTiles = Array.from(document.querySelectorAll('.block-tile:not(.hidden)')) as HTMLElement[];
    if (idx >= 0 && idx < visibleTiles.length) {
      this.selectPaletteItem(visibleTiles[idx]);
    }
  }

  public setToolMode(mode: 'PLACE' | 'SELECT'): void {
    this.simpleBuilder.toolMode = mode;
    this.btnModePlace?.classList.toggle('active', mode === 'PLACE');
    this.btnModePlace?.classList.toggle('mode-active', mode === 'PLACE');
    this.btnModeSelect?.classList.toggle('active', mode === 'SELECT');
    this.btnModeSelect?.classList.toggle('mode-active', mode === 'SELECT');

    if (mode === 'PLACE') {
      this.simpleBuilder.selectBlock(null);
      this.syncInspectorUI();
      this.telemetryHUD.showToast('🔨 โหมดวางบล็อก (Place Mode)');
    } else {
      this.telemetryHUD.showToast('✋ โหมดเลือกและแก้ไข (Select Mode) — คลิกบล็อกเพื่อปรับแต่ง');
    }
  }

  public handleRotateShape(): void {
    const rots = this.simpleBuilder.rotateActiveShape('y');
    if (this.shapeRotVal) {
      this.shapeRotVal.textContent = `${rots.y}°`;
    }
    this.telemetryHUD.showToast(`🔄 หมุนซ้าย/ขวา (Yaw [R]): ${rots.y}°`);
  }

  public handlePitchShape(): void {
    const rots = this.simpleBuilder.rotateActiveShape('x');
    if (this.shapePitchVal) {
      this.shapePitchVal.textContent = `${rots.x}°`;
    }
    const desc =
      rots.x === 90
        ? ' (แผ่นชิดหลัง)'
        : rots.x === 180
        ? ' (แผ่นชิดบน/หงายขึ้น)'
        : rots.x === 270
        ? ' (แผ่นชิดหน้า)'
        : ' (แผ่นชิดล่าง)';
    this.telemetryHUD.showToast(`⤹ ปรับก้ม/เงย (Pitch [F]): ${rots.x}°${desc}`);
  }

  public handleRollShape(): void {
    const rots = this.simpleBuilder.rotateActiveShape('z');
    if (this.shapeRollVal) {
      this.shapeRollVal.textContent = `${rots.z}°`;
    }
    const desc =
      rots.z === 90
        ? ' (แผ่นชิดขวา)'
        : rots.z === 180
        ? ' (แผ่นชิดบน)'
        : rots.z === 270
        ? ' (แผ่นชิดซ้าย)'
        : ' (แผ่นชิดล่าง)';
    this.telemetryHUD.showToast(`↩️ ตะแคงซ้าย/ขวา (Roll [C]): ${rots.z}°${desc}`);
  }

  public handleFlipShape(): void {
    const rots = this.simpleBuilder.flipActiveShape();
    if (this.shapePitchVal) {
      this.shapePitchVal.textContent = `${rots.x}°`;
    }
    const desc =
      rots.x === 90
        ? ' (แผ่นชิดหลัง)'
        : rots.x === 180
        ? ' (แผ่นชิดบน/หงายขึ้น)'
        : rots.x === 270
        ? ' (แผ่นชิดหน้า)'
        : ' (แผ่นชิดล่าง)';
    this.telemetryHUD.showToast(`⬆️ พลิกหงายขึ้น (180°): ${rots.x}°${desc}`);
  }

  public toggleSymmetry(): void {
    this.simpleBuilder.symmetryEnabled = !this.simpleBuilder.symmetryEnabled;
    this.btnSymmetry?.classList.toggle('active', this.simpleBuilder.symmetryEnabled);
    if (this.symStatus) {
      this.symStatus.textContent = this.simpleBuilder.symmetryEnabled ? 'ON' : 'OFF';
    }
    this.telemetryHUD.showToast(`Mirror Symmetry: ${this.simpleBuilder.symmetryEnabled ? 'ON' : 'OFF'}`);
  }

  public updateTrackLengthUI(): void {
    const len = this.simpleBuilder.trackLength;
    if (this.elTrackLenVal) {
      this.elTrackLenVal.textContent = `${len} BLOCKS (${Math.round(len * 50)} cm)`;
    }
    if (this.elInspTrackLenVal) {
      this.elInspTrackLenVal.textContent = `${len} BLOCKS (${Math.round(len * 50)} cm)`;
    }
    this.trackChips.forEach((chip) => {
      const el = chip as HTMLElement;
      el.classList.toggle('active', parseInt(el.dataset.len || '0', 10) === len);
    });
  }

  public setTrackLength(len: number): void {
    this.simpleBuilder.setTrackLength(len);
    this.updateTrackLengthUI();
    this.syncInspectorUI();
    this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
    this.onBlueprintModified();
    this.telemetryHUD.showToast(`🐅 Tiger II Track: ${this.simpleBuilder.trackLength} Blocks (${Math.round(this.simpleBuilder.trackLength * 50)} cm) & Auto-Floor Resized`);
  }

  public updateTensionUI(tension: TrackTension): void {
    if (this.elHudTensionVal) {
      this.elHudTensionVal.textContent = tension;
    }
    this.tensionChips.forEach((chip) => {
      const el = chip as HTMLElement;
      el.classList.toggle('active', el.dataset.tension === tension);
    });
  }

  public setTension(tension: TrackTension): void {
    this.simpleBuilder.setTrackTension(tension);
    const trackedVehicle = this.getTrackedVehicle();
    if (trackedVehicle) {
      trackedVehicle.setTrackTension(tension);
    }
    this.updateTensionUI(tension);
    this.onBlueprintModified();
    const label =
      tension === 'TAUT'
        ? '⚡ TAUT (Tight / 0mm Sag)'
        : tension === 'REALISTIC'
        ? '🛡️ REALISTIC (7mm Heavy Tank Sag)'
        : '⚓ SLACK (Loose / 22mm Sag)';
    this.telemetryHUD.showToast(`⛓️ Track Tension: ${label}`);
  }

  public cycleTension(): void {
    const current = this.simpleBuilder.trackTension;
    const idx = this.TENSION_CYCLE.indexOf(current);
    const next = this.TENSION_CYCLE[(idx + 1) % this.TENSION_CYCLE.length];
    this.setTension(next);
  }

  public updateGridSnapUI(snap: number): void {
    this.gridChips.forEach((chip) => {
      const el = chip as HTMLElement;
      el.classList.toggle('active', parseFloat(el.dataset.snap || '0.5') === snap);
    });
  }

  public setGridSnap(snap: number): void {
    this.simpleBuilder.setGridSnap(snap);
    this.updateGridSnapUI(snap);
    const label =
      snap === 0.5
        ? '50 cm (บล็อกมาตรฐาน 1x)'
        : snap === 0.25
        ? '25 cm (ครึ่งบล็อก ½)'
        : '12.5 cm (ไมโคร ¼ บล็อก)';
    this.telemetryHUD.showToast(`📐 Grid Snap: ${label}`);
  }

  public cycleGridSnap(): void {
    const next = this.simpleBuilder.cycleGridSnap();
    this.updateGridSnapUI(next);
    const label =
      next === 0.5
        ? '50 cm (บล็อกมาตรฐาน 1x)'
        : next === 0.25
        ? '25 cm (ครึ่งบล็อก ½)'
        : '12.5 cm (ไมโคร ¼ บล็อก)';
    this.telemetryHUD.showToast(`📐 Grid Snap: ${label}`);
  }

  public sync3DGridBtn(): void {
    if (!this.btnToggle3DGrid || !this.btn3DGridText) return;
    const isVisible = this.simpleBuilder.is3DGridVisible();
    this.btnToggle3DGrid.classList.toggle('active', isVisible);
    this.btn3DGridText.innerHTML = `🔲 3D Grid [H]: <b>${isVisible ? 'ON' : 'OFF'}</b>`;
  }

  public toggle3DGrid(): void {
    const enabled = this.simpleBuilder.toggle3DGrid();
    this.sync3DGridBtn();
    this.telemetryHUD.showToast(enabled ? '🔲 เปิดเส้นกริด 3 มิติ (3D Grid: ON)' : '🔳 ปิดเส้นกริด 3 มิติ (3D Grid: OFF)');
  }

  public shiftVehicle(dy: number): void {
    const res = this.simpleBuilder.shiftAllBlocks(dy);
    if (res.success) {
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
      this.telemetryHUD.showToast(dy > 0 ? '⬆️ ยกตัวรถขึ้น 1 ชั้น (+0.5m)' : '⬇️ ลดระดับตัวรถลง 1 ชั้น (-0.5m)');
    } else {
      this.telemetryHUD.showToast(res.reason ?? '⚠️ ไม่สามารถปรับระดับได้');
    }
  }

  public syncInspectorUI(): void {
    const selectedBlock = this.simpleBuilder.getSelectedBlock();
    if (!selectedBlock || this.simpleBuilder.toolMode !== 'SELECT' || this.getCurrentMode() !== 'GARAGE') {
      this.elInspector?.classList.add('hidden');
      return;
    }

    this.elInspector?.classList.remove('hidden');
    const type = selectedBlock.type;
    const shape = selectedBlock.shape;
    const label = shape ? LEGO_SHAPE_DEFS[shape]?.label ?? shape : BLOCK_DEFS[type]?.label ?? type;
    const shapeMass = shape ? LEGO_SHAPE_DEFS[shape]?.mass : undefined;
    const blockMass = selectedBlock.isAutoFloor ? 157 : (shapeMass ?? BLOCK_DEFS[type]?.mass ?? 0);
    if (this.elInspectorName) {
      this.elInspectorName.textContent = `${label} (${blockMass} kg)`;
    }

    const rx = (selectedBlock.rotationX ?? 0) * 90;
    const ry = (selectedBlock.rotationY ?? 0) * 90;
    const rz = (selectedBlock.rotationZ ?? 0) * 90;
    const pitchLabel = rx === 180 ? ' (หงายขึ้น)' : rx === 0 ? '' : ` (${rx}°)`;
    const cmX = Math.round(selectedBlock.x * 50);
    const cmY = Math.round(selectedBlock.y * 50);
    const cmZ = Math.round(selectedBlock.z * 50);
    if (this.elInspectorCoords) {
      this.elInspectorCoords.textContent = `X: ${cmX} cm | Y: ${cmY} cm | Z: ${cmZ} cm | เงย: ${rx}°${pitchLabel} | หัน: ${ry}° | เอียง: ${rz}°`;
    }

    const isTrack = type === 'TRACK_UNIT';
    this.elInspectorRotateControls?.classList.toggle('hidden', isTrack);
    this.elInspectorRotateLocked?.classList.toggle('hidden', !isTrack);

    this.elInspectorTrackSec?.classList.toggle('hidden', !isTrack);
    if (isTrack && this.elInspTrackLenVal) {
      const len = this.simpleBuilder.trackLength;
      this.elInspTrackLenVal.textContent = `${len} BLOCKS (${Math.round(len * 50)} cm)`;
    }
  }

  public handleMove(dx: number, dy: number, dz: number): void {
    const step = this.simpleBuilder.gridSnap / 0.5;
    const res = this.simpleBuilder.moveSelectedBlock(dx * step, dy * step, dz * step);
    if (!res.success) {
      this.telemetryHUD.showToast(res.reason || '⚠️ ไม่สามารถเลื่อนได้');
    } else {
      this.syncInspectorUI();
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
    }
  }

  public handleRotate(axis: 'x' | 'y' | 'z'): void {
    const res = this.simpleBuilder.rotateSelectedBlock(axis);
    if (!res.success) {
      this.telemetryHUD.showToast(res.reason || '⚠️ ไม่สามารถหมุนได้');
    } else {
      this.syncInspectorUI();
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
      const b = this.simpleBuilder.getSelectedBlock();
      if (axis === 'x') {
        const deg = (b?.rotationX ?? 0) * 90;
        const desc = deg === 90 ? ' (ชิดหลัง)' : deg === 180 ? ' (ชิดบน/หงายขึ้น)' : deg === 270 ? ' (ชิดหน้า)' : ' (ชิดล่าง)';
        this.telemetryHUD.showToast(`⤹ ก้ม/เงย (Pitch): ${deg}°${desc}`);
      } else if (axis === 'y') {
        this.telemetryHUD.showToast(`↻ ซ้าย/ขวา (Yaw): ${(b?.rotationY ?? 0) * 90}°`);
      } else {
        const deg = (b?.rotationZ ?? 0) * 90;
        const desc = deg === 90 ? ' (ชิดขวา)' : deg === 180 ? ' (ชิดบน)' : deg === 270 ? ' (ชิดซ้าย)' : ' (ชิดล่าง)';
        this.telemetryHUD.showToast(`⤿ ตะแคง (Roll): ${deg}°${desc}`);
      }
    }
  }

  public handleStretch(dir: 'x+' | 'x-' | 'y+' | 'y-' | 'z+' | 'z-'): void {
    const res = this.simpleBuilder.stretchSelectedBlock(dir);
    if (!res.success) {
      this.telemetryHUD.showToast(res.reason || '⚠️ ไม่สามารถยืดได้');
    } else {
      this.syncInspectorUI();
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
      this.telemetryHUD.showToast('↔️ ยืดบล็อกสำเร็จ (+1 บล็อก)');
    }
  }

  public handleInspTrackResize(delta: number): void {
    const res = this.simpleBuilder.resizeSelectedTrack(delta);
    if (res.success) {
      this.updateTrackLengthUI();
      this.syncInspectorUI();
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
      this.telemetryHUD.showToast(`🐅 ปรับขนาดล้อสายพาน: ${res.newLength} บล็อก (${(res.newLength * 0.5).toFixed(1)}m) & ปรับพื้นท้องอัตโนมัติ`);
    }
  }

  public handleDeleteSelected(): void {
    const ok = this.simpleBuilder.deleteSelectedBlock();
    if (ok) {
      this.syncInspectorUI();
      this.telemetryHUD.updateGarageTelemetry(this.simpleBuilder);
      this.onBlueprintModified();
      this.telemetryHUD.showToast('🗑️ ลบบล็อกเรียบร้อย');
    }
  }

  private bindEvents(): void {
    // Categories
    this.catTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const cat = (tab as HTMLElement).dataset.cat;
        if (cat) this.selectCategory(cat);
      });
    });

    // Palette tiles
    document.querySelectorAll('.block-tile').forEach((tile) => {
      tile.addEventListener('click', () => {
        this.selectPaletteItem(tile as HTMLElement);
      });
    });

    // Tool Modes
    this.btnModePlace?.addEventListener('click', () => this.setToolMode('PLACE'));
    this.btnModeSelect?.addEventListener('click', () => this.setToolMode('SELECT'));

    // Rotations
    this.btnRotateShape?.addEventListener('click', () => this.handleRotateShape());
    this.btnPitchShape?.addEventListener('click', () => this.handlePitchShape());
    this.btnRollShape?.addEventListener('click', () => this.handleRollShape());
    this.btnFlipShape?.addEventListener('click', () => this.handleFlipShape());
    this.btnSymmetry?.addEventListener('click', () => this.toggleSymmetry());

    // Track config
    this.btnTrackLenDec?.addEventListener('click', () => this.setTrackLength(this.simpleBuilder.trackLength - 1));
    this.btnTrackLenInc?.addEventListener('click', () => this.setTrackLength(this.simpleBuilder.trackLength + 1));
    this.trackChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const len = parseInt((chip as HTMLElement).dataset.len || '6', 10);
        this.setTrackLength(len);
      });
    });

    this.tensionChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const tension = (chip as HTMLElement).dataset.tension as TrackTension;
        if (tension) this.setTension(tension);
      });
    });
    this.btnHudTension?.addEventListener('click', () => this.cycleTension());

    // Grid snap
    this.gridChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        const snap = parseFloat((chip as HTMLElement).dataset.snap || '0.5');
        this.setGridSnap(snap);
      });
    });

    // 3D Grid & Elevation
    this.btnToggle3DGrid?.addEventListener('click', () => this.toggle3DGrid());
    this.btnLiftVehicle?.addEventListener('click', () => this.shiftVehicle(1));
    this.btnLowerVehicle?.addEventListener('click', () => this.shiftVehicle(-1));

    // Inspector
    this.btnMoveLeft?.addEventListener('click', () => this.handleMove(-1, 0, 0));
    this.btnMoveRight?.addEventListener('click', () => this.handleMove(1, 0, 0));
    this.btnMoveFwd?.addEventListener('click', () => this.handleMove(0, 0, 1));
    this.btnMoveBack?.addEventListener('click', () => this.handleMove(0, 0, -1));
    this.btnMoveUp?.addEventListener('click', () => this.handleMove(0, 1, 0));
    this.btnMoveDown?.addEventListener('click', () => this.handleMove(0, -1, 0));

    this.btnRotYaw?.addEventListener('click', () => this.handleRotate('y'));
    this.btnRotPitch?.addEventListener('click', () => this.handleRotate('x'));
    this.btnRotRoll?.addEventListener('click', () => this.handleRotate('z'));

    this.btnStretchLeft?.addEventListener('click', () => this.handleStretch('x-'));
    this.btnStretchRight?.addEventListener('click', () => this.handleStretch('x+'));
    this.btnStretchFwd?.addEventListener('click', () => this.handleStretch('z+'));
    this.btnStretchBack?.addEventListener('click', () => this.handleStretch('z-'));
    this.btnStretchUp?.addEventListener('click', () => this.handleStretch('y+'));
    this.btnStretchDown?.addEventListener('click', () => this.handleStretch('y-'));

    this.btnInspTrackDec?.addEventListener('click', () => this.handleInspTrackResize(-1));
    this.btnInspTrackInc?.addEventListener('click', () => this.handleInspTrackResize(1));

    this.btnInspectorDelete?.addEventListener('click', () => this.handleDeleteSelected());
    this.btnInspectorClose?.addEventListener('click', () => {
      this.simpleBuilder.selectBlock(null);
      this.syncInspectorUI();
    });
  }
}
