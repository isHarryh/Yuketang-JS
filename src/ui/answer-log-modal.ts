import $ from "jquery";
import * as bootstrap from "bootstrap";
import { showToast } from "./banner.js";
import { getProblemTypeLabel } from "../problem-types.js";
import {
  answerLog,
  type AnswerLogLevel,
  type AnswerLogRecord,
  type AnswerLogStatus,
} from "../answer-log.js";

const MODAL_ID = "yuketang-js-answer-log-modal";

const STATUS_BADGES: Record<AnswerLogStatus, { text: string; cls: string }> = {
  scheduled: { text: "等待答题", cls: "bg-secondary" },
  running: { text: "答题中", cls: "bg-primary" },
  "waiting-confirm": { text: "等待确认", cls: "bg-info" },
  success: { text: "已提交", cls: "bg-success" },
  failed: { text: "失败", cls: "bg-danger" },
  cancelled: { text: "已取消", cls: "bg-warning text-dark" },
  skipped: { text: "已跳过", cls: "bg-secondary" },
};

const LEVEL_COLORS: Record<AnswerLogLevel, string> = {
  info: "text-body-secondary",
  success: "text-success",
  warning: "text-warning-emphasis",
  danger: "text-danger",
};

const openRecords = new Set<string>();
let modalInstance: bootstrap.Modal | null = null;
let clearArmedTimer: ReturnType<typeof setTimeout> | null = null;

function pad(n: number, width = 2): string {
  return String(n).padStart(width, "0");
}

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function $pre(text: string): JQuery {
  return $("<pre class='mb-0 p-2 rounded small'></pre>")
    .css({
      background: "#f8f9fa",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
      maxHeight: "320px",
      overflow: "auto",
    })
    .text(text);
}

function $section(title: string, $content: JQuery, open = false): JQuery {
  const $details = $("<details class='mb-2'></details>").prop("open", open);
  $details.append($("<summary class='fw-medium'></summary>").text(title));
  $details.append($("<div class='mt-1'></div>").append($content));
  return $details;
}

function renderRecord(record: AnswerLogRecord): JQuery {
  const badge = STATUS_BADGES[record.status] ?? STATUS_BADGES.scheduled;
  const $details = $("<details class='border rounded mb-2'></details>").prop(
    "open",
    openRecords.has(record.problemId),
  );
  $details.on("toggle", () => {
    if ($details.prop("open")) {
      openRecords.add(record.problemId);
    } else {
      openRecords.delete(record.problemId);
    }
  });

  const $summary = $(
    "<summary class='d-flex flex-wrap align-items-center gap-2 px-3 py-2' style='cursor: pointer;'></summary>",
  );
  $summary.append(
    $("<span class='text-body-secondary small'></span>").text(
      formatDateTime(record.createdAt),
    ),
    $("<span class='fw-medium'></span>").text(
      getProblemTypeLabel(record.problemType),
    ),
    $(`<span class='badge ${badge.cls}'></span>`).text(badge.text),
  );
  if (record.answer && record.answer.length > 0) {
    $summary.append(
      $("<span class='small'></span>").text(`答案：${record.answer.join(", ")}`),
    );
  }
  $details.append($summary);

  const $body = $("<div class='px-3 pb-3 small'></div>");

  const meta = [
    `题目 ID：${record.problemId}`,
    record.model ? `模型：${record.provider ?? ""} / ${record.model}` : "",
  ].filter(Boolean);
  $body.append($("<div class='text-body-secondary mb-2'></div>").text(meta.join("　")));

  $body.append($section("题干", $pre(record.body || "（空）"), true));

  if (record.slideImageUrl) {
    const note =
      record.imageAttached === undefined
        ? ""
        : record.imageAttached
          ? "（已随消息发送给大模型）"
          : "（未发送给大模型）";
    const $img = $("<img class='border rounded' alt='PPT 截图'>")
      .attr("src", record.slideImageUrl)
      .attr("referrerpolicy", "no-referrer")
      .css({ maxWidth: "100%", maxHeight: "360px" });
    const $wrap = $("<div></div>")
      .append($img)
      .append($("<div class='text-body-secondary mt-1'></div>").text(note));
    $body.append($section("PPT 截图", $wrap));
  }

  const $timeline = $("<ul class='list-unstyled mb-0'></ul>");
  for (const event of record.events) {
    const $item = $("<li class='mb-1'></li>");
    $item.append(
      $("<span class='font-monospace text-body-secondary me-2'></span>").text(
        formatTime(event.time),
      ),
      $(`<span class='${LEVEL_COLORS[event.level] ?? ""}'></span>`).text(
        event.message,
      ),
    );
    if (event.detail) {
      $item.append($("<div class='mt-1'></div>").append($pre(event.detail)));
    }
    $timeline.append($item);
  }
  $body.append($section("过程", $timeline, true));

  if (record.prompt) {
    $body.append($section("发给大模型的提示词", $pre(record.prompt)));
  }
  if (record.reasoning) {
    $body.append($section("大模型思考过程", $pre(record.reasoning)));
  }
  if (record.reply !== undefined) {
    $body.append($section("大模型原始回复", $pre(record.reply || "（空回复）")));
  }

  $details.append($body);
  return $details;
}

