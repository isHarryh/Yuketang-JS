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
