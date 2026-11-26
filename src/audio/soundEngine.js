// Motor de audio híbrido: carga /public/music/<artista>.mp3 si existe,
// o genera una pista musical dinámica con Web Audio API como respaldo inmediato.

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.paused = false;
    this.currentArtist = null;
    this.audioEl = null;
    this.usingMp3 = false;
    this.synthTimer = null;
    this.stepIndex = 0;
    this.volumeScale = 0.45;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended' && !this.paused) {
      this.ctx.resume().catch(() => {});
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.audioEl) {
      this.audioEl.muted = muted;
    }
  }

  setPhaseVolume(isRhythmPhase) {
    this.volumeScale = isRhythmPhase ? 0.72 : 0.36;
    if (this.audioEl) {
      this.audioEl.volume = this.volumeScale;
    }
  }

  playArtistTrack(artist, isRhythmPhase = false) {
    this.stopTrack();
    this.currentArtist = artist;
    this.setPhaseVolume(isRhythmPhase);
    this.ensureContext();

    const audio = new Audio(artist.files.audio);
    audio.loop = true;
    audio.volume = this.volumeScale;
    audio.muted = this.muted;

    let settled = false;
    const fallbackToSynth = () => {
      if (settled) return;
      settled = true;
      if (this.currentArtist?.id !== artist.id) return;
      this.usingMp3 = false;
      this.audioEl = null;
      this.startSynthLoop(artist);
    };

    audio.addEventListener(
      'canplaythrough',
      () => {
        if (settled) return;
        settled = true;
        if (this.currentArtist?.id !== artist.id) return;
        this.usingMp3 = true;
        this.audioEl = audio;
        if (!this.paused) {
          audio.play().catch(() => {
            this.usingMp3 = false;
            this.startSynthLoop(artist);
          });
        }
      },
      { once: true }
    );

    audio.addEventListener('error', fallbackToSynth, { once: true });
    audio.load();
  }

  startSynthLoop(artist) {
    if (this.synthTimer) clearInterval(this.synthTimer);
    this.stepIndex = 0;
    const stepMs = Math.round((60 / artist.synth.bpm / 2) * 1000);

    this.synthTimer = setInterval(() => {
      if (this.paused || this.muted || !this.ctx) return;
      this.playSynthStep(artist, this.stepIndex++);
    }, stepMs);
  }

  playSynthStep(artist, step) {
    const now = this.ctx.currentTime;
    const { scale, bassPattern, wave, style } = artist.synth;
    const vol = this.volumeScale * 0.22;

    // Kick en tiempos pares o patrón urbano
    const isKick = style === 'urban' ? step % 4 === 0 || step % 8 === 3 : step % 4 === 0;
    if (isKick) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(135, now);
      osc.frequency.exponentialRampToValueAtTime(42, now + 0.11);
      gain.gain.setValueAtTime(vol * 1.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.13);
    }

    // Snare / Clap en 2 y 6
    if (step % 4 === 2) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(style === 'urban' ? 240 : 190, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.07);
      gain.gain.setValueAtTime(vol * 0.85, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.09);
    }

    // Bajo
    const bassFreq = bassPattern[step % bassPattern.length];
    if (bassFreq > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(bassFreq, now);
      gain.gain.setValueAtTime(vol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.19);
    }

    // Melodía arpegiada
    if (step % 2 === 0 || (style === 'math' && step % 3 === 1)) {
      const noteFreq = scale[(step * 3 + Math.floor(step / 4)) % scale.length];
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(noteFreq, now);
      gain.gain.setValueAtTime(vol * 0.48, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    }
  }

  pause() {
    this.paused = true;
    if (this.audioEl && !this.audioEl.paused) {
      this.audioEl.pause();
    }
    if (this.ctx && this.ctx.state === 'running') {
      this.ctx.suspend().catch(() => {});
    }
  }

  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.audioEl && this.usingMp3) {
      this.audioEl.play().catch(() => {});
    }
  }

  stopTrack() {
    if (this.synthTimer) {
      clearInterval(this.synthTimer);
      this.synthTimer = null;
    }
    if (this.audioEl) {
      this.audioEl.pause();
      this.audioEl.src = '';
      this.audioEl = null;
    }
    this.usingMp3 = false;
  }

  playSfx(type) {
    if (this.muted) return;
    this.ensureContext();
    const now = this.ctx.currentTime;

    const tone = (freqStart, freqEnd, duration, wave = 'sine', gainVal = 0.16, delay = 0) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = wave;
      osc.frequency.setValueAtTime(freqStart, now + delay);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + delay + duration);
      gain.gain.setValueAtTime(gainVal, now + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, now + delay + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + delay);
      osc.stop(now + delay + duration + 0.01);
    };

    switch (type) {
      case 'correct':
        tone(523.25, 659.25, 0.12, 'triangle', 0.18, 0);
        tone(659.25, 783.99, 0.16, 'triangle', 0.18, 0.09);
        break;
      case 'wrong':
        tone(220, 140, 0.18, 'sawtooth', 0.14, 0);
        break;
      case 'hit':
        tone(660, 880, 0.08, 'sine', 0.16, 0);
        break;
      case 'miss':
        tone(170, 95, 0.14, 'sawtooth', 0.15, 0);
        break;
      case 'dvd':
        tone(587.33, 880, 0.1, 'sine', 0.16, 0);
        tone(880, 1174.66, 0.16, 'sine', 0.16, 0.08);
        break;
      case 'win':
        tone(523.25, 523.25, 0.1, 'triangle', 0.18, 0);
        tone(659.25, 659.25, 0.1, 'triangle', 0.18, 0.1);
        tone(783.99, 1046.5, 0.25, 'triangle', 0.2, 0.2);
        break;
      case 'tick':
        tone(440, 440, 0.05, 'sine', 0.1, 0);
        break;
      default:
        break;
    }
  }
}

export const soundEngine = new SoundEngine();