function render(): void {
  const $list = $(`#${MODAL_ID}-list`);
  if ($list.length === 0) {
    return;
  }
  const $scroll = $list.closest(".modal-body");
  const scrollTop = $scroll.scrollTop() ?? 0;

  const records = answerLog.getAll().sort((a, b) => b.createdAt - a.createdAt);
  $list.empty();
  if (records.length === 0) {
    $list.append(
      $("<div class='text-center text-body-secondary py-4'></div>").text(
        "暂无答题记录。题目解锁并触发自动答题后，这里会显示完整过程。",
      ),
    );
  } else {
    records.forEach((record) => $list.append(renderRecord(record)));
  }
  $scroll.scrollTop(scrollTop);
}

function ensureModal(): bootstrap.Modal {
  if (modalInstance) {
    return modalInstance;
  }

  const html = `
    <div class="modal fade" id="${MODAL_ID}" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-xl modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">答题日志</h5>
            <span class="text-body-secondary small ms-2">保存最近 50 道题，多个标签页共享</span>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="关闭"></button>
          </div>
          <div class="modal-body">
            <div id="${MODAL_ID}-list"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-sm btn-outline-secondary" id="${MODAL_ID}-copy">复制全部（JSON）</button>
            <button type="button" class="btn btn-sm btn-outline-danger" id="${MODAL_ID}-clear">清空日志</button>
            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">关闭</button>
          </div>
        </div>
      </div>
    </div>
  `;
  $("body").append(html);
  const element = document.getElementById(MODAL_ID);
  if (!element) {
    throw new Error("Answer log modal element is missing");
  }

  $(`#${MODAL_ID}-copy`).on("click", async () => {
    try {
      await navigator.clipboard.writeText(
        JSON.stringify(answerLog.getAll(), null, 2),
      );
      showToast("success", "答题日志", "已复制到剪贴板");
    } catch (err) {
      showToast("danger", "答题日志", `复制失败：${(err as Error).message}`);
    }
  });

  const $clear = $(`#${MODAL_ID}-clear`);
  $clear.on("click", () => {
    // Two-step confirmation without a blocking browser dialog
    if (clearArmedTimer === null) {
      $clear.text("再点一次确认清空");
      clearArmedTimer = setTimeout(() => {
        clearArmedTimer = null;
        $clear.text("清空日志");
      }, 3000);
      return;
    }
    clearTimeout(clearArmedTimer);
    clearArmedTimer = null;
    $clear.text("清空日志");
    openRecords.clear();
    answerLog.clear();
  });

  answerLog.onChange(() => {
    if ($(element).hasClass("show")) {
      render();
    }
  });

  modalInstance = new bootstrap.Modal(element);
  return modalInstance;
}

export function openAnswerLog(): void {
  const modal = ensureModal();
  render();
  modal.show();
}
