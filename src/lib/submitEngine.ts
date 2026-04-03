/**
 * Submit Engine — Resilience Module
 * Implements: Jitter, Silent Auto-Retry, Plan Z Fallback
 */

export interface ExamSubmission {
  userId: string;
  answers: Record<number, string>;
  timestamp: number;
  examDuration: number;
}

export type SubmitStatus =
  | "idle"
  | "jitter-waiting"
  | "submitting"
  | "retrying"
  | "success"
  | "plan-z";

export interface SubmitResult {
  status: SubmitStatus;
  submissionId?: string;
  error?: string;
  retryCount?: number;
}

const MAX_RETRIES = 4;
const JITTER_MIN_MS = 1000;
const JITTER_MAX_MS = 12000; // 1s + Math.random() * 11000

/**
 * Submit with jitter delay (traffic shaping)
 * Random delay between 1-12 seconds before actual submission
 */
export function submitWithJitter(
  submission: ExamSubmission,
  onStatusChange: (status: SubmitStatus, detail?: string) => void
): Promise<SubmitResult> {
  return new Promise((resolve) => {
    onStatusChange("jitter-waiting", "Đang mã hóa dữ liệu bài thi...");

    const jitterDelay =
      Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS) + JITTER_MIN_MS;

    setTimeout(async () => {
      onStatusChange("submitting", "Đang gửi bài thi...");

      const result = await submitWithRetry(submission, onStatusChange);
      resolve(result);
    }, jitterDelay);
  });
}

/**
 * Silent Auto-Retry with exponential backoff
 * Retries up to 4 times: 1s → 2s → 4s → 8s
 */
async function submitWithRetry(
  submission: ExamSubmission,
  onStatusChange: (status: SubmitStatus, detail?: string) => void
): Promise<SubmitResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submission),
      });

      if (response.ok) {
        const data = await response.json();
        onStatusChange("success");
        return {
          status: "success",
          submissionId: data.submissionId,
        };
      }

      // Retry on server errors (500, 502, 504)
      if ([500, 502, 504].includes(response.status)) {
        if (attempt < MAX_RETRIES) {
          const backoffMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s, 8s
          onStatusChange(
            "retrying",
            `Đang thử lại... (${attempt + 1}/${MAX_RETRIES})`
          );
          await sleep(backoffMs);
          continue;
        }
      }

      // Non-retryable error
      onStatusChange("plan-z");
      return {
        status: "plan-z",
        error: `HTTP ${response.status}`,
        retryCount: attempt,
      };
    } catch (err) {
      // Network error — retry
      if (attempt < MAX_RETRIES) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        onStatusChange(
          "retrying",
          `Lỗi mạng, đang thử lại... (${attempt + 1}/${MAX_RETRIES})`
        );
        await sleep(backoffMs);
        continue;
      }

      onStatusChange("plan-z");
      return {
        status: "plan-z",
        error: err instanceof Error ? err.message : "Unknown error",
        retryCount: attempt,
      };
    }
  }

  onStatusChange("plan-z");
  return { status: "plan-z", error: "Max retries exceeded", retryCount: MAX_RETRIES };
}

/**
 * Plan Z: Copy exam data to clipboard
 */
export async function copyExamDataToClipboard(
  submission: ExamSubmission
): Promise<boolean> {
  const answersString = Object.entries(submission.answers)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([qId, ans]) => `${qId}:${ans}`)
    .join(",");

  const clipboardText = `[${submission.userId}]-[${answersString}]-[${submission.timestamp}]`;

  try {
    await navigator.clipboard.writeText(clipboardText);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = clipboardText;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand("copy");
    document.body.removeChild(textarea);
    return success;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
