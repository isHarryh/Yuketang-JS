import $ from "jquery";
import * as bootstrap from "bootstrap";
import { showToast } from "./banner.js";
import { log } from "../utils/log.js";
import {
  ProblemType,
  getProblemTypeLabel,
} from "../problem-types.js";

export interface ConfirmableProblem {
  problemId: string;
  problemType: number;
  body: string;
  options?: { key: string; value: string }[];
  blanks?: { num: number }[];
}

type EditorMode = "single" | "multiple" | "blanks" | "json";

interface ConfirmRequest {
  problem: ConfirmableProblem;
  result: string[];
  resolve: (value: string[] | null) => void;
  reject: (reason: unknown) => void;
}

type CollectedAnswers =
  | { ok: true; answers: string[] }
  | { ok: false; message: string };

const MODAL_ID = "yuketang-js-answer-confirm-modal";

const queue: ConfirmRequest[] = [];
const inflight = new Map<string, Promise<string[] | null>>();
let pumping = false;
let modalInstance: bootstrap.Modal | null = null;

export function requestAnswerConfirmation(
  problem: ConfirmableProblem,
  result: string[],
): Promise<string[] | null> {
  const existing = inflight.get(problem.problemId);
  if (existing) {
    return existing;
  }

  const promise = new Promise<string[] | null>((resolve, reject) => {
    queue.push({
      problem,
      result: result.map((item) => String(item)),
      resolve,
      reject,
    });
  });
  inflight.set(problem.problemId, promise);
  void pump();
  return promise;
}

async function pump(): Promise<void> {
  if (pumping) {
    return;
  }
  pumping = true;
  try {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) {
        break;
      }
      try {
        const edited = await showOnce(item.problem, item.result, queue.length);
        item.resolve(edited);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        log(`❌ Answer confirm modal failed: ${message}`);
        showToast("danger", "确认答案", `确认框出错，请稍后重试：${message}`);
        item.reject(err);
      } finally {
        inflight.delete(item.problem.problemId);
      }
      if (queue.length > 0) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }
  } finally {
    pumping = false;
  }
}

function ensureModal(): bootstrap.Modal {
  if (modalInstance) {
    return modalInstance;
  }

  const html = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="yuketang-js-answer-confirm-title">确认答案</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button>
          </div>
          <div class="modal-body" id="yuketang-js-answer-confirm-body"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" id="yuketang-js-answer-confirm-cancel">取消</button>
            <button type="button" class="btn btn-primary" id="yuketang-js-answer-confirm-submit">确认提交</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("body").append(html);
  const element = document.getElementById(MODAL_ID);
  if (!element) {
    throw new Error("Answer confirm modal element is missing");
  }
  modalInstance = new bootstrap.Modal(element, {
    backdrop: true,
    keyboard: true,
  });
  return modalInstance;
}

function showOnce(
  problem: ConfirmableProblem,
  result: string[],
  waitingBehind: number,
): Promise<string[] | null> {
  const modal = ensureModal();
  renderModal(problem, result, waitingBehind);

  return new Promise((resolve) => {
    let decision: string[] | null = null;
    let settled = false;
    const $root = $(`#${MODAL_ID}`);
    const $submit = $("#yuketang-js-answer-confirm-submit");
    const $cancel = $("#yuketang-js-answer-confirm-cancel");

    const settle = (value: string[] | null) => {
      if (settled) {
        return;
      }
      settled = true;
      $submit.off("click");
      $cancel.off("click");
      $root.off("hidden.bs.modal");
      resolve(value);
    };

    $submit.on("click", () => {
      const collected = collectAnswers(problem);
      if (!collected.ok) {
        showToast("warning", "确认答案", collected.message);
        return;
      }
      decision = collected.answers;
      modal.hide();
    });

    $cancel.on("click", () => {
      modal.hide();
    });

    $root.on("hidden.bs.modal", () => {
      settle(decision);
    });

    modal.show();
  });
}

function renderModal(
  problem: ConfirmableProblem,
  result: string[],
  waitingBehind: number,
): void {
  const title =
    waitingBehind > 0
      ? `确认答案（后面还有 ${waitingBehind} 道）`
      : "确认答案";
  $("#yuketang-js-answer-confirm-title").text(title);

  const $body = $("#yuketang-js-answer-confirm-body");
  $body.empty();

  $body.append(
    $("<div class='text-body-secondary mb-2'></div>").text(
      getProblemTypeLabel(problem.problemType),
    ),
  );

  const $stem = $("<div class='mb-3'></div>").css({
    maxHeight: "240px",
    overflow: "auto",
    border: "1px solid #dee2e6",
    borderRadius: "0.375rem",
    padding: "0.75rem",
  });
  if (problem.body) {
    $stem.html(problem.body);
  } else {
    $stem.append($("<span class='text-body-secondary'></span>").text("（题干为空）"));
  }
  $body.append($stem);

  $body.append(
    $("<div class='alert alert-info py-2'></div>").text(
      `模型答案：${result.length > 0 ? result.join("，") : "（空）"}`,
    ),
  );

  const mode = editorMode(problem);
  if (mode === "single" || mode === "multiple") {
    appendChoiceEditor($body, problem, result, mode);
    return;
  }
  if (mode === "blanks") {
    appendBlankEditor($body, problem, result);
    return;
  }
  appendJsonEditor($body, result);
}

