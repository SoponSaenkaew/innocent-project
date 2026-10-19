import { BLOCK_DEFS } from '../blocks/BlockTypes';
import { SimpleBuilder } from '../garage/SimpleBuilder';
import { TrackedVehicle } from '../vehicle/TrackedVehicle';

export class TelemetryHUD {
  private combatLog: HTMLElement | null;

  // Telemetry (Left panel)
  private elMass: HTMLElement | null;
  private elBlocks: HTMLElement | null;
  private elEngines: HTMLElement | null;
  private elTracks: HTMLElement | null;
  private elWeapons: HTMLElement | null;
  private elPower: HTMLElement | null;
  private elPwRatio: HTMLElement | null;
  private elTopSpeed: HTMLElement | null;
  private elBrakeMode: HTMLElement | null;
  private elCockpitCheck: HTMLElement | null;

  // Drive Bottom HUD
  private elSpeed: HTMLElement | null;
  private elTrkBarL: HTMLElement | null;
  private elTrkBarR: HTMLElement | null;
  private elAutoBrakeBadge: HTMLElement | null;
  private elGearLabel: HTMLElement | null;
  private elCcLabel: HTMLElement | null;
  private elWeaponStatus: HTMLElement | null;

  constructor() {
    this.combatLog = document.getElementById('combat-log');

    // Left Panel
    this.elMass = document.getElementById('stat-mass');
    this.elBlocks = document.getElementById('stat-blocks');
    this.elEngines = document.getElementById('stat-engines');
    this.elTracks = document.getElementById('stat-tracks');
    this.elWeapons = document.getElementById('stat-weapons');
    this.elPower = document.getElementById('stat-power');
    this.elPwRatio = document.getElementById('stat-pw-ratio');
    this.elTopSpeed = document.getElementById('stat-top-speed');
    this.elBrakeMode = document.getElementById('stat-brake-mode');
    this.elCockpitCheck = document.getElementById('stat-cockpit-check');

    // Drive Bottom HUD
    this.elSpeed = document.getElementById('hud-speed');
    this.elTrkBarL = document.getElementById('trk-bar-l');
    this.elTrkBarR = document.getElementById('trk-bar-r');
    this.elAutoBrakeBadge = document.getElementById('hud-autobrake-badge');
    this.elGearLabel = document.getElementById('hud-gear-label') || document.getElementById('hud-cc-label');
    this.elCcLabel = document.getElementById('hud-cc-label') || this.elGearLabel;
    this.elWeaponStatus = document.getElementById('hud-weapon-status');
  }

  public showToast(msg: string): void {
    if (!this.combatLog) return;
    const toast = document.createElement('div');
    toast.className = 'log-toast';
    toast.textContent = msg;
    this.combatLog.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }

  public updateGarageTelemetry(simpleBuilder: SimpleBuilder): void {
    const stats = simpleBuilder.getStats();
    const massKg = stats.mass;
    const massTons = (massKg / 1000).toFixed(2);

    if (this.elMass) this.elMass.textContent = `${massTons} t (${massKg.toLocaleString()} kg)`;
    if (this.elBlocks) this.elBlocks.textContent = `${stats.blockCount} pcs`;
    if (this.elEngines) this.elEngines.textContent = `${stats.engineCount}x Maybach V12 (2x3)`;
    if (this.elTracks) this.elTracks.textContent = `${stats.trackCount} Units`;
    if (this.elWeapons) this.elWeapons.textContent = `${stats.weaponCount} Flak`;

    const totalPowerWatts = stats.engineCount * (BLOCK_DEFS.ENGINE.powerWatts ?? 525000);
    const totalKw = Math.round(totalPowerWatts / 1000);
    const totalHp = Math.round(totalKw * 1.341);
    if (this.elPower) {
      this.elPower.textContent = stats.engineCount > 0 ? `${totalKw} kW (${totalHp} HP)` : '0 kW (0 HP)';
    }

    const pwrRatio = stats.mass > 0 ? totalPowerWatts / stats.mass : 0;
    const hpPerTon = (totalHp / Math.max(0.1, stats.mass / 1000)).toFixed(1);
    const estTopSpeed = totalPowerWatts > 0 ? Math.min(88, Math.max(12, Math.round(12 + 3.0 * parseFloat(hpPerTon)))) : 0;

    if (this.elPwRatio) {
      this.elPwRatio.textContent = stats.engineCount > 0 ? `${hpPerTon} HP/t (${Math.round(pwrRatio)} W/kg)` : '0 HP/t';
    }
    if (this.elTopSpeed) {
      this.elTopSpeed.textContent = stats.engineCount > 0 ? `${estTopSpeed} km/h` : '0 km/h';
    }

    if (this.elBrakeMode) {
      this.elBrakeMode.textContent = 'Auto-Brake Ready';
      this.elBrakeMode.style.color = '#38e578';
    }

    if (this.elCockpitCheck) {
      if (stats.hasCockpit) {
        this.elCockpitCheck.textContent = 'OK (1/1)';
        this.elCockpitCheck.style.color = '#38e578';
      } else {
        this.elCockpitCheck.textContent = 'MISSING COCKPIT!';
        this.elCockpitCheck.style.color = '#ff384c';
      }
    }
  }

