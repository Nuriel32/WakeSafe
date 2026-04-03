import { Platform } from 'react-native';

class AlertAudioService {
  private lastPlayedAt = 0;
  private readonly cooldownMs = 7000;
  private audioContext: AudioContext | null = null;
  private unlocked = false;

  private isWeb(): boolean {
    return Platform.OS === 'web' && typeof window !== 'undefined';
  }

  private getContext(): AudioContext | null {
    if (!this.isWeb()) return null;
    if (!this.audioContext) {
      const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) return null;
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }

  async unlockFromUserGesture(): Promise<void> {
    if (!this.isWeb()) return;
    try {
      const ctx = this.getContext();
      if (!ctx) return;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      this.unlocked = true;
    } catch (error) {
      console.warn('Audio unlock failed:', error);
    }
  }

  async playFatigueAlert(): Promise<void> {
    if (!this.isWeb()) return;

    const now = Date.now();
    if (now - this.lastPlayedAt < this.cooldownMs) return;

    const ctx = this.getContext();
    if (!ctx) return;

    if (!this.unlocked) {
      // Attempt a silent resume; on strict autoplay policies this will still require user gesture.
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
      } catch {
        return;
      }
    }

    const playTone = (frequency: number, startAt: number, durationSec: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequency;

      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(0.28, startAt + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationSec);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startAt);
      osc.stop(startAt + durationSec);
    };

    const t0 = ctx.currentTime + 0.01;
    playTone(880, t0, 0.18);
    playTone(660, t0 + 0.24, 0.22);
    this.lastPlayedAt = now;
  }
}

export const alertAudioService = new AlertAudioService();
