/**
 * Web Audio Synthesizer for SurvivalCraft:
 * Zero-asset dependency procedural audio for tank combat, autocannon fire, and transmission shifts.
 */
export class AudioManager {
  private static instance: AudioManager | null = null;
  private audioCtx: AudioContext | null = null;

  private constructor() {}

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private initContext(): AudioContext | null {
    if (!this.audioCtx) {
      const AudioCtxClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.audioCtx = new AudioCtxClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  /**
   * Procedural 3.7cm Flakzwilling 44 AA autocannon sound:
   * High transient mechanical crack + low-frequency explosive punch.
   */
  public playAutocannonSound(): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // 1. High transient crack & mechanical noise burst
      const bufferSize = Math.floor(ctx.sampleRate * 0.05);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.012));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(1500, t);
      noiseFilter.Q.setValueAtTime(2.2, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.55, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.01, t + 0.05);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);

      // 2. Heavy 37mm low-frequency punch
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(170, t);
      osc.frequency.exponentialRampToValueAtTime(42, t + 0.08);

      oscGain.gain.setValueAtTime(0.70, t);
      oscGain.gain.exponentialRampToValueAtTime(0.01, t + 0.08);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Procedural 8.8cm FlaK 41 Heavy Cannon sound:
   * Earth-shaking sub-bass shockwave (26-140Hz), explosive supersonic blast,
   * and heavy mechanical breech recoil slide clank.
   */
  public playFlak41Sound(): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // 1. Earth-shaking sub-bass seismic thump (140Hz down to 26Hz)
      const subOsc = ctx.createOscillator();
      const subGain = ctx.createGain();

      subOsc.type = 'sine';
      subOsc.frequency.setValueAtTime(140, t);
      subOsc.frequency.exponentialRampToValueAtTime(26, t + 0.38);

      subGain.gain.setValueAtTime(1.0, t);
      subGain.gain.exponentialRampToValueAtTime(0.001, t + 0.40);

      subOsc.connect(subGain);
      subGain.connect(ctx.destination);
      subOsc.start(t);
      subOsc.stop(t + 0.42);

      // 2. Explosive muzzle blast & supersonic air crack (filtered noise burst)
      const blastLen = Math.floor(ctx.sampleRate * 0.28);
      const blastBuf = ctx.createBuffer(1, blastLen, ctx.sampleRate);
      const blastData = blastBuf.getChannelData(0);
      for (let i = 0; i < blastLen; i++) {
        blastData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.065));
      }
      const blastSource = ctx.createBufferSource();
      blastSource.buffer = blastBuf;

      const blastFilter = ctx.createBiquadFilter();
      blastFilter.type = 'lowpass';
      blastFilter.frequency.setValueAtTime(2600, t);
      blastFilter.frequency.exponentialRampToValueAtTime(320, t + 0.25);

      const blastGain = ctx.createGain();
      blastGain.gain.setValueAtTime(0.90, t);
      blastGain.gain.exponentialRampToValueAtTime(0.005, t + 0.28);

      blastSource.connect(blastFilter);
      blastFilter.connect(blastGain);
      blastGain.connect(ctx.destination);
      blastSource.start(t);
      blastSource.stop(t + 0.29);

      // 3. Transient high-pressure muzzle shockwave snap
      const snapLen = Math.floor(ctx.sampleRate * 0.025);
      const snapBuf = ctx.createBuffer(1, snapLen, ctx.sampleRate);
      const snapData = snapBuf.getChannelData(0);
      for (let i = 0; i < snapLen; i++) {
        snapData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.005));
      }
      const snapSource = ctx.createBufferSource();
      snapSource.buffer = snapBuf;

      const snapFilter = ctx.createBiquadFilter();
      snapFilter.type = 'highpass';
      snapFilter.frequency.setValueAtTime(1800, t);

      const snapGain = ctx.createGain();
      snapGain.gain.setValueAtTime(0.75, t);
      snapGain.gain.exponentialRampToValueAtTime(0.001, t + 0.025);

      snapSource.connect(snapFilter);
      snapFilter.connect(snapGain);
      snapGain.connect(ctx.destination);
      snapSource.start(t);
      snapSource.stop(t + 0.026);

      // 4. Heavy hydro-pneumatic recuperator breech slide & mechanical clank (~0.14s after shot)
      const breechT = t + 0.12;
      const clankOsc = ctx.createOscillator();
      const clankGain = ctx.createGain();

      clankOsc.type = 'triangle';
      clankOsc.frequency.setValueAtTime(460, breechT);
      clankOsc.frequency.exponentialRampToValueAtTime(180, breechT + 0.10);

      clankGain.gain.setValueAtTime(0.35, breechT);
      clankGain.gain.exponentialRampToValueAtTime(0.001, breechT + 0.10);

      clankOsc.connect(clankGain);
      clankGain.connect(ctx.destination);
      clankOsc.start(breechT);
      clankOsc.stop(breechT + 0.11);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  /**
   * Heavy mechanical transmission dog-clutch engagement clunk + gear mesh.
   */
  public playGearShiftSound(isUp: boolean): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      // Heavy transmission dog-clutch engagement clunk
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(isUp ? 260 : 180, t);
      osc.frequency.exponentialRampToValueAtTime(isUp ? 110 : 80, t + 0.08);

      oscGain.gain.setValueAtTime(0.35, t);
      oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.08);

      // Metallic gear tooth mesh noise
      const bufLen = Math.floor(ctx.sampleRate * 0.035);
      const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.009));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = noiseBuf;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(isUp ? 1400 : 950, t);
      filter.Q.setValueAtTime(2.8, t);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.25, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);
      noise.start(t);
      noise.stop(t + 0.035);
    } catch {
      // Audio autoplay policy fallback
    }
  }

  // Turret traverse servo audio node references
  private turretServoOsc: OscillatorNode | null = null;
  private turretServoGain: GainNode | null = null;
  private isTurretSoundPlaying = false;

  /**
   * Continuous procedural electric/hydraulic turret traverse servo hum.
   * Smoothly fades in when turret is slewing and fades out when stationary.
   */
  public updateTurretServoSound(isTraversing: boolean): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;

      if (!this.turretServoOsc) {
        // Initialize persistent traverse synthesizer node graph
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(145, ctx.currentTime);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(420, ctx.currentTime);
        filter.Q.setValueAtTime(3.5, ctx.currentTime);

        gain.gain.setValueAtTime(0, ctx.currentTime);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        this.turretServoOsc = osc;
        this.turretServoGain = gain;
      }

      if (this.turretServoGain) {
        const t = ctx.currentTime;
        if (isTraversing) {
          this.turretServoGain.gain.cancelScheduledValues(t);
          this.turretServoGain.gain.setTargetAtTime(0.065, t, 0.06);
          this.isTurretSoundPlaying = true;
        } else if (this.isTurretSoundPlaying) {
          this.turretServoGain.gain.cancelScheduledValues(t);
          this.turretServoGain.gain.setTargetAtTime(0, t, 0.08);
          this.isTurretSoundPlaying = false;
        }
      }
    } catch {
      // Autoplay fallback
    }
  }

  /**
   * Optical periscope / telescopic sight zoom lens click.
   */
  public playOpticZoomSound(isZoomIn: boolean): void {
    try {
      const ctx = this.initContext();
      if (!ctx) return;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(isZoomIn ? 680 : 420, t);
      osc.frequency.exponentialRampToValueAtTime(isZoomIn ? 1200 : 260, t + 0.05);

      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.05);
    } catch {
      // Autoplay fallback
    }
  }
}

export const audioManager = AudioManager.getInstance();
