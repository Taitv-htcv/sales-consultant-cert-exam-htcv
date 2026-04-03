"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import questions from "@/data/questions.json";
import {
  submitWithJitter,
  copyExamDataToClipboard,
  type SubmitStatus,
  type ExamSubmission,
} from "@/lib/submitEngine";

const EXAM_DURATION_SECONDS = 30 * 60; // 30 minutes
const STORAGE_KEY = "war-room-exam-state";

interface ExamState {
  answers: Record<number, string>;
  remainingTime: number;
  userId: string;
  startedAt: number;
  submitted: boolean;
}

function generateUserId(): string {
  return `USER-${Date.now().toString(36).toUpperCase()}-${Math.random()
    .toString(36)
    .substring(2, 6)
    .toUpperCase()}`;
}

function loadState(): ExamState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as ExamState;
    // Recalculate remaining time based on elapsed real time
    const elapsed = Math.floor((Date.now() - state.startedAt) / 1000);
    const remaining = EXAM_DURATION_SECONDS - elapsed;
    if (remaining <= 0 || state.submitted) return state;
    return { ...state, remainingTime: remaining };
  } catch {
    return null;
  }
}

function saveState(state: ExamState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full — ignore
  }
}

function clearState(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(STORAGE_KEY);
}

export default function ExamPage() {
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [remainingTime, setRemainingTime] = useState(EXAM_DURATION_SECONDS);
  const [userId, setUserId] = useState("");
  const [startedAt, setStartedAt] = useState(0);
  const [submitStatus, setSubmitStatus] = useState<SubmitStatus>("idle");
  const [submitDetail, setSubmitDetail] = useState("");
  const [submissionId, setSubmissionId] = useState("");
  const [showNav, setShowNav] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const isSubmittingRef = useRef(false);

  // Initialize state from localStorage or fresh
  useEffect(() => {
    const saved = loadState();
    if (saved && !saved.submitted) {
      setAnswers(saved.answers);
      setRemainingTime(saved.remainingTime);
      setUserId(saved.userId);
      setStartedAt(saved.startedAt);
    } else if (saved && saved.submitted) {
      setSubmitStatus("success");
      setUserId(saved.userId);
      setAnswers(saved.answers);
    } else {
      const newUserId = generateUserId();
      const now = Date.now();
      setUserId(newUserId);
      setStartedAt(now);
      saveState({
        answers: {},
        remainingTime: EXAM_DURATION_SECONDS,
        userId: newUserId,
        startedAt: now,
        submitted: false,
      });
    }
    setIsInitialized(true);
  }, []);

  // Countdown timer
  useEffect(() => {
    if (!isInitialized || submitStatus !== "idle") return;

    const interval = setInterval(() => {
      setRemainingTime((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, submitStatus]);

  // Save to localStorage on every answer change
  useEffect(() => {
    if (!isInitialized || !userId) return;
    saveState({
      answers,
      remainingTime,
      userId,
      startedAt,
      submitted: submitStatus === "success",
    });
  }, [answers, remainingTime, userId, startedAt, submitStatus, isInitialized]);

  const handleAnswer = useCallback(
    (questionId: number, option: string) => {
      if (submitStatus !== "idle") return;
      setAnswers((prev) => ({ ...prev, [questionId]: option }));
    },
    [submitStatus]
  );

  const handleSubmit = useCallback(async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    const submission: ExamSubmission = {
      userId,
      answers,
      timestamp: Date.now(),
      examDuration: EXAM_DURATION_SECONDS - remainingTime,
    };

    const result = await submitWithJitter(submission, (status, detail) => {
      setSubmitStatus(status);
      setSubmitDetail(detail || "");
    });

    if (result.status === "success") {
      setSubmissionId(result.submissionId || "");
      saveState({
        answers,
        remainingTime,
        userId,
        startedAt,
        submitted: true,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, answers, remainingTime, startedAt]);

  const handlePlanZ = useCallback(async () => {
    const submission: ExamSubmission = {
      userId,
      answers,
      timestamp: Date.now(),
      examDuration: EXAM_DURATION_SECONDS - remainingTime,
    };
    const success = await copyExamDataToClipboard(submission);
    setCopied(success);
    if (success) {
      setTimeout(() => setCopied(false), 3000);
    }
  }, [userId, answers, remainingTime]);

  const handleResetExam = useCallback(() => {
    clearState();
    window.location.reload();
  }, []);

  const formatTime = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const answeredCount = Object.keys(answers).length;
  const totalQuestions = questions.length;
  const currentQ = questions[currentQuestion];
  const isUrgent = remainingTime <= 5 * 60; // Last 5 minutes
  const progress = (answeredCount / totalQuestions) * 100;

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center min-h-dvh">
        <div className="spinner w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  // Submission status overlay
  if (submitStatus !== "idle") {
    return (
      <div className="status-overlay flex flex-col items-center justify-center min-h-dvh p-6 relative z-10">
        {/* Jitter / Submitting / Retrying */}
        {(submitStatus === "jitter-waiting" ||
          submitStatus === "submitting" ||
          submitStatus === "retrying") && (
          <div className="glass-card p-8 max-w-sm w-full text-center space-y-6">
            <div className="spinner w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full mx-auto" />
            <div>
              <h2 className="text-xl font-bold text-white mb-2">
                {submitStatus === "jitter-waiting"
                  ? "🔐 Mã hóa dữ liệu"
                  : submitStatus === "submitting"
                  ? "📡 Đang gửi bài"
                  : "🔄 Đang thử lại"}
              </h2>
              <p className="text-slate-400 text-sm">{submitDetail}</p>
            </div>
            <p className="text-xs text-slate-500">
              Vui lòng không đóng trình duyệt
            </p>
          </div>
        )}

        {/* Success */}
        {submitStatus === "success" && (
          <div className="glass-card p-8 max-w-sm w-full text-center space-y-6">
            <div className="success-check w-20 h-20 rounded-full bg-green-500/20 border-2 border-green-500 flex items-center justify-center mx-auto">
              <svg
                className="w-10 h-10 text-green-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white mb-2">
                🎉 Nộp bài thành công!
              </h2>
              <p className="text-slate-400 text-sm">
                Bài thi của bạn đã được ghi nhận
              </p>
            </div>
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Mã thí sinh:</span>
                <span className="text-indigo-400 font-mono text-xs">
                  {userId}
                </span>
              </div>
              {submissionId && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Mã nộp bài:</span>
                  <span className="text-green-400 font-mono text-xs">
                    {submissionId}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Số câu đã trả lời:</span>
                <span className="text-white font-semibold">
                  {answeredCount}/{totalQuestions}
                </span>
              </div>
            </div>
            <button
              onClick={handleResetExam}
              className="w-full py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
            >
              Thi lại (Xóa dữ liệu)
            </button>
          </div>
        )}

        {/* Plan Z Fallback */}
        {submitStatus === "plan-z" && (
          <div className="glass-card p-8 max-w-sm w-full text-center space-y-6 border-red-500/30">
            <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500 flex items-center justify-center mx-auto">
              <svg
                className="w-8 h-8 text-red-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-red-400 mb-2">
                ⚠️ LỖI MẠNG
              </h2>
              <p className="text-slate-400 text-sm">
                Không thể gửi bài thi sau nhiều lần thử. Vui lòng sao chép dữ
                liệu bài thi và gửi cho giám thị qua chat nhóm.
              </p>
            </div>
            <button
              onClick={handlePlanZ}
              className="plan-z-btn w-full py-4 px-6 text-base"
              id="plan-z-copy-btn"
            >
              {copied
                ? "✅ ĐÃ SAO CHÉP — DÁN VÀO CHAT NHÓM"
                : "📋 COPY DỮ LIỆU BÀI THI"}
            </button>
            <p className="text-xs text-slate-500">
              Mã thí sinh:{" "}
              <span className="text-indigo-400 font-mono">{userId}</span>
            </p>
            <button
              onClick={() => {
                isSubmittingRef.current = false;
                setSubmitStatus("idle");
              }}
              className="w-full py-2 rounded-lg bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 text-sm transition-colors"
            >
              ← Quay lại bài thi
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-dvh relative z-10">
      {/* Header: Timer + Progress */}
      <header className="sticky top-0 z-50 glass-card rounded-none border-x-0 border-t-0 px-4 py-3 safe-area-top">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div
              className={`timer-text text-2xl font-bold tracking-wider ${
                isUrgent ? "text-red-400 timer-urgent" : "text-white"
              }`}
            >
              {formatTime(remainingTime)}
            </div>
            {isUrgent && (
              <span className="text-[10px] font-medium text-red-400 bg-red-500/10 px-2 py-0.5 rounded-full">
                SẮP HẾT GIỜ
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-slate-400">Đã trả lời</div>
              <div className="text-sm font-bold text-white">
                {answeredCount}/{totalQuestions}
              </div>
            </div>
            <button
              onClick={() => setShowNav(!showNav)}
              className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 hover:bg-indigo-500/30 transition-colors"
              id="toggle-nav-btn"
              aria-label="Mở bảng câu hỏi"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="max-w-2xl mx-auto mt-2">
          <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500 ease-out"
              style={{
                width: `${progress}%`,
                background: "var(--accent-gradient)",
              }}
            />
          </div>
        </div>
      </header>

      {/* Question Nav Panel (Slide-down) */}
      {showNav && (
        <div className="fixed inset-0 z-40 bg-black/60" onClick={() => setShowNav(false)}>
          <div
            className="glass-card absolute top-0 left-0 right-0 mt-[72px] mx-4 p-4 max-w-2xl lg:mx-auto border-t-0 rounded-t-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-semibold text-slate-300">
                Bảng câu hỏi
              </h3>
              <div className="flex gap-3 text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-indigo-500 inline-block" /> Đã trả lời
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-slate-700 border border-slate-600 inline-block" /> Chưa trả lời
                </span>
              </div>
            </div>
            <div className="grid grid-cols-10 gap-1.5">
              {questions.map((q, idx) => (
                <button
                  key={q.id}
                  onClick={() => {
                    setCurrentQuestion(idx);
                    setShowNav(false);
                  }}
                  className={`q-dot w-full aspect-square flex items-center justify-center text-xs font-medium ${
                    answers[q.id]
                      ? "answered"
                      : currentQuestion === idx
                      ? "current bg-slate-800"
                      : "unanswered"
                  }`}
                >
                  {q.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full">
        {/* Question */}
        <div className="glass-card p-5 mb-4">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs font-semibold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full">
              Câu {currentQ.id}/{totalQuestions}
            </span>
            {answers[currentQ.id] && (
              <span className="text-xs text-green-400 bg-green-500/10 px-2 py-1 rounded-full">
                ✓ Đã chọn
              </span>
            )}
          </div>
          <h2 className="text-base sm:text-lg font-semibold text-white leading-relaxed">
            {currentQ.question}
          </h2>
        </div>

        {/* Options */}
        <div className="space-y-3 mb-6">
          {currentQ.options.map((option) => {
            const optionLetter = option.charAt(0);
            const isSelected = answers[currentQ.id] === optionLetter;
            return (
              <button
                key={option}
                onClick={() => handleAnswer(currentQ.id, optionLetter)}
                className={`option-btn w-full text-left p-4 flex items-start gap-3 ${
                  isSelected ? "selected" : ""
                }`}
                id={`option-${currentQ.id}-${optionLetter}`}
              >
                <span
                  className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                    isSelected
                      ? "bg-indigo-500 border-indigo-500 text-white"
                      : "border-slate-600 text-slate-400"
                  }`}
                >
                  {optionLetter}
                </span>
                <span
                  className={`text-sm leading-relaxed pt-0.5 ${
                    isSelected ? "text-white" : "text-slate-300"
                  }`}
                >
                  {option.substring(3)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Navigation */}
        <div className="flex gap-3">
          <button
            onClick={() => setCurrentQuestion((p) => Math.max(0, p - 1))}
            disabled={currentQuestion === 0}
            className="flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            id="prev-btn"
          >
            ← Trước
          </button>
          {currentQuestion < totalQuestions - 1 ? (
            <button
              onClick={() =>
                setCurrentQuestion((p) => Math.min(totalQuestions - 1, p + 1))
              }
              className="flex-1 py-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 font-medium text-sm hover:bg-slate-700 transition-colors"
              id="next-btn"
            >
              {answers[currentQ.id] ? "Tiếp →" : "Bỏ qua →"}
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              className="submit-btn flex-1 py-3 text-sm"
              id="submit-btn"
            >
              📤 Nộp bài ({answeredCount}/{totalQuestions})
            </button>
          )}
        </div>
      </main>

      {/* Footer: Quick Submit */}
      {answeredCount === totalQuestions && currentQuestion < totalQuestions - 1 && (
        <div className="sticky bottom-0 z-30 p-4 safe-area-bottom">
          <div className="max-w-2xl mx-auto">
            <button
              onClick={handleSubmit}
              className="submit-btn w-full py-4 text-base"
              id="quick-submit-btn"
            >
              ✅ Đã hoàn thành tất cả — Nộp bài ngay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
