import $ from "jquery";
import { showToast } from "./banner.js";
import { getProblemTypeLabel } from "../problem-types.js";
import {
  ensureKatexStyle,
  renderMarkdownWithMath,
} from "../utils/markdown-math.js";

const PANEL_ID = "yuketang-js-solution-panel";
const PILL_ID = "yuketang-js-solution-pill";

interface SolutionProblem {
  problemId: string;
  problemType: number;
  body: string;
}

interface SolutionEntry {
  problem: SolutionProblem;
  createdAt: number;
  state: "loading" | "done" | "error";
  markdown: string;
  error: string;
  regenerate: () => void;
}

/**
 * Floating panel on the right side that shows generated solutions for short-answer problems.
 */
class SolutionPanel {
  private entries: SolutionEntry[] = [];
  private selectedId: string | null = null;
  private collapsed = false;

  setLoading(problem: SolutionProblem, regenerate: () => void): void {
    let entry = this._find(problem.problemId);
    if (!entry) {
      entry = {
        problem,
        createdAt: Date.now(),
        state: "loading",
        markdown: "",
        error: "",
        regenerate,
      };
      this.entries.push(entry);
    }
    entry.state = "loading";
    entry.regenerate = regenerate;
    this.selectedId = problem.problemId;
    this.collapsed = false;
    this._render();
  }

  setSolution(problemId: string, markdown: string): void {
    const entry = this._find(problemId);
    if (!entry) {
      return;
    }
    entry.state = "done";
    entry.markdown = markdown;
    this._render();
  }

  setError(problemId: string, message: string): void {
    const entry = this._find(problemId);
    if (!entry) {
      return;
    }
    entry.state = "error";
    entry.error = message;
    this._render();
  }

  private _find(problemId: string): SolutionEntry | undefined {
    return this.entries.find((e) => e.problem.problemId === problemId);
  }

  private _ensureDom(): void {
    if ($(`#${PANEL_ID}`).length > 0) {
      return;
    }
    ensureKatexStyle();

    const $panel = $(`
      <div id="${PANEL_ID}" class="card shadow">
        <div class="card-header d-flex align-items-center gap-2 py-2">
          <span class="fw-semibold text-nowrap">主观题解题过程</span>
          <select class="form-select form-select-sm ms-auto" style="width: auto; max-width: 180px;" data-role="select"></select>
          <button type="button" class="btn btn-sm btn-outline-secondary" data-role="collapse" title="收起">收起</button>
          <button type="button" class="btn-close" data-role="close" aria-label="关闭"></button>
        </div>
        <div class="card-body overflow-auto" data-role="body"></div>
        <div class="card-footer d-flex gap-2 py-2">
          <button type="button" class="btn btn-sm btn-outline-secondary" data-role="copy">复制原文</button>
          <button type="button" class="btn btn-sm btn-outline-primary" data-role="regenerate">重新生成</button>
        </div>
      </div>
    `).css({
      position: "fixed",
      top: "80px",
      right: "16px",
      width: "460px",
      maxWidth: "calc(100vw - 32px)",
      maxHeight: "calc(100vh - 120px)",
      zIndex: 1040,
      display: "flex",
      flexDirection: "column",
    });
    $panel.find("[data-role=body]").css({
      fontSize: "15px",
      lineHeight: 1.75,
      overflowWrap: "anywhere",
    });

    const $pill = $(
      `<button id="${PILL_ID}" type="button" class="btn btn-primary btn-sm shadow">解题过程</button>`,
    ).css({
      position: "fixed",
      top: "50%",
      right: 0,
      zIndex: 1040,
      writingMode: "vertical-rl",
      borderTopRightRadius: 0,
      borderBottomRightRadius: 0,
      padding: "12px 6px",
    });

    $panel.find("[data-role=select]").on("change", (e) => {
      this.selectedId = String($(e.target).val());
      this._render();
    });
    $panel.find("[data-role=collapse]").on("click", () => {
      this.collapsed = true;
      this._render();
    });
    $panel.find("[data-role=close]").on("click", () => {
      this.entries = [];
      this.selectedId = null;
      this._render();
    });
    $panel.find("[data-role=copy]").on("click", async () => {
      const entry = this.selectedId ? this._find(this.selectedId) : undefined;
      if (!entry || entry.state !== "done") {
        return;
      }
      try {
        await navigator.clipboard.writeText(entry.markdown);
        showToast("success", "解题过程", "已复制 Markdown 原文");
      } catch (err) {
        showToast("danger", "解题过程", `复制失败：${(err as Error).message}`);
      }
    });
    $panel.find("[data-role=regenerate]").on("click", () => {
      const entry = this.selectedId ? this._find(this.selectedId) : undefined;
      if (entry && entry.state !== "loading") {
        entry.regenerate();
      }
    });
    $pill.on("click", () => {
      this.collapsed = false;
      this._render();
    });

    $("body").append($panel, $pill);
  }

  private _render(): void {
    if (!document.body) {
      return;
    }
    this._ensureDom();
    const $panel = $(`#${PANEL_ID}`);
    const $pill = $(`#${PILL_ID}`);

    if (this.entries.length === 0) {
      $panel.hide();
      $pill.hide();
      return;
    }
    $panel.toggle(!this.collapsed);
    $pill.toggle(this.collapsed);

    const entry =
      (this.selectedId && this._find(this.selectedId)) ||
      this.entries[this.entries.length - 1];
    this.selectedId = entry.problem.problemId;

    const $select = $panel.find("[data-role=select]");
    $select.empty();
    this.entries.forEach((e, index) => {
      const d = new Date(e.createdAt);
      const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      $select.append(
        $("<option></option>")
          .val(e.problem.problemId)
          .text(`第 ${index + 1} 题 · ${getProblemTypeLabel(e.problem.problemType)} · ${time}`),
      );
    });
    $select.val(entry.problem.problemId);
    $select.toggle(this.entries.length > 1);

    const $body = $panel.find("[data-role=body]");
    $body.empty();

    const $stem = $("<details class='mb-3 small'></details>");
    $stem.append($("<summary class='text-body-secondary'></summary>").text("查看题目"));
    $stem.append(
      $("<div class='mt-1 p-2 rounded'></div>")
        .css({ background: "#f8f9fa", whiteSpace: "pre-wrap" })
        .text(entry.problem.body || "（题干为空，可能是图片题）"),
    );
    $body.append($stem);

    if (entry.state === "loading") {
      $body.append(`
        <div class="d-flex align-items-center gap-2 text-body-secondary">
          <div class="spinner-border spinner-border-sm" role="status"></div>
          <span>正在生成解题过程…</span>
        </div>
      `);
    } else if (entry.state === "error") {
      $body.append(
        $("<div class='alert alert-danger mb-0 small'></div>").text(
          `生成失败：${entry.error}`,
        ),
      );
    } else {
      $body.append(
        $("<div class='yuketang-js-solution-content'></div>").html(
          renderMarkdownWithMath(entry.markdown),
        ),
      );
    }

    $panel.find("[data-role=copy]").prop("disabled", entry.state !== "done");
    $panel
      .find("[data-role=regenerate]")
      .prop("disabled", entry.state === "loading");
  }
}

export const solutionPanel = new SolutionPanel();
