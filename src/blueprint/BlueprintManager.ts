import { BlueprintBlock, DEFAULT_TANK_BLUEPRINT } from '../blocks/BlockTypes';
import { SimpleBuilder } from '../garage/SimpleBuilder';
import { TrackTension } from '../vehicle/KingTigerTrack';

export const BLUEPRINT_STORAGE_KEY = 'scrapgrid_vehicle_blueprint';

export interface DeserializedBlueprint {
  blocks: BlueprintBlock[];
  trackLength?: number;
  trackTension?: TrackTension;
}

export interface BlueprintManagerCallbacks {
  setTrackLength: (len: number) => void;
  setTrackTension: (tension: TrackTension) => void;
  updateUI: () => void;
  showToast: (msg: string) => void;
}

export class BlueprintManager {
  private simpleBuilder: SimpleBuilder;
  private callbacks: BlueprintManagerCallbacks;

  // DOM elements
  private btnSaveBlueprint: HTMLElement | null;
  private btnOpenBlueprintList: HTMLElement | null;
  private modalBlueprintList: HTMLElement | null;
  private btnCloseBlueprintModal: HTMLElement | null;
  private btnModalClose: HTMLElement | null;
  private btnModalRefresh: HTMLElement | null;
  private blueprintFileList: HTMLElement | null;
  private inputLoadJson: HTMLInputElement | null;
  private btnLoadDefault: HTMLElement | null;
  private btnClearGrid: HTMLElement | null;

  constructor(simpleBuilder: SimpleBuilder, callbacks: BlueprintManagerCallbacks) {
    this.simpleBuilder = simpleBuilder;
    this.callbacks = callbacks;

    this.btnSaveBlueprint = document.getElementById('btn-save-blueprint');
    this.btnOpenBlueprintList = document.getElementById('btn-open-blueprint-list');
    this.modalBlueprintList = document.getElementById('modal-blueprint-list');
    this.btnCloseBlueprintModal = document.getElementById('btn-close-blueprint-modal');
    this.btnModalClose = document.getElementById('btn-modal-close');
    this.btnModalRefresh = document.getElementById('btn-modal-refresh');
    this.blueprintFileList = document.getElementById('blueprint-file-list');
    this.inputLoadJson = document.getElementById('input-load-json') as HTMLInputElement | null;
    this.btnLoadDefault = document.getElementById('btn-load-default');
    this.btnClearGrid = document.getElementById('btn-clear-grid');

    this.bindEvents();
  }

  public serializeBlueprint(): string {
    const rawBlocks = this.simpleBuilder.getBlueprint();
    const cleanBlocks = rawBlocks.map((b) => {
      const item: Record<string, unknown> = {
        x: b.x,
        y: b.y,
        z: b.z,
        type: b.type,
      };
      if (b.shape && b.shape !== 'CUBE') item.shape = b.shape;
      if (b.rotationY) item.rotationY = b.rotationY;
      if (b.rotationX) item.rotationX = b.rotationX;
      if (b.rotationZ) item.rotationZ = b.rotationZ;
      if (b.isAutoFloor) item.isAutoFloor = true;
      return item;
    });

    const payload = {
      name: `ScrapGrid_Tank_${new Date().toISOString().slice(0, 10)}`,
      version: 1,
      savedAt: new Date().toISOString(),
      trackLength: this.simpleBuilder.trackLength,
      trackTension: this.simpleBuilder.trackTension,
      blockCount: cleanBlocks.length,
      blocks: cleanBlocks,
    };

    return JSON.stringify(payload, null, 2);
  }

  public deserializeBlueprint(jsonString: string): DeserializedBlueprint | null {
    try {
      const data = JSON.parse(jsonString);
      const rawBlocks = Array.isArray(data) ? data : data.blocks;
      if (!Array.isArray(rawBlocks)) return null;

      const blocks: BlueprintBlock[] = [];
      for (const b of rawBlocks) {
        if (typeof b.x !== 'number' || typeof b.y !== 'number' || typeof b.z !== 'number' || !b.type) {
          continue;
        }
        blocks.push({
          x: Number(Number(b.x).toFixed(3)),
          y: Number(Number(b.y).toFixed(3)),
          z: Number(Number(b.z).toFixed(3)),
          type: b.type,
          shape: b.shape || 'CUBE',
          rotationY: b.rotationY || 0,
          rotationX: b.rotationX || 0,
          rotationZ: b.rotationZ || 0,
          isAutoFloor: Boolean(b.isAutoFloor),
        });
      }

      if (blocks.length === 0) return null;

      return {
        blocks,
        trackLength: typeof data.trackLength === 'number' ? data.trackLength : undefined,
        trackTension: typeof data.trackTension === 'string' ? (data.trackTension as TrackTension) : undefined,
      };
    } catch {
      return null;
    }
  }

