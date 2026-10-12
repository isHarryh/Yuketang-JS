import { config } from "./config.js";
import { log } from "./utils/log.js";
import { showToast } from "./ui/banner.js";
import { requestAnswerConfirmation } from "./ui/answer-confirm-modal.js";
import {
  getProblemTypeName,
  isShortAnswerProblem,
} from "./problem-types.js";
import OpenAI from "openai";

export interface ExtractedProblem {
  problemId: string;
  problemType: number;
  body: string;
  options?: { key: string; value: string }[];
  blanks?: { num: number }[];
  hasAutoAnswered?: boolean;
  autoAnswerInProgress?: boolean;
}

function buildPrompt(problem: ExtractedProblem): string {
  return `
You are an expert answering a quiz question.
Please analyze the following question and its options/blanks, and provide the correct answers.

Note:
- Return ONLY valid JSON in the format ["Answer1", "Answer2"].
- In any situation, even if you don't have enough context or confidence to give the correct answer, you STILL need to provide a available answer.
${problem.options ? `- For single/multiple choice problems, you need to provide the option's code but not its description text.` : ""}
${problem.blanks ? `- Use the language the question used to fill in the blank.` : ""}

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
   * Short-answer problems need a handwritten photo upload, so they are never submitted.
   */
  skipShortAnswer(problemId: string): void {
    const problem = this.getProblem(problemId);
    if (!problem || problem.hasAutoAnswered) {
      return;
    }
    problem.hasAutoAnswered = true;
    log(`⏭️ Skip auto answer for short-answer problem ${problemId}`);
    showToast(
      "warning",
      "自动答题",
      "这是主观题（简答），需要手写并拍照上传，已跳过自动答题",
    );
  }

  async handleProblem(problemId: string): Promise<void> {
    const problem = this.getProblem(problemId);
    if (!problem) {
      log(`❌ Problem ${problemId} not found in memory`);
      return;
    }

    if (isShortAnswerProblem(problem.problemType)) {
      this.skipShortAnswer(problemId);
      return;
    }

    if (problem.hasAutoAnswered || problem.autoAnswerInProgress) {
      log(`⏭️ Skip auto answer for ${problemId} because it is already handled or in progress`);
      return;
    }

    if (!config.isLlmConfigAvailable()) {
      log(`❌ LLM configuration is missing or invalid. Please check settings.`);
      return;
    }

    problem.autoAnswerInProgress = true;
    try {
      await this.answerProblem(problem);
    } finally {
      problem.autoAnswerInProgress = false;
    }
  }

  private async answerProblem(problem: ExtractedProblem): Promise<void> {
    const llmConfig = config.getLlmConfig();

    const openai = new OpenAI({
      baseURL: llmConfig.baseUrl,
      apiKey: llmConfig.apiKey,
      dangerouslyAllowBrowser: true,
    });

    log(`🧠 Sending problem ${problem.problemId} to LLM...`);

    let result: string[] = [];

    try {
      const completion = await openai.chat.completions.create({
        messages: [{ role: "system", content: buildPrompt(problem) }],
        model: llmConfig.model,
        thinking: { type: "enabled" },
        reasoning_effort: llmConfig.reasoningEffort,
        stream: false,
      } as any);

      const reply = completion.choices[0]?.message?.content || "[]";
      const match = reply.match(/\[.*\]/s);
      if (!match) {
        log(`⚠️ Could not parse JSON from LLM: ${reply}`);
        showToast("danger", "大模型", "大模型返回的结果无法解析，请手动答题");
        return;
      }
      const parsed: unknown = JSON.parse(match[0]);
      if (!Array.isArray(parsed)) {
        log(`⚠️ LLM JSON is not an array: ${reply}`);
        showToast("danger", "大模型", "大模型返回的结果无法解析，请手动答题");
        return;
      }
      result = parsed.map((item) => String(item));

      log(`✅ LLM answered: ${JSON.stringify(result)}`);
    } catch (err: any) {
      log(`❌ LLM Error: ${err.message}`);
      showToast(
        "danger",
        "大模型",
        `大模型调用出错，请手动答题，错误原因是 ${err.message}`,
      );
      return;
    }

    if (config.getAutoAnswerConfig().confirmBeforeSubmit) {
      const edited = await requestAnswerConfirmation(problem, result);
      if (edited === null) {
        problem.hasAutoAnswered = true;
        log(`🚫 User cancelled answer submission for ${problem.problemId}`);
        showToast("info", "自动答题", "已取消提交，这道题不会再次自动答题");
        return;
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
        showToast("success", "自动答题", "自动答题发送成功");
      } else {
        log(
          `⚠️ Answer for problem ${problemId} submitted but rejected by server. Response: ${JSON.stringify(data)}`,
        );
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
      showToast("danger", "自动答题", `自动答题发送失败，因为 ${err.message}`);
    }
  }
}

export const problemSolver = new ProblemSolver();