  public updateDriveTelemetry(trackedVehicle: TrackedVehicle, simpleBuilder: SimpleBuilder): void {
    const mass = Math.round(trackedVehicle.body.mass());
    const massTons = (mass / 1000).toFixed(2);
    const blocks = simpleBuilder.getBlueprint().length;

    if (this.elMass) this.elMass.textContent = `${massTons} t (${mass.toLocaleString()} kg)`;
    if (this.elBlocks) this.elBlocks.textContent = `${blocks} pcs`;
    if (this.elEngines) this.elEngines.textContent = `${trackedVehicle.engineCount}x Maybach V12 (2x3)`;
    if (this.elTracks) this.elTracks.textContent = `${simpleBuilder.getStats().trackCount} Units`;
    const flak44Count = trackedVehicle.flakWeapons.length;
    const flak41Count = trackedVehicle.flak41Weapons.length;
    if (this.elWeapons) {
      if (flak44Count > 0 && flak41Count > 0) {
        this.elWeapons.textContent = `${flak41Count}x 88mm + ${flak44Count}x 37mm`;
      } else if (flak41Count > 0) {
        this.elWeapons.textContent = `${flak41Count}x Flak 41 (88mm)`;
      } else if (flak44Count > 0) {
        this.elWeapons.textContent = `${flak44Count}x Flak 44 (37mm)`;
      } else {
        this.elWeapons.textContent = 'None';
      }
    }

    const driveKw = Math.round(trackedVehicle.totalPowerWatts / 1000);
    const driveHp = Math.round(driveKw * 1.341);
    if (this.elPower) {
      this.elPower.textContent = trackedVehicle.engineCount > 0 ? `${driveKw} kW (${driveHp} HP)` : '0 kW (0 HP)';
    }

    const hpPerTon = trackedVehicle.getPowerToWeightHpPerTon().toFixed(1);
    const pwrRatio = mass > 0 ? Math.round(trackedVehicle.totalPowerWatts / mass) : 0;
    const topSpeed = Math.round(trackedVehicle.getMaxVehicleSpeedKmh());

    if (this.elPwRatio) {
      this.elPwRatio.textContent = trackedVehicle.engineCount > 0 ? `${hpPerTon} HP/t (${pwrRatio} W/kg)` : '0 HP/t';
    }
    if (this.elTopSpeed) {
      this.elTopSpeed.textContent = trackedVehicle.engineCount > 0 ? `${topSpeed} km/h` : '0 km/h';
    }

    if (this.elBrakeMode) {
      if (trackedVehicle.isAutoBraking) {
        this.elBrakeMode.textContent = 'Active (Hill-Hold)';
        this.elBrakeMode.style.color = '#ff384c';
      } else {
        this.elBrakeMode.textContent = 'Driving';
        this.elBrakeMode.style.color = '#38e578';
      }
    }
  }

  public syncGearHud(trackedVehicle: TrackedVehicle): void {
    const spec = trackedVehicle.getGearSpec();
    if (!this.elGearLabel) return;
    this.elGearLabel.textContent = spec.label;

    if (spec.isReverse) {
      this.elGearLabel.style.color = '#f97316';
      this.elGearLabel.style.textShadow = '0 0 10px rgba(249, 115, 22, 0.5)';
    } else if (spec.isNeutral) {
      this.elGearLabel.style.color = '#ffbe2e';
      this.elGearLabel.style.textShadow = '0 0 10px rgba(255, 190, 46, 0.5)';
    } else {
      this.elGearLabel.style.color = '#38e578';
      this.elGearLabel.style.textShadow = '0 0 10px rgba(56, 229, 120, 0.5)';
    }
  }

