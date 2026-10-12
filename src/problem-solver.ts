import { config } from "./config.js";
import { log } from "./utils/log.js";
import { showToast } from "./ui/banner.js";
import { requestAnswerConfirmation } from "./ui/answer-confirm-modal.js";
import {
  getProblemTypeName,
  isShortAnswerProblem,
} from "./problem-types.js";
import {
  callLlm,
  getLlmErrorStatus,
  type LlmImage,
  type LlmReply,
} from "./llm-client.js";
import { fetchSlideImage } from "./utils/slide-image.js";
import { answerLog } from "./answer-log.js";
import { solutionPanel } from "./ui/solution-panel.js";

export interface ExtractedProblem {
  problemId: string;
  problemType: number;
  body: string;
  options?: { key: string; value: string }[];
  blanks?: { num: number }[];
  slideImageUrl?: string;
  hasAutoAnswered?: boolean;
  autoAnswerInProgress?: boolean;
  solutionInProgress?: boolean;
}

type PromptBuilder = (problem: ExtractedProblem, withImage: boolean) => string;

function buildSolutionPrompt(
  problem: ExtractedProblem,
  withImage: boolean,
): string {
  return `
You are an expert tutor. Below is a subjective (short-answer) question from a class quiz. The student will copy your solution by hand onto an answer sheet and upload a photo of it.

Write a complete model solution that is ready to be copied onto paper:
- Write in the same language as the question (a Chinese question gets a Chinese answer).
- Show the key reasoning steps clearly and concisely, the way a model answer looks on paper. No greetings, meta commentary, or restating these instructions.
- Use LaTeX for all math: $...$ for inline and $$...$$ for display equations.
- Use Markdown for structure (numbered steps, bold for key results). No tables, code blocks, or HTML.
- End with a clearly marked final answer or conclusion.
- If the question is open-ended (discussion, opinion, explanation), give a well-organized answer with clear key points.
${withImage ? `- The attached image is a screenshot of the slide containing this question. Use it for figures, formulas, and any content missing from the text below.` : ""}

Problem:
<problem>
${problem.body}
</problem>
`;
}

