import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ImagePlus, Plus, Trash2, Video, X } from "lucide-react";
import RichTextEditor, {
  isRichTextEffectivelyEmpty,
  normalizeRichTextValue
} from "../components/RichTextEditor.jsx";
import {
  createAdminBlankQuiz,
  createTeacherBlankQuiz,
  getAdminQuizById,
  getTeacherQuizById,
  updateAdminBlankQuiz,
  updateTeacherBlankQuiz
} from "../../services/api.js";
import { formatValidationErrors, showConfirm, showError, showSuccess, showWarning } from "../../utils/alerts.js";

const QUESTION_TYPES = [
  { value: "mcq_single", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short Answer" }
];
const DRAFT_STORAGE_KEY_PREFIX = "just_quizz_blank_quiz_draft";
const EDIT_RETURN_STORAGE_KEY_PREFIX = "just_quizz_blank_quiz_edit_return";
const TITLE_ERROR_KEY = "title";
const DESCRIPTION_ERROR_KEY = "description";
const TIME_LIMIT_ERROR_KEY = "time_limit";
const MAX_ATTEMPTS_ERROR_KEY = "max_attempts";
const ALLOWED_VIDEO_MIME_TYPES = new Set([
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-matroska"
]);
const ALLOWED_VIDEO_EXTENSIONS = new Set(["mp4", "webm", "mov", "mkv", "m4v"]);
const ALLOWED_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "avif"
]);
const VIDEO_HOST_ALLOWLIST = [
  "youtu.be",
  "youtube.com",
  "youtube-nocookie.com",
  "vimeo.com"
];

function uid(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getLowerExtension(filename = "") {
  const value = String(filename).trim();
  const dot = value.lastIndexOf(".");
  if (dot === -1) return "";
  return value.slice(dot + 1).toLowerCase();
}

function isAllowedImageFile(file) {
  if (!file) return true;
  if (typeof file?.type === "string" && file.type.toLowerCase().startsWith("image/")) {
    return true;
  }
  return ALLOWED_IMAGE_EXTENSIONS.has(getLowerExtension(file?.name ?? ""));
}

function isAllowedVideoFile(file) {
  if (!file) return true;
  const mime = String(file?.type ?? "").toLowerCase();
  if (mime && ALLOWED_VIDEO_MIME_TYPES.has(mime)) {
    return true;
  }
  return ALLOWED_VIDEO_EXTENSIONS.has(getLowerExtension(file?.name ?? ""));
}

function hostMatchesAllowList(hostname) {
  const value = String(hostname ?? "").toLowerCase();
  return VIDEO_HOST_ALLOWLIST.some((allowed) => value === allowed || value.endsWith(`.${allowed}`));
}

function isAllowedVideoUrl(rawValue) {
  const value = String(rawValue ?? "").trim();
  if (value === "") return true;
  if (value.includes("<") || value.includes(">")) return false;

  if (value.startsWith("/")) {
    return ALLOWED_VIDEO_EXTENSIONS.has(getLowerExtension(value));
  }

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  const protocol = parsed.protocol.toLowerCase();
  if (protocol !== "http:" && protocol !== "https:") {
    return false;
  }

  if (hostMatchesAllowList(parsed.hostname)) {
    return true;
  }

  return ALLOWED_VIDEO_EXTENSIONS.has(getLowerExtension(parsed.pathname));
}

function getPromptErrorKey(questionId) {
  return `q:${questionId}:prompt`;
}

function getOptionErrorKey(questionId, optionId) {
  return `q:${questionId}:option:${optionId}`;
}

function getTrueFalseErrorKey(questionId) {
  return `q:${questionId}:true_false`;
}

function createOption(text = "", isCorrect = false) {
  return {
    id: uid("opt"),
    text,
    is_correct: isCorrect,
    image_file: null
  };
}

function createDefaultOptions(type) {
  if (type === "true_false") {
    return [createOption("True", true), createOption("False", false)];
  }

  if (type === "short_answer") {
    return [createOption(""), createOption(""), createOption(""), createOption("")];
  }

  return [createOption(""), createOption(""), createOption(""), createOption("")];
}

function createQuestion(type) {
  return {
    id: uid("q"),
    question_type: type,
    prompt: "",
    points: 1,
    explanation: "",
    video_url: "",
    image_file: null,
    video_file: null,
    options: createDefaultOptions(type)
  };
}

function convertQuestionToType(question, nextType) {
  if (nextType === question.question_type) return question;

  if (nextType === "true_false") {
    return {
      ...question,
      question_type: "true_false",
      options: [createOption("True", true), createOption("False", false)]
    };
  }

  if (nextType === "short_answer") {
    return {
      ...question,
      question_type: "short_answer",
      options:
        question.options.length > 0
          ? question.options.map((option) => ({ ...option, is_correct: false }))
          : createDefaultOptions("short_answer")
    };
  }

  const baseOptions =
    question.question_type === "true_false"
      ? createDefaultOptions("mcq_single")
      : question.options.length > 0
        ? question.options.map((option) => ({ ...option }))
        : createDefaultOptions("mcq_single");

  while (baseOptions.length < 4) {
    baseOptions.push(createOption(""));
  }

  const normalized = baseOptions.map((option) => ({
    ...option,
    is_correct: false
  }));
  normalized[0].is_correct = true;

  return {
    ...question,
    question_type: "mcq_single",
    options: normalized
  };
}

function getOptionLabel(index) {
  return String.fromCharCode(65 + index);
}

function promptPlaceholder(type) {
  if (type === "true_false") return "Have a true-or-false statement";
  if (type === "short_answer") return "Have a short-answer prompt";
  return "Have a multiple-choice question";
}

function getDraftStorageKey(role, draftScope = "new") {
  return `${DRAFT_STORAGE_KEY_PREFIX}_${role}_${draftScope}`;
}

function getEditReturnStorageKey(role) {
  return `${EDIT_RETURN_STORAGE_KEY_PREFIX}_${role}`;
}

function toRangedInt(value, fallback = 1, min = 1, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  if (normalized < min || normalized > max) return fallback;
  return normalized;
}

function parseQuestionPoints(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Number(n.toFixed(2));
}

function stripFilesFromQuestions(questions) {
  return questions.map((question) => ({
    id: question.id,
    question_type: question.question_type,
    prompt: question.prompt,
    points: question.points,
    explanation: question.explanation,
    video_url: question.video_url,
    options: (question.options ?? []).map((option) => ({
      id: option.id,
      text: option.text,
      is_correct: Boolean(option.is_correct)
    }))
  }));
}

function normalizeDraftQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions
    .map((rawQuestion) => {
      const type = QUESTION_TYPES.some((item) => item.value === rawQuestion?.question_type)
        ? rawQuestion.question_type
        : "mcq_single";

      const base = createQuestion(type);
      const rawOptions = Array.isArray(rawQuestion?.options) ? rawQuestion.options : [];

      let mappedOptions = rawOptions
        .map((option) => ({
          id: option?.id || uid("opt"),
          text: String(option?.text ?? ""),
          is_correct: Boolean(option?.is_correct),
          image_file: null
        }))
        .filter((option) =>
          type === "short_answer"
            ? option.text.trim() !== ""
            : !isRichTextEffectivelyEmpty(option.text)
        );

      if (type === "true_false" && mappedOptions.length > 0) {
        let foundCorrect = false;
        mappedOptions = mappedOptions.map((option) => {
          if (option.is_correct && !foundCorrect) {
            foundCorrect = true;
            return option;
          }
          return { ...option, is_correct: false };
        });
        if (!foundCorrect) mappedOptions[0].is_correct = true;
      }

      if (type === "mcq_single" && mappedOptions.length > 0) {
        const correctIndexes = [];
        mappedOptions.forEach((option, index) => {
          if (option.is_correct) correctIndexes.push(index);
        });

        if (correctIndexes.length === 0) {
          mappedOptions[0].is_correct = true;
        }
      }

      return {
        ...base,
        id: rawQuestion?.id || uid("q"),
        prompt: String(rawQuestion?.prompt ?? ""),
        points: Number(rawQuestion?.points || 1),
        explanation: String(rawQuestion?.explanation ?? ""),
        video_url: String(rawQuestion?.video_url ?? ""),
        image_file: null,
        video_file: null,
        options: mappedOptions.length > 0 ? mappedOptions : base.options
      };
    })
    .filter(Boolean);
}

function normalizeLoadedQuizQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  const normalized = rawQuestions
    .map((rawQuestion) => {
      const type = QUESTION_TYPES.some((item) => item.value === rawQuestion?.question_type)
        ? rawQuestion.question_type
        : "mcq_single";
      const base = createQuestion(type);
      const rawOptions = Array.isArray(rawQuestion?.options) ? rawQuestion.options : [];

      let mappedOptions = rawOptions
        .map((option) => ({
          id: option?.id || uid("opt"),
          text: String(option?.text ?? option?.option_text ?? ""),
          is_correct: Boolean(option?.is_correct),
          image_file: null
        }))
        .filter((option) =>
          type === "short_answer"
            ? option.text.trim() !== ""
            : !isRichTextEffectivelyEmpty(option.text)
        );

      if (type === "true_false") {
        const trueOption = mappedOptions.find((option) => option.text.trim().toLowerCase() === "true");
        const falseOption = mappedOptions.find((option) => option.text.trim().toLowerCase() === "false");
        mappedOptions = [
          trueOption ?? createOption("True", true),
          falseOption ?? createOption("False", false)
        ];
        const correctIndexes = [];
        mappedOptions.forEach((option, index) => {
          if (option.is_correct) correctIndexes.push(index);
        });
        if (correctIndexes.length === 0) {
          mappedOptions[0].is_correct = true;
        } else if (correctIndexes.length > 1) {
          const first = correctIndexes[0];
          mappedOptions = mappedOptions.map((option, index) => ({
            ...option,
            is_correct: index === first
          }));
        }
      }

      if (type === "mcq_single" && mappedOptions.length > 0) {
        const correctIndexes = [];
        mappedOptions.forEach((option, index) => {
          if (option.is_correct) correctIndexes.push(index);
        });

        if (correctIndexes.length === 0) {
          mappedOptions[0].is_correct = true;
        }
      }

      return {
        ...base,
        id: rawQuestion?.id || uid("q"),
        prompt: String(rawQuestion?.prompt ?? ""),
        points: Number(rawQuestion?.points || 1),
        explanation: String(rawQuestion?.explanation ?? ""),
        video_url: String(rawQuestion?.video_url ?? ""),
        image_file: null,
        video_file: null,
        options: mappedOptions.length > 0 ? mappedOptions : base.options
      };
    })
    .filter(Boolean);

  return normalized;
}

