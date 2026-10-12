import { log } from "./utils/log.js";
import { showStaleConfigWarning } from "./ui/settings-modal.js";

const CONFIG_KEY = "yuketang-js-config";

interface AudioConfig {
  selected: string;
}

export type LlmProvider = "openai" | "anthropic";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  apiKey: string;
  model: string;
  reasoningEffort: string;
}

interface AutoAnswerConfig {
  enabled: boolean;
  timeLeftThreshold: number;
  timeAfterSend: number;
  confirmBeforeSubmit: boolean;
  includeSlideImage: boolean;
}

interface EventListenersConfig {
  unlockProblem: boolean;
  extendTime: boolean;
  randomPick: boolean;
}

interface CheckinConfig {
  defaultFingerprint: string;
  autoCheckinEnabled: boolean;
  autoCheckinDelay: number;
  autoRefreshEnabled: boolean;
  autoRefreshInterval: number;
  autoCheckinAudit: boolean;
}

interface Config {
  audio: AudioConfig;
  llm: LlmConfig;
  autoAnswer: AutoAnswerConfig;
  eventListeners: EventListenersConfig;
  checkin: CheckinConfig;
  hash: string;
}

const DEFAULT_CONFIG: Config = {
  audio: {
    selected: "preset:0",
  },
  llm: {
    provider: "openai",
    baseUrl: "",
    apiKey: "",
    model: "",
    reasoningEffort: "high",
  },
  autoAnswer: {
    enabled: false,
    timeLeftThreshold: 300,
    timeAfterSend: 10,
    confirmBeforeSubmit: false,
    includeSlideImage: true,
  },
  eventListeners: {
    unlockProblem: true,
    extendTime: true,
    randomPick: true,
  },
  checkin: {
    defaultFingerprint: "1",
    autoCheckinEnabled: false,
    autoCheckinDelay: 10,
    autoRefreshEnabled: false,
    autoRefreshInterval: 30,
    autoCheckinAudit: false,
  },
  hash: "",
};

class ConfigManager {
  private config: Config;
  private _monitorTimer: ReturnType<typeof setInterval> | null;

  constructor() {
    this.config = this._loadConfig();
    this._monitorTimer = null;
  }

