import $ from "jquery";
import "bootstrap/dist/css/bootstrap.css";
import { log } from "../utils/log.js";
import { notify } from "../utils/notify.js";
import { audioController } from "../utils/audio-controller.js";
import { settingsModal } from "./settings-modal.js";
import { openAnswerLog } from "./answer-log-modal.js";

export class LessonHeaderUI {
  private $container: JQuery | null;
  private $statusText: JQuery | null;
  private $notifyBtn: JQuery | null;
  private $settingsBtn: JQuery | null;
  private $logBtn: JQuery | null;
  private lastActiveTime: number | null;

  constructor() {
    this.$container = null;
    this.$statusText = null;
    this.$notifyBtn = null;
    this.$settingsBtn = null;
    this.$logBtn = null;
    this.lastActiveTime = null; // null means never active
  }

  /**
   * Ensures the UI is injected and updates all status.
   */
  update(): void {
    this._ensureInjected();
    this._updateStatusDisplay();
  }

  /**
   * Mark as active and update lastActiveTime.
   */
  setActive(): void {
    this.lastActiveTime = Date.now();
    this._updateStatusDisplay();
  }

  private _ensureInjected(): void {
    // Check if already injected
    if (this.$container && this.$container.length > 0) {
      return;
    }

    const $header = $(".lesson__header");
    if ($header.length === 0) {
      return;
    }

    // Check if container already exists
    const $existing = $("#yuketang-js-ui-container");
    if ($existing.length > 0) {
      this.$container = $existing;
      this.$statusText = this.$container.find("#yuketang-js-status-text");
      this.$notifyBtn = this.$container.find("#yuketang-js-test-notification");
      this.$settingsBtn = this.$container.find("#yuketang-js-settings-btn");
      this.$logBtn = this.$container.find("#yuketang-js-answer-log-btn");
      return;
    }

    this.$container = $(
      '<div id="yuketang-js-ui-container" class="d-inline-flex align-items-center gap-2"></div>',
    );
    this.$statusText = $(
      '<span id="yuketang-js-status-text" class="badge"></span>',
    );
    this.$notifyBtn = $(
      '<button id="yuketang-js-test-notification" class="btn btn-sm btn-primary"></button>',
    );
    this.$notifyBtn.text("发送测试通知");
    this.$notifyBtn.on("click", () => {
      notify("🆗 测试通知", "【点我消除通知】恭喜！通知系统工作正常。");
      audioController.play();
    });

    this.$settingsBtn = $(
      '<button id="yuketang-js-settings-btn" class="btn btn-sm btn-secondary"></button>',
    );
    this.$settingsBtn.text("脚本设置");
    this.$settingsBtn.on("click", () => {
      settingsModal.open();
    });

    this.$logBtn = $(
      '<button id="yuketang-js-answer-log-btn" class="btn btn-sm btn-secondary"></button>',
    );
    this.$logBtn.text("答题日志");
    this.$logBtn.on("click", () => {
      openAnswerLog();
    });

    this.$container
      .append(this.$statusText)
      .append(this.$notifyBtn)
      .append(this.$logBtn)
      .append(this.$settingsBtn);
    $header.append(this.$container);

    log("🔲 UI container added to lesson__header");
  }

  private _updateStatusDisplay(): void {
    if (!this.$statusText || this.$statusText.length === 0) {
      return;
    }

    // If never active
    if (this.lastActiveTime === null) {
      this.$statusText.text("未监听");
      this.$statusText.removeClass("bg-secondary bg-info");
      this.$statusText.addClass("bg-danger");
      return;
    }

    const now = Date.now();
    const inactiveThreshold = 300 * 1000;
    const timeSinceActive = now - this.lastActiveTime;

    if (timeSinceActive > inactiveThreshold) {
      this.$statusText.text("无活动");
      this.$statusText.removeClass("bg-danger bg-info");
      this.$statusText.addClass("bg-secondary");
    } else {
      this.$statusText.text("已监听");
      this.$statusText.removeClass("bg-danger bg-secondary");
      this.$statusText.addClass("bg-info");
    }
  }
}