  public autoSaveBlueprint(): void {
    try {
      const rawBlocks = this.simpleBuilder.getBlueprint();
      if (rawBlocks.length > 0) {
        const json = this.serializeBlueprint();
        localStorage.setItem(BLUEPRINT_STORAGE_KEY, json);
      }
    } catch {
      // LocalStorage error fallback
    }
  }

  public loadInitialBlueprint(): void {
    let initialLoaded = false;
    try {
      const cached = localStorage.getItem(BLUEPRINT_STORAGE_KEY);
      if (cached) {
        const res = this.deserializeBlueprint(cached);
        if (res && res.blocks.length > 0) {
          if (typeof res.trackLength === 'number') {
            this.callbacks.setTrackLength(res.trackLength);
          }
          if (res.trackTension) {
            this.callbacks.setTrackTension(res.trackTension);
          }
          this.simpleBuilder.loadBlueprint(res.blocks);
          initialLoaded = true;
        }
      }
    } catch {
      // Fallback
    }

    if (!initialLoaded) {
      this.simpleBuilder.loadBlueprint(DEFAULT_TANK_BLUEPRINT);
    }
  }

  public async saveBlueprintToFile(): Promise<void> {
    try {
      const rawBlocks = this.simpleBuilder.getBlueprint();
      if (rawBlocks.length === 0) {
        this.callbacks.showToast('⚠️ ไม่มีบล็อกในกริด ไม่สามารถบันทึกได้');
        return;
      }

      const d = new Date();
      const pad = (n: number) => (n < 10 ? '0' + n : String(n));
      const timestamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
      const defaultName = `tank_${timestamp}`;

      const userInput = window.prompt(
        'ระบุชื่อไฟล์บันทึกโมเดล (จะบันทึกลงโฟลเดอร์ blueprints/ ในโปรเจกต์):',
        defaultName
      );
      if (userInput === null) return; // User cancelled
      const cleanName = userInput.trim() || defaultName;
      const filename = cleanName.endsWith('.json') ? cleanName : `${cleanName}.json`;

      const json = this.serializeBlueprint();
      localStorage.setItem(BLUEPRINT_STORAGE_KEY, json);

      // 1. Try saving directly into project's blueprints/ folder via Vite dev server API
      try {
        const payload = JSON.parse(json);
        const resp = await fetch('/api/save-blueprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename, blueprint: payload }),
        });
        const resJson = await resp.json();
        if (resJson.success) {
          this.callbacks.showToast(`💾 บันทึกสำเร็จลงโฟลเดอร์ blueprints/${resJson.filename} เรียบร้อย! (${rawBlocks.length} บล็อก)`);
          return;
        }
      } catch (apiErr) {
        console.warn('Vite API save fallback:', apiErr);
      }

      // 2. Fallback: Browser file download
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.callbacks.showToast(`💾 บันทึกโมเดลสำเร็จ (${rawBlocks.length} บล็อก) → ดาวน์โหลด ${filename}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.showToast(`⚠️ บันทึกไม่สำเร็จ: ${msg}`);
    }
  }

  public openBlueprintListModal(): void {
    if (!this.modalBlueprintList) return;
    this.modalBlueprintList.classList.remove('hidden');
    this.refreshBlueprintList();
  }

  public closeBlueprintListModal(): void {
    if (!this.modalBlueprintList) return;
    this.modalBlueprintList.classList.add('hidden');
  }

  public async refreshBlueprintList(): Promise<void> {
    if (!this.blueprintFileList) return;
    this.blueprintFileList.innerHTML = '<div style="padding:15px; text-align:center; color:var(--text-muted);">กำลังโหลดรายชื่อไฟล์...</div>';
    try {
      const resp = await fetch('/api/list-blueprints');
      const data = await resp.json();
      if (!data.success || !Array.isArray(data.files) || data.files.length === 0) {
        this.blueprintFileList.innerHTML = `
          <div style="padding:20px; text-align:center; color:var(--text-muted); line-height:1.6;">
            ยังไม่มีไฟล์ในโฟลเดอร์ <code>blueprints/</code><br>
            กดปุ่ม <b>💾 Save JSON</b> เพื่อบันทึกโมเดลแรกของคุณลงโฟลเดอร์นี้!
          </div>`;
        return;
      }

      this.blueprintFileList.innerHTML = '';
      for (const item of data.files) {
        const row = document.createElement('div');
        row.className = 'blueprint-file-item';
        const dateStr = new Date(item.mtime).toLocaleString('th-TH');
        const sizeKb = (item.size / 1024).toFixed(1);
        row.innerHTML = `
          <div class="blueprint-file-info">
            <span class="blueprint-file-name">📄 ${item.filename}</span>
            <span class="blueprint-file-meta">แก้ไขล่าสุด: ${dateStr} &bull; ${sizeKb} KB</span>
          </div>
          <button class="blueprint-load-btn" data-file="${item.filename}">📂 โหลดโมเดล</button>
        `;
        row.querySelector('.blueprint-load-btn')?.addEventListener('click', async () => {
          await this.loadBlueprintFromServer(item.filename);
          this.closeBlueprintListModal();
        });
        this.blueprintFileList.appendChild(row);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.blueprintFileList.innerHTML = `<div style="padding:15px; color:#ef4444;">⚠️ ไม่สามารถเชื่อมต่อ API ได้: ${msg}</div>`;
    }
  }

  public async loadBlueprintFromServer(filename: string): Promise<void> {
    try {
      const resp = await fetch(`/api/load-blueprint?name=${encodeURIComponent(filename)}`);
      if (!resp.ok) throw new Error('File not found');
      const jsonStr = await resp.text();
      const res = this.deserializeBlueprint(jsonStr);
      if (!res) {
        this.callbacks.showToast('⚠️ รูปแบบไฟล์ JSON ไม่ถูกต้อง หรือไม่พบบล็อก');
        return;
      }

      if (res.trackLength) {
        this.callbacks.setTrackLength(res.trackLength);
      }
      if (res.trackTension) {
        this.callbacks.setTrackTension(res.trackTension);
      }

      this.simpleBuilder.loadBlueprint(res.blocks);
      this.callbacks.updateUI();
      this.autoSaveBlueprint();
      this.callbacks.showToast(`📂 โหลดโมเดล ${filename} สำเร็จ (${res.blocks.length} บล็อก)!`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.callbacks.showToast(`⚠️ โหลดไฟล์ไม่สำเร็จ: ${msg}`);
    }
  }

  public loadBlueprintFromFile(file: File): void {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (!content) {
        this.callbacks.showToast('⚠️ ไฟล์ว่างเปล่าหรือไม่สามารถอ่านได้');
        return;
      }

      const res = this.deserializeBlueprint(content);
      if (!res) {
        this.callbacks.showToast('⚠️ รูปแบบไฟล์ JSON ไม่ถูกต้อง หรือไม่พบบล็อก');
        return;
      }

      if (res.trackLength) {
        this.callbacks.setTrackLength(res.trackLength);
      }
      if (res.trackTension) {
        this.callbacks.setTrackTension(res.trackTension);
      }

      this.simpleBuilder.loadBlueprint(res.blocks);
      this.callbacks.updateUI();
      this.autoSaveBlueprint();
      this.callbacks.showToast(`📂 โหลดโมเดลสำเร็จ (${res.blocks.length} บล็อก)!`);
    };
    reader.onerror = () => {
      this.callbacks.showToast('⚠️ ไม่สามารถอ่านไฟล์ได้');
    };
    reader.readAsText(file);
  }

  private bindEvents(): void {
    this.btnSaveBlueprint?.addEventListener('click', () => this.saveBlueprintToFile());
    this.btnOpenBlueprintList?.addEventListener('click', () => this.openBlueprintListModal());
    this.btnCloseBlueprintModal?.addEventListener('click', () => this.closeBlueprintListModal());
    this.btnModalClose?.addEventListener('click', () => this.closeBlueprintListModal());
    this.btnModalRefresh?.addEventListener('click', () => this.refreshBlueprintList());

    this.modalBlueprintList?.addEventListener('click', (e) => {
      if (e.target === this.modalBlueprintList) this.closeBlueprintListModal();
    });

    if (this.inputLoadJson) {
      this.inputLoadJson.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files.length > 0) {
          this.loadBlueprintFromFile(target.files[0]);
          target.value = '';
        }
      });
    }

    this.btnLoadDefault?.addEventListener('click', () => {
      this.callbacks.setTrackLength(13);
      this.callbacks.setTrackTension('REALISTIC');
      this.simpleBuilder.loadBlueprint(DEFAULT_TANK_BLUEPRINT);
      this.callbacks.updateUI();
      this.autoSaveBlueprint();
      this.callbacks.showToast('Loaded Starter Chassis (Flatbed Floor + Maybach 2x3 V12 + Tracks)');
    });

    this.btnClearGrid?.addEventListener('click', () => {
      this.simpleBuilder.clearAll();
      this.callbacks.updateUI();
      this.autoSaveBlueprint();
      this.callbacks.showToast('Grid Cleared');
    });
  }
}
