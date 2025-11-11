import { AUDIO_DATA } from "./data.js";

export function log(msg) {
  console.log(`[Yuketang-JS] ${msg}`);
}

export function notify(title, text) {
  // https://www.tampermonkey.net/documentation.php?locale=en#api:GM_notification
  if (typeof GM_notification === "function") {
    GM_notification({
      text: text,
      title: title,
      image: "https://www.yuketang.cn/static/images/favicon.ico",
      highlight: true,
      timeout: 3600 * 1000,
    });
    log(`🔈 Notification sent: ${title}`);
  } else {
    log("⚠️ Notification not available");
  }
}

export class WsMitm {
  constructor() {
    this.originalWebSocket = null;
    this.urlRegex = null;
    this.onReceiveCallback = null;
    this.onUploadCallback = null;
    this.interceptedConnections = new Map();
    this.isActive = false;
  }

  /**
   * @param {Function} callback - (url, data)
   */
  setOnReceive(callback) {
    if (typeof callback === "function") {
      this.onReceiveCallback = callback;
    }
  }

  /**
   * @param {Function} callback - (url, data)
   */
  setOnUpload(callback) {
    if (typeof callback === "function") {
      this.onUploadCallback = callback;
    }
  }

  startMitm(urlReg) {
    if (this.isActive) {
      return;
    }

    if (typeof urlReg === "string") {
      this.urlRegex = new RegExp(urlReg);
    } else if (urlReg instanceof RegExp) {
      this.urlRegex = urlReg;
    } else {
      throw new Error("Bad urlReg type");
    }

    const targetWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    this.originalWebSocket = targetWindow.WebSocket;
    log(
      "📍 WebSocket MITM using window is " +
        (typeof unsafeWindow !== "undefined" ? "unsafeWindow" : "window")
    );

    const self = this;
    targetWindow.WebSocket = class ProxyWebSocket extends (
      self.originalWebSocket
    ) {
      constructor(url, protocols) {
        super(url, protocols);
        log("🚧 WebSocket connection attempted to: " + url);

        if (self.urlRegex.test(url)) {
          const wsId = `${url}_${Date.now()}_${Math.random()}`;

          self.interceptedConnections.set(wsId, {
            url,
            protocols,
            instance: this,
            messages: [],
          });

          const originalSend = this.send;
          this.send = function (data) {
            if (self.onUploadCallback) {
              self.onUploadCallback(url, data);
            }
            return originalSend.call(this, data);
          };

          const originalAddEventListener = this.addEventListener;
          this.addEventListener = function (eventType, listener, options) {
            if (eventType === "message") {
              const wrappedListener = function (event) {
                if (self.onReceiveCallback) {
                  self.onReceiveCallback(url, event.data);
                }
                listener(event);
              };
              return originalAddEventListener.call(
                this,
                eventType,
                wrappedListener,
                options
              );
            }
            return originalAddEventListener.call(
              this,
              eventType,
              listener,
              options
            );
          };

          const originalDescriptor = Object.getOwnPropertyDescriptor(
            Object.getPrototypeOf(this),
            "onmessage"
          );

          let userOnMessage = null;

          Object.defineProperty(this, "onmessage", {
            set: function (callback) {
              userOnMessage = callback;
              const wrappedCallback = function (event) {
                if (self.onReceiveCallback) {
                  self.onReceiveCallback(url, event.data);
                }
                if (userOnMessage) {
                  userOnMessage.call(this, event);
                }
              };
              if (originalDescriptor && originalDescriptor.set) {
                originalDescriptor.set.call(this, wrappedCallback);
              } else {
                // Fallback
                originalAddEventListener.call(this, "message", wrappedCallback);
              }
            },
            get: function () {
              return userOnMessage;
            },
            configurable: true,
            enumerable: false,
          });
        }
      }
    };

    this.isActive = true;
    log("▶️ Started WebSocket MITM for URLs matching: " + this.urlRegex);
  }

  endMitm() {
    if (!this.isActive) {
      return;
    }

    const targetWindow =
      typeof unsafeWindow !== "undefined" ? unsafeWindow : window;

    if (this.originalWebSocket) {
      targetWindow.WebSocket = this.originalWebSocket;
    }

    this.interceptedConnections.clear();

    this.urlRegex = null;
    this.isActive = false;

    log("⏹️ Stopped WebSocket MITM");
  }

  getInterceptedConnections() {
    return Array.from(this.interceptedConnections.values());
  }

  isActive() {
    return this.isActive;
  }
}

export const wsMitm = new WsMitm();

export class AudioController {
  constructor() {
    this.currentAudioIndex = 0;
    this.audioElement = new Audio();
    this.currentAudioData = AUDIO_DATA[0];
    this.customAudio = null;
    this._initializeAudio();
  }

  _initializeAudio() {
    if (this.currentAudioData && this.currentAudioData.data) {
      this.audioElement.src = this.currentAudioData.data;
    }
  }

  _isPlaying() {
    return !this.audioElement.paused;
  }

  /**
   * Plays the audio.
   * If the previous audio is still playing, this play request will be ignored.
   */
  play() {
    if (!this._isPlaying()) {
      this.audioElement.currentTime = 0;
      this.audioElement.play().catch((err) => {
        log("❌ Audio play error:", err);
      });
    }
  }

  stop() {
    this.audioElement.pause();
    this.audioElement.currentTime = 0;
  }

  /**
   * Switches to a different audio by name or index.
   * @param {string|number} nameOrIndex - Audio name or index
   */
  setAudio(nameOrIndex) {
    let newIndex = -1;

    if (typeof nameOrIndex === "number") {
      newIndex = nameOrIndex;
    } else if (typeof nameOrIndex === "string") {
      newIndex = AUDIO_DATA.findIndex((audio) => audio.name === nameOrIndex);
    }

    if (newIndex < 0 || newIndex >= AUDIO_DATA.length) {
      console.error(`Audio] Invalid audio index or name: ${nameOrIndex}`);
      return false;
    }

    this.currentAudioIndex = newIndex;
    this.currentAudioData = AUDIO_DATA[newIndex];
    this.customAudio = null;
    this._initializeAudio();
    return true;
  }

  /**
   * Add or replace custom audio from file data.
   * @param {string} name - Custom audio name
   * @param {string} data - Audio data URL or blob URL
   */
  addAudio(name, data) {
    // Remove previous custom audio if exists
    if (this.customAudio) {
      if (this.customAudio.data.startsWith("blob:")) {
        URL.revokeObjectURL(this.customAudio.data);
      }
      this.customAudio = null;
    }

    // Store new custom audio
    this.customAudio = { name, data };
    this.currentAudioData = this.customAudio;
    this._initializeAudio();
    log(`🎵 Custom audio added: ${name}`);
    return true;
  }
}

export const audioController = new AudioController();
