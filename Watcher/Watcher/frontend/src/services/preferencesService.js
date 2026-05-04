/**
 * preferencesService
 * ──────────────────
 * Singleton that mirrors the `preferences` JSONField of the user's profile.
 * - Reads are synchronous (in-memory cache).
 * - Writes are synchronous to cache, then debounced-flushed to
 *   PATCH /api/auth/profile after 800 ms of inactivity.
 * - call `init(prefsObject)` once the profile API has responded.
 * - Fires the custom DOM event `watcher:prefs:ready` after init so that
 *   components that mounted before the profile loaded can re-hydrate.
 */

const DEBOUNCE_MS = 800;

class PreferencesService {
    _cache = {};
    _timer = null;
    _ready = false;

    /** Populate cache from server response and fire ready event */
    init(preferencesObj) {
        this._cache = (preferencesObj && typeof preferencesObj === 'object') ? { ...preferencesObj } : {};
        this._ready = true;
        try {
            window.dispatchEvent(new CustomEvent('watcher:prefs:ready'));
        } catch (_) {}
    }

    isReady() { return this._ready; }

    get(key, defaultValue) {
        return this._cache[key] !== undefined ? this._cache[key] : defaultValue;
    }

    set(key, value) {
        this._cache[key] = value;
        this._schedule();
    }

    remove(key) {
        delete this._cache[key];
        this._schedule();
    }

    _schedule() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._flush(), DEBOUNCE_MS);
    }

    _flush() {
        const token = localStorage.getItem('token');
        if (!token) return;
        fetch('/api/auth/profile', {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Token ${token}`,
            },
            body: JSON.stringify({ preferences: { ...this._cache } }),
        }).catch(() => {});
    }
}

export default new PreferencesService();
