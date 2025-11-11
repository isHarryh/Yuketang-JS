import $ from "jquery";
import "bootstrap/dist/css/bootstrap.css";
import { log, notify } from "./utils.js";

export class LessonHeaderUI {
  constructor() {
    this.$container = null;
    this.$statusText = null;
    this.$notifyBtn = null;
    this.lastActiveTime = null; // null means never active
  }

  /**
   * Ensures the UI is injected and updates all status.
   */
  update() {
    this._ensureInjected();
    this._updateStatusDisplay();
  }

  /**
   * Mark as active and update lastActiveTime.
   */
  setActive() {
    this.lastActiveTime = Date.now();
    this._updateStatusDisplay();
  }

  _ensureInjected() {
    // Check if already injected
    if (this.$container && this.$container.length > 0) {
      return;
    }

    const $header = $(".lesson__header");
    if ($header.length === 0) {
      log("❓ lesson__header not found on this page");
      return;
    }

    // Check if container already exists
    const $existing = $("#yuketang-js-ui-container");
    if ($existing.length > 0) {
      this.$container = $existing;
      this.$statusText = this.$container.find("#yuketang-js-status-text");
      this.$notifyBtn = this.$container.find("#yuketang-js-test-notification");
      return;
    }

    this.$container = $(
      '<div id="yuketang-js-ui-container" class="d-inline-flex align-items-center gap-2"></div>'
    );
    this.$statusText = $(
      '<span id="yuketang-js-status-text" class="badge"></span>'
    );
    this.$notifyBtn = $(
      '<button id="yuketang-js-test-notification" class="btn btn-sm btn-primary"></button>'
    )
      .text("发送测试通知")
      .click(() => {
        notify(
          "🆗 测试通知",
          "【👉点我消除通知】恭喜！通知系统工作正常。（Yuketang-JS）"
        );
      });

    this.$container.append(this.$statusText).append(this.$notifyBtn);
    $header.append(this.$container);

    log("🔲 UI container added to lesson__header");
  }

  _updateStatusDisplay() {
    if (!this.$statusText || this.$statusText.length === 0) {
      return;
    }

    // If never active
    if (this.lastActiveTime === null) {
      this.$statusText
        .text("未监听")
        .removeClass("bg-secondary bg-info")
        .addClass("bg-danger");
      return;
    }

    const now = Date.now();
    const inactiveThreshold = 300 * 1000;
    const timeSinceActive = now - this.lastActiveTime;

    if (timeSinceActive > inactiveThreshold) {
      this.$statusText
        .text("无活动")
        .removeClass("bg-danger bg-info")
        .addClass("bg-secondary");
    } else {
      this.$statusText
        .text("已监听")
        .removeClass("bg-danger bg-secondary")
        .addClass("bg-info");
    }
  }
}
