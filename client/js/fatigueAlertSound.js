/**
 * Plays a short warning tone when Socket.IO indicates the driver is not fit to drive
 * (sleeping, drowsy, critical fatigue, or safe-stop recommendation).
 * Browsers require a prior user gesture to unlock audio; we unlock on first click/tap/keydown.
 */
class FatigueAlertSoundManager {
    constructor() {
        this.audioUrl =
            (window.CONFIG && window.CONFIG.FATIGUE_ALERT_SOUND_URL) ||
            'sounds/driver-fatigue-warning.mp3';
        this.minIntervalMs =
            (window.CONFIG && window.CONFIG.FATIGUE_ALERT_SOUND_MIN_INTERVAL_MS) || 10000;
        this._audio = null;
        this._unlocked = false;
        this._lastPlayAt = 0;
        this._attached = false;
        this._unlockHandler = this._unlockHandler.bind(this);
    }

    attach(wsManager) {
        if (!wsManager || this._attached) return;
        this._attached = true;
        document.addEventListener('click', this._unlockHandler, { capture: true, passive: true });
        document.addEventListener('keydown', this._unlockHandler, { capture: true, passive: true });
        document.addEventListener('touchstart', this._unlockHandler, { capture: true, passive: true });

        wsManager.on('driver_fatigue_alert', (payload) => this._onDriverFatigueAlert(payload));
        wsManager.on('fatigue_safe_stop', (payload) => this._onFatigueSafeStop(payload));
        wsManager.on('fatigue_detection', (payload) => this._onFatigueDetection(payload));
    }

    _unlockHandler() {
        if (this._unlocked) return;
        this._ensureAudio();
        const a = this._audio;
        if (!a) return;
        a.muted = true;
        a.play()
            .then(() => {
                a.pause();
                a.currentTime = 0;
                a.muted = false;
                this._unlocked = true;
            })
            .catch(() => {
                /* still locked until user interacts again */
            });
    }

    _ensureAudio() {
        if (this._audio) return;
        this._audio = new Audio(this.audioUrl);
        this._audio.preload = 'auto';
    }

    _shouldThrottle() {
        const now = Date.now();
        if (now - this._lastPlayAt < this.minIntervalMs) return true;
        this._lastPlayAt = now;
        return false;
    }

    play() {
        if (!this._unlocked || this._shouldThrottle()) return;
        this._ensureAudio();
        const a = this._audio;
        if (!a) return;
        try {
            a.currentTime = 0;
            a.volume = 1;
            a.play().catch((err) => console.warn('[fatigueAlertSound] play blocked:', err.message));
        } catch (e) {
            console.warn('[fatigueAlertSound] play error:', e);
        }
    }

    _onDriverFatigueAlert(payload) {
        const severity = payload && payload.severity;
        if (severity === 'critical' || severity === 'warning') {
            this.play();
        }
    }

    _onFatigueSafeStop() {
        this.play();
    }

    _onFatigueDetection(payload) {
        if (!payload) return;
        const source = payload.raw || payload;
        const level = source.fatigueLevel;
        const actionRequired = source.alert && source.alert.actionRequired;
        if (level === 'sleeping' || level === 'drowsy' || actionRequired) {
            this.play();
        }
    }
}

window.FatigueAlertSoundManager = FatigueAlertSoundManager;

(function initFatigueAlertSound() {
    window.fatigueAlertSound = new FatigueAlertSoundManager();
    const attach = () => {
        if (window.wsManager) {
            window.fatigueAlertSound.attach(window.wsManager);
        }
    };
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', attach);
    } else {
        attach();
    }
})();
