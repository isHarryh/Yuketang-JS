import "./style.css";
import $ from "jquery";
import { R_HELLO, R_UNLOCK_PROBLEM, R_EXTEND_TIME } from "./enum.js";
import { log, notify, wsMitm } from "./utils.js";

(function () {
  "use strict";

  let mitmSuccess = false;

  wsMitm.startMitm(".*wsapp.*");

  wsMitm.onReceiveCallback = function (url, data) {
    log(`⬇️ Received data from ${url}: ${data}`);
    try {
      const json = JSON.parse(data);
      if (json && json.op) {
        if (json.op === R_HELLO) {
          mitmSuccess = true;
          log("✅ WebSocket MITM is functioning correctly");
          updateStatusText();
        } else if (json.op === R_UNLOCK_PROBLEM) {
          const limit = json.problem ? json.problem.limit || "N/A" : "N/A";
          notify(
            "⏰ 新的题目",
            `【👉点我消除通知】新的题目已解锁！限时 ${limit} 秒。（Yuketang-JS）`
          );
        } else if (json.op === R_EXTEND_TIME) {
          const extend = json.problem ? json.problem.extend || "N/A" : "N/A";
          notify(
            "⏰ 题目延时",
            `【👉点我消除通知】题目时间已延长 ${extend} 秒。（Yuketang-JS）`
          );
        }
      }
    } catch (error) {
      log(`⚠️ Failed to parse WebSocket message: ${error}`);
    }
  };

  wsMitm.onUploadCallback = function (url, data) {
    log(`⬆️ Sent data to ${url}: ${data}`);
  };

  function updateStatusText() {
    const $statusText = $("#yuketang-js-status-text");
    if ($statusText.length > 0) {
      if (mitmSuccess) {
        $statusText
          .text("已监听")
          .removeClass("not-listening")
          .addClass("listening");
      } else {
        $statusText
          .text("未监听")
          .removeClass("listening")
          .addClass("not-listening");
      }
    }
  }

  function ensureHeader() {
    const $header = $(".lesson__header");
    if ($header.length === 0) {
      log("❓ lesson__header not found on this page");
      return;
    }

    const $existingBtn = $("#yuketang-js-test-notification");
    if ($existingBtn.length > 0) {
      return;
    }

    const $statusText = $('<span id="yuketang-js-status-text"></span>');

    const $btn = $('<button id="yuketang-js-test-notification"></button>')
      .text("发送测试通知")
      .click(function () {
        notify(
          "🆗 测试通知",
          "【👉点我消除通知】恭喜！通知系统工作正常。（Yuketang-JS）"
        );
      });

    $header.append($statusText).append($btn);
    log("🔲 Test notification button added to lesson__header");
    updateStatusText();
  }

  log("🚀 Yuketang-JS script successfully loaded!");

  setInterval(function () {
    ensureHeader();
    updateStatusText();
  }, 1000);
})();
