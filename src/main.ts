import {
  R_HELLO,
  R_UNLOCK_PROBLEM,
  R_EXTEND_TIME,
  R_CALL_PAUSED,
} from "./enum.js";
import { log } from "./utils/log.js";
import { notify } from "./utils/notify.js";
import { wsMitm } from "./utils/ws-mitm.js";
import { audioController } from "./utils/audio-controller.js";
import { XHRSpy } from "./utils/xhr-spy.js";
import { LessonHeaderUI } from "./ui/header.js";
import { GeneralHeaderUI } from "./ui/general-header.js";
import { showToast } from "./ui/banner.js";
import { problemSolver } from "./problem-solver.js";
import { isShortAnswerProblem } from "./problem-types.js";
import { config } from "./config.js";
import { answerLog } from "./answer-log.js";

(function (): void {
  "use strict";

  // Set up XHR interceptor
  XHRSpy.add(/\/lesson\/presentation\/fetch/, (json: any) => {
    if (json && json.data && Array.isArray(json.data.slides)) {
      let count = 0;
      for (const slide of json.data.slides) {
        if (slide.problem) {
          const p = slide.problem;
          const extracted = {
            problemId: p.problemId,
            problemType: p.problemType,
            body: p.body,
            hasAutoAnswered: false,
            options: p.options,
            blanks: p.blanks,
            // Rendered image of the slide; field names are not documented, so try both
            slideImageUrl: slide.cover || slide.thumbnail || undefined,
          };
          if (!extracted.slideImageUrl) {
            log(`⚠️ No slide image for problem ${p.problemId}, slide keys: ${Object.keys(slide).join(", ")}`);
          }
          problemSolver.addProblem(p.problemId, extracted);
          count++;
        }
      }
      log(`📄 Extracted ${count} problems from presentation fetch`);
      const aaConfig = config.getAutoAnswerConfig();
      const aaStatus = !aaConfig.enabled
        ? "自动答题已关闭"
        : config.isLlmConfigAvailable()
          ? "自动答题已开启"
          : "自动答题已开启，但大模型配置不正确";
      showToast(
        "info",
        "题目统计",
        `当前课堂总计的题目数量是 ${problemSolver.getProblemCount()} 道<br>${aaStatus}`,
      );
    }
  });

  const headerUI = new LessonHeaderUI();
  const generalHeaderUI = new GeneralHeaderUI();

  const scheduleAutoAnswer = (problemId: string, limit: string | number) => {
    const aaConfig = config.getAutoAnswerConfig();
    const problem = problemSolver.getProblem(problemId);

    if (aaConfig.enabled && problem && !problem.hasAutoAnswered) {
      if (isShortAnswerProblem(problem.problemType)) {
        problemSolver.skipShortAnswer(problemId);
        return;
      }

      const numLimit = typeof limit === "string" ? parseInt(limit, 10) : limit;
      let delayMs = 0;
      if (isNaN(numLimit) || numLimit <= 0) {
        // Not timed
        delayMs = aaConfig.timeAfterSend * 1000;
      } else {
        delayMs = Math.max(0, numLimit - aaConfig.timeLeftThreshold) * 1000;
      }
      log(`🕒 Will run auto answer for ${problemId} in ${delayMs}ms`);
      answerLog.event(
        problem,
        "info",
        `题目已解锁（限时 ${isNaN(numLimit) || numLimit <= 0 ? "无" : `${numLimit} 秒`}），${delayMs / 1000} 秒后自动答题`,
        { patch: { status: "scheduled" } },
      );

      if (delayMs > 0) {
        showToast(
          "info",
          "自动答题",
          `将在 ${delayMs / 1000} 秒后准备自动答题`,
        );
      } else {
        showToast("info", "自动答题", "将立即开始准备自动答题");
      }

      setTimeout(() => {
        const p = problemSolver.getProblem(problemId);
        if (p && !p.hasAutoAnswered) {
          log(`🤖 Auto answering ${problemId}...`);
          problemSolver.handleProblem(problemId).catch(console.error);
        }
      }, delayMs);
    }
  };

  wsMitm.startMitm(".*wsapp.*");

  wsMitm.onReceiveCallback = function (url: string, data: string): void {
    log(`⬇️ Received data from ${url}: ${data}`);
    try {
      const json = JSON.parse(data) as {
        op?: string;
        problem?: { limit?: number; extend?: number; prob?: string };
      };
      if (json && json.op) {
        headerUI.setActive();
        const elConfig = config.getEventListenersConfig();

        if (json.op === R_HELLO) {
          log("✅ WebSocket MITM is functioning correctly");
        } else if (json.op === R_UNLOCK_PROBLEM && elConfig.unlockProblem) {
          const limit = json.problem ? json.problem.limit || "N/A" : "N/A";
          const problemId = json.problem ? json.problem.prob : undefined;

          notify(
            "⏰ 新的题目",
            `【👉点我消除通知】新的题目已解锁！限时 ${limit} 秒。（Yuketang-JS）`,
          );
          audioController.play();

          log(`🔓 Problem ID is ${problemId}`);
          if (problemId) {
            scheduleAutoAnswer(problemId, limit);
          }
        } else if (json.op === R_EXTEND_TIME && elConfig.extendTime) {
          const extend = json.problem ? json.problem.extend || "N/A" : "N/A";
          const problemId = json.problem ? json.problem.prob : undefined;

          notify(
            "⏰ 题目延时",
            `【👉点我消除通知】题目时间已延长 ${extend} 秒。（Yuketang-JS）`,
          );
          audioController.play();

          log(`🔓 Problem ID is ${problemId}`);
          if (problemId) {
            scheduleAutoAnswer(problemId, extend);
          }
        } else if (json.op === R_CALL_PAUSED && elConfig.randomPick) {
          const name = (json as any).name || "未知姓名";
          const sid = (json as any).sid || "";

          notify(
            "🎯 随机点名",
            `【👉点我消除通知】随机点名选中：${name} ${sid}（Yuketang-JS）`,
          );
          audioController.play();

          log(`🎯 Random pick: ${name} (${sid})`);
        }
      }
    } catch (error) {
      log(`⚠️ Failed to parse WebSocket message: ${error}`);
    }
  };

  wsMitm.onUploadCallback = function (url: string, data: string): void {
    log(`⬆️ Sent data to ${url}: ${data}`);
  };

  log("🚀 Yuketang-JS script successfully loaded!");

  config.startConfigChangeMonitor();

  setInterval(function (): void {
    headerUI.update();
    generalHeaderUI.update();
  }, 1000);
})();
