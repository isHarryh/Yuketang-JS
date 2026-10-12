import { log } from "./utils/log.js";

const LOG_KEY = "yuketang-js-answer-log";
const MAX_RECORDS = 50;
const MAX_TEXT_LENGTH = 20000;

export type AnswerLogStatus =
  | "scheduled"
  | "running"
  | "waiting-confirm"
  | "success"
  | "failed"
  | "cancelled"
  | "skipped";

export type AnswerLogLevel = "info" | "success" | "warning" | "danger";

export interface AnswerLogEvent {
  time: number;
  level: AnswerLogLevel;
  message: string;
  detail?: string;
}

export interface AnswerLogRecord {
  problemId: string;
  problemType: number;
  body: string;
  pageUrl: string;
  slideImageUrl?: string;
  createdAt: number;
  updatedAt: number;
  status: AnswerLogStatus;
  provider?: string;
  model?: string;
  prompt?: string;
  imageAttached?: boolean;
  reasoning?: string;
  reply?: string;
  answer?: string[];
  events: AnswerLogEvent[];
}

export interface LoggableProblem {
  problemId: string;
  problemType: number;
  body: string;
  slideImageUrl?: string;
}

type RecordPatch = Partial<
  Omit<AnswerLogRecord, "problemId" | "createdAt" | "events">
>;

function truncate(text: string): string {
  return text.length > MAX_TEXT_LENGTH
    ? `${text.slice(0, MAX_TEXT_LENGTH)}\n…（已截断）`
    : text;
}

/**
 * Persistent per-problem auto answer log, stored in GM storage and shared across tabs.
 */
class AnswerLog {
  private listeners = new Set<() => void>();

  constructor() {
    if (typeof GM_addValueChangeListener === "function") {
      GM_addValueChangeListener(LOG_KEY, (_name, _oldValue, _newValue, remote) => {
        // Local writes already notify listeners directly
        if (remote) {
          this._notify();
        }
      });
    }
  }

  getAll(): AnswerLogRecord[] {
    try {
      const stored = GM_getValue<string | null>(LOG_KEY, null);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          return parsed as AnswerLogRecord[];
        }
      }
    } catch (err) {
      log(`⚠️ Answer log load error: ${(err as Error).message}`);
    }
    return [];
  }

  /**
   * Appends an event to the problem's record (creating it if needed) and applies the patch.
   */
  event(
    problem: LoggableProblem,
    level: AnswerLogLevel,
    message: string,
    options: { detail?: string; patch?: RecordPatch } = {},
  ): void {
    // Re-read storage on every write so concurrent tabs don't clobber each other
    const records = this.getAll();
    const now = Date.now();
    let record = records.find((r) => r.problemId === problem.problemId);
    if (!record) {
      record = {
        problemId: problem.problemId,
        problemType: problem.problemType,
        body: truncate(problem.body ?? ""),
        pageUrl: location.href,
        slideImageUrl: problem.slideImageUrl,
        createdAt: now,
        updatedAt: now,
        status: "scheduled",
        events: [],
      };
      records.push(record);
    }

    const patch = { ...options.patch };
    for (const key of ["prompt", "reply", "reasoning"] as const) {
      const value = patch[key];
      if (typeof value === "string") {
        patch[key] = truncate(value);
      }
    }
    Object.assign(record, patch);
    record.updatedAt = now;
    record.events.push({
      time: now,
      level,
      message,
      ...(options.detail ? { detail: truncate(options.detail) } : {}),
    });

    records.sort((a, b) => a.createdAt - b.createdAt);
    this._write(records.slice(-MAX_RECORDS));
  }

  clear(): void {
    this._write([]);
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private _write(records: AnswerLogRecord[]): void {
    try {
      GM_setValue(LOG_KEY, JSON.stringify(records));
    } catch (err) {
      log(`❌ Answer log save error: ${(err as Error).message}`);
    }
    this._notify();
  }

  private _notify(): void {
    this.listeners.forEach((listener) => {
      try {
        listener();
      } catch (err) {
        log(`⚠️ Answer log listener error: ${(err as Error).message}`);
      }
    });
  }
}

export const answerLog = new AnswerLog();