function appendChoiceEditor(
  $body: JQuery,
  problem: ConfirmableProblem,
  result: string[],
  mode: "single" | "multiple",
): void {
  const options = problem.options ?? [];
  const unmatched = result.filter(
    (answer) => !options.some((option) => keysMatch(option.key, answer)),
  );
  if (unmatched.length > 0) {
    $body.append(
      $("<div class='alert alert-warning py-2'></div>").text(
        `模型返回的答案对不上选项：${unmatched.join("，")}，请手动选择。`,
      ),
    );
  }

  options.forEach((option, index) => {
    const id = `yuketang-js-confirm-option-${index}`;
    const $wrap = $("<div class='form-check mb-2'></div>");
    const $input = $("<input class='form-check-input'>").attr({
      type: mode === "single" ? "radio" : "checkbox",
      name: "yuketang-js-confirm-choice",
      id,
      value: option.key,
    });
    if (result.some((answer) => keysMatch(option.key, answer))) {
      $input.prop("checked", true);
    }
    const $label = $("<label class='form-check-label'></label>").attr("for", id);
    $label.append($("<span class='fw-medium me-2'></span>").text(option.key));
    $label.append($("<span></span>").html(option.value));
    $wrap.append($input, $label);
    $body.append($wrap);
  });
}

function appendBlankEditor(
  $body: JQuery,
  problem: ConfirmableProblem,
  result: string[],
): void {
  const declared = problem.blanks?.length ?? 0;
  const count = declared > 0 ? declared : Math.max(result.length, 1);
  for (let i = 0; i < count; i++) {
    const $group = $("<div class='mb-2'></div>");
    $group.append(
      $("<label class='form-label fw-medium mb-1'></label>").text(`第 ${i + 1} 空`),
    );
    $group.append(
      $("<input type='text' class='form-control form-control-sm yuketang-js-confirm-blank'>").val(
        result[i] ?? "",
      ),
    );
    $body.append($group);
  }
}

function appendJsonEditor($body: JQuery, result: string[]): void {
  $body.append(
    $("<label class='form-label fw-medium mb-1' for='yuketang-js-confirm-json'></label>").text(
      "答案（JSON 数组）",
    ),
  );
  $body.append(
    $("<textarea class='form-control' id='yuketang-js-confirm-json' rows='4'></textarea>").val(
      JSON.stringify(result, null, 2),
    ),
  );
}

function collectAnswers(problem: ConfirmableProblem): CollectedAnswers {
  const mode = editorMode(problem);
  if (mode === "single" || mode === "multiple") {
    const answers: string[] = [];
    $("input[name='yuketang-js-confirm-choice']:checked").each(function () {
      answers.push(String($(this).val() ?? ""));
    });
    if (answers.length === 0) {
      return {
        ok: false,
        message: mode === "single" ? "请选择一个选项" : "请至少选择一个选项",
      };
    }
    return { ok: true, answers };
  }

  if (mode === "blanks") {
    const answers: string[] = [];
    $(".yuketang-js-confirm-blank").each(function () {
      answers.push(String($(this).val() ?? ""));
    });
    return { ok: true, answers };
  }

  const raw = String($("#yuketang-js-confirm-json").val() ?? "").trim();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { ok: false, message: "答案必须是 JSON 数组" };
    }
    return { ok: true, answers: parsed.map((item) => String(item)) };
  } catch {
    return { ok: false, message: "答案不是合法的 JSON 数组" };
  }
}

function editorMode(problem: ConfirmableProblem): EditorMode {
  if (problem.problemType === ProblemType.FillBlank) {
    return "blanks";
  }
  if (
    problem.problemType === ProblemType.SingleChoice &&
    (problem.options?.length ?? 0) > 0
  ) {
    return "single";
  }
  if (
    problem.problemType === ProblemType.MultipleChoice &&
    (problem.options?.length ?? 0) > 0
  ) {
    return "multiple";
  }
  return "json";
}

function keysMatch(key: string, answer: string): boolean {
  return key === answer || key.toLowerCase() === answer.toLowerCase();
}
