import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { TestMap } from './arena/TestMap';
import { SimpleBuilder } from './garage/SimpleBuilder';
import { TrackedVehicle } from './vehicle/TrackedVehicle';
import { audioManager } from './audio/AudioManager';
import { BlueprintManager } from './blueprint/BlueprintManager';
import { TelemetryHUD } from './ui/TelemetryHUD';
import { GarageUI } from './ui/GarageUI';

type AppMode = 'GARAGE' | 'DRIVE';

const KEY_TO_PALETTE_INDEX: Record<string, number> = {
  Digit1: 0,
  Digit2: 1,
  Digit3: 2,
  Digit4: 3,
  Digit5: 4,
  Digit6: 5,
  Digit7: 6,
  Digit8: 7,
  Digit9: 8,
  Digit0: 9,
  Minus: 10,
};

async function bootstrap() {
  const container = document.getElementById('canvas-container')!;

  // 1. Core UI Elements & Subsystems
  const appModeBadge = document.getElementById('app-mode-badge')!;
  const btnModeToggle = document.getElementById('btn-mode-toggle')!;
  const modeIcon = document.getElementById('mode-icon')!;
  const modeLabel = document.getElementById('mode-label')!;
  const btnRecover = document.getElementById('btn-recover')!;
  const btnToggleShadows = document.getElementById('btn-toggle-shadows');
  const shadowBtnLabel = document.getElementById('shadow-btn-label');
  const guideTitle = document.getElementById('guide-title')!;
  const guideList = document.getElementById('guide-list')!;

  const btnCcDown = (document.getElementById('btn-cc-down') || document.getElementById('btn-gear-down'))!;
  const btnCcUp = (document.getElementById('btn-cc-up') || document.getElementById('btn-gear-up'))!;

  // War Thunder Aim & Sniper DOM Elements
  const elAimSystem = document.getElementById('wt-aim-system');
  const elMouseAim = document.getElementById('wt-mouse-aim');
  const elGunReticle = document.getElementById('wt-gun-reticle');
  const elGunStatusLabel = document.getElementById('wt-gun-status-label');
  const elLeadSvg = document.getElementById('wt-lead-svg');
  const elLeadLine = document.getElementById('wt-lead-line');
  const elFreeLookBadge = document.getElementById('wt-free-look-badge');
  const elPointerLockPrompt = document.getElementById('wt-pointer-lock-prompt');
  const elSniperOverlay = document.getElementById('wt-sniper-overlay');
  const elSniperRangeVal = document.getElementById('sniper-range-val');
  const elSniperZoomVal = document.getElementById('sniper-zoom-val');
  const elSniperCannonVal = document.getElementById('sniper-cannon-val');

  const telemetryHUD = new TelemetryHUD();

  // 2. Initialize Rapier WASM Physics
  await RAPIER.init();
  const gravity = { x: 0.0, y: -9.81, z: 0.0 };
  const world = new RAPIER.World(gravity);
  const fixedTimeStep = 1 / 60;
  world.timestep = fixedTimeStep;

  // 3. Initialize Three.js Scene, Camera & Lighting
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x18202e); // Clean studio slate background
  scene.fog = null; // Garage mode is fog-free for razor-sharp inspection

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = false;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  // Omnidirectional white lighting for authentic true colors
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.95);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.25);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xffffff, 0.35);
  sunLight.position.set(20, 35, 20);
  sunLight.castShadow = false;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xffffff, 0.25);
  fillLight.position.set(-20, -15, -20);
  scene.add(fillLight);

  // 4. Test Arena & Garage Builder
  const testMap = new TestMap(scene, world);
  testMap.setVisible(false);

  const simpleBuilder = new SimpleBuilder(scene, camera);

  // 5. Application State & Vehicles
  let currentMode: AppMode = 'GARAGE';
  document.body.className = 'mode-garage';

  let trackedVehicle: TrackedVehicle | null = null;
  const spawnPadPos = new THREE.Vector3(0, 0.40, 0);

  // Camera angles
  let garageYaw = 0.5;
  let garagePitch = 0.35;
  let driveYaw = 0.0;
  let drivePitch = -0.06; // Natural horizontal aim over tank glacis
  let camDistance = 8.5;
  let smoothCamY = 1.6;

  // War Thunder Aiming, Free-Look & Sniper States
  let isPointerLocked = false;
  let ignorePointerMoves = 0;
  let isFreeLooking = false;
  const frozenAimTarget = new THREE.Vector3();
  const currentAimTarget = new THREE.Vector3();
  let isSniperMode = false;
  let sniperZoom = 4.0;

  // 6. Initialize Modular Sub-controllers
  let garageUI: GarageUI;

  const blueprintManager = new BlueprintManager(simpleBuilder, {
    setTrackLength: (len) => garageUI.setTrackLength(len),
    setTrackTension: (tension) => garageUI.setTension(tension),
    updateUI: () => {
      garageUI.updateTrackLengthUI();
      telemetryHUD.updateGarageTelemetry(simpleBuilder);
    },
    showToast: (msg) => telemetryHUD.showToast(msg),
  });

  garageUI = new GarageUI({
    simpleBuilder,
    telemetryHUD,
    getTrackedVehicle: () => trackedVehicle,
    onBlueprintModified: () => blueprintManager.autoSaveBlueprint(),
    getCurrentMode: () => currentMode,
  });

  // Load blueprint from localStorage or starter chassis
  blueprintManager.loadInitialBlueprint();
  garageUI.syncInitialUI();
  telemetryHUD.updateGarageTelemetry(simpleBuilder);

  // 7. Drive HUD Controls (Cruise Control & Manual Gear Shifting)
  function handleCruiseStep(delta: -1 | 1) {
    if (!trackedVehicle) return;
    const spec = trackedVehicle.stepCruise(delta);
    telemetryHUD.syncCruiseHud(trackedVehicle);

    const maxVehSpeed = Math.round(trackedVehicle.getMaxVehicleSpeedKmh());
    if (spec.stage === 0) {
      telemetryHUD.showToast('Speed Lock: [MAN] Manual Throttle (WASD)');
    } else if (spec.stage > 0) {
      const lockedKmh = Math.round(maxVehSpeed * spec.speedFraction);
      telemetryHUD.showToast(`Speed Lock: [${spec.label}] Locked at ${lockedKmh} km/h`);
    } else {
      const lockedRevKmh = Math.round(maxVehSpeed * 0.65 * spec.speedFraction);
      telemetryHUD.showToast(`Speed Lock: [${spec.label}] Reverse Lock at ${lockedRevKmh} km/h`);
    }
  }

  btnCcDown?.addEventListener('click', () => handleCruiseStep(-1));
  btnCcUp?.addEventListener('click', () => handleCruiseStep(1));

  btnRecover?.addEventListener('click', () => {
    if (currentMode === 'DRIVE' && trackedVehicle) {
      const t = trackedVehicle.body.translation();
      const newY = Math.max(0.40, t.y + 0.35);
      trackedVehicle.resetPose(new THREE.Vector3(t.x, newY, t.z));
      smoothCamY = newY + trackedVehicle.maxLocalY + 0.70;
      testMap.resetDynamicObjects();
      telemetryHUD.showToast('Vehicle Recovered & Targets Respawned');
    }
  });

  // 8. Shadow Toggle
  let shadowsEnabled = false;
  function toggleShadows() {
    shadowsEnabled = !shadowsEnabled;
    renderer.shadowMap.enabled = shadowsEnabled;
    sunLight.castShadow = shadowsEnabled;
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => (m.needsUpdate = true));
        } else {
          obj.material.needsUpdate = true;
        }
      }
    });
    if (shadowBtnLabel) {
      shadowBtnLabel.textContent = shadowsEnabled ? '☀️ Shadow: ON' : '💡 Shadow: OFF';
    }
    telemetryHUD.showToast(shadowsEnabled ? '☀️ Shadows: ENABLED' : '💡 Shadows: DISABLED (True Color Mode)');
  }
  btnToggleShadows?.addEventListener('click', toggleShadows);

  // 9. Mode Switching: GARAGE <-> DRIVE
  function switchMode(targetMode: AppMode) {
    if (targetMode === currentMode) return;

    if (targetMode === 'DRIVE') {
      const stats = simpleBuilder.getStats();
      if (!stats.hasCockpit) {
        telemetryHUD.showToast('⚠️ Cannot Drive: Please place a Cockpit [9] first!');
        return;
      }
      if (stats.trackCount === 0) {
        telemetryHUD.showToast('⚠️ Notice: No track units placed! Vehicle will slide.');
      }
      if (stats.engineCount === 0) {
        telemetryHUD.showToast('⚠️ Warning: 0 Engines placed! Install Maybach V12 to drive.');
      }

      currentMode = 'DRIVE';
      document.body.className = 'mode-drive';
      appModeBadge.textContent = '🏎️ TEST DRIVE MODE';
      modeIcon.textContent = '🛠️';
      modeLabel.textContent = 'GARAGE MODE';
      scene.background = new THREE.Color(0x0f172a);
      scene.fog = new THREE.FogExp2(0x0f172a, 0.0018);
      testMap.resetDynamicObjects();

      isSniperMode = false;
      isFreeLooking = false;
      camera.fov = 60;
      camera.updateProjectionMatrix();
      elSniperOverlay?.classList.add('hidden');
      elFreeLookBadge?.classList.add('hidden');
      if (!isPointerLocked) {
        elPointerLockPrompt?.classList.remove('hidden');
      }

      guideTitle.textContent = 'WAR THUNDER COMBAT & MOUSE-AIM CONTROLS (320m)';
      guideList.innerHTML = `
        <li><kbd>MOUSE</kbd> War Thunder Mouse Aim (L-Click lock cursor, ESC to unlock)</li>
        <li><kbd>L-CLICK</kbd> / <kbd>SPACE</kbd> Fire Autocannon &amp; Heavy Guns</li>
        <li><kbd>SHIFT</kbd> / <kbd>R-CLICK</kbd> Toggle Sniper / Gunner Sight View (Scroll to Zoom 4x/8x)</li>
        <li><kbd>C</kbd> Hold Free-Look (Pan Camera around Tank with Turret Locked)</li>
        <li><kbd>W</kbd> / <kbd>S</kbd> Throttle Forward / Brake (Auto-Shifting Gearbox D1-D5)</li>
        <li><kbd>A</kbd> / <kbd>D</kbd> Tank Turn &amp; Neutral Pivot (Turret auto-stabilizes)</li>
        <li><kbd>Q</kbd> / <kbd>E</kbd> Speed Lock / Cruise Control (<kbd>CC1</kbd> <kbd>CC2</kbd> <kbd>MAX</kbd> / <kbd>R</kbd>)</li>
        <li><kbd>T</kbd> Toggle Track Tension (<kbd>TAUT</kbd> / <kbd>REALISTIC</kbd> / <kbd>SLACK</kbd>)</li>
        <li><kbd>U</kbd> Toggle Shadow (On / Off)</li>
        <li><kbd>R</kbd> Recover Tank &amp; Respawn Targets</li>
        <li><kbd>TAB</kbd> Back to Garage</li>
        <li style="margin-top:6px; color:#f59e0b; font-weight:bold;">🧭 OFFROAD PROVING GROUND:</li>
        <li>⬆️ <b>North:</b> สนามลูกระนาด (Moguls, Washboard, Camelback Waves, สะพานท่อนซุง)</li>
        <li>➡️ <b>East:</b> อุทยานเนินเขาชัน (10° / 20° / 30° / 35° &amp; บันได 3 ขั้น)</li>
        <li>⬅️ <b>West:</b> ทางลาดเอียงข้าง (18° / 24°), ดงหินขรุขระ &amp; คูเพลาะรถถัง</li>
        <li>⬇️ <b>South:</b> แอ่งโคลนลื่น (Mud Slough 0.28) &amp; ลานยิงเป้าทำลายล้าง</li>
      `;

      simpleBuilder.selectBlock(null);
      garageUI.syncInspectorUI();
      simpleBuilder.setVisible(false);
      testMap.setVisible(true);

      // Spawn Tracked Vehicle
      if (trackedVehicle) {
        trackedVehicle.destroy();
      }
      trackedVehicle = new TrackedVehicle(
        simpleBuilder.getBlueprint(),
        spawnPadPos,
        scene,
        world,
        simpleBuilder.trackTension
      );
      trackedVehicle.onGearShift = (_gear, isUp) => {
        audioManager.playGearShiftSound(isUp);
        telemetryHUD.syncGearHud(trackedVehicle!);
      };

      smoothCamY = spawnPadPos.y + trackedVehicle.maxLocalY + 0.70;

      garageUI.updateTensionUI(simpleBuilder.trackTension);
      telemetryHUD.syncCruiseHud(trackedVehicle);
      telemetryHUD.syncGearHud(trackedVehicle);
      telemetryHUD.updateDriveTelemetry(trackedVehicle, simpleBuilder);
      telemetryHUD.showToast('🎯 Combat Drive Active — War Thunder Mouse-Aim & Stabilizer Ready!');
    } else {
      currentMode = 'GARAGE';
      document.body.className = 'mode-garage';
      appModeBadge.textContent = '🛠️ GARAGE MODE';
      modeIcon.textContent = '🏎️';
      modeLabel.textContent = 'TEST DRIVE';
      scene.background = new THREE.Color(0x18202e);
      scene.fog = null;

      if (document.pointerLockElement) {
        document.exitPointerLock?.();
      }
      isSniperMode = false;
      isFreeLooking = false;
      camera.fov = 60;
      camera.updateProjectionMatrix();
      elSniperOverlay?.classList.add('hidden');
      elFreeLookBadge?.classList.add('hidden');
      elPointerLockPrompt?.classList.add('hidden');
      audioManager.updateTurretServoSound(false);

      guideTitle.textContent = 'GARAGE CONTROLS';
      guideList.innerHTML = `
        <li><kbd>1</kbd> - <kbd>6</kbd> Select Active Category Items</li>
        <li><kbd>V</kbd> Toggle Place / Select &amp; Edit Mode</li>
        <li><kbd>R</kbd> / <kbd>F</kbd> / <kbd>C</kbd> Rotate Yaw, Pitch &amp; Roll (หัน / ก้มเงย / ตะแคงซ้ายขวา)</li>
        <li><kbd>H</kbd> Toggle 3D Spatial Grid (เปิด/ปิด เส้น 3 มิติ)</li>
        <li><kbd>PgUp</kbd> / <kbd>PgDn</kbd> Lift / Lower Vehicle (ยก/ลดระดับตัวรถ)</li>
        <li><kbd>G</kbd> Cycle Grid Snap (50 cm / 25 cm / 12.5 cm)</li>
        <li><kbd>[</kbd> / <kbd>]</kbd> Adjust Track Length (Auto-stretches floor)</li>
        <li><kbd>L-CLICK</kbd> Place Block / Select Block in [V] mode</li>
        <li><kbd>R-CLICK</kbd> Delete Hovered Block</li>
        <li><kbd>DRAG</kbd> Orbit 3D Build Platform</li>
        <li><kbd>M</kbd> Toggle Mirror Symmetry</li>
        <li><kbd>Ctrl+S</kbd> Save Blueprint directly to project blueprints/</li>
        <li><kbd>TAB</kbd> Switch to Test Drive &amp; Fire!</li>
      `;

      if (trackedVehicle) {
        trackedVehicle.destroy();
        trackedVehicle = null;
      }

      simpleBuilder.selectBlock(null);
      garageUI.syncInspectorUI();
      testMap.setVisible(false);
      simpleBuilder.setVisible(true);
      telemetryHUD.updateGarageTelemetry(simpleBuilder);
      telemetryHUD.showToast('Garage Mode Active — Assemble Vehicle & Press TAB!');
    }
  }

  btnModeToggle.addEventListener('click', () => {
    switchMode(currentMode === 'GARAGE' ? 'DRIVE' : 'GARAGE');
  });

  // 10. War Thunder Combat Controls & Mouse-Aim Logic
  let isMouseDown = false;
  let isDragging = false;
  let dragDist = 0;
  let isDriveFiring = false;

  function toggleSniperMode(force?: boolean) {
    if (currentMode !== 'DRIVE') return;
    const nextState = force !== undefined ? force : !isSniperMode;
    if (nextState === isSniperMode) return;
    isSniperMode = nextState;

    audioManager.playOpticZoomSound(isSniperMode);
    if (isSniperMode) {
      elSniperOverlay?.classList.remove('hidden');
      elMouseAim?.classList.add('hidden');
      elGunReticle?.classList.add('hidden');
      elLeadSvg?.classList.add('hidden');
      if (elSniperZoomVal) elSniperZoomVal.textContent = `${sniperZoom.toFixed(1)}x`;
      telemetryHUD.showToast('🔭 Sniper Sight Active [Scroll: Zoom 4x/8x • Shift/R-Click: Exit]');
    } else {
      elSniperOverlay?.classList.add('hidden');
      elMouseAim?.classList.remove('hidden');
      elGunReticle?.classList.remove('hidden');
      elLeadSvg?.classList.remove('hidden');
      camera.fov = 60;
      camera.updateProjectionMatrix();
      telemetryHUD.showToast('Third-Person View [Shift/R-Click: Sniper Sight]');
    }
  }

  // Pointer lock change listener
  document.addEventListener('pointerlockchange', () => {
    isPointerLocked = document.pointerLockElement === renderer.domElement;
    if (isPointerLocked) {
      elPointerLockPrompt?.classList.add('hidden');
    } else {
      if (currentMode === 'DRIVE') {
        elPointerLockPrompt?.classList.remove('hidden');
      }
    }
  });

  window.addEventListener('contextmenu', (e) => e.preventDefault());

  renderer.domElement.addEventListener('pointerdown', (e) => {
    isMouseDown = true;
    isDragging = false;
    dragDist = 0;

    if (currentMode === 'DRIVE') {
      if (e.button === 0) {
        if (!isPointerLocked) {
          ignorePointerMoves = 3;
          renderer.domElement.requestPointerLock?.();
        }
        isDriveFiring = true;
      } else if (e.button === 2) {
        toggleSniperMode();
      }
    }
  });

  let lastDriveClientX: number | null = null;
  let lastDriveClientY: number | null = null;

  window.addEventListener('pointermove', (e) => {
    if (currentMode === 'DRIVE') {
      // Discard initial pointer-lock transition spikes
      if (ignorePointerMoves > 0) {
        ignorePointerMoves--;
        lastDriveClientX = e.clientX;
        lastDriveClientY = e.clientY;
        return;
      }

      // Filter out massive single-frame synthetic mouse delta jumps
      if (Math.abs(e.movementX) > 85 || Math.abs(e.movementY) > 85) {
        lastDriveClientX = e.clientX;
        lastDriveClientY = e.clientY;
        return;
      }

      if (isPointerLocked) {
        const sensitivity = isSniperMode ? 0.0012 / (sniperZoom / 4) : 0.0028;
        // Moving mouse RIGHT (movementX > 0) turns view RIGHT
        driveYaw += e.movementX * sensitivity;
        // Moving mouse UP (movementY < 0) tilts view UP into sky
        // Moving mouse DOWN (movementY > 0) tilts view DOWN towards ground
        drivePitch = Math.max(-0.60, Math.min(1.10, drivePitch - e.movementY * sensitivity));
      } else if (isMouseDown) {
        // Fallback smooth drag if not pointer-locked
        const dx = lastDriveClientX !== null ? e.clientX - lastDriveClientX : 0;
        const dy = lastDriveClientY !== null ? e.clientY - lastDriveClientY : 0;
        const sensitivity = 0.0032;
        driveYaw += dx * sensitivity;
        drivePitch = Math.max(-0.60, Math.min(1.10, drivePitch - dy * sensitivity));
      }

      lastDriveClientX = e.clientX;
      lastDriveClientY = e.clientY;
    } else if (isMouseDown) {
      const dx = e.movementX;
      const dy = e.movementY;
      dragDist += Math.hypot(dx, dy);

      if (dragDist > 4) {
        isDragging = true;
      }

      garageYaw -= dx * 0.0055;
      garagePitch = Math.max(-0.45, Math.min(1.4, garagePitch + dy * 0.0055));
    }

    if (currentMode === 'GARAGE') {
      const target = e.target as HTMLElement;
      if (target === renderer.domElement || target === container) {
        simpleBuilder.updateHover(e.clientX, e.clientY);
      } else {
        if (simpleBuilder.toolMode !== 'SELECT' || !simpleBuilder.getSelectedBlock()) {
          simpleBuilder.hideFocused3DGrid();
        }
      }
    }
  });

  container.addEventListener('pointerleave', () => {
    if (currentMode === 'GARAGE') {
      if (simpleBuilder.toolMode !== 'SELECT' || !simpleBuilder.getSelectedBlock()) {
        simpleBuilder.hideFocused3DGrid();
      }
    }
  });

  window.addEventListener('pointerup', (e) => {
    lastDriveClientX = null;
    lastDriveClientY = null;
    if (currentMode === 'DRIVE') {
      if (e.button === 0) {
        isDriveFiring = false;
      }
    } else if (currentMode === 'GARAGE') {
      if (isMouseDown && !isDragging) {
        const target = e.target as HTMLElement;
        if (target === renderer.domElement || target === container) {
          if (e.button === 0) {
            const ok = simpleBuilder.placeAtHover(e.clientX, e.clientY);
            if (ok) {
              telemetryHUD.updateGarageTelemetry(simpleBuilder);
              blueprintManager.autoSaveBlueprint();
            } else if (simpleBuilder.toolMode === 'PLACE' && simpleBuilder.selectedBlockType === 'TRACK_UNIT') {
              const hover = simpleBuilder.updateHover(e.clientX, e.clientY);
              if (hover && Math.abs(hover.gridPos.x) < 1) {
                telemetryHUD.showToast('⚠️ ชุดล้อสายพานต้องวางเป็นคู่ (ซ้าย-ขวา) ห้ามวางตรงกลาง');
              }
            }
            if (simpleBuilder.toolMode === 'SELECT') {
              garageUI.syncInspectorUI();
            }
          } else if (e.button === 2) {
            const ok = simpleBuilder.deleteAtPointer(e.clientX, e.clientY);
            if (ok) {
              if (simpleBuilder.toolMode === 'SELECT') {
                garageUI.syncInspectorUI();
              }
              telemetryHUD.updateGarageTelemetry(simpleBuilder);
              blueprintManager.autoSaveBlueprint();
            }
          }
        }
      }
    }
    isMouseDown = false;
    isDragging = false;
  });

  window.addEventListener(
    'wheel',
    (e) => {
      if (currentMode === 'DRIVE' && isSniperMode) {
        const prevZoom = sniperZoom;
        if (e.deltaY < 0) {
          sniperZoom = 8.0;
        } else {
          sniperZoom = 4.0;
        }
        if (prevZoom !== sniperZoom) {
          audioManager.playOpticZoomSound(sniperZoom > prevZoom);
          if (elSniperZoomVal) elSniperZoomVal.textContent = `${sniperZoom.toFixed(1)}x`;
        }
        return;
      }
      camDistance = Math.max(2.5, Math.min(16.0, camDistance + e.deltaY * 0.008));
    },
    { passive: true }
  );

  // 11. Keyboard Input
  const keys: Record<string, boolean> = {};

  window.addEventListener('keydown', (e) => {
    const code = e.code;
    const isRepeat = e.repeat;
    keys[code] = true;

    if (code === 'Tab') {
      e.preventDefault();
      switchMode(currentMode === 'GARAGE' ? 'DRIVE' : 'GARAGE');
      return;
    }

    if ((e.ctrlKey || e.metaKey) && code === 'KeyS' && currentMode === 'GARAGE') {
      e.preventDefault();
      blueprintManager.saveBlueprintToFile();
      return;
    }

    if (code === 'Space' && currentMode === 'DRIVE') {
      e.preventDefault();
      isDriveFiring = true;
    }

    if (!isRepeat) {
      if (code === 'KeyC' && currentMode === 'DRIVE') {
        isFreeLooking = true;
        frozenAimTarget.copy(currentAimTarget);
        elFreeLookBadge?.classList.remove('hidden');
      }
      if ((code === 'ShiftLeft' || code === 'ShiftRight') && currentMode === 'DRIVE') {
        toggleSniperMode();
      }
      if (code === 'KeyV' && currentMode === 'GARAGE') {
        garageUI.setToolMode(simpleBuilder.toolMode === 'PLACE' ? 'SELECT' : 'PLACE');
      }
      if ((code === 'Delete' || code === 'Backspace') && currentMode === 'GARAGE' && simpleBuilder.toolMode === 'SELECT') {
        garageUI.handleDeleteSelected();
      }
      if (code === 'Escape' && currentMode === 'GARAGE' && simpleBuilder.toolMode === 'SELECT') {
        simpleBuilder.selectBlock(null);
        garageUI.syncInspectorUI();
      }
      if (KEY_TO_PALETTE_INDEX[code] !== undefined && currentMode === 'GARAGE') {
        garageUI.selectPaletteByIndex(KEY_TO_PALETTE_INDEX[code]);
      }
      if ((code === 'KeyM' || code === 'KeyX') && currentMode === 'GARAGE') {
        garageUI.toggleSymmetry();
      }
      if (code === 'BracketLeft' && currentMode === 'GARAGE') {
        garageUI.setTrackLength(simpleBuilder.trackLength - 1);
      }
      if (code === 'BracketRight' && currentMode === 'GARAGE') {
        garageUI.setTrackLength(simpleBuilder.trackLength + 1);
      }
      if (code === 'KeyQ' && currentMode === 'DRIVE') {
        handleCruiseStep(-1);
      }
      if (code === 'KeyE' && currentMode === 'DRIVE') {
        handleCruiseStep(1);
      }
      if (code === 'KeyT') {
        garageUI.cycleTension();
      }
      if (code === 'KeyG' && currentMode === 'GARAGE') {
        garageUI.cycleGridSnap();
      }
      if (code === 'KeyU') {
        toggleShadows();
      }
      if (code === 'KeyF' && currentMode === 'GARAGE') {
        garageUI.handlePitchShape();
      }
      if (code === 'KeyC' && currentMode === 'GARAGE') {
        garageUI.handleRollShape();
      }
      if (code === 'KeyH' && currentMode === 'GARAGE') {
        garageUI.toggle3DGrid();
      }
      if (code === 'PageUp' && currentMode === 'GARAGE') {
        e.preventDefault();
        garageUI.shiftVehicle(1);
      }
      if (code === 'PageDown' && currentMode === 'GARAGE') {
        e.preventDefault();
        garageUI.shiftVehicle(-1);
      }
      if (code === 'KeyR') {
        if (currentMode === 'DRIVE' && trackedVehicle) {
          const t = trackedVehicle.body.translation();
          const newY = Math.max(0.40, t.y + 0.35);
          trackedVehicle.resetPose(new THREE.Vector3(t.x, newY, t.z));
          smoothCamY = newY + trackedVehicle.maxLocalY + 0.70;
          testMap.resetDynamicObjects();
          telemetryHUD.showToast('Vehicle Recovered & Targets Respawned');
        } else if (currentMode === 'GARAGE') {
          garageUI.handleRotateShape();
        }
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Space') {
      isDriveFiring = false;
    }
    if (e.code === 'KeyC' && currentMode === 'DRIVE') {
      isFreeLooking = false;
      elFreeLookBadge?.classList.add('hidden');
    }
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 12. Main 60Hz Physics & Render Loop
  let lastTime = performance.now();
  let accumulator = 0;
  let hudTimer = 0;
  const cameraTarget = new THREE.Vector3();
  const aimRaycaster = new THREE.Raycaster();
  const screenCenter = new THREE.Vector2(0, 0);

  function animate(now: number) {
    requestAnimationFrame(animate);

    const frameDt = Math.min(0.05, (now - lastTime) / 1000);
    lastTime = now;
    accumulator += frameDt;
    hudTimer += frameDt;

    if (currentMode === 'DRIVE' && trackedVehicle) {
      const throttle =
        (keys['KeyW'] || keys['ArrowUp'] ? 1 : 0) - (keys['KeyS'] || keys['ArrowDown'] ? 1 : 0);
      const steer =
        (keys['KeyD'] || keys['ArrowRight'] ? 1 : 0) - (keys['KeyA'] || keys['ArrowLeft'] ? 1 : 0);

      while (accumulator >= fixedTimeStep) {
        trackedVehicle.stepPhysics(fixedTimeStep, throttle, steer);
        world.step();
        testMap.update();
        trackedVehicle.captureCurrentTransform();
        accumulator -= fixedTimeStep;
      }

      const alpha = accumulator / fixedTimeStep;
      trackedVehicle.syncVisuals(alpha);

      // Camera & Aiming Dynamics: Sniper View vs Third-Person Chase
      const weaponState = trackedVehicle.getPrimaryWeaponState();

      if (isSniperMode && weaponState.hasWeapon) {
        // Place camera at optical gunner sight position, looking directly along gun direction
        camera.position.copy(weaponState.sightWorldPos);
        const gunLookTarget = weaponState.sightWorldPos.clone().addScaledVector(weaponState.gunWorldDir, 120);
        camera.lookAt(gunLookTarget);
        camera.fov = 60 / sniperZoom;
        camera.updateProjectionMatrix();

        // Laser rangefinder calculation: raycast forward along gun barrel
        aimRaycaster.set(weaponState.sightWorldPos, weaponState.gunWorldDir);
        aimRaycaster.far = 1200;
        const hits = aimRaycaster.intersectObjects(testMap.mapGroup.children, true);
        let distM = 0;
        for (const hit of hits) {
          if (hit.distance > 2.0) {
            distM = Math.round(hit.distance);
            break;
          }
        }
        if (elSniperRangeVal) {
          elSniperRangeVal.textContent = distM > 0 ? `${distM} m` : '> 800 m';
        }
        if (elSniperCannonVal) elSniperCannonVal.textContent = weaponState.weaponName;

        // Player's intended aim vector in Sniper Mode
        const cosP = Math.cos(drivePitch);
        const sinP = Math.sin(drivePitch);
        const aimLookDir = new THREE.Vector3(
          -Math.sin(driveYaw) * cosP,
          sinP,
          Math.cos(driveYaw) * cosP
        ).normalize();

        if (!isFreeLooking) {
          aimRaycaster.set(weaponState.sightWorldPos, aimLookDir);
          aimRaycaster.far = 1000;
          const aimHits = aimRaycaster.intersectObjects(testMap.mapGroup.children, true);
          let aimTargetPos: THREE.Vector3 | null = null;
          for (const h of aimHits) {
            if (h.distance > 3.0) {
              aimTargetPos = h.point;
              break;
            }
          }
          if (aimTargetPos) {
            currentAimTarget.copy(aimTargetPos);
          } else {
            currentAimTarget.copy(weaponState.sightWorldPos).addScaledVector(aimLookDir, 150);
          }
          trackedVehicle.setAimTarget(currentAimTarget);
        } else {
          trackedVehicle.setAimTarget(frozenAimTarget);
        }
      } else {
        // Third-Person War Thunder Chase Camera
        camera.fov = 60;
        camera.updateProjectionMatrix();

        const interpPos = trackedVehicle.renderPosition;
        // Anchor directly above the vehicle's highest point (roof / turret top)
        const targetAnchorY = interpPos.y + trackedVehicle.maxLocalY + 0.70;
        smoothCamY += (targetAnchorY - smoothCamY) * Math.min(1, frameDt * 10);
        const anchorPos = new THREE.Vector3(interpPos.x, smoothCamY, interpPos.z);

        // Calculate Look Direction from driveYaw and drivePitch
        const cosP = Math.cos(drivePitch);
        const sinP = Math.sin(drivePitch);
        const camForward = new THREE.Vector3(
          -Math.sin(driveYaw) * cosP,
          sinP,
          Math.cos(driveYaw) * cosP
        ).normalize();

        // Position camera pulled back behind anchor along camForward
        const camPos = anchorPos.clone().sub(camForward.clone().multiplyScalar(camDistance));
        // Prevent camera from clipping through terrain
        camPos.y = Math.max(0.55, camPos.y);
        camera.position.copy(camPos);

        // Camera looks forward along camForward into the distance (100m ahead)
        const camLookTarget = camPos.clone().add(camForward.clone().multiplyScalar(100));
        camera.lookAt(camLookTarget);
        camera.updateMatrixWorld();

        // Weapon Targeting: raycast from camera through center crosshair forward into battlefield
        if (!isFreeLooking) {
          aimRaycaster.setFromCamera(screenCenter, camera);
          aimRaycaster.far = 1000;
          const hits = aimRaycaster.intersectObjects(testMap.mapGroup.children, true);
          let validPoint: THREE.Vector3 | null = null;
          for (const hit of hits) {
            if (hit.distance > 4.0) {
              validPoint = hit.point;
              break;
            }
          }
          if (validPoint) {
            currentAimTarget.copy(validPoint);
          } else {
            currentAimTarget.copy(aimRaycaster.ray.origin).addScaledVector(aimRaycaster.ray.direction, 120);
          }
          trackedVehicle.setAimTarget(currentAimTarget);
        } else {
          trackedVehicle.setAimTarget(frozenAimTarget);
        }

        // War Thunder Dual Reticle Screen Projection
        if (weaponState.hasWeapon) {
          const gunPointWorld = weaponState.muzzleWorldPos.clone().addScaledVector(weaponState.gunWorldDir, 70);
          const proj = gunPointWorld.project(camera);

          const screenW = window.innerWidth;
          const screenH = window.innerHeight;
          const cx = screenW * 0.5;
          const cy = screenH * 0.5;

          // Position mouse aim cursor
          if (isFreeLooking) {
            const aimProj = frozenAimTarget.clone().project(camera);
            if (aimProj.z < 1) {
              const mx = (aimProj.x * 0.5 + 0.5) * screenW;
              const my = (-aimProj.y * 0.5 + 0.5) * screenH;
              if (elMouseAim) {
                elMouseAim.style.left = `${mx}px`;
                elMouseAim.style.top = `${my}px`;
              }
            }
          } else {
            if (elMouseAim) {
              elMouseAim.style.left = `${cx}px`;
              elMouseAim.style.top = `${cy}px`;
            }
          }

          // Position gun laying reticle
          if (proj.z < 1 && elGunReticle) {
            const gx = (proj.x * 0.5 + 0.5) * screenW;
            const gy = (-proj.y * 0.5 + 0.5) * screenH;
            elGunReticle.style.left = `${gx}px`;
            elGunReticle.style.top = `${gy}px`;

            const mx = parseFloat(elMouseAim?.style.left || `${cx}`);
            const my = parseFloat(elMouseAim?.style.top || `${cy}`);
            elLeadLine?.setAttribute('x1', `${mx}`);
            elLeadLine?.setAttribute('y1', `${my}`);
            elLeadLine?.setAttribute('x2', `${gx}`);
            elLeadLine?.setAttribute('y2', `${gy}`);

            if (weaponState.isAtLimit) {
              elGunReticle.className = 'wt-gun-reticle limit';
              if (elGunStatusLabel) elGunStatusLabel.textContent = 'LIMIT';
            } else if (weaponState.isAligned) {
              elGunReticle.className = 'wt-gun-reticle aligned';
              if (elGunStatusLabel) elGunStatusLabel.textContent = 'READY';
            } else {
              elGunReticle.className = 'wt-gun-reticle traversing';
              if (elGunStatusLabel) elGunStatusLabel.textContent = `TRAVERSING (${weaponState.diffDeg.toFixed(0)}°)`;
            }
          }
        }
      }

      // Weapon Firing: alternate barrels, spawn tracers & play sound
      if (isDriveFiring) {
        const fireRes = trackedVehicle.fireWeapons();
        if (fireRes.fired) {
          if (fireRes.fired41) {
            audioManager.playFlak41Sound();
          }
          if (fireRes.fired44) {
            audioManager.playAutocannonSound();
          }
        }
      }

      const slewState = trackedVehicle.updateWeapons(frameDt);
      audioManager.updateTurretServoSound(slewState.isTraversing);

      // Update Drive HUD
      telemetryHUD.updateWeaponStatus(trackedVehicle, isDriveFiring);
      telemetryHUD.updateDriveVisuals(trackedVehicle);

      if (hudTimer >= 0.1) {
        hudTimer = 0;
        telemetryHUD.updateDriveTelemetry(trackedVehicle, simpleBuilder);
        telemetryHUD.syncGearHud(trackedVehicle);
        telemetryHUD.syncCruiseHud(trackedVehicle);
      }
    } else {
      // Garage Mode
      audioManager.updateTurretServoSound(false);
      accumulator = 0;

      const camOffset = new THREE.Vector3(
        -Math.sin(garageYaw) * Math.cos(garagePitch) * camDistance,
        Math.sin(garagePitch) * camDistance,
        -Math.cos(garageYaw) * Math.cos(garagePitch) * camDistance
      );

      const garageLookTarget = new THREE.Vector3(0, 0.75, 0);
      camera.position.copy(garageLookTarget).add(camOffset);
      camera.lookAt(garageLookTarget);
      camera.updateMatrixWorld();
    }

    renderer.render(scene, camera);
  }

  requestAnimationFrame(animate);
}

bootstrap().catch(console.error);