function buildPrompt(problem: ExtractedProblem, withImage: boolean): string {
  return `
You are an expert answering a quiz question.
Please analyze the following question and its options/blanks, and provide the correct answers.

Note:
- Return ONLY valid JSON in the format ["Answer1", "Answer2"].
- In any situation, even if you don't have enough context or confidence to give the correct answer, you STILL need to provide a available answer.
${problem.options ? `- For single/multiple choice problems, you need to provide the option's code but not its description text.` : ""}
${problem.blanks ? `- Use the language the question used to fill in the blank.` : ""}
${withImage ? `- The attached image is a screenshot of the slide containing this question. Use it as additional context (figures, formulas, tables), but treat the text below as the authoritative question.` : ""}

Problem Type: ${getProblemTypeName(problem.problemType)}

Problem Body:
<problem>
${problem.body}
</problem>

${problem.options ? `Options:\n${problem.options.map((o) => `${o.key}: ${o.value}`).join("\n")}` : ""}
${problem.blanks ? `Blanks: ${problem.blanks.length} blanks to fill.` : ""}

Now please provide the answer in the required JSON format.
`;
}

// Client errors that may mean the model or proxy can't take image input
function isRetryableWithoutImage(err: unknown): boolean {
  const status = getLlmErrorStatus(err);
  return (
    status !== undefined &&
    status >= 400 &&
    status < 500 &&
    ![401, 403, 429].includes(status)
  );
}

export class ProblemSolver {
  private problemsDict: Map<string, ExtractedProblem>;

  constructor() {
    this.problemsDict = new Map<string, ExtractedProblem>();
  }

  addProblem(problemId: string, problem: ExtractedProblem) {
    this.problemsDict.set(problemId, problem);
  }

  getProblem(problemId: string): ExtractedProblem | undefined {
    return this.problemsDict.get(problemId);
  }

  getProblemCount(): number {
    return this.problemsDict.size;
  }

  /**
   * Short-answer problems are never submitted; optionally generate a solution for the user to copy by hand.
   */
  handleShortAnswer(problemId: string): void {
    const problem = this.getProblem(problemId);
    if (!problem || problem.hasAutoAnswered) {
      return;
    }
    problem.hasAutoAnswered = true;
    log(`⏭️ Skip auto answer for short-answer problem ${problemId}`);
    answerLog.event(problem, "warning", "主观题需要手写拍照上传，不会自动提交", {
      patch: { status: "skipped" },
    });

    const willGenerate =
      config.getAutoAnswerConfig().shortAnswerSolution &&
      config.isLlmConfigAvailable();
    showToast(
      "warning",
      "自动答题",
      willGenerate
        ? "这是主观题（简答），需要手写并拍照上传，不会自动提交。正在生成解题过程，完成后显示在右侧浮窗"
        : "这是主观题（简答），需要手写并拍照上传，已跳过自动答题",
    );
    if (willGenerate) {
      void this.generateSolution(problem);
    }
  }

  async generateSolution(problem: ExtractedProblem): Promise<void> {
    if (problem.solutionInProgress) {
      return;
    }
    problem.solutionInProgress = true;
    const llmConfig = config.getLlmConfig();
    solutionPanel.setLoading(problem, () => {
      void this.generateSolution(problem);
    });
    log(`📝 Generating solution for short-answer problem ${problem.problemId}...`);
    answerLog.event(problem, "info", "开始生成主观题解题过程（不会提交）", {
      patch: { provider: llmConfig.provider, model: llmConfig.model },
    });

    try {
      const reply = await this.askLlm(problem, buildSolutionPrompt);
      if (!reply.text.trim()) {
        throw new Error("大模型返回了空内容");
      }
      solutionPanel.setSolution(problem.problemId, reply.text);
      log(`✅ Solution generated for ${problem.problemId}`);
      answerLog.event(problem, "success", "解题过程已生成，显示在右侧浮窗");
      showToast("success", "解题过程", "主观题解题过程已生成，请查看右侧浮窗");
    } catch (err: any) {
      log(`❌ Failed to generate solution for ${problem.problemId}: ${err.message}`);
      solutionPanel.setError(problem.problemId, err.message);
      answerLog.event(problem, "danger", "生成解题过程失败", { detail: err.message });
    } finally {
      problem.solutionInProgress = false;
    }
  }

  async handleProblem(problemId: string): Promise<void> {
    const problem = this.getProblem(problemId);
    if (!problem) {
      log(`❌ Problem ${problemId} not found in memory`);
      return;
    }

    if (isShortAnswerProblem(problem.problemType)) {
      this.handleShortAnswer(problemId);
      return;
    }

    if (problem.hasAutoAnswered || problem.autoAnswerInProgress) {
      log(`⏭️ Skip auto answer for ${problemId} because it is already handled or in progress`);
      return;
    }

    if (!config.isLlmConfigAvailable()) {
      log(`❌ LLM configuration is missing or invalid. Please check settings.`);
      answerLog.event(problem, "danger", "大模型配置缺失或不正确，未能自动答题", {
        patch: { status: "failed" },
      });
      return;
    }

    problem.autoAnswerInProgress = true;
    try {
      await this.answerProblem(problem);
    } finally {
      problem.autoAnswerInProgress = false;
    }
  }

  private async loadSlideImages(problem: ExtractedProblem): Promise<LlmImage[]> {
    if (!config.getAutoAnswerConfig().includeSlideImage) {
      return [];
    }
    if (!problem.slideImageUrl) {
      log(`⚠️ No slide image URL for problem ${problem.problemId}`);
      answerLog.event(problem, "warning", "没有找到题目所在页的 PPT 截图，只发送文字");
      return [];
    }
    try {
      const image = await fetchSlideImage(problem.slideImageUrl);
      log(`🖼️ Slide image loaded for ${problem.problemId} (${image.width}x${image.height})`);
      answerLog.event(
        problem,
        "info",
        `已获取 PPT 截图（${image.width}×${image.height}，约 ${Math.round((image.data.length * 3) / 4 / 1024)} KB）`,
      );
      return [{ mediaType: image.mediaType, data: image.data }];
    } catch (err: any) {
      log(`⚠️ Failed to load slide image for ${problem.problemId}: ${err.message}`);
      answerLog.event(problem, "warning", "获取 PPT 截图失败，只发送文字", {
        detail: `${problem.slideImageUrl}\n${err.message}`,
      });
      return [];
    }
  }

  private async askLlm(
    problem: ExtractedProblem,
    build: PromptBuilder = buildPrompt,
  ): Promise<LlmReply> {
    const llmConfig = config.getLlmConfig();
    const images = await this.loadSlideImages(problem);

    const send = async (withImages: boolean): Promise<LlmReply> => {
      const prompt = build(problem, withImages);
      answerLog.event(
        problem,
        "info",
        withImages ? "已把题目和 PPT 截图发给大模型" : "已把题目发给大模型",
        { patch: { prompt, imageAttached: withImages } },
      );
      const startedAt = Date.now();
      const reply = await callLlm(llmConfig, {
        user: prompt,
        images: withImages ? images : undefined,
      });
      answerLog.event(
        problem,
        "success",
        `大模型已回复（用时 ${((Date.now() - startedAt) / 1000).toFixed(1)} 秒）`,
        { patch: { reply: reply.text, reasoning: reply.reasoning } },
      );
      return reply;
    };

    if (images.length === 0) {
      return send(false);
    }
    try {
      return await send(true);
    } catch (err: any) {
      if (!isRetryableWithoutImage(err)) {
        throw err;
      }
      log(`⚠️ LLM request with image failed, retrying without image: ${err.message}`);
      answerLog.event(problem, "warning", "带截图的请求被拒绝（模型可能不支持图片），改为只发送文字重试", {
        detail: err.message,
      });
      return send(false);
    }
  }

  private async answerProblem(problem: ExtractedProblem): Promise<void> {
    const llmConfig = config.getLlmConfig();

    log(`🧠 Sending problem ${problem.problemId} to LLM...`);
    answerLog.event(problem, "info", "开始自动答题", {
      patch: {
        status: "running",
        provider: llmConfig.provider,
        model: llmConfig.model,
      },
    });

    let result: string[] = [];

    try {
      const reply = (await this.askLlm(problem)).text || "[]";
      const match = reply.match(/\[.*\]/s);
      if (!match) {
        log(`⚠️ Could not parse JSON from LLM: ${reply}`);
        answerLog.event(problem, "danger", "无法从回复中解析出 JSON 答案，请手动答题", {
          patch: { status: "failed" },
        });
        showToast("danger", "大模型", "大模型返回的结果无法解析，请手动答题");
        return;
      }
      const parsed: unknown = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) {
        log(`⚠️ LLM JSON is not an array: ${reply}`);
        answerLog.event(problem, "danger", "回复中的 JSON 不是数组，请手动答题", {
          patch: { status: "failed" },
        });
        showToast("danger", "大模型", "大模型返回的结果无法解析，请手动答题");
        return;
      }
      result = parsed.map((item) => String(item));

      log(`✅ LLM answered: ${JSON.stringify(result)}`);
      answerLog.event(problem, "success", `解析出答案：${result.join(", ")}`, {
        patch: { answer: result },
      });
    } catch (err: any) {
      log(`❌ LLM Error: ${err.message}`);
      answerLog.event(problem, "danger", "大模型调用出错，请手动答题", {
        detail: err.message,
        patch: { status: "failed" },
      });
      showToast(
        "danger",
        "大模型",
        `大模型调用出错，请手动答题，错误原因是 ${err.message}`,
      );
      return;
    }

    if (config.getAutoAnswerConfig().confirmBeforeSubmit) {
      answerLog.event(problem, "info", "等待手动确认答案", {
        patch: { status: "waiting-confirm" },
      });
      const edited = await requestAnswerConfirmation(problem, result);
      if (edited === null) {
        problem.hasAutoAnswered = true;
        log(`🚫 User cancelled answer submission for ${problem.problemId}`);
        answerLog.event(problem, "warning", "已取消提交", {
          patch: { status: "cancelled" },
        });
        showToast("info", "自动答题", "已取消提交，这道题不会再次自动答题");
        return;
      }
      if (JSON.stringify(edited) !== JSON.stringify(result)) {
        answerLog.event(problem, "info", `答案已手动改为：${edited.join(", ")}`, {
          patch: { answer: edited },
        });
      }
      result = edited;
    } else {
      showToast(
        "success",
        "大模型",
        `大模型返回的答案是：${result.join(", ")}`,
      );
    }

    await this.submitAnswer(problem, result);
  }

  private async submitAnswer(
    problem: ExtractedProblem,
    result: string[],
  ): Promise<void> {
    const problemId = problem.problemId;
    log(`📤 Submitting answer for ${problemId}...`);
    try {
      const payload = {
        problemId: problem.problemId,
        problemType: problem.problemType,
        dt: Date.now(),
        result: result,
      };
      answerLog.event(problem, "info", "正在向雨课堂提交答案", {
        detail: JSON.stringify(payload, null, 2),
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      // Check global authorization
      const realWindow =
        typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
      const auth = (realWindow as any).Authorization;
      if (auth) {
        headers["Authorization"] = `Bearer ${auth}`;
      }

      const response = await fetch(
        "https://www.yuketang.cn/api/v3/lesson/problem/answer",
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        },
      );

      const setAuth = response.headers.get("Set-Auth");
      if (setAuth) {
        (realWindow as any).Authorization = setAuth;
        log(`🔄 Updated window.Authorization from response`);
      }

      const data = await response.json();
      if (data.code === 0) {
        log(`✅ Answer for problem ${problemId} accepted by server.`);
        answerLog.event(problem, "success", "雨课堂已接收答案", {
          detail: JSON.stringify(data, null, 2),
          patch: { status: "success" },
        });
        showToast("success", "自动答题", "自动答题发送成功");
      } else {
        log(
          `⚠️ Answer for problem ${problemId} submitted but rejected by server. Response: ${JSON.stringify(data)}`,
        );
        answerLog.event(problem, "danger", `雨课堂拒绝了答案：${data.msg}`, {
          detail: JSON.stringify(data, null, 2),
          patch: { status: "failed" },
        });
        showToast(
          "warning",
          "自动答题",
          `自动答题被拒绝接收，因为 ${data.msg}`,
        );
      }
      problem.hasAutoAnswered = true;
    } catch (err: any) {
      log(
        `❌ Failed to submit answer for problem ${problemId}: ${err.message}`,
      );
      answerLog.event(problem, "danger", "提交答案失败", {
        detail: err.message,
        patch: { status: "failed" },
      });
      showToast("danger", "自动答题", `自动答题发送失败，因为 ${err.message}`);
    }
  }
}

export const problemSolver = new ProblemSolver();