function BlankQuizBuilderSection({ role, currentPath, onNavigate }) {
  const isAdmin = role === "admin";
  const quizzesBasePath = isAdmin ? "/admin/quizzes" : "/teacher/quizzes";
  const questionsBasePath = `${quizzesBasePath}/questions`;
  const editPathPrefix = `${questionsBasePath}/edit/`;
  const isEditMode = typeof currentPath === "string" && currentPath.startsWith(editPathPrefix);
  const editQuizId = isEditMode ? Number(currentPath.slice(editPathPrefix.length).split("/")[0]) : null;
  const draftScope = isEditMode && Number.isFinite(editQuizId) ? `edit_${editQuizId}` : "new";
  const draftStorageKey = useMemo(() => getDraftStorageKey(role, draftScope), [role, draftScope]);
  const editReturnStorageKey = useMemo(() => getEditReturnStorageKey(role), [role]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingQuiz, setLoadingQuiz] = useState(false);
  const [title, setTitle] = useState("Untitled Quiz");
  const [description, setDescription] = useState("");
  const [timeLimit, setTimeLimit] = useState("");
  const [maxAttempts, setMaxAttempts] = useState(1);
  const [questions, setQuestions] = useState([]);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const [validationErrors, setValidationErrors] = useState({});
  const titleInputRef = useRef(null);
  const descriptionEditorRef = useRef(null);
  const timeLimitInputRef = useRef(null);
  const maxAttemptsInputRef = useRef(null);
  const promptEditorRefs = useRef(new Map());
  const optionInputRefs = useRef(new Map());
  const trueFalseRefs = useRef(new Map());

  useEffect(() => {
    let active = true;

    const applyDraft = (parsedDraft) => {
      if (typeof parsedDraft?.title === "string") setTitle(parsedDraft.title || "Untitled Quiz");
      if (typeof parsedDraft?.description === "string") setDescription(parsedDraft.description);
      if (typeof parsedDraft?.timeLimit === "string") setTimeLimit(parsedDraft.timeLimit);
      if (typeof parsedDraft?.maxAttempts !== "undefined") {
        setMaxAttempts(toRangedInt(parsedDraft.maxAttempts, 1, 0, 20));
      }
      setQuestions(normalizeDraftQuestions(parsedDraft?.questions));
    };

    const hydrate = async () => {
      setDraftHydrated(false);
      setLoadingQuiz(false);

      const rawDraft = localStorage.getItem(draftStorageKey);
      if (rawDraft) {
        try {
          const parsed = JSON.parse(rawDraft);
          if (!active) return;
          applyDraft(parsed);
          setDraftHydrated(true);
          return;
        } catch {
          localStorage.removeItem(draftStorageKey);
        }
      }

      if (isEditMode) {
        if (!Number.isFinite(editQuizId) || Number(editQuizId) <= 0) {
          if (active) {
            await showError("Edit Quiz Failed", "Quiz ID is invalid.");
            onNavigate(quizzesBasePath);
          }
          return;
        }

        setLoadingQuiz(true);
        try {
          const response = isAdmin
            ? await getAdminQuizById(editQuizId)
            : await getTeacherQuizById(editQuizId);

          if (!active) return;
          const quiz = response?.quiz;
          if (!quiz) {
            await showError("Edit Quiz Failed", "Quiz not found.");
            onNavigate(quizzesBasePath);
            return;
          }

          setTitle(String(quiz.title || "Untitled Quiz"));
          setDescription(String(quiz.description || ""));
          setTimeLimit(quiz.time_limit_seconds ? String(quiz.time_limit_seconds) : "");
          setMaxAttempts(toRangedInt(quiz.max_attempts, 1, 0, 20));

          const loadedQuestions = Array.isArray(quiz.questions)
            ? quiz.questions
            : Array.isArray(quiz.questions_preview)
              ? quiz.questions_preview
              : [];
          setQuestions(normalizeLoadedQuizQuestions(loadedQuestions));
        } catch (error) {
          if (!active) return;
          await showError("Edit Quiz Failed", error?.data?.message || "Unable to load blank quiz.");
          onNavigate(quizzesBasePath);
          return;
        } finally {
          if (active) setLoadingQuiz(false);
        }
      } else {
        if (!active) return;
        setTitle("Untitled Quiz");
        setDescription("");
        setTimeLimit("");
        setMaxAttempts(1);
        setQuestions([]);
      }

      if (active) setDraftHydrated(true);
    };

    hydrate();
    return () => {
      active = false;
    };
  }, [draftStorageKey, isEditMode, editQuizId, isAdmin, onNavigate, quizzesBasePath]);

  useEffect(() => {
    if (!draftHydrated) return;

    const draftPayload = {
      title,
      description,
      timeLimit,
      maxAttempts,
      questions: stripFilesFromQuestions(questions)
    };

    localStorage.setItem(draftStorageKey, JSON.stringify(draftPayload));
  }, [draftHydrated, draftStorageKey, title, description, timeLimit, maxAttempts, questions]);

  const canSave = useMemo(() => {
    return !submitting && title.trim() && questions.length > 0;
  }, [questions.length, submitting, title]);

  const addQuestion = (type) => {
    setQuestions((prev) => [...prev, createQuestion(type)]);
  };

  const clearValidationError = (key) => {
    setValidationErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const clearQuestionValidationErrors = (questionId) => {
    const prefix = `q:${questionId}:`;
    setValidationErrors((prev) => {
      const keys = Object.keys(prev);
      if (!keys.some((key) => key.startsWith(prefix))) return prev;

      const next = { ...prev };
      keys.forEach((key) => {
        if (key.startsWith(prefix)) delete next[key];
      });
      return next;
    });
  };

  const setPromptEditorRef = (questionId, element) => {
    if (element) {
      promptEditorRefs.current.set(questionId, element);
      return;
    }
    promptEditorRefs.current.delete(questionId);
  };

  const setOptionInputRef = (questionId, optionId, element) => {
    const key = `${questionId}:${optionId}`;
    if (element) {
      optionInputRefs.current.set(key, element);
      return;
    }
    optionInputRefs.current.delete(key);
  };

  const setTrueFalseRef = (questionId, element) => {
    if (element) {
      trueFalseRefs.current.set(questionId, element);
      return;
    }
    trueFalseRefs.current.delete(questionId);
  };

  const focusValidationTarget = (target) => {
    if (!target) return;

    let element = null;
    if (target.type === "title") {
      element = titleInputRef.current;
    } else if (target.type === "description") {
      const wrapper = descriptionEditorRef.current;
      element = wrapper?.querySelector('[contenteditable="true"]') ?? wrapper;
    } else if (target.type === "time_limit") {
      element = timeLimitInputRef.current;
    } else if (target.type === "max_attempts") {
      element = maxAttemptsInputRef.current;
    } else if (target.type === "prompt") {
      const wrapper = promptEditorRefs.current.get(target.questionId);
      element = wrapper?.querySelector('[contenteditable="true"]') ?? wrapper;
    } else if (target.type === "option") {
      element = optionInputRefs.current.get(`${target.questionId}:${target.optionId}`);
    } else if (target.type === "true_false") {
      const wrapper = trueFalseRefs.current.get(target.questionId);
      element = wrapper?.querySelector("button") ?? wrapper;
    }

    if (!element) return;

    if (typeof element.scrollIntoView === "function") {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    if (typeof element.focus === "function") {
      window.setTimeout(() => element.focus(), 0);
    }
  };

  const setQuestionType = (questionId, nextType) => {
    clearQuestionValidationErrors(questionId);
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId ? convertQuestionToType(question, nextType) : question
      )
    );
  };

  const removeQuestion = (questionId) => {
    clearQuestionValidationErrors(questionId);
    setQuestions((prev) => prev.filter((question) => question.id !== questionId));
  };

  const updateQuestion = (questionId, field, value) => {
    if (field === "prompt") {
      clearValidationError(getPromptErrorKey(questionId));
    }
    setQuestions((prev) =>
      prev.map((question) => (question.id === questionId ? { ...question, [field]: value } : question))
    );
  };

  const setQuestionImageFile = async (questionId, file, inputEl) => {
    if (!file) {
      updateQuestion(questionId, "image_file", null);
      if (inputEl) inputEl.value = "";
      return;
    }

    if (!isAllowedImageFile(file)) {
      updateQuestion(questionId, "image_file", null);
      if (inputEl) inputEl.value = "";
      await showWarning("Invalid File", "Only image files are allowed.");
      return;
    }

    updateQuestion(questionId, "image_file", file);
  };

  const setOptionImageFile = async (questionId, optionId, file, inputEl) => {
    if (!file) {
      updateOption(questionId, optionId, "image_file", null);
      if (inputEl) inputEl.value = "";
      return;
    }

    if (!isAllowedImageFile(file)) {
      updateOption(questionId, optionId, "image_file", null);
      if (inputEl) inputEl.value = "";
      await showWarning("Invalid File", "Only image files are allowed.");
      return;
    }

    updateOption(questionId, optionId, "image_file", file);
  };

  const setQuestionVideoFile = async (questionId, file, inputEl) => {
    if (!file) {
      updateQuestion(questionId, "video_file", null);
      if (inputEl) inputEl.value = "";
      return;
    }

    if (!isAllowedVideoFile(file)) {
      updateQuestion(questionId, "video_file", null);
      if (inputEl) inputEl.value = "";
      await showWarning("Invalid File", "Only video files (mp4/webm/mov/mkv) are allowed.");
      return;
    }

    updateQuestion(questionId, "video_file", file);
    updateQuestion(questionId, "video_url", "");
  };

  const validateAndFixVideoUrl = async (questionId, value) => {
    const trimmed = String(value ?? "").trim();

    if (trimmed === "") {
      if (value !== "") {
        updateQuestion(questionId, "video_url", "");
      }
      return;
    }

    if (!isAllowedVideoUrl(trimmed)) {
      updateQuestion(questionId, "video_url", "");
      await showWarning(
        "Invalid Link",
        "Only valid video links are allowed (YouTube/Vimeo or direct .mp4/.webm/.mov/.mkv)."
      );
      return;
    }

    if (trimmed !== value) {
      updateQuestion(questionId, "video_url", trimmed);
    }
  };

  const addOption = (questionId) => {
    setQuestions((prev) =>
      prev.map((question) =>
        question.id === questionId
          ? { ...question, options: [...question.options, createOption("")] }
          : question
      )
    );
  };

  const removeOption = (questionId, optionId) => {
    clearValidationError(getOptionErrorKey(questionId, optionId));
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) return question;
        if (question.question_type === "true_false") return question;

        const minOptions =
          question.question_type === "short_answer"
            ? 1
            : question.question_type === "mcq_single"
              ? 4
              : 2;
        if (question.options.length <= minOptions) return question;

        return {
          ...question,
          options: question.options.filter((option) => option.id !== optionId)
        };
      })
    );
  };

  const updateOption = (questionId, optionId, field, value) => {
    if (field === "text") {
      clearValidationError(getOptionErrorKey(questionId, optionId));
    }
    if (field === "is_correct") {
      clearValidationError(getTrueFalseErrorKey(questionId));
    }
    setQuestions((prev) =>
      prev.map((question) => {
        if (question.id !== questionId) return question;

        if (field === "is_correct") {
          if (question.question_type === "mcq_single") {
            const selectedOption = question.options.find((option) => option.id === optionId);
            const isCurrentlySelected = Boolean(selectedOption?.is_correct);

            if (isCurrentlySelected) {
              const selectedCount = question.options.filter((option) => option.is_correct).length;
              if (selectedCount <= 1) {
                return question;
              }
              return {
                ...question,
                options: question.options.map((option) =>
                  option.id === optionId ? { ...option, is_correct: false } : option
                )
              };
            }

            return {
              ...question,
              options: question.options.map((option) =>
                option.id === optionId ? { ...option, is_correct: true } : option
              )
            };
          }

          return {
            ...question,
            options: question.options.map((option) => ({
              ...option,
              is_correct: option.id === optionId
            }))
          };
        }

        return {
          ...question,
          options: question.options.map((option) =>
            option.id === optionId ? { ...option, [field]: value } : option
          )
        };
      })
    );
  };

  const validateBeforeSave = () => {
    const errors = {};
    let firstInvalidTarget = null;

    const addError = (key, message, target) => {
      if (!errors[key]) {
        errors[key] = message;
      }
      if (!firstInvalidTarget && target) {
        firstInvalidTarget = target;
      }
    };

    if (!title.trim()) {
      addError(TITLE_ERROR_KEY, "Please fill this field.", { type: "title" });
    }

    if (isRichTextEffectivelyEmpty(description)) {
      addError(DESCRIPTION_ERROR_KEY, "Please fill this field.", { type: "description" });
    }

    const parsedTimeLimit = Number(timeLimit);
    if (!Number.isFinite(parsedTimeLimit) || parsedTimeLimit < 30) {
      addError(TIME_LIMIT_ERROR_KEY, "Time limit must be at least 30 seconds.", { type: "time_limit" });
    }

    const parsedMaxAttempts = Number(maxAttempts);
    if (!Number.isInteger(parsedMaxAttempts) || parsedMaxAttempts < 0 || parsedMaxAttempts > 20) {
      addError(MAX_ATTEMPTS_ERROR_KEY, "Max attempts must be between 0 and 20.", { type: "max_attempts" });
    }

    if (questions.length === 0) {
      return {
        isValid: false,
        errors,
        firstInvalidTarget,
        message: "Add at least one question."
      };
    }

    for (let i = 0; i < questions.length; i += 1) {
      const question = questions[i];
      const videoUrl = String(question.video_url ?? "").trim();
      if (isRichTextEffectivelyEmpty(question.prompt)) {
        addError(getPromptErrorKey(question.id), "Please fill this field.", {
          type: "prompt",
          questionId: question.id
        });
      }

      if (parseQuestionPoints(question.points) === null) {
        return {
          isValid: false,
          errors,
          firstInvalidTarget,
          message: `Question ${i + 1}: points must be a number greater than 0.`
        };
      }

      if (!question.video_file && videoUrl !== "" && !isAllowedVideoUrl(videoUrl)) {
        return {
          isValid: false,
          errors,
          firstInvalidTarget,
          message: `Question ${i + 1}: video link must be a valid video URL (YouTube/Vimeo or direct .mp4/.webm/.mov/.mkv).`
        };
      }

      if (question.question_type === "mcq_single") {
        if (question.options.length < 4) {
          return {
            isValid: false,
            errors,
            firstInvalidTarget,
            message: `Question ${i + 1}: add options A, B, C and D.`
          };
        }

        const requiredOptions = question.options.slice(0, 4);
        requiredOptions.forEach((option) => {
          if (isRichTextEffectivelyEmpty(option.text)) {
            addError(getOptionErrorKey(question.id, option.id), "Please fill this field.", {
              type: "option",
              questionId: question.id,
              optionId: option.id
            });
          }
        });

        const correctCount = requiredOptions.filter(
          (option) => !isRichTextEffectivelyEmpty(option.text) && option.is_correct
        ).length;
        if (correctCount < 1) {
          return {
            isValid: false,
            errors,
            firstInvalidTarget:
              firstInvalidTarget ??
              (requiredOptions[0]
                ? {
                    type: "option",
                    questionId: question.id,
                    optionId: requiredOptions[0].id
                  }
                : null),
            message: `Question ${i + 1}: choose at least 1 correct answer.`
          };
        }

        continue;
      }

      if (question.question_type === "true_false") {
        const validOptions = question.options.filter((option) =>
          !isRichTextEffectivelyEmpty(option.text)
        );
        if (validOptions.length < 2) {
          return {
            isValid: false,
            errors,
            firstInvalidTarget,
            message: `Question ${i + 1}: true/false options are required.`
          };
        }

        const correctCount = validOptions.filter((option) => option.is_correct).length;
        if (correctCount !== 1) {
          addError(getTrueFalseErrorKey(question.id), "Please fill this field.", {
            type: "true_false",
            questionId: question.id
          });
        }
        continue;
      }

      if (question.question_type === "short_answer") {
        const firstFilledOption = question.options.find((option) => option.text.trim() !== "");
        if (!firstFilledOption) {
          const firstOption = question.options[0];
          if (firstOption) {
            addError(getOptionErrorKey(question.id, firstOption.id), "Please fill this field.", {
              type: "option",
              questionId: question.id,
              optionId: firstOption.id
            });
          } else {
            return {
              isValid: false,
              errors,
              firstInvalidTarget,
              message: `Question ${i + 1}: add at least one short answer.`
            };
          }
        }
        continue;
      }

      if (question.question_type !== "short_answer") {
        const validOptions = question.options.filter((option) =>
          !isRichTextEffectivelyEmpty(option.text)
        );
        if (validOptions.length < 2) {
          return {
            isValid: false,
            errors,
            firstInvalidTarget,
            message: `Question ${i + 1}: add at least 2 options.`
          };
        }

        const correctCount = validOptions.filter((option) => option.is_correct).length;
        if (correctCount !== 1) {
          return {
            isValid: false,
            errors,
            firstInvalidTarget,
            message: `Question ${i + 1}: choose one correct answer.`
          };
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        isValid: false,
        errors,
        firstInvalidTarget,
        message: "Please fill the required fields."
      };
    }

    return {
      isValid: true,
      errors: {},
      firstInvalidTarget: null,
      message: ""
    };
  };

  const clearDraftAndReset = () => {
    localStorage.removeItem(draftStorageKey);
    setTitle("Untitled Quiz");
    setDescription("");
    setTimeLimit("");
    setMaxAttempts(1);
    setQuestions([]);
    setValidationErrors({});
  };

  const handleCancelDraft = async () => {
    const confirm = await showConfirm({
      title: "Cancel Draft?",
      text: "This will clear your saved blank quiz draft.",
      confirmText: "Yes, Clear",
      cancelText: "Keep Draft"
    });
    if (!confirm.isConfirmed) return;

    clearDraftAndReset();
    await showSuccess("Draft Cleared", "Blank quiz draft has been removed.");
  };

  const handleSave = async () => {
    const validation = validateBeforeSave();
    if (!validation.isValid) {
      setValidationErrors(validation.errors);
      if (validation.firstInvalidTarget) {
        focusValidationTarget(validation.firstInvalidTarget);
      }
      await showWarning("Validation", validation.message || "Please fill the required fields.");
      return;
    }
    setValidationErrors({});

    setSubmitting(true);
    try {
      const formData = new FormData();
      const normalizedDescription = normalizeRichTextValue(description);
      const parsedTimeLimit = Math.floor(Number(timeLimit));
      const parsedMaxAttempts = Math.floor(Number(maxAttempts));
      const resolvedStatus = parsedMaxAttempts === 0 ? "archived" : "draft";

      formData.append("title", title.trim());
      formData.append("description", normalizedDescription);
      formData.append("status", resolvedStatus);
      formData.append("max_attempts", String(parsedMaxAttempts));
      formData.append("time_limit_seconds", String(parsedTimeLimit));

      const questionsPayload = questions.map((question, questionIndex) => {
        if (question.image_file) {
          formData.append(`question_image_${questionIndex}`, question.image_file);
        }
        if (question.video_file) {
          formData.append(`question_video_${questionIndex}`, question.video_file);
        }

        const options = question.options
          .map((option, optionIndex) => {
            if (option.image_file) {
              formData.append(`option_image_${questionIndex}_${optionIndex}`, option.image_file);
            }

            const nextText =
              question.question_type === "short_answer"
                ? option.text.trim()
                : normalizeRichTextValue(option.text);

            return {
              text: nextText,
              is_correct: Boolean(option.is_correct)
            };
          })
          .filter((option) => option.text !== "");

        return {
          question_type: question.question_type,
          prompt: normalizeRichTextValue(question.prompt),
          points: parseQuestionPoints(question.points) ?? 1,
          explanation: normalizeRichTextValue(question.explanation) || null,
          video_url: question.video_url.trim() || null,
          options: question.question_type === "short_answer" ? [] : options
        };
      });

      formData.append("questions_json", JSON.stringify(questionsPayload));

      if (isEditMode && Number.isFinite(editQuizId) && Number(editQuizId) > 0) {
        if (isAdmin) {
          await updateAdminBlankQuiz(editQuizId, formData);
        } else {
          await updateTeacherBlankQuiz(editQuizId, formData);
        }
      } else {
        if (isAdmin) {
          await createAdminBlankQuiz(formData);
        } else {
          await createTeacherBlankQuiz(formData);
        }
      }

      localStorage.removeItem(draftStorageKey);
      const returnPath = localStorage.getItem(editReturnStorageKey);
      if (isEditMode) localStorage.removeItem(editReturnStorageKey);

      await showSuccess("Saved", isEditMode ? "Quiz updated successfully." : "Quiz and questions saved successfully.");
      onNavigate(returnPath || quizzesBasePath);
    } catch (error) {
      const text =
        formatValidationErrors(error?.data?.errors) ||
        error?.data?.message ||
        "Unable to save blank quiz.";
      await showError("Save Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingQuiz) {
    return (
      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
        Loading quiz for editing...
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-[280px] flex-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {isEditMode ? "Edit Quiz Builder" : "Quiz Builder"}
            </p>
            <input
              ref={titleInputRef}
              value={title}
              onChange={(event) => {
                clearValidationError(TITLE_ERROR_KEY);
                setTitle(event.target.value);
              }}
              className={`mt-2 w-full rounded-2xl border-2 px-4 py-3 text-5xl font-bold text-[#1e293b] outline-none ${
                validationErrors[TITLE_ERROR_KEY]
                  ? "border-red-500 focus:border-red-500"
                  : "border-[#0ea5e9] focus:border-[#0284c7]"
              }`}
              placeholder="Untitled Quiz"
            />
            {validationErrors[TITLE_ERROR_KEY] ? (
              <p className="mt-1 text-sm font-medium text-red-600">{validationErrors[TITLE_ERROR_KEY]}</p>
            ) : null}
            <p className="mt-2 text-sm text-slate-500">Name your quiz and then add blank questions below.</p>
          </div>

          <div className="w-full max-w-[360px] space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
              <div ref={descriptionEditorRef}>
                <RichTextEditor
                  value={description}
                  onChange={(nextValue) => {
                    clearValidationError(DESCRIPTION_ERROR_KEY);
                    setDescription(nextValue);
                  }}
                  placeholder="Write quiz description..."
                  minHeight={110}
                  compact
                  className={validationErrors[DESCRIPTION_ERROR_KEY] ? "border-red-500" : ""}
                />
              </div>
              {validationErrors[DESCRIPTION_ERROR_KEY] ? (
                <p className="mt-1 text-xs font-medium text-red-600">{validationErrors[DESCRIPTION_ERROR_KEY]}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Time Limit (sec)</label>
              <input
                ref={timeLimitInputRef}
                type="number"
                min={30}
                value={timeLimit}
                onChange={(event) => {
                  clearValidationError(TIME_LIMIT_ERROR_KEY);
                  setTimeLimit(event.target.value);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 ${
                  validationErrors[TIME_LIMIT_ERROR_KEY]
                    ? "border-red-500 focus:border-red-500"
                    : "border-slate-300 focus:border-[#1E3A8A]"
                }`}
              />
              {validationErrors[TIME_LIMIT_ERROR_KEY] ? (
                <p className="mt-1 text-xs font-medium text-red-600">{validationErrors[TIME_LIMIT_ERROR_KEY]}</p>
              ) : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">Max Attempts</label>
              <input
                ref={maxAttemptsInputRef}
                type="number"
                min={0}
                max={20}
                value={maxAttempts}
                onChange={(event) => {
                  clearValidationError(MAX_ATTEMPTS_ERROR_KEY);
                  setMaxAttempts(event.target.value);
                }}
                className={`w-full rounded-xl border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-100 ${
                  validationErrors[MAX_ATTEMPTS_ERROR_KEY]
                    ? "border-red-500 focus:border-red-500"
                    : "border-slate-300 focus:border-[#1E3A8A]"
                }`}
              />
              {validationErrors[MAX_ATTEMPTS_ERROR_KEY] ? (
                <p className="mt-1 text-xs font-medium text-red-600">{validationErrors[MAX_ATTEMPTS_ERROR_KEY]}</p>
              ) : (
                <p className="mt-1 text-xs text-slate-500">Set `0` to cancel quiz access (archived).</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="text-3xl font-bold text-slate-800">Add Blank Question</h3>
        <div className="mt-6 flex flex-col items-center gap-4 pb-2">
          {QUESTION_TYPES.map((type) => (
            <button
              key={type.value}
              type="button"
              onClick={() => addQuestion(type.value)}
              className="w-full max-w-[360px] rounded-2xl bg-sky-100 px-8 py-4 text-4xl font-semibold text-sky-700 transition hover:bg-sky-200"
            >
              {type.label}
            </button>
          ))}
        </div>

      </section>

      {questions.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
          No question yet. Choose a question type above.
        </section>
      ) : null}

      {questions.map((question, questionIndex) => {
        const promptError = validationErrors[getPromptErrorKey(question.id)];
        const trueFalseError = validationErrors[getTrueFalseErrorKey(question.id)];
        const validOptions =
          question.question_type === "short_answer"
            ? question.options.filter((option) => option.text.trim() !== "")
            : question.options.filter((option) => !isRichTextEffectivelyEmpty(option.text));
        const correctCount = validOptions.filter((option) => option.is_correct).length;
        const hasValidCorrectCount =
          question.question_type === "mcq_single"
            ? correctCount >= 1
            : question.question_type === "true_false"
              ? correctCount === 1
              : true;
        const isReady =
          !isRichTextEffectivelyEmpty(question.prompt) &&
          (question.question_type === "short_answer" || (validOptions.length >= 2 && hasValidCorrectCount));

        const trueOption = question.options[0];
        const falseOption = question.options[1];

        return (
          <section key={question.id} className="rounded-[28px] border border-slate-200 bg-slate-100/80 p-4 md:p-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px_68px]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-[auto_auto_minmax(0,1fr)_170px] md:items-start">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-[3px] border-slate-400">
                    <span className="h-3 w-3 rounded-full bg-slate-300" />
                  </span>

                  <p className="text-[2.1rem] font-bold leading-none text-slate-700">{questionIndex + 1}.</p>

                  <div ref={(element) => setPromptEditorRef(question.id, element)} className="space-y-2">
                    <select
                      value={question.question_type}
                      onChange={(event) => setQuestionType(question.id, event.target.value)}
                      className="h-14 w-full max-w-[320px] rounded-xl border border-slate-200 bg-white px-4 text-lg font-semibold text-slate-600 outline-none focus:border-[#1E3A8A]"
                    >
                      {QUESTION_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>

                    <RichTextEditor
                      value={question.prompt}
                      onChange={(nextValue) => updateQuestion(question.id, "prompt", nextValue)}
                      placeholder={promptPlaceholder(question.question_type)}
                      minHeight={130}
                      className={`text-base ${promptError ? "border-red-500" : ""}`}
                    />
                    {promptError ? <p className="text-sm font-medium text-red-600">{promptError}</p> : null}
                  </div>

                  <div className="flex h-14 items-center rounded-xl border border-slate-200 bg-white px-4">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={question.points}
                      onChange={(event) =>
                        updateQuestion(
                          question.id,
                          "points",
                          event.target.value.replace(/[^0-9.]/g, "")
                        )
                      }
                      placeholder="1"
                      className="w-24 bg-transparent text-2xl font-semibold text-slate-700 outline-none"
                    />
                    <span className="ml-auto text-2xl text-slate-400">point</span>
                  </div>
                </div>

                {question.question_type === "mcq_single" ? (
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-slate-500">
                      Choose one or more correct answers.
                    </p>
                    {question.options.map((option, optionIndex) => {
                      const optionError = validationErrors[getOptionErrorKey(question.id, option.id)];
                      return (
                        <div
                          key={option.id}
                          className="grid gap-2 sm:grid-cols-[52px_44px_minmax(0,1fr)_52px_44px] sm:items-center"
                        >
                        <span
                          className={`inline-flex h-12 w-12 items-center justify-center rounded-full text-2xl font-bold ${
                            option.is_correct ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-700"
                          }`}
                        >
                          {getOptionLabel(optionIndex)}
                        </span>

                        <button
                          type="button"
                          onClick={() => {
                            updateOption(question.id, option.id, "is_correct", true);
                          }}
                          className={`inline-flex h-11 w-11 items-center justify-center rounded-full border-[3px] ${
                            option.is_correct
                              ? "border-emerald-500 bg-emerald-500 text-white"
                              : "border-slate-500 text-transparent"
                          }`}
                        >
                          <Check className="h-6 w-6" />
                        </button>

                        <div className="space-y-1">
                          <input
                            ref={(element) => setOptionInputRef(question.id, option.id, element)}
                            value={option.text}
                            onChange={(event) => updateOption(question.id, option.id, "text", event.target.value)}
                            placeholder={`Answer ${getOptionLabel(optionIndex)}`}
                            className={`h-12 w-full rounded-xl border bg-white px-4 text-2xl text-slate-700 outline-none placeholder:text-slate-400 ${
                              optionError ? "border-red-500 focus:border-red-500" : "border-slate-200 focus:border-[#1E3A8A]"
                            }`}
                          />
                          {optionError ? <p className="text-xs font-medium text-red-600">{optionError}</p> : null}
                        </div>

                        <label className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-sky-700">
                          <ImagePlus className="h-6 w-6" />
                          <input
                            type="file"
                            accept="image/*"
                            className="hidden"
                            onChange={(event) =>
                              setOptionImageFile(
                                question.id,
                                option.id,
                                event.target.files?.[0] ?? null,
                                event.target
                              )
                            }
                          />
                        </label>

                        <button
                          type="button"
                          onClick={() => removeOption(question.id, option.id)}
                          className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                          title="Remove option"
                        >
                          <X className="h-7 w-7" />
                        </button>
                        </div>
                      );
                    })}

                    <button
                      type="button"
                      onClick={() => addOption(question.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2 text-2xl font-semibold text-sky-700"
                    >
                      <Plus className="h-6 w-6" />
                      Add Answer
                    </button>
                  </div>
                ) : null}

                {question.question_type === "true_false" ? (
                  <div
                    ref={(element) => setTrueFalseRef(question.id, element)}
                    className={`flex flex-wrap gap-3 rounded-xl ${
                      trueFalseError ? "border border-red-500 p-2" : ""
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => updateOption(question.id, trueOption?.id, "is_correct", true)}
                      className={`h-16 min-w-[170px] rounded-2xl px-8 text-3xl font-bold ${
                        trueOption?.is_correct
                          ? "bg-emerald-500 text-white"
                          : "border border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      True
                    </button>
                    <button
                      type="button"
                      onClick={() => updateOption(question.id, falseOption?.id, "is_correct", true)}
                      className={`h-16 min-w-[170px] rounded-2xl px-8 text-3xl font-bold ${
                        falseOption?.is_correct
                          ? "bg-emerald-500 text-white"
                          : "border border-slate-200 bg-white text-slate-500"
                      }`}
                    >
                      False
                    </button>
                    {trueFalseError ? (
                      <p className="w-full text-sm font-medium text-red-600">{trueFalseError}</p>
                    ) : null}
                  </div>
                ) : null}

                {question.question_type === "short_answer" ? (
                  <div className="space-y-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      {question.options.map((option, optionIndex) => {
                        const optionError = validationErrors[getOptionErrorKey(question.id, option.id)];
                        return (
                          <div key={option.id} className="flex items-start gap-2">
                            <div className="w-full space-y-1">
                              <input
                                ref={(element) => setOptionInputRef(question.id, option.id, element)}
                                value={option.text}
                                onChange={(event) => updateOption(question.id, option.id, "text", event.target.value)}
                                placeholder={`Correct Answer (Option ${optionIndex + 1})`}
                                className={`h-12 w-full rounded-xl border bg-white px-4 text-2xl text-slate-700 outline-none placeholder:text-slate-400 ${
                                  optionError ? "border-red-500 focus:border-red-500" : "border-slate-200 focus:border-[#1E3A8A]"
                                }`}
                              />
                              {optionError ? <p className="text-xs font-medium text-red-600">{optionError}</p> : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => removeOption(question.id, option.id)}
                              className="inline-flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                            >
                              <X className="h-7 w-7" />
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => addOption(question.id)}
                      className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-2 text-2xl font-semibold text-sky-700"
                    >
                      <Plus className="h-6 w-6" />
                      Add Answer
                    </button>
                  </div>
                ) : null}

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-600">Explanation (optional)</label>
                  <RichTextEditor
                    value={question.explanation}
                    onChange={(nextValue) => updateQuestion(question.id, "explanation", nextValue)}
                    placeholder="An explanation, if you like."
                    minHeight={90}
                    compact
                  />
                </div>
              </div>

              <aside className="rounded-2xl border border-slate-200 bg-white p-5 text-center">
                <label
                  className="block cursor-pointer rounded-xl border border-dashed border-slate-300 px-4 py-10 text-sky-700 transition hover:bg-slate-50"
                  onDragOver={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    const file = event.dataTransfer?.files?.[0] ?? null;
                    void setQuestionImageFile(question.id, file);
                  }}
                >
                  <ImagePlus className="mx-auto h-10 w-10" />
                  <p className="mt-3 text-2xl font-semibold">Drag & Drop or Choose Image</p>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) =>
                      setQuestionImageFile(question.id, event.target.files?.[0] ?? null, event.target)
                    }
                  />
                  <span className="mt-2 block truncate text-sm text-slate-500">
                    {question.image_file?.name || "No image selected"}
                  </span>
                </label>

                <div className="my-4 h-px bg-slate-200" />

                <div className="rounded-xl border border-slate-200 px-4 py-6 text-sky-700">
                  <Video className="mx-auto h-10 w-10" />
                  <p className="mt-2 text-2xl font-semibold">Embed Video</p>
                  <input
                    value={question.video_url}
                    onChange={(event) => updateQuestion(question.id, "video_url", event.target.value)}
                    onBlur={(event) => void validateAndFixVideoUrl(question.id, event.target.value)}
                    placeholder="https://..."
                    className="mt-4 h-11 w-full rounded-lg border border-slate-300 px-3 text-base text-slate-700 outline-none focus:border-[#1E3A8A]"
                  />

                  <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                    <Video className="h-4 w-4" />
                    Upload video file
                    <input
                      type="file"
                      accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                      className="hidden"
                      onChange={(event) =>
                        setQuestionVideoFile(question.id, event.target.files?.[0] ?? null, event.target)
                      }
                    />
                  </label>
                  <span className="mt-2 block truncate text-sm text-slate-500">
                    {question.video_file?.name || "No video selected"}
                  </span>
                </div>
              </aside>

              <div className="flex flex-row gap-3 xl:flex-col">
                <button
                  type="button"
                  className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl ${
                    isReady ? "bg-sky-500 text-white" : "bg-slate-300 text-slate-500"
                  }`}
                  title={isReady ? "Question ready" : "Question incomplete"}
                >
                  <Check className="h-9 w-9" />
                </button>
                <button
                  type="button"
                  onClick={() => removeQuestion(question.id)}
                  className="inline-flex h-16 w-16 items-center justify-center rounded-2xl text-sky-700 hover:bg-slate-200"
                  title="Delete question"
                >
                  <Trash2 className="h-9 w-9" />
                </button>
              </div>
            </div>
          </section>
        );
      })}

      <div className="sticky bottom-3 z-20 flex justify-end">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancelDraft}
            className="inline-flex min-w-[170px] items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Cancel Draft
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-full bg-sky-100 px-8 py-3 text-2xl font-bold text-sky-800 transition hover:bg-sky-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-5 w-5" />
            {submitting ? "Saving..." : isEditMode ? "Save Changes" : "Save and Exit"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BlankQuizBuilderSection;
