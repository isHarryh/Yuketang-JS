import "./style.css";
import { R_HELLO, R_UNLOCK_PROBLEM, R_EXTEND_TIME } from "./enum.js";
import { log, notify, wsMitm, audioController } from "./utils.js";
import { LessonHeaderUI } from "./ui.js";

(function () {
  "use strict";

  let mitmSuccess = false;

  const headerUI = new LessonHeaderUI();

  wsMitm.startMitm(".*wsapp.*");

  wsMitm.onReceiveCallback = function (url, data) {
    log(`⬇️ Received data from ${url}: ${data}`);
    try {
      const json = JSON.parse(data);
      if (json && json.op) {
        headerUI.setActive();
        if (json.op === R_HELLO) {
          mitmSuccess = true;
          log("✅ WebSocket MITM is functioning correctly");
        } else if (json.op === R_UNLOCK_PROBLEM) {
          const limit = json.problem ? json.problem.limit || "N/A" : "N/A";
          notify(
            "⏰ 新的题目",
            `【👉点我消除通知】新的题目已解锁！限时 ${limit} 秒。（Yuketang-JS）`
          );
          audioController.play();
        } else if (json.op === R_EXTEND_TIME) {
          const extend = json.problem ? json.problem.extend || "N/A" : "N/A";
          notify(
            "⏰ 题目延时",
            `【👉点我消除通知】题目时间已延长 ${extend} 秒。（Yuketang-JS）`
          );
          audioController.play();
        }
      }
    } catch (error) {
      log(`⚠️ Failed to parse WebSocket message: ${error}`);
    }
  };

  wsMitm.onUploadCallback = function (url, data) {
    log(`⬆️ Sent data to ${url}: ${data}`);
  };

  log("🚀 Yuketang-JS script successfully loaded!");

  setInterval(function () {
    headerUI.update();
  }, 1000);
})();
