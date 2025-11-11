import { log } from "./utils.js";

const CONFIG_KEY = "yuketang-js-config";

const DEFAULT_CONFIG = {
  audio: {
    selected: "preset:0",
  },
};

class ConfigManager {
  constructor() {
    this.config = this._loadConfig();
  }

  _loadConfig() {
    try {
      const stored = GM_getValue(CONFIG_KEY, null);
      if (stored) {
        const parsed = JSON.parse(stored);
        log(`📋 Config loaded from storage`);
        return this._mergeWithDefaults(parsed);
      }
    } catch (err) {
      log(`⚠️ Config load error: ${err.message}`);
    }
    log(`📋 Using default config`);
    return this._deepClone(DEFAULT_CONFIG);
  }

  _mergeWithDefaults(loaded) {
    return {
      audio: {
        selected: loaded.audio?.selected ?? DEFAULT_CONFIG.audio.selected,
      },
    };
  }

  _deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  _saveConfig() {
    try {
      GM_setValue(CONFIG_KEY, JSON.stringify(this.config));
      log(`💾 Config saved to storage`);
      return true;
    } catch (err) {
      log(`❌ Config save error: ${err.message}`);
      return false;
    }
  }

  /**
   * Gets selected audio preset
   * @returns {string} - "preset:0" or "preset:1"
   */
  getSelectedAudio() {
    return this.config.audio.selected;
  }

  /**
   * Set selected audio preset
   * @param {string} presetId - "preset:0" or "preset:1"
   */
  setSelectedAudio(presetId) {
    this.config.audio.selected = presetId;
    return this._saveConfig();
  }

  /**
   * Gets entire audio configuration
   * @returns {{ selected: string }}
   */
  getAudioConfig() {
    return this._deepClone(this.config.audio);
  }
}

export const config = new ConfigManager();
