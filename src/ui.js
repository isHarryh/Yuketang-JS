import $ from "jquery";
import "bootstrap/dist/css/bootstrap.css";
import * as bootstrap from "bootstrap";
import { log, notify, audioController } from "./utils.js";
import { config } from "./config.js";

export class LessonHeaderUI {
  constructor() {
    this.$container = null;
    this.$statusText = null;
    this.$notifyBtn = null;
    this.$settingsBtn = null;
    this.$modal = null;
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
      this.$settingsBtn = this.$container.find("#yuketang-js-settings-btn");
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
        notify("🆗 测试通知", "【点我消除通知】恭喜！通知系统工作正常。");
        audioController.play();
      });

    this.$settingsBtn = $(
      '<button id="yuketang-js-settings-btn" class="btn btn-sm btn-secondary"></button>'
    )
      .text("脚本设置")
      .click(() => {
        this._openSettingsModal();
      });

    this.$container
      .append(this.$statusText)
      .append(this.$notifyBtn)
      .append(this.$settingsBtn);
    $header.append(this.$container);

    // Inject modal
    this._createModal();

    log("🔲 UI container added to lesson__header");
  }

  _createModal() {
    if (this.$modal && this.$modal.length > 0) {
      return;
    }

    const modalHtml = `
      <div class="modal fade" id="yuketang-js-settings-modal" tabindex="-1" aria-labelledby="yuketang-js-settings-modal-label" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h1 class="modal-title fs-5" id="yuketang-js-settings-modal-label">Yuketang-JS 脚本设置</h1>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <ul class="nav nav-tabs" id="yuketang-js-settings-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button class="nav-link active" id="yuketang-js-classroom-alert-tab" data-bs-toggle="tab" data-bs-target="#yuketang-js-classroom-alert" type="button" role="tab" aria-controls="yuketang-js-classroom-alert" aria-selected="true">
                    通知音频设置
                  </button>
                </li>
              </ul>
              <div class="tab-content" id="yuketang-js-settings-tabs-content">
                <div class="tab-pane fade show active" id="yuketang-js-classroom-alert" role="tabpanel" aria-labelledby="yuketang-js-classroom-alert-tab">
                  <div class="mt-3">
                    <div class="d-flex gap-2 mb-3">
                      <button id="yuketang-js-test-audio-btn" class="btn btn-sm btn-warning">测试音频播放</button>
                      <button id="yuketang-js-stop-audio-btn" class="btn btn-sm btn-warning">停止所有音频</button>
                    </div>
                    <h5>选择音频</h5>
                    <div id="yuketang-js-audio-options"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    $("body").append(modalHtml);
    this.$modal = $("#yuketang-js-settings-modal");

    this._populateAudioOptions();
  }

  _populateAudioOptions() {
    const $audioOptions = $("#yuketang-js-audio-options");
    const audioData = [
      { id: 0, name: "默认提示音 1" },
      { id: 1, name: "默认提示音 2" },
    ];

    audioData.forEach((audio) => {
      const radioId = `yuketang-js-audio-${audio.id}`;
      const $radio = $(`
        <div class="form-check">
          <input class="form-check-input" type="radio" name="yuketang-js-audio-select" id="${radioId}" value="${audio.id}" />
          <label class="form-check-label" for="${radioId}">${audio.name}</label>
        </div>
      `);

      $radio.on("change", (e) => {
        const selectedId = parseInt($(e.target).val());
        audioController.setAudio(selectedId);
        log(`🎵 Audio changed to: ${audio.name}`);
      });

      $audioOptions.append($radio);
    });

    // Restore configuration
    const selectedAudio = config.getSelectedAudio();
    if (selectedAudio && selectedAudio.startsWith("preset:")) {
      const presetId = parseInt(selectedAudio.split(":")[1]);
      $audioOptions
        .find(`#yuketang-js-audio-${presetId}`)
        .prop("checked", true);
      log(`🎵 Restored preset audio: ${audioData[presetId]?.name}`);
    } else {
      // Default to first option
      $audioOptions.find("input[type='radio']").first().prop("checked", true);
    }
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

  _openSettingsModal() {
    if (!this.$modal || this.$modal.length === 0) {
      this._createModal();
    }

    // Attach button event listeners
    $("#yuketang-js-test-audio-btn")
      .off("click")
      .on("click", () => {
        audioController.play();
        log("▶️ Test audio playback triggered");
      });

    $("#yuketang-js-stop-audio-btn")
      .off("click")
      .on("click", () => {
        audioController.stop();
        log("⏹️ All audio stopped");
      });

    const modalInstance = new bootstrap.Modal(this.$modal[0]);
    modalInstance.show();
  }
}
