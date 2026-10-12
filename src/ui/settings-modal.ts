import $ from "jquery";
import "bootstrap/dist/css/bootstrap.css";
import * as bootstrap from "bootstrap";
import { log } from "../utils/log.js";
import { audioController } from "../utils/audio-controller.js";
import { config } from "../config.js";
import { FINGERPRINT_OPTIONS } from "../constants.js";
import { showToast } from "./banner.js";
import OpenAI from "openai";

export function showStaleConfigWarning(): void {
  const modalId = "yuketang-js-stale-config-modal";
  $(`#${modalId}`).remove();

  const html = `
    <div class="modal fade" id="${modalId}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Yuketang-JS 配置已过期</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <p>脚本设置已在其他地方被修改，请刷新当前页面以确保配置是最新的。</p>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="yuketang-js-stale-ignore-btn">忽略</button>
            <button type="button" class="btn btn-primary" id="yuketang-js-stale-refresh-btn">立即刷新</button>
          </div>
        </div>
      </div>
    </div>
  `;

  $("body").append(html);
  const $modal = $(`#${modalId}`);
  const modalInstance = new bootstrap.Modal($modal[0]);

  $("#yuketang-js-stale-ignore-btn").on("click", () => {
    modalInstance.hide();
  });

  $("#yuketang-js-stale-refresh-btn").on("click", () => {
    config.reloadFromStorage();
    location.reload();
  });

  $modal.on("hidden.bs.modal", () => {
    $modal.remove();
  });

  modalInstance.show();
}

class SettingsModal {
  private $modal: JQuery | null;

  constructor() {
    this.$modal = null;
  }

  open(): void {
    this._showSettings();
  }

