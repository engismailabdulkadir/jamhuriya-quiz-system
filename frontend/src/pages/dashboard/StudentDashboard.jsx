import { useEffect, useMemo, useRef, useState } from "react";
import {
  getStudentAvailableQuizzes,
  getStudentQuizForAttempt,
  logStudentProctorEvent,
  submitStudentQuizAttempt
} from "../../services/api.js";
import { showError, showSuccess, showWarning } from "../../utils/alerts.js";

function formatSeconds(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "No limit";
  const minutes = Math.floor(value / 60);
  const remainder = value % 60;
  if (minutes <= 0) return `${remainder} sec`;
  if (remainder === 0) return `${minutes} min`;
  return `${minutes} min ${remainder} sec`;
}

function formatTimerClock(seconds) {
  const value = Math.max(Number(seconds) || 0, 0);
  const hrs = Math.floor(value / 3600);
  const mins = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function normalizeQuestionType(type) {
  const value = String(type || "").toLowerCase();
  if (value === "mcq_multi") return "multiple";
  if (value === "mcq_single" || value === "true_false") return "single";
  return "text";
}

function StudentDashboard({ student, onExit }) {
  const [loadingQuizzes, setLoadingQuizzes] = useState(true);
  const [quizzes, setQuizzes] = useState([]);
  const [selectedQuiz, setSelectedQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [loadingQuizDetail, setLoadingQuizDetail] = useState(false);
  const [lastResult, setLastResult] = useState(null);
  const [remainingSeconds, setRemainingSeconds] = useState(null);
  const [autoSubmittingForAttempt, setAutoSubmittingForAttempt] = useState(null);
  const proctorStateRef = useRef({
    lastSentAt: 0,
    lastKey: "",
    counts: { tab_switch: 0, window_blur: 0 }
  });

  const studentPayload = useMemo(
    () => ({
      student_id: String(student?.student_id ?? "").trim(),
      student_name: String(student?.student_name ?? "").trim()
    }),
    [student]
  );

  const loadQuizzes = async () => {
    if (!studentPayload.student_id || !studentPayload.student_name) {
      setQuizzes([]);
      setLoadingQuizzes(false);
      return;
    }

    setLoadingQuizzes(true);
    try {
      const response = await getStudentAvailableQuizzes(studentPayload);
      setQuizzes(response?.quizzes ?? []);
    } catch (error) {
      await showError("Load Failed", error?.data?.message || "Unable to load quizzes.");
      setQuizzes([]);
    } finally {
      setLoadingQuizzes(false);
    }
  };

  useEffect(() => {
    loadQuizzes();
  }, [studentPayload.student_id, studentPayload.student_name]);

  const openQuiz = async (quizId) => {
    setLoadingQuizDetail(true);
    setLastResult(null);
    try {
      const response = await getStudentQuizForAttempt(quizId, studentPayload);
      const quiz = response?.quiz;
      if (!quiz) {
        await showWarning("Quiz", "Quiz data was not found.");
        return;
      }
      setSelectedQuiz(quiz);
      setAnswers({});
      setRemainingSeconds(quiz?.attempt?.timer?.remaining_seconds ?? null);
      setAutoSubmittingForAttempt(null);
    } catch (error) {
      await showError("Open Quiz Failed", error?.data?.message || "Unable to open quiz.");
    } finally {
      setLoadingQuizDetail(false);
    }
  };

  useEffect(() => {
    if (!selectedQuiz?.attempt?.id) {
      setRemainingSeconds(null);
      return;
    }

    const timer = selectedQuiz?.attempt?.timer;
    if (!timer || !timer.expires_at) {
      setRemainingSeconds(null);
      return;
    }

    const expiresAtMs = new Date(timer.expires_at).getTime();
    if (!Number.isFinite(expiresAtMs)) {
      setRemainingSeconds(timer.remaining_seconds ?? null);
      return;
    }

    const tick = () => {
      const next = Math.max(Math.ceil((expiresAtMs - Date.now()) / 1000), 0);
      setRemainingSeconds(next);
    };

    tick();
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [selectedQuiz?.attempt?.id, selectedQuiz?.attempt?.timer?.expires_at, selectedQuiz?.attempt?.timer?.remaining_seconds]);

  useEffect(() => {
    const attemptId = Number(selectedQuiz?.attempt?.id || 0);
    const attemptStatus = String(selectedQuiz?.attempt?.status || "").toLowerCase();
    if (!attemptId || attemptStatus !== "in_progress") return;

    proctorStateRef.current = {
      lastSentAt: 0,
      lastKey: "",
      counts: { tab_switch: 0, window_blur: 0 }
    };

    const sendEvent = async (event, meta = {}) => {
      const nowMs = Date.now();
      const key = `${attemptId}:${event}`;
      const state = proctorStateRef.current;
      if (state.lastKey === key && nowMs - state.lastSentAt < 1200) return;
      state.lastKey = key;
      state.lastSentAt = nowMs;

      state.counts[event] = (state.counts[event] ?? 0) + 1;

      try {
        await logStudentProctorEvent(attemptId, {
          ...studentPayload,
          event,
          meta: {
            ...meta,
            count: state.counts[event],
            client_time: new Date().toISOString()
          }
        });
      } catch (error) {
        // Ignore logging errors to avoid interrupting the quiz experience.
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        sendEvent("tab_switch", { visibility_state: document.visibilityState });
      }
    };

    const onWindowBlur = () => {
      sendEvent("window_blur");
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [selectedQuiz?.attempt?.id, selectedQuiz?.attempt?.status, studentPayload]);

  const selectSingleOption = (questionId, optionId) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { selected_option_id: optionId, selected_option_ids: [optionId], answer_text: "" }
    }));
  };

  const toggleMultiOption = (questionId, optionId) => {
    setAnswers((prev) => {
      const current = prev[questionId] ?? { selected_option_ids: [], answer_text: "" };
      const nextIds = new Set(current.selected_option_ids ?? []);
      if (nextIds.has(optionId)) nextIds.delete(optionId);
      else nextIds.add(optionId);
      return {
        ...prev,
        [questionId]: { selected_option_ids: Array.from(nextIds), selected_option_id: null, answer_text: "" }
      };
    });
  };

  const updateTextAnswer = (questionId, text) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: { answer_text: text, selected_option_id: null, selected_option_ids: [] }
    }));
  };

  const hasAnswer = (question) => {
    const payload = answers[question.id];
    if (!payload) return false;
    const questionMode = normalizeQuestionType(question.question_type);
    if (questionMode === "text") {
      return String(payload.answer_text ?? "").trim() !== "";
    }
    return Array.isArray(payload.selected_option_ids) && payload.selected_option_ids.length > 0;
  };

  const submitAttempt = async ({ force = false, triggeredByTimer = false } = {}) => {
    if (!selectedQuiz) return;

    const questions = selectedQuiz.questions ?? [];
    const missingQuestions = force ? [] : questions.filter((question) => !hasAnswer(question));
    if (!force && missingQuestions.length > 0) {
      await showWarning("Validation", "Please answer all questions before submitting.");
      return;
    }

    const attemptId = Number(selectedQuiz?.attempt?.id || 0);
    if (!attemptId) {
      await showError("Submit Failed", "Attempt ID is missing. Please reopen the quiz.");
      return;
    }

    const payload = {
      ...studentPayload,
      attempt_id: attemptId,
      answers: questions.map((question) => {
        const answer = answers[question.id] ?? {};
        return {
          question_id: question.id,
          answer_text: String(answer.answer_text ?? "").trim(),
          selected_option_id: answer.selected_option_id ?? null,
          selected_option_ids: answer.selected_option_ids ?? []
        };
      })
    };

    setSubmitting(true);
    try {
      const response = await submitStudentQuizAttempt(selectedQuiz.id, payload);
      const result = response?.result ?? null;
      setLastResult(result);
      setSelectedQuiz(null);
      setAnswers({});
      setRemainingSeconds(null);
      setAutoSubmittingForAttempt(null);
      if (triggeredByTimer) {
        await showWarning("Time Up", response?.message || "Time expired. Attempt submitted automatically.");
      } else {
        await showSuccess("Submitted", response?.message || "Your attempt was submitted successfully.");
      }
      await loadQuizzes();
    } catch (error) {
      await showError("Submit Failed", error?.data?.message || "Unable to submit attempt.");
      if (triggeredByTimer) {
        setAutoSubmittingForAttempt(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  useEffect(() => {
    const attemptId = Number(selectedQuiz?.attempt?.id || 0);
    if (!attemptId) return;
    if (remainingSeconds === null) return;
    if (remainingSeconds > 0) return;
    if (submitting) return;
    if (autoSubmittingForAttempt === attemptId) return;

    setAutoSubmittingForAttempt(attemptId);
    submitAttempt({ force: true, triggeredByTimer: true });
  }, [remainingSeconds, selectedQuiz?.attempt?.id, submitting, autoSubmittingForAttempt]);

  if (loadingQuizzes) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <section className="w-full max-w-xl rounded-2xl bg-white p-8 text-center shadow-xl">
          <h2 className="text-xl font-bold text-[#1E3A8A]">Loading Quizzes...</h2>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8">
      <section className="mx-auto w-full max-w-6xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#1E3A8A]">Student Dashboard</h1>
            <p className="mt-1 text-slate-600">
              Welcome, {student?.student_name ?? "Student"} ({student?.student_id ?? "ID"})
            </p>
          </div>
          <button
            type="button"
            onClick={onExit}
            className="rounded-xl bg-[#1E3A8A] px-4 py-2 font-medium text-white transition hover:bg-[#172d6d]"
          >
            Exit Student Session
          </button>
        </div>

        {lastResult ? (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-emerald-900">
            <p className="font-semibold">Attempt #{lastResult.attempt_id} submitted.</p>
            <p className="text-sm">
              Score: {lastResult.total_score}/{lastResult.total_possible} | Answered: {lastResult.answered_count}/
              {lastResult.question_count}
            </p>
          </div>
        ) : null}

        {loadingQuizDetail ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-slate-600">
            Loading quiz...
          </div>
        ) : null}

        {!selectedQuiz && !loadingQuizDetail ? (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-800">Available Quizzes</h2>
            {quizzes.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-slate-500">
                No published quizzes are assigned to you yet.
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {quizzes.map((quiz) => (
                  <article key={quiz.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <h3 className="text-lg font-bold text-[#1E3A8A]">{quiz.title}</h3>
                    <p className="mt-1 text-sm text-slate-500">{quiz.description || "No description."}</p>
                    <div className="mt-3 space-y-1 text-xs text-slate-600">
                      <p>Room: {quiz.room_name || "-"}</p>
                      <p>Questions: {quiz.question_count ?? 0}</p>
                      <p>Time Limit: {formatSeconds(quiz.time_limit_seconds)}</p>
                      <p>
                        Attempts: {quiz.attempts_used ?? 0}
                        {quiz.remaining_attempts === null ? " (Unlimited)" : ` | Remaining: ${quiz.remaining_attempts}`}
                      </p>
                      {typeof quiz.active_attempt?.timer?.remaining_seconds === "number" ? (
                        <p>Active Timer: {formatTimerClock(quiz.active_attempt.timer.remaining_seconds)}</p>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => openQuiz(quiz.id)}
                      className="mt-4 w-full rounded-xl bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d]"
                    >
                      {quiz.active_attempt ? "Resume Attempt" : "Start Attempt"}
                    </button>
                  </article>
                ))}
              </div>
            )}
          </div>
        ) : null}

        {selectedQuiz ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold text-[#1E3A8A]">{selectedQuiz.title}</h2>
                <p className="text-sm text-slate-600">{selectedQuiz.description || "No description."}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedQuiz(null);
                  setAnswers({});
                  setRemainingSeconds(null);
                  setAutoSubmittingForAttempt(null);
                }}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Back to Quizzes
              </button>
            </div>

            <div
              className={`rounded-xl border px-4 py-3 text-sm ${
                remainingSeconds !== null && remainingSeconds <= 60
                  ? "border-red-300 bg-red-50 text-red-700"
                  : "border-slate-200 bg-slate-50 text-slate-700"
              }`}
            >
              Time Limit: {formatSeconds(selectedQuiz.time_limit_seconds)} | Max Attempts: {selectedQuiz.max_attempts || "Unlimited"}
              {remainingSeconds !== null ? (
                <span className="ml-2 font-semibold">
                  | Timer: {formatTimerClock(remainingSeconds)}
                </span>
              ) : null}
            </div>

            {(selectedQuiz.questions ?? []).map((question, index) => {
              const answer = answers[question.id] ?? {};
              const mode = normalizeQuestionType(question.question_type);
              const selectedIds = answer.selected_option_ids ?? [];
              const selectedSingleId = answer.selected_option_id;

              return (
                <article key={question.id} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <h3 className="text-base font-semibold text-slate-800">
                      {index + 1}. <span dangerouslySetInnerHTML={{ __html: question.prompt || "" }} />
                    </h3>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-[#1E3A8A]">
                      {question.points} pt
                    </span>
                  </div>

                  {question.image_path ? (
                    <img src={question.image_path} alt="Question media" className="mb-3 max-h-56 rounded-lg border border-slate-200 object-contain" />
                  ) : null}

                  {question.video_url ? (
                    <video src={question.video_url} controls className="mb-3 max-h-56 w-full rounded-lg border border-slate-200" />
                  ) : null}

                  {mode === "text" ? (
                    <textarea
                      value={answer.answer_text ?? ""}
                      onChange={(event) => updateTextAnswer(question.id, event.target.value)}
                      rows={4}
                      placeholder="Type your answer..."
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                    />
                  ) : (
                    <div className="space-y-2">
                      {(question.options ?? []).map((option) => (
                        <label
                          key={option.id}
                          className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 hover:border-slate-300"
                        >
                          {mode === "multiple" ? (
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(option.id)}
                              onChange={() => toggleMultiOption(question.id, option.id)}
                              className="mt-1"
                            />
                          ) : (
                            <input
                              type="radio"
                              name={`question-${question.id}`}
                              checked={selectedSingleId === option.id || selectedIds.includes(option.id)}
                              onChange={() => selectSingleOption(question.id, option.id)}
                              className="mt-1"
                            />
                          )}
                          <span className="text-sm text-slate-700">{option.option_text}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => submitAttempt()}
                disabled={submitting || (remainingSeconds !== null && remainingSeconds <= 0)}
                className="rounded-xl bg-[#1E3A8A] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Submitting..." : remainingSeconds !== null && remainingSeconds <= 0 ? "Submitting by Timer..." : "Submit Attempt"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

export default StudentDashboard;
