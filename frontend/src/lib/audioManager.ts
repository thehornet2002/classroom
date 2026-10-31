// Dedicated High-Reliability Audio Manager
// Handles browser autoplay policies, user gesture unlocking, and jitter-free multi-peer audio playback

class AudioManager {
  private audioElements = new Map<string, HTMLAudioElement>();
  private audioContext: AudioContext | null = null;
  private isUnlocked = false;

  constructor() {
    this.setupGestureUnlock();
  }

  private setupGestureUnlock() {
    const unlock = () => {
      if (!this.audioContext) {
        try {
          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          if (AudioContextClass) {
            this.audioContext = new AudioContextClass();
          }
        } catch (e) {}
      }

      if (this.audioContext && this.audioContext.state === "suspended") {
        this.audioContext.resume().catch(() => {});
      }

      // Retry playing any audio elements that were waiting for gesture
      for (const el of this.audioElements.values()) {
        if (el.paused && el.srcObject) {
          el.play().catch(() => {});
        }
      }

      this.isUnlocked = true;
    };

    if (typeof window !== "undefined") {
      window.addEventListener("click", unlock, { passive: true });
      window.addEventListener("keydown", unlock, { passive: true });
      window.addEventListener("touchstart", unlock, { passive: true });
    }
  }

  playRemoteAudio(peerId: string, track: MediaStreamTrack) {
    if (track.kind !== "audio") return;

    let el = this.audioElements.get(peerId);
    if (!el) {
      el = new Audio();
      el.autoplay = true;
      (el as any).playsInline = true;
      el.volume = 1.0;
      this.audioElements.set(peerId, el);
    }

    const stream = new MediaStream([track]);
    el.srcObject = stream;

    const playPromise = el.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // Autoplay policy prevented playback, will be unlocked on first user tap/click
      });
    }
  }

  stopRemoteAudio(peerId: string) {
    const el = this.audioElements.get(peerId);
    if (el) {
      el.pause();
      el.srcObject = null;
      this.audioElements.delete(peerId);
    }
  }

  stopAll() {
    for (const el of this.audioElements.values()) {
      el.pause();
      el.srcObject = null;
    }
    this.audioElements.clear();
  }
}

export const audioManager = new AudioManager();