  private _showSettings(): void {
    if (!this.$modal || this.$modal.length === 0) {
      this._create();
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

    const modalInstance = new bootstrap.Modal(this.$modal![0]);
    modalInstance.show();
  }

  private _create(): void {
    if (this.$modal && this.$modal.length > 0) {
      return;
    }

    const modalHtml = `
      <div class="modal fade" id="yuketang-js-settings-modal" aria-labelledby="yuketang-js-settings-modal-label" aria-hidden="true">
        <div class="modal-dialog">
          <div class="modal-content">
            <div class="modal-header">
              <h1 class="modal-title fs-5" id="yuketang-js-settings-modal-label">Yuketang-JS 脚本设置</h1>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body">
              <ul class="nav nav-tabs" id="yuketang-js-settings-tabs" role="tablist">
                <li class="nav-item" role="presentation">
                  <button class="nav-link active" id="yuketang-js-checkin-tab" data-bs-toggle="tab" data-bs-target="#yuketang-js-checkin" type="button" role="tab" aria-controls="yuketang-js-checkin" aria-selected="true">
                    签到
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="yuketang-js-classroom-tab" data-bs-toggle="tab" data-bs-target="#yuketang-js-classroom" type="button" role="tab" aria-controls="yuketang-js-classroom" aria-selected="false">
                    课堂
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="yuketang-js-llm-settings-tab" data-bs-toggle="tab" data-bs-target="#yuketang-js-llm-settings" type="button" role="tab" aria-controls="yuketang-js-llm-settings" aria-selected="false">
                    大模型
                  </button>
                </li>
                <li class="nav-item" role="presentation">
                  <button class="nav-link" id="yuketang-js-audio-tab" data-bs-toggle="tab" data-bs-target="#yuketang-js-audio" type="button" role="tab" aria-controls="yuketang-js-audio" aria-selected="false">
                    通知音频
                  </button>
                </li>
              </ul>
              <div class="tab-content" id="yuketang-js-settings-tabs-content">
                <div class="tab-pane fade show active" id="yuketang-js-checkin" role="tabpanel" aria-labelledby="yuketang-js-checkin-tab">
                  <div class="mt-3">
                    <h6 class="fw-semibold border-bottom pb-2 mb-3">签到指纹设置</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <label for="yuketang-js-checkin-fingerprint" class="form-label fw-medium mb-1">默认签到指纹</label>
                      <select class="form-select form-select-sm" id="yuketang-js-checkin-fingerprint"></select>
                    </div>

                    <h6 class="fw-semibold border-bottom pb-2 mb-3 mt-4">自动签到设置</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-text mb-2"><b>注意</b>：您需要<b>打开雨课堂主页</b>才能在有课堂上课时自动进行签到！</div>
                      <div class="form-text mb-2"><b>注意</b>：您需要将雨课堂域名添加到浏览器“标签页睡眠”或类似节能策略的白名单中，以防自动签到功能失效！</div>
                      <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" role="switch" id="yuketang-js-checkin-auto-enabled">
                        <label class="form-check-label" for="yuketang-js-checkin-auto-enabled">开启自动签到</label>
                      </div>
                      <div class="mb-2">
                        <label for="yuketang-js-checkin-auto-delay" class="form-label fw-medium mb-1">签到前延迟秒数</label>
                        <input type="number" class="form-control form-control-sm" id="yuketang-js-checkin-auto-delay" value="15">
                      </div>
                    </div>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-text mb-2">建议您开启主页自动刷新功能，从而防止账号登录过期</div>
                      <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" role="switch" id="yuketang-js-checkin-auto-refresh">
                        <label class="form-check-label" for="yuketang-js-checkin-auto-refresh">开启主页自动刷新</label>
                      </div>
                      <div class="mb-0">
                        <label for="yuketang-js-checkin-refresh-interval" class="form-label fw-medium mb-1">刷新间隔分钟数</label>
                        <input type="number" class="form-control form-control-sm" id="yuketang-js-checkin-refresh-interval" value="5">
                      </div>
                    </div>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-text mb-2">浏览器可能会阻止打开课堂页面，建议您点击下方按钮进行测试</div>
                      <button id="yuketang-js-checkin-test-open" class="btn btn-sm btn-primary">测试打开新页面</button>
                    </div>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <a class="d-flex justify-content-between align-items-center text-decoration-none text-body user-select-none"
                         data-bs-toggle="collapse" href="#yuketang-js-checkin-advanced" role="button" aria-expanded="false">
                        <span class="fw-medium small">高级选项</span>
                        <span id="yuketang-js-checkin-advanced-chevron" class="small" style="transition: transform 0.2s;">▸</span>
                      </a>
                      <div id="yuketang-js-checkin-advanced" class="collapse mt-2">
                        <div class="form-check mb-2">
                          <input class="form-check-input" type="checkbox" id="yuketang-js-checkin-audit">
                          <label class="form-check-label small" for="yuketang-js-checkin-audit">旁听生或其他身份课程也自动签到</label>
                        </div>
                        <button id="yuketang-js-checkin-clear-cache" class="btn btn-sm btn-outline-danger">清除已签到课程缓存</button>
                      </div>
                    </div>
                    <div id="yuketang-js-checkin-reload-hint" class="rounded px-3 py-2 mb-3 d-none alert alert-warning mb-0 py-2 px-3" role="alert">
                      <div class="d-flex justify-content-between align-items-center">
                        <span class="small">当前所做的修改需要刷新页面才能生效</span>
                        <button id="yuketang-js-checkin-reload-btn" class="btn btn-sm btn-warning">立即刷新</button>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="yuketang-js-classroom" role="tabpanel" aria-labelledby="yuketang-js-classroom-tab">
                  <div class="mt-3">
                    <h6 class="fw-semibold border-bottom pb-2 mb-3">事件监听</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-text mb-2">选择需要发送桌面通知的课堂事件</div>
                      <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="yuketang-js-el-unlock">
                        <label class="form-check-label" for="yuketang-js-el-unlock">发布题目</label>
                      </div>
                      <div class="form-check mb-2">
                        <input class="form-check-input" type="checkbox" id="yuketang-js-el-extend">
                        <label class="form-check-label" for="yuketang-js-el-extend">延时题目</label>
                      </div>
                      <div class="form-check mb-0">
                        <input class="form-check-input" type="checkbox" id="yuketang-js-el-random">
                        <label class="form-check-label" for="yuketang-js-el-random">随机点名</label>
                      </div>
                    </div>

                    <h6 class="fw-semibold border-bottom pb-2 mb-3 mt-4">自动答题</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" role="switch" id="yuketang-js-aa-enabled">
                        <label class="form-check-label" for="yuketang-js-aa-enabled">启用自动答题（需要配置正确的大模型设置）</label>
                      </div>
                      <div class="form-check form-switch mb-2">
                        <input class="form-check-input" type="checkbox" role="switch" id="yuketang-js-aa-confirm">
                        <label class="form-check-label" for="yuketang-js-aa-confirm">提交前手动确认</label>
                        <div class="form-text">开启后，大模型返回答案时先弹出确认框，可以修改后再提交。关闭则直接提交。主观题（简答）始终跳过。</div>
                      </div>
                      <div class="mb-2">
                        <label for="yuketang-js-aa-time-left" class="form-label fw-medium mb-1">限时题目在截止前多少秒启动自动答题</label>
                        <input type="number" class="form-control form-control-sm" id="yuketang-js-aa-time-left" value="30">
                      </div>
                      <div class="mb-0">
                        <label for="yuketang-js-aa-time-after" class="form-label fw-medium mb-1">不限时题目在收到题目后多少秒启动自动答题</label>
                        <input type="number" class="form-control form-control-sm" id="yuketang-js-aa-time-after" value="15">
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="yuketang-js-llm-settings" role="tabpanel" aria-labelledby="yuketang-js-llm-settings-tab">
                  <div class="mt-3">
                    <h6 class="fw-semibold border-bottom pb-2 mb-3">大模型配置</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="mb-2">
                        <label for="yuketang-js-llm-baseurl" class="form-label fw-medium mb-1">API Base URL</label>
                        <input type="text" class="form-control form-control-sm" id="yuketang-js-llm-baseurl" placeholder="https://...">
                      </div>
                      <div class="mb-2">
                        <label for="yuketang-js-llm-apikey" class="form-label fw-medium mb-1">API Key</label>
                        <div class="input-group input-group-sm">
                          <input type="password" class="form-control" id="yuketang-js-llm-apikey" placeholder="sk-xxxxxx">
                          <button class="btn btn-outline-secondary" type="button" id="yuketang-js-llm-apikey-toggle">显示/隐藏</button>
                        </div>
                      </div>
                      <div class="mb-2">
                        <label for="yuketang-js-llm-model" class="form-label fw-medium mb-1">模型名称</label>
                        <input type="text" class="form-control form-control-sm" id="yuketang-js-llm-model">
                      </div>
                      <div class="mb-0">
                        <label for="yuketang-js-llm-reasoning" class="form-label fw-medium mb-1">推理强度</label>
                        <select class="form-select form-select-sm" id="yuketang-js-llm-reasoning">
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                          <option value="xhigh">xhigh</option>
                        </select>
                      </div>
                    </div>
                    <div class="mb-3">
                      <button id="yuketang-js-llm-test-btn" class="btn btn-sm btn-primary">测试大模型功能</button>
                    </div>
                    <div id="yuketang-js-llm-test-result" class="d-none">
                      <div id="yuketang-js-llm-test-alert" class="alert mb-0" role="alert">
                        <strong id="yuketang-js-llm-test-status"></strong>
                        <pre id="yuketang-js-llm-test-detail" class="mb-0 mt-1" style="white-space: pre-wrap;"></pre>
                      </div>
                    </div>
                  </div>
                </div>
                <div class="tab-pane fade" id="yuketang-js-audio" role="tabpanel" aria-labelledby="yuketang-js-audio-tab">
                  <div class="mt-3">
                    <h6 class="fw-semibold border-bottom pb-2 mb-3">通知音频</h6>
                    <div class="rounded px-3 py-2 mb-3" style="background: #f8f9fa;">
                      <div class="form-text mb-2">选择收到课堂事件时播放的提示音</div>
                      <div id="yuketang-js-audio-options"></div>
                      <div class="d-flex gap-2 mt-2">
                        <button id="yuketang-js-test-audio-btn" class="btn btn-sm btn-primary">测试音频播放</button>
                        <button id="yuketang-js-stop-audio-btn" class="btn btn-sm btn-outline-primary">停止所有音频</button>
                      </div>
                    </div>
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

    this._populateEventListenersOptions();
    this._populateAutoAnswerOptions();
    this._populateLlmOptions();
    this._populateAudioOptions();
    this._populateCheckinOptions();
  }

  private _populateEventListenersOptions(): void {
    const elConfig = config.getEventListenersConfig();
    const $unlock = $("#yuketang-js-el-unlock");
    const $extend = $("#yuketang-js-el-extend");
    const $random = $("#yuketang-js-el-random");

    $unlock.prop("checked", elConfig.unlockProblem);
    $extend.prop("checked", elConfig.extendTime);
    $random.prop("checked", elConfig.randomPick);

    const updateConfig = () => {
      config.setEventListenersConfig({
        unlockProblem: Boolean($unlock.prop("checked")),
        extendTime: Boolean($extend.prop("checked")),
        randomPick: Boolean($random.prop("checked")),
      });
    };

    $unlock.on("change", updateConfig);
    $extend.on("change", updateConfig);
    $random.on("change", updateConfig);
  }

  private _populateAutoAnswerOptions(): void {
    const aaConfig = config.getAutoAnswerConfig();
    const $enabled = $("#yuketang-js-aa-enabled");
    const $confirm = $("#yuketang-js-aa-confirm");
    const $timeLeft = $("#yuketang-js-aa-time-left");
    const $timeAfter = $("#yuketang-js-aa-time-after");

    $enabled.prop("checked", aaConfig.enabled);
    $confirm.prop("checked", aaConfig.confirmBeforeSubmit);
    $timeLeft.val(aaConfig.timeLeftThreshold);
    $timeAfter.val(aaConfig.timeAfterSend);

    const updateConfig = () => {
      config.setAutoAnswerConfig({
        enabled: Boolean($enabled.prop("checked")),
        confirmBeforeSubmit: Boolean($confirm.prop("checked")),
        timeLeftThreshold: parseInt($timeLeft.val() as string, 10) || 30,
        timeAfterSend: parseInt($timeAfter.val() as string, 10) || 15,
      });
    };

    $enabled.on("change", updateConfig);
    $confirm.on("change", updateConfig);
    $timeLeft.on("change", updateConfig);
    $timeAfter.on("change", updateConfig);
  }

  private _populateLlmOptions(): void {
    const llmConfig = config.getLlmConfig();
    const $baseUrl = $("#yuketang-js-llm-baseurl");
    const $apiKey = $("#yuketang-js-llm-apikey");
    const $model = $("#yuketang-js-llm-model");
    const $reasoning = $("#yuketang-js-llm-reasoning");

    $baseUrl.val(llmConfig.baseUrl);
    $apiKey.val(llmConfig.apiKey);
    $model.val(llmConfig.model);
    $reasoning.val(llmConfig.reasoningEffort);

    const updateConfig = () => {
      config.setLlmConfig({
        baseUrl: $baseUrl.val() as string,
        apiKey: $apiKey.val() as string,
        model: $model.val() as string,
        reasoningEffort: $reasoning.val() as string,
      });
    };

    $baseUrl.on("change", updateConfig);
    $apiKey.on("change", updateConfig);
    $model.on("change", updateConfig);
    $reasoning.on("change", updateConfig);

    $("#yuketang-js-llm-apikey-toggle").on("click", () => {
      const type = $apiKey.attr("type") === "password" ? "text" : "password";
      $apiKey.attr("type", type);
    });

    const showTestResult = (
      level: "success" | "danger" | "warning",
      status: string,
      detail: string,
    ) => {
      const $result = $("#yuketang-js-llm-test-result");
      const $alert = $("#yuketang-js-llm-test-alert");
      const $status = $("#yuketang-js-llm-test-status");
      const $detail = $("#yuketang-js-llm-test-detail");

      $alert.removeClass("alert-success alert-danger alert-warning");
      $alert.addClass(`alert-${level}`);
      $status.text(status);
      $detail.text(detail);
      $result.removeClass("d-none");
    };

    $("#yuketang-js-llm-test-btn").on("click", async () => {
      const baseUrl = $baseUrl.val() as string;
      const apiKey = $apiKey.val() as string;
      const model = $model.val() as string;
      const reasoningEffort = $reasoning.val() as string;

      if (!config.isLlmConfigAvailable()) {
        showTestResult(
          "warning",
          "配置不完整",
          "API Base URL 需以 http(s):// 开头，API Key 长度至少为 4，模型名称不可为空。",
        );
        return;
      }

      const openai = new OpenAI({
        baseURL: baseUrl,
        apiKey: apiKey,
        dangerouslyAllowBrowser: true,
      });

      const btn = $("#yuketang-js-llm-test-btn");
      btn.prop("disabled", true);
      btn.text("测试中...");
      $("#yuketang-js-llm-test-result").addClass("d-none");

      try {
        const completion = await openai.chat.completions.create({
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: 'If you can see this, please say "OK".' },
          ],
          model: model,
          thinking: { type: "enabled" },
          reasoning_effort: reasoningEffort,
          stream: false,
        } as any);

        const reply = completion.choices[0]?.message?.content || "(空回复)";
        showTestResult("success", "测试通过", reply);
      } catch (e: any) {
        showTestResult("danger", "测试失败", e.message);
      } finally {
        btn.prop("disabled", false);
        btn.text("测试大模型功能");
      }
    });
  }

  private _populateAudioOptions(): void {
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

      $radio.on("change", (e: Event) => {
        const selectedId = parseInt($(e.target as HTMLElement).val() as string);
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

  private _populateCheckinOptions(): void {
    const checkinConfig = config.getCheckinConfig();
    const $fingerprint = $("#yuketang-js-checkin-fingerprint");
    const $autoEnabled = $("#yuketang-js-checkin-auto-enabled");
    const $autoDelay = $("#yuketang-js-checkin-auto-delay");
    const $autoRefresh = $("#yuketang-js-checkin-auto-refresh");
    const $refreshInterval = $("#yuketang-js-checkin-refresh-interval");
    const $audit = $("#yuketang-js-checkin-audit");

    // Populate fingerprint dropdown
    FINGERPRINT_OPTIONS.forEach((opt) => {
      $fingerprint.append(`<option value="${opt.value}">${opt.label}</option>`);
    });
    $fingerprint.val(checkinConfig.defaultFingerprint);

    $autoEnabled.prop("checked", checkinConfig.autoCheckinEnabled);
    $autoDelay.val(checkinConfig.autoCheckinDelay);
    $autoRefresh.prop("checked", checkinConfig.autoRefreshEnabled);
    $refreshInterval.val(checkinConfig.autoRefreshInterval);
    $audit.prop("checked", checkinConfig.autoCheckinAudit);

    const updateConfig = () => {
      config.setCheckinConfig({
        defaultFingerprint: $fingerprint.val() as string,
        autoCheckinEnabled: Boolean($autoEnabled.prop("checked")),
        autoCheckinDelay: parseInt($autoDelay.val() as string, 10) || 15,
        autoRefreshEnabled: Boolean($autoRefresh.prop("checked")),
        autoRefreshInterval:
          parseInt($refreshInterval.val() as string, 10) || 5,
        autoCheckinAudit: Boolean($audit.prop("checked")),
      });
    };

    $fingerprint.on("change", updateConfig);
    $autoEnabled.on("change", updateConfig);
    $autoDelay.on("change", updateConfig);
    $autoRefresh.on("change", updateConfig);
    $refreshInterval.on("change", updateConfig);
    $audit.on("change", updateConfig);

    const $reloadHint = $("#yuketang-js-checkin-reload-hint");
    const showReloadHint = () => $reloadHint.removeClass("d-none");
    $autoEnabled.on("change", showReloadHint);
    $autoDelay.on("change", showReloadHint);
    $autoRefresh.on("change", showReloadHint);
    $refreshInterval.on("change", showReloadHint);
    $audit.on("change", showReloadHint);

    $("#yuketang-js-checkin-reload-btn").on("click", () => {
      location.reload();
    });

    // Advanced options chevron animation
    const $advanced = $("#yuketang-js-checkin-advanced");
    const $chevron = $("#yuketang-js-checkin-advanced-chevron");
    $advanced.on("show.bs.collapse", () => {
      $chevron.css("transform", "rotate(90deg)");
    });
    $advanced.on("hide.bs.collapse", () => {
      $chevron.css("transform", "rotate(0deg)");
    });

    $("#yuketang-js-checkin-test-open").on("click", () => {
      window.open("/lesson/fullscreen/v3", "_blank");
      showToast(
        "info",
        "自动签到",
        "已请求打开新页面用于测试，如果您没有看到有新页面打开，请检查浏览器的拦截提示；如果新页面已正常打开，则没有问题，您可将其关闭",
        0,
      );
    });

    $("#yuketang-js-checkin-clear-cache").on("click", () => {
      GM_setValue("yuketang-js-checked-lessons", []);
      log("🗑️ Checked lessons cache cleared");
      showToast("success", "自动签到", "已签到课程的缓存已清除");
    });
  }
}

export const settingsModal = new SettingsModal();