  public syncCruiseHud(trackedVehicle: TrackedVehicle): void {
    const spec = trackedVehicle.getCruiseSpec();
    if (!this.elCcLabel) return;
    this.elCcLabel.textContent = spec.label;

    if (spec.stage > 0) {
      this.elCcLabel.style.color = '#38e578';
      this.elCcLabel.style.textShadow = '0 0 10px rgba(56, 229, 120, 0.5)';
    } else if (spec.stage < 0) {
      this.elCcLabel.style.color = '#f97316';
      this.elCcLabel.style.textShadow = '0 0 10px rgba(249, 115, 22, 0.5)';
    } else {
      this.elCcLabel.style.color = '#ffbe2e';
      this.elCcLabel.style.textShadow = '0 0 10px rgba(255, 190, 46, 0.5)';
    }
  }

  public updateWeaponStatus(trackedVehicle: TrackedVehicle, isFiring: boolean): void {
    if (!this.elWeaponStatus) return;
    const flak44Count = trackedVehicle.flakWeapons.length;
    const flak41Count = trackedVehicle.flak41Weapons.length;
    const hasGuns = flak44Count > 0 || flak41Count > 0;

    if (!hasGuns) {
      this.elWeaponStatus.textContent = 'NO WEAPONS EQUIPPED';
      this.elWeaponStatus.style.color = '#94a3b8';
    } else if (isFiring) {
      if (flak41Count > 0 && flak44Count > 0) {
        this.elWeaponStatus.textContent = '💥 FIRING 8.8cm & 3.7cm BATTERY!';
      } else if (flak41Count > 0) {
        this.elWeaponStatus.textContent = '💥 FIRING 8.8cm FLAK 41 HEAVY CANNON!';
      } else {
        this.elWeaponStatus.textContent = 'FIRING 3.7cm FLAKZWILLING!';
      }
      this.elWeaponStatus.style.color = '#ff384c';
    } else {
      let label = '';
      if (flak41Count > 0 && flak44Count > 0) {
        label = `8.8cm (${flak41Count}x) + 3.7cm (${flak44Count}x) READY`;
      } else if (flak41Count > 0) {
        label = `FLAK 41 88mm READY (${flak41Count}x)`;
      } else {
        label = `FLAK 44 READY (${flak44Count}x)`;
      }
      this.elWeaponStatus.textContent = `${label} • [L-CLICK / SPACE]`;
      this.elWeaponStatus.style.color = '#38e578';
    }
  }

  public updateDriveVisuals(trackedVehicle: TrackedVehicle): void {
    if (this.elSpeed) {
      this.elSpeed.textContent = String(Math.round(trackedVehicle.currentSpeedKmh));
    }

    if (this.elTrkBarL) {
      const lPct = Math.round(Math.abs(trackedVehicle.leftTrackPower) * 100);
      this.elTrkBarL.style.height = `${lPct}%`;
      this.elTrkBarL.style.background = trackedVehicle.leftTrackPower < 0 ? '#ffbe2e' : '#38e578';
    }

    if (this.elTrkBarR) {
      const rPct = Math.round(Math.abs(trackedVehicle.rightTrackPower) * 100);
      this.elTrkBarR.style.height = `${rPct}%`;
      this.elTrkBarR.style.background = trackedVehicle.rightTrackPower < 0 ? '#ffbe2e' : '#38e578';
    }

    if (this.elAutoBrakeBadge) {
      this.elAutoBrakeBadge.classList.toggle('active', trackedVehicle.isAutoBraking);
      if (!trackedVehicle.isAutoBraking) {
        this.elAutoBrakeBadge.textContent = '🟢 DRIVING';
      } else if (trackedVehicle.currentSpeedKmh > 1.2) {
        this.elAutoBrakeBadge.textContent = '🟡 COASTING / BRAKING';
      } else {
        this.elAutoBrakeBadge.textContent = '🛑 HILL-HOLD (LOCKED)';
      }
    }
  }
}