  private _loadConfig(): Config {
    try {
      const stored = GM_getValue<string | null>(CONFIG_KEY, null);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Config>;
        log(`📋 Config loaded from storage`);
        const merged = this._mergeWithDefaults(parsed);
        merged.hash = this._computeHash(this._getContentFrom(merged));
        return merged;
      }
    } catch (err) {
      const error = err as Error;
      log(`⚠️ Config load error: ${error.message}`);
    }
    log(`📋 Using default config`);
    return this._deepClone(DEFAULT_CONFIG);
  }

  private _mergeWithDefaults(loaded: Partial<Config>): Config {
    return {
      audio: {
        selected: loaded.audio?.selected ?? DEFAULT_CONFIG.audio.selected,
      },
      llm: {
        provider: loaded.llm?.provider ?? DEFAULT_CONFIG.llm.provider,
        baseUrl: loaded.llm?.baseUrl ?? DEFAULT_CONFIG.llm.baseUrl,
        apiKey: loaded.llm?.apiKey ?? DEFAULT_CONFIG.llm.apiKey,
        model: loaded.llm?.model ?? DEFAULT_CONFIG.llm.model,
        reasoningEffort:
          loaded.llm?.reasoningEffort ?? DEFAULT_CONFIG.llm.reasoningEffort,
      },
      autoAnswer: {
        enabled:
          loaded.autoAnswer?.enabled ?? DEFAULT_CONFIG.autoAnswer.enabled,
        timeLeftThreshold:
          loaded.autoAnswer?.timeLeftThreshold ??
          DEFAULT_CONFIG.autoAnswer.timeLeftThreshold,
        timeAfterSend:
          loaded.autoAnswer?.timeAfterSend ??
          DEFAULT_CONFIG.autoAnswer.timeAfterSend,
        confirmBeforeSubmit:
          loaded.autoAnswer?.confirmBeforeSubmit ??
          DEFAULT_CONFIG.autoAnswer.confirmBeforeSubmit,
        includeSlideImage:
          loaded.autoAnswer?.includeSlideImage ??
          DEFAULT_CONFIG.autoAnswer.includeSlideImage,
      },
      eventListeners: {
        unlockProblem:
          loaded.eventListeners?.unlockProblem ??
          DEFAULT_CONFIG.eventListeners.unlockProblem,
        extendTime:
          loaded.eventListeners?.extendTime ??
          DEFAULT_CONFIG.eventListeners.extendTime,
        randomPick:
          loaded.eventListeners?.randomPick ??
          DEFAULT_CONFIG.eventListeners.randomPick,
      },
      checkin: {
        defaultFingerprint:
          loaded.checkin?.defaultFingerprint ??
          DEFAULT_CONFIG.checkin.defaultFingerprint,
        autoCheckinEnabled:
          loaded.checkin?.autoCheckinEnabled ??
          DEFAULT_CONFIG.checkin.autoCheckinEnabled,
        autoCheckinDelay:
          loaded.checkin?.autoCheckinDelay ??
          DEFAULT_CONFIG.checkin.autoCheckinDelay,
        autoRefreshEnabled:
          loaded.checkin?.autoRefreshEnabled ??
          DEFAULT_CONFIG.checkin.autoRefreshEnabled,
        autoRefreshInterval:
          loaded.checkin?.autoRefreshInterval ??
          DEFAULT_CONFIG.checkin.autoRefreshInterval,
        autoCheckinAudit:
          loaded.checkin?.autoCheckinAudit ??
          DEFAULT_CONFIG.checkin.autoCheckinAudit,
      },
      hash: loaded.hash ?? "",
    };
  }

  private _deepClone(obj: Config): Config {
    return JSON.parse(JSON.stringify(obj));
  }

  private _computeHash(data: Omit<Config, "hash">): string {
    const json = JSON.stringify(data);
    let hash = 5381;
    for (let i = 0; i < json.length; i++) {
      hash = ((hash << 5) + hash + json.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
  }

  private _getContent(): Omit<Config, "hash"> {
    return this._getContentFrom(this.config);
  }

  private _getContentFrom(cfg: Config): Omit<Config, "hash"> {
    return {
      audio: cfg.audio,
      llm: cfg.llm,
      autoAnswer: cfg.autoAnswer,
      eventListeners: cfg.eventListeners,
      checkin: cfg.checkin,
    };
  }

  private _saveConfig(): boolean {
    try {
      this.config.hash = this._computeHash(this._getContent());
      GM_setValue(CONFIG_KEY, JSON.stringify(this.config));
      log(`💾 Config saved to storage`);
      return true;
    } catch (err) {
      const error = err as Error;
      log(`❌ Config save error: ${error.message}`);
      return false;
    }
  }

  /**
   * Checks if the config in GM storage differs from the in-memory config,
   * indicating it was modified in another tab.
   */
  checkForExternalChanges(): boolean {
    try {
      const stored = GM_getValue<string | null>(CONFIG_KEY, null);
      if (!stored) return false;
      const parsed = JSON.parse(stored) as Partial<Config>;
      if (!parsed.hash) return false;
      const merged = this._mergeWithDefaults(parsed);
      const storedHash = this._computeHash(this._getContentFrom(merged));
      const currentHash = this._computeHash(this._getContent());
      return storedHash !== currentHash;
    } catch {
      return false;
    }
  }

  /**
   * Reloads config from GM storage to pick up external changes.
   */
  reloadFromStorage(): void {
    this.config = this._loadConfig();
    log(`🔄 Config reloaded from storage`);
  }

  /**
   * Starts periodic monitoring for config changes made in other tabs.
   * @param interval - Check interval in ms (default 10000)
   * @param onChange - Callback when external change is detected (default: show stale config warning)
   * @param fastStop - If true, stop monitoring after first detection (default true)
   */
  startConfigChangeMonitor(
    interval: number = 10000,
    onChange: () => void = showStaleConfigWarning,
    fastStop: boolean = true,
  ): void {
    this.stopConfigChangeMonitor();
    this._monitorTimer = setInterval(() => {
      if (this.checkForExternalChanges()) {
        log(`⚠️ Config changed in another tab`);
        if (fastStop) {
          this.stopConfigChangeMonitor();
        }
        onChange();
      }
    }, interval);
  }

  stopConfigChangeMonitor(): void {
    if (this._monitorTimer !== null) {
      clearInterval(this._monitorTimer);
      this._monitorTimer = null;
    }
  }

  /**
   * Gets selected audio preset
   * @returns {string} - "preset:0" or "preset:1"
   */
  getSelectedAudio(): string {
    return this.config.audio.selected;
  }

  /**
   * Set selected audio preset
   * @param {string} presetId - "preset:0" or "preset:1"
   */
  setSelectedAudio(presetId: string): boolean {
    this.config.audio.selected = presetId;
    return this._saveConfig();
  }

  getAudioConfig(): AudioConfig {
    return JSON.parse(JSON.stringify(this.config.audio)) as AudioConfig;
  }

  isLlmConfigAvailable(): boolean {
    const { baseUrl, apiKey, model } = this.config.llm;
    return (
      /^https?:\/\/.+/.test(baseUrl) && apiKey.length >= 4 && model.length > 0
    );
  }

  getLlmConfig(): LlmConfig {
    return JSON.parse(JSON.stringify(this.config.llm)) as LlmConfig;
  }

  setLlmConfig(newConfig: Partial<LlmConfig>): boolean {
    this.config.llm = { ...this.config.llm, ...newConfig };
    return this._saveConfig();
  }

  getAutoAnswerConfig(): AutoAnswerConfig {
    return JSON.parse(
      JSON.stringify(this.config.autoAnswer),
    ) as AutoAnswerConfig;
  }

  setAutoAnswerConfig(newConfig: Partial<AutoAnswerConfig>): boolean {
    this.config.autoAnswer = { ...this.config.autoAnswer, ...newConfig };
    return this._saveConfig();
  }

  getEventListenersConfig(): EventListenersConfig {
    return JSON.parse(
      JSON.stringify(this.config.eventListeners),
    ) as EventListenersConfig;
  }

  setEventListenersConfig(newConfig: Partial<EventListenersConfig>): boolean {
    this.config.eventListeners = {
      ...this.config.eventListeners,
      ...newConfig,
    };
    return this._saveConfig();
  }

  getCheckinConfig(): CheckinConfig {
    return JSON.parse(JSON.stringify(this.config.checkin)) as CheckinConfig;
  }

  setCheckinConfig(newConfig: Partial<CheckinConfig>): boolean {
    this.config.checkin = { ...this.config.checkin, ...newConfig };
    return this._saveConfig();
  }
}

export const config = new ConfigManager();
