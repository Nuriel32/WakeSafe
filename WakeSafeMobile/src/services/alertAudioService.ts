import { Platform, Vibration } from 'react-native';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Bundled fatigue / drowsiness siren that plays whenever a fatigue alert
// or warning notification is delivered to the mobile app.
const SIREN_ALERT_ASSET = require('../utils/sounds/siren-alert.mp3');

class AlertAudioService {
  private lastPlayedAt = 0;
  private readonly cooldownMs = 7000;
  private player: AudioPlayer | null = null;
  private unlocked = false;
  private audioModeConfigured = false;

  private isWeb(): boolean {
    return Platform.OS === 'web' && typeof window !== 'undefined';
  }

  private getPlayer(): AudioPlayer | null {
    if (this.player) return this.player;
    try {
      const player = createAudioPlayer(SIREN_ALERT_ASSET);
      player.volume = 1;
      player.loop = false;
      this.player = player;
      return player;
    } catch (error) {
      console.warn('AlertAudioService: failed to create audio player:', error);
      return null;
    }
  }

  // On iOS the audio session must allow playback in silent mode so that the
  // siren still rings when the driver has muted the phone. This is a no-op on
  // Android/web but is safe to call repeatedly.
  private async configureAudioMode(): Promise<void> {
    if (this.audioModeConfigured) return;
    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldRouteThroughEarpiece: false,
        allowsRecording: false,
      });
      this.audioModeConfigured = true;
    } catch (error) {
      console.warn('AlertAudioService: failed to configure audio mode:', error);
    }
  }

  // Browsers (and to a lesser extent iOS) require a user gesture before audio
  // playback is allowed. Call this from a button-press handler on app start.
  async unlockFromUserGesture(): Promise<void> {
    try {
      await this.configureAudioMode();
      const player = this.getPlayer();
      if (!player) return;

      const originalVolume = player.volume;
      player.volume = 0;
      try {
        await player.seekTo(0);
      } catch {
        // seek is best-effort; ignore if the asset isn't ready yet
      }
      player.play();
      // Stop the warm-up almost immediately - we only need the audio pipeline
      // primed so the first real alert has zero latency.
      setTimeout(() => {
        try {
          player.pause();
          player.seekTo(0).catch(() => {});
          player.volume = originalVolume;
        } catch {
          // ignore
        }
      }, 40);

      this.unlocked = true;
    } catch (error) {
      console.warn('AlertAudioService: unlock failed:', error);
    }
  }

  async playFatigueAlert(): Promise<void> {
    const now = Date.now();
    if (now - this.lastPlayedAt < this.cooldownMs) return;
    this.lastPlayedAt = now;

    // Vibrate on physical devices for tactile feedback even if the speaker is
    // covered or audio playback fails.
    if (Platform.OS === 'ios' || Platform.OS === 'android') {
      try {
        Vibration.cancel();
        Vibration.vibrate([0, 800, 250, 800, 250, 900], false);
      } catch {
        // ignore vibration errors
      }
    }

    try {
      await this.configureAudioMode();
      const player = this.getPlayer();
      if (!player) return;

      try {
        await player.seekTo(0);
      } catch {
        // ignore - some platforms reject seek before first play
      }
      player.volume = 1;
      player.play();
    } catch (error) {
      console.warn('AlertAudioService: failed to play fatigue alert sound:', error);
    }
  }
}

export const alertAudioService = new AlertAudioService();
