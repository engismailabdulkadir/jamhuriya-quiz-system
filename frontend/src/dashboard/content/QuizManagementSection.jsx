import { useEffect, useMemo, useRef, useState } from "react";
import ContentSection from "../components/ContentSection.jsx";
import DataTable from "../components/DataTable.jsx";
import EmptyState from "../components/EmptyState.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { iconMap } from "../components/iconMap.js";
import RichTextEditor, { normalizeRichTextValue, isRichTextEffectivelyEmpty } from "../components/RichTextEditor.jsx";
import {
  createAdminQuiz,
  updateAdminBlankQuiz,
  createTeacherQuiz,
  deleteAdminQuiz,
  deleteTeacherQuiz,
  generateAdminQuizWithAi,
  generateTeacherQuizWithAi,
  getAdminQuizById,
  getAdminQuizzes,
  getTeacherQuizById,
  getTeacherQuizzes,
  updateTeacherBlankQuiz,
  updateAdminQuiz,
  updateTeacherQuiz,
  getAdminAttempts,
  getTeacherAttempts,
  getAdminRooms,
  getTeacherRooms
} from "../../services/api.js";
import { formatValidationErrors, showConfirm, showError, showSuccess, showWarning } from "../../utils/alerts.js";

const { Plus, X, ClipboardCheck, BookOpen, Eye, Pencil, Trash2, Search, Share2, GraduationCap, ChevronLeft } = iconMap;

const LAUNCH_DELIVERY_METHODS = [
  {
    value: "instant_feedback",
    label: "Instant Feedback",
    description:
      "Students answer questions in order and cannot change answers. Instant feedback is provided after each question. You monitor progress in a table of live results.",
    Icon: ClipboardCheck
  },
  {
    value: "open_navigation",
    label: "Open Navigation",
    description:
      "Students may answer questions in any order and change answers before finishing. You monitor progress in a table of live results.",
    Icon: Share2
  },
  {
    value: "teacher_paced",
    label: "Teacher Paced",
    description:
      "You control the flow of questions and monitor responses as they happen. You may skip and revisit questions.",
    Icon: GraduationCap
  }
];

const QUESTION_TYPE_OPTIONS = [
  { value: "mcq_single", label: "Multiple Choice" },
  { value: "true_false", label: "True / False" },
  { value: "short_answer", label: "Short Answer" }
];

const QUESTION_COUNT_OPTIONS = [5, 10, 15];

const initialForm = {
  title: "",
  description: "",
  time_limit_seconds: "",
  max_attempts: 1,
  status: "draft",
  shuffle_questions: false,
  shuffle_options: false,
  allow_back_navigation: true
};

const initialAiForm = {
  prompt: "",
  question_count: 10,
  question_types: ["mcq_single", "true_false", "short_answer"],
  generate_explanations: true,
  title: "",
  description: "",
  status: "draft",
  difficulty: "mixed",
  language: "English",
  time_limit_seconds: "",
  max_attempts: 1,
  shuffle_questions: false,
  shuffle_options: false,
  allow_back_navigation: true
};
const BLANK_EDIT_RETURN_KEY_PREFIX = "just_quizz_blank_quiz_edit_return";

function buildLaunchStateFromQuiz(quiz) {
  const savedSettings = quiz?.settings ?? {};
  const allowsBackNavigation = Boolean(quiz?.allow_back_navigation);
  const deliveryMethod = savedSettings.delivery_method || (allowsBackNavigation ? "open_navigation" : "instant_feedback");

  return {
    delivery_method: deliveryMethod,
    require_names: savedSettings.require_names ?? true,
    shuffle_questions: Boolean(quiz?.shuffle_questions),
    shuffle_answers: Boolean(quiz?.shuffle_options),
    show_question_feedback: savedSettings.show_question_feedback ?? deliveryMethod === "instant_feedback",
    show_final_score: savedSettings.show_final_score ?? false,
    one_attempt: Number(quiz?.max_attempts ?? 1) === 1,
    time_limit: Number(quiz?.time_limit_seconds ?? 0) >= 30
  };
}

function applyDeliveryMethodToLaunchState(currentState, nextMethod) {
  const nextState = {
    ...currentState,
    delivery_method: nextMethod
  };

  if (nextMethod === "instant_feedback") {
    nextState.show_question_feedback = true;
  } else {
    nextState.show_question_feedback = false;
  }

  if (nextMethod === "teacher_paced") {
    nextState.shuffle_questions = false;
  }

  return nextState;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatRelativeDate(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  const diffMs = date.getTime() - Date.now();
  const absSeconds = Math.round(Math.abs(diffMs) / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  if (absSeconds < 60) {
    return rtf.format(Math.round(diffMs / 1000), "second");
  }

  const absMinutes = Math.round(absSeconds / 60);
  if (absMinutes < 60) {
    return rtf.format(Math.round(diffMs / (60 * 1000)), "minute");
  }

  const absHours = Math.round(absMinutes / 60);
  if (absHours < 24) {
    return rtf.format(Math.round(diffMs / (60 * 60 * 1000)), "hour");
  }

  const absDays = Math.round(absHours / 24);
  if (absDays < 7) {
    return rtf.format(Math.round(diffMs / (24 * 60 * 60 * 1000)), "day");
  }

  const absWeeks = Math.round(absDays / 7);
  if (absWeeks < 5) {
    return rtf.format(Math.round(diffMs / (7 * 24 * 60 * 60 * 1000)), "week");
  }

  const absMonths = Math.round(absDays / 30);
  if (absMonths < 12) {
    return rtf.format(Math.round(diffMs / (30 * 24 * 60 * 60 * 1000)), "month");
  }

  return rtf.format(Math.round(diffMs / (365 * 24 * 60 * 60 * 1000)), "year");
}

function QuizManagementSection({ role, currentPath, onNavigate }) {
  const fileInputRef = useRef(null);
  const generatedRef = useRef(null);
  const isAdmin = role === "admin";
  const quizzesBasePath = isAdmin ? "/admin/quizzes" : "/teacher/quizzes";
  const blankEditReturnStorageKey = `${BLANK_EDIT_RETURN_KEY_PREFIX}_${role}`;
  const editPathPrefix = `${quizzesBasePath}/edit/`;
  const detailPathPrefix = `${quizzesBasePath}/details/`;

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [quizzes, setQuizzes] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [modalSearchInput, setModalSearchInput] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createStep, setCreateStep] = useState("chooser");
  const [form, setForm] = useState(initialForm);
  const [aiForm, setAiForm] = useState(initialAiForm);
  const [aiFile, setAiFile] = useState(null);
  const [generatedResult, setGeneratedResult] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [viewingQuiz, setViewingQuiz] = useState(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [selectedLaunchQuiz, setSelectedLaunchQuiz] = useState(null);
  const [launchConfig, setLaunchConfig] = useState(() => buildLaunchStateFromQuiz(null));
  const [launching, setLaunching] = useState(false);
  const [launchRooms, setLaunchRooms] = useState([]);
  const [launchRoomId, setLaunchRoomId] = useState("");
  const [launchRoomsLoading, setLaunchRoomsLoading] = useState(false);
  const [editingQuiz, setEditingQuiz] = useState(null);
  const [editForm, setEditForm] = useState(initialForm);
  const [editLoading, setEditLoading] = useState(false);
  const [editReturnPath, setEditReturnPath] = useState(quizzesBasePath);
  const [resultsQuiz, setResultsQuiz] = useState(null);
  const [resultsAttempts, setResultsAttempts] = useState([]);
  const [resultsLoading, setResultsLoading] = useState(false);
  const [resultsError, setResultsError] = useState("");

  const isAddPath = currentPath.endsWith("/quizzes/add");
  const isEditPath = currentPath.startsWith(editPathPrefix);
  const isDetailPath = currentPath.startsWith(detailPathPrefix);
  const resultsPathPrefix = `${quizzesBasePath}/results`;
  const isResultsPath = currentPath === resultsPathPrefix || currentPath.startsWith(`${resultsPathPrefix}/`);
  const resultQuizIdFromPath = currentPath.startsWith(`${resultsPathPrefix}/`)
    ? Number.parseInt(currentPath.slice(resultsPathPrefix.length + 1).split("/")[0], 10)
    : null;
  const editQuizIdFromPath = isEditPath
    ? Number.parseInt(currentPath.slice(editPathPrefix.length).split("/")[0], 10)
    : null;
  const detailQuizIdFromPath = isDetailPath
    ? Number.parseInt(currentPath.slice(detailPathPrefix.length).split("/")[0], 10)
    : null;
  const resolvedReturnPath = isAddPath ? quizzesBasePath : currentPath || quizzesBasePath;

  const columns = useMemo(
    () => [
      { key: "title", label: "Title" },
      { key: "status", label: "Status", type: "status" },
      { key: "time_limit_seconds", label: "Time Limit (sec)" },
      { key: "max_attempts", label: "Max Attempts" },
      { key: "created_at", label: "Created At" }
    ],
    []
  );

  const rows = quizzes.map((quiz) => ({
    id: quiz.id,
    title: quiz.title,
    status: quiz.status,
    time_limit_seconds: quiz.time_limit_seconds ?? "-",
    max_attempts: quiz.max_attempts ?? 1,
    created_at: formatDate(quiz.created_at),
    _raw: quiz
  }));

  const modalQuizRows = useMemo(() => {
    const query = modalSearchInput.trim().toLowerCase();

    return quizzes
      .filter((quiz) => {
        if (!query) return true;

        const title = String(quiz?.title ?? "").toLowerCase();
        const description = String(quiz?.description ?? "").toLowerCase();
        return title.includes(query) || description.includes(query);
      })
      .map((quiz) => ({
        id: quiz.id,
        title: String(quiz.title || "Untitled Quiz"),
        modifiedLabel: formatRelativeDate(quiz.updated_at || quiz.created_at),
        modifiedValue: formatDate(quiz.updated_at || quiz.created_at),
        _raw: quiz
      }));
  }, [modalSearchInput, quizzes]);

  const launchSettingRows = [
    {
      key: "require_names",
      label: "Require Names"
    },
    {
      key: "shuffle_questions",
      label: "Shuffle Questions"
    },
    {
      key: "shuffle_answers",
      label: "Shuffle Answers"
    },
    {
      key: "show_question_feedback",
      label: "Show Question Feedback"
    },
    {
      key: "show_final_score",
      label: "Show Final Score"
    },
    {
      key: "one_attempt",
      label: "One Attempt"
    },
    {
      key: "time_limit",
      label: "Time Limit"
    }
  ];

  useEffect(() => {
    if (isAddPath) {
      setShowCreateModal(true);
      setCreateStep("library");
    }
  }, [isAddPath]);

  useEffect(() => {
    if (!isEditPath || !editQuizIdFromPath || Number.isNaN(editQuizIdFromPath)) return;
    if (editingQuiz && Number(editingQuiz.id) === Number(editQuizIdFromPath)) return;

    let active = true;
    const loadQuizForEdit = async () => {
      setEditLoading(true);
      try {
        const response = isAdmin
          ? await getAdminQuizById(editQuizIdFromPath)
          : await getTeacherQuizById(editQuizIdFromPath);

        if (!active) return;
        const quiz = response?.quiz;
        if (!quiz) {
          await showError("Edit Quiz Failed", "Quiz not found.");
          onNavigate(editReturnPath || quizzesBasePath);
          return;
        }

        setEditingQuiz(quiz);
        setEditForm({
          title: quiz.title || "",
          description: quiz.description || "",
          time_limit_seconds: quiz.time_limit_seconds || "",
          max_attempts: quiz.max_attempts || 1,
          status: quiz.status || "draft",
          shuffle_questions: Boolean(quiz.shuffle_questions),
          shuffle_options: Boolean(quiz.shuffle_options),
          allow_back_navigation: Boolean(quiz.allow_back_navigation)
        });
      } catch (err) {
        if (!active) return;
        await showError("Edit Quiz Failed", err?.data?.message || "Unable to load quiz for editing.");
        onNavigate(editReturnPath || quizzesBasePath);
      } finally {
        if (active) setEditLoading(false);
      }
    };

    loadQuizForEdit();
    return () => {
      active = false;
    };
  }, [isEditPath, editQuizIdFromPath, editingQuiz, isAdmin, onNavigate, editReturnPath, quizzesBasePath]);

  useEffect(() => {
    if (!isDetailPath) {
      setViewingQuiz(null);
      return;
    }

    if (!detailQuizIdFromPath || Number.isNaN(detailQuizIdFromPath)) {
      showError("Quiz Details Failed", "Quiz ID is invalid.");
      onNavigate(quizzesBasePath);
      return;
    }

    let active = true;
    const loadQuizForView = async () => {
      setViewLoading(true);
      try {
        const response = isAdmin
          ? await getAdminQuizById(detailQuizIdFromPath)
          : await getTeacherQuizById(detailQuizIdFromPath);

        if (!active) return;
        const quiz = response?.quiz;
        if (!quiz) {
          await showError("Quiz Details Failed", "Quiz not found.");
          onNavigate(quizzesBasePath);
          return;
        }

        setViewingQuiz(quiz);
      } catch (err) {
        if (!active) return;
        await showError("Quiz Details Failed", err?.data?.message || "Unable to load quiz details.");
        onNavigate(quizzesBasePath);
      } finally {
        if (active) setViewLoading(false);
      }
    };

    loadQuizForView();
    return () => {
      active = false;
    };
  }, [isDetailPath, detailQuizIdFromPath, isAdmin, onNavigate, quizzesBasePath]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const response = isAdmin
          ? await getAdminQuizzes({ search: appliedSearch, status: "all" })
          : await getTeacherQuizzes({ search: appliedSearch, status: "all" });

        if (!active) return;
        setQuizzes(response?.quizzes ?? []);
      } catch (err) {
        if (!active) return;
        setError(err?.data?.message || "Failed to load quizzes.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, isAdmin, refreshKey]);

  useEffect(() => {
    if (!isResultsPath) {
      setResultsQuiz(null);
      setResultsAttempts([]);
      setResultsError("");
      return;
    }

    if (!resultQuizIdFromPath || Number.isNaN(resultQuizIdFromPath)) {
      setResultsQuiz(null);
      setResultsAttempts([]);
      setResultsError("");
      return;
    }

    let active = true;
    const loadResults = async () => {
      setResultsLoading(true);
      setResultsError("");

      try {
        const [quizResponse, attemptResponse] = await Promise.all([
          isAdmin ? getAdminQuizById(resultQuizIdFromPath) : getTeacherQuizById(resultQuizIdFromPath),
          isAdmin ? getAdminAttempts({ limit: 200, quiz_id: resultQuizIdFromPath }) : getTeacherAttempts({ limit: 200, quiz_id: resultQuizIdFromPath })
        ]);

        if (!active) return;

        const quiz = quizResponse?.quiz;
        if (!quiz) {
          setResultsError("Quiz not found.");
          setResultsQuiz(null);
          setResultsAttempts([]);
          return;
        }

        const attempts = Array.isArray(attemptResponse?.attempts) ? attemptResponse.attempts : [];
        setResultsQuiz(quiz);
        setResultsAttempts(attempts.filter((attempt) => Number(attempt.quiz_id) === resultQuizIdFromPath));
      } catch (err) {
        if (!active) return;
        setResultsError(err?.data?.message || "Unable to load live results.");
        setResultsQuiz(null);
        setResultsAttempts([]);
      } finally {
        if (active) setResultsLoading(false);
      }
    };

    loadResults();
    return () => {
      active = false;
    };
  }, [isResultsPath, resultQuizIdFromPath, isAdmin]);

  const reload = () => setRefreshKey((prev) => prev + 1);

  const openCreateModal = () => {
    setShowCreateModal(true);
    setCreateStep("library");
    setModalSearchInput("");
    if (!isAddPath) {
      onNavigate(`${quizzesBasePath}/add`);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateStep("library");
    setModalSearchInput("");
    setSelectedLaunchQuiz(null);
    setLaunchConfig(buildLaunchStateFromQuiz(null));
    setLaunching(false);
    setLaunchRoomId("");
    setLaunchRooms([]);
    setForm(initialForm);
    setAiForm(initialAiForm);
    setAiFile(null);
    setGeneratedResult(null);
    if (isAddPath) {
      onNavigate(quizzesBasePath);
    }
  };

  const onChange = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onAiChange = (event) => {
    const { name, value, type, checked } = event.target;
    setAiForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const toggleAiQuestionType = (typeName) => {
    setAiForm((prev) => {
      const exists = prev.question_types.includes(typeName);
      return {
        ...prev,
        question_types: exists
          ? prev.question_types.filter((item) => item !== typeName)
          : [...prev.question_types, typeName]
      };
    });
  };

  const selectAiQuestionCount = (count) => {
    setAiForm((prev) => ({ ...prev, question_count: count }));
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const onAiFileChange = (event) => {
    const file = event.target.files?.[0] ?? null;
    setAiFile(file);
  };

  const clearAiFile = () => {
    setAiFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const openBlankQuizForm = () => {
    setShowCreateModal(false);
    setCreateStep("library");
    setForm(initialForm);
    setAiForm(initialAiForm);
    setAiFile(null);
    setGeneratedResult(null);
    setSelectedLaunchQuiz(null);
    onNavigate(`${quizzesBasePath}/questions`);
  };

  const openCreateOptions = () => {
    setSelectedLaunchQuiz(null);
    setCreateStep("chooser");
  };

  const openAiQuizForm = () => {
    setCreateStep("ai");
    setGeneratedResult(null);
  };

  const showComingSoon = async (featureName) => {
    await showWarning("Coming Soon", `${featureName} option will be added next.`);
  };

  const handleGenerateQuizWithAi = async (event) => {
    event.preventDefault();

    if (!aiForm.prompt.trim()) {
      await showWarning("Prompt Required", "Please write what the questions should cover.");
      return;
    }

    if (aiForm.question_types.length === 0) {
      await showWarning("Question Type Required", "Select at least one question type.");
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append("prompt", aiForm.prompt.trim());
      payload.append("question_count", String(aiForm.question_count || 10));
      payload.append("generate_explanations", aiForm.generate_explanations ? "1" : "0");
      payload.append("status", "draft");
      payload.append("difficulty", aiForm.difficulty);
      payload.append("language", aiForm.language || "English");
      payload.append("max_attempts", String(aiForm.max_attempts || 1));
      payload.append("shuffle_questions", aiForm.shuffle_questions ? "1" : "0");
      payload.append("shuffle_options", aiForm.shuffle_options ? "1" : "0");
      payload.append("allow_back_navigation", aiForm.allow_back_navigation ? "1" : "0");

      if (aiForm.title.trim()) payload.append("title", aiForm.title.trim());
      if (!isRichTextEffectivelyEmpty(aiForm.description)) {
        payload.append("description", normalizeRichTextValue(aiForm.description));
      }
      if (aiForm.time_limit_seconds) payload.append("time_limit_seconds", String(aiForm.time_limit_seconds));

      for (const typeName of aiForm.question_types) {
        payload.append("question_types[]", typeName);
      }

      if (aiFile) {
        payload.append("context_file", aiFile);
      }

      const response = isAdmin
        ? await generateAdminQuizWithAi(payload)
        : await generateTeacherQuizWithAi(payload);

      const questionCount = response?.quiz?.question_count ?? aiForm.question_count;
      const generatedQuestions = response?.quiz?.questions ?? response?.quiz?.questions_preview ?? [];
      setGeneratedResult({
        quizId: response?.quiz?.id,
        title: response?.quiz?.title || "Generated Quiz",
        count: questionCount,
        questions: generatedQuestions
      });
      setTimeout(() => {
        generatedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "AI generation failed.";
      await showError("AI Generation Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateQuiz = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = {
        title: form.title,
        description: normalizeRichTextValue(form.description) || null,
        status: "draft",
        max_attempts: Number(form.max_attempts || 1),
        time_limit_seconds: form.time_limit_seconds ? Number(form.time_limit_seconds) : null,
        shuffle_questions: Boolean(form.shuffle_questions),
        shuffle_options: Boolean(form.shuffle_options),
        allow_back_navigation: Boolean(form.allow_back_navigation)
      };

      if (isAdmin) {
        await createAdminQuiz(payload);
      } else {
        await createTeacherQuiz(payload);
      }

      await showSuccess("Quiz Created", "Quiz has been created successfully.");
      closeCreateModal();
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Create quiz failed.";
      await showError("Create Quiz Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const onEditChange = (event) => {
    const { name, value, type, checked } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const openEditModal = (quiz) => {
    const editPath = `${quizzesBasePath}/questions/edit/${quiz.id}`;
    localStorage.setItem(blankEditReturnStorageKey, resolvedReturnPath);
    if (currentPath !== editPath) onNavigate(editPath);
  };

  const closeEditModal = () => {
    setEditingQuiz(null);
    setEditForm(initialForm);
    if (isEditPath) {
      onNavigate(editReturnPath || quizzesBasePath);
    }
  };

  const handleUpdateQuiz = async (event) => {
    event.preventDefault();
    if (!editingQuiz) return;

    const payload = {
      title: editForm.title,
      description: normalizeRichTextValue(editForm.description) || null,
      status: "draft",
      max_attempts: Number(editForm.max_attempts || 1),
      time_limit_seconds: editForm.time_limit_seconds ? Number(editForm.time_limit_seconds) : null,
      shuffle_questions: Boolean(editForm.shuffle_questions),
      shuffle_options: Boolean(editForm.shuffle_options),
      allow_back_navigation: Boolean(editForm.allow_back_navigation)
    };

    setSubmitting(true);
    try {
      if (isAdmin) {
        await updateAdminQuiz(editingQuiz.id, payload);
      } else {
        await updateTeacherQuiz(editingQuiz.id, payload);
      }
      await showSuccess("Quiz Updated", "Quiz updated successfully.");
      closeEditModal();
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Update quiz failed.";
      await showError("Update Quiz Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteQuiz = async (quiz) => {
    const confirm = await showConfirm({
      title: "Delete Quiz?",
      text: `Quiz "${quiz.title}" will be deleted permanently.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmButtonColor: "#fd7e14"
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      if (isAdmin) {
        await deleteAdminQuiz(quiz.id);
      } else {
        await deleteTeacherQuiz(quiz.id);
      }
      await showSuccess("Quiz Deleted", "Quiz deleted successfully.");
      reload();
    } catch (err) {
      await showError("Delete Failed", err?.data?.message || "Unable to delete quiz.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleViewQuiz = (quiz) => {
    const blankQuestionPath = `${quizzesBasePath}/questions/edit/${quiz.id}`;
    localStorage.setItem(blankEditReturnStorageKey, resolvedReturnPath);
    if (currentPath !== blankQuestionPath) {
      onNavigate(blankQuestionPath);
    }
  };

  const handleViewQuizFromLibrary = (quiz) => {
    setSelectedLaunchQuiz(quiz);
    setLaunchConfig(buildLaunchStateFromQuiz(quiz));
    setLaunchRoomId(quiz.room_id ? String(quiz.room_id) : "");
    setCreateStep("launch");
  };

  const closeLaunchStep = () => {
    setSelectedLaunchQuiz(null);
    setLaunchConfig(buildLaunchStateFromQuiz(null));
    setLaunching(false);
    setCreateStep("library");
    setLaunchRoomId("");
    setLaunchRooms([]);
  };

  const fetchLaunchRooms = async () => {
    setLaunchRoomsLoading(true);
    try {
      const response = isAdmin ? await getAdminRooms({ status: "active" }) : await getTeacherRooms({ status: "active" });
      const fetchedRooms = Array.isArray(response?.rooms) ? response.rooms : [];
      setLaunchRooms(fetchedRooms);
      if (selectedLaunchQuiz?.room_id) {
        setLaunchRoomId(String(selectedLaunchQuiz.room_id));
      } else if (!launchRoomId && fetchedRooms.length > 0) {
        setLaunchRoomId(String(fetchedRooms[0].id));
      }
    } catch (err) {
      // ignore silently; user can still choose room if this fails
    } finally {
      setLaunchRoomsLoading(false);
    }
  };

  useEffect(() => {
    if (selectedLaunchQuiz && createStep === "launch") {
      fetchLaunchRooms();
    }
  }, [selectedLaunchQuiz, createStep, isAdmin]);

  const chooseLaunchDeliveryMethod = (deliveryMethod) => {
    setLaunchConfig((currentState) => applyDeliveryMethodToLaunchState(currentState, deliveryMethod));
  };

  const toggleLaunchSetting = (key, disabled = false) => {
    if (disabled) return;

    setLaunchConfig((currentState) => ({
      ...currentState,
      [key]: !currentState[key]
    }));
  };

  const handleLaunchQuizPreview = async () => {
    if (!selectedLaunchQuiz) return;

    if (!launchRoomId) {
      await showWarning("Room Required", "Please select a room or class before launching the quiz.");
      return;
    }

    const payload = {
      title: selectedLaunchQuiz.title || "",
      description: selectedLaunchQuiz.description ?? null,
      room_id: Number(launchRoomId),
      shuffle_questions: Boolean(launchConfig.shuffle_questions),
      shuffle_options: Boolean(launchConfig.shuffle_answers),
      allow_back_navigation: launchConfig.delivery_method === "open_navigation",
      max_attempts: launchConfig.one_attempt
        ? 1
        : Math.max(Number(selectedLaunchQuiz.max_attempts || 2), 2),
      time_limit_seconds: launchConfig.time_limit
        ? Number(selectedLaunchQuiz.time_limit_seconds || 30)
        : null,
      settings: {
        delivery_method: launchConfig.delivery_method,
        require_names: Boolean(launchConfig.require_names),
        show_question_feedback: Boolean(launchConfig.show_question_feedback),
        show_final_score: Boolean(launchConfig.show_final_score)
      },
      status: "published"
    };

    setLaunching(true);
    try {
      const response = isAdmin
        ? await updateAdminQuiz(selectedLaunchQuiz.id, payload)
        : await updateTeacherQuiz(selectedLaunchQuiz.id, payload);

      await showSuccess(
        "Quiz Launched",
        `Quiz "${selectedLaunchQuiz.title || "Quiz"}" has been saved and published.`
      );

      closeCreateModal();
      reload();
      onNavigate(`${quizzesBasePath}/results/${response?.quiz?.id ?? selectedLaunchQuiz.id}`);
    } catch (err) {
      await showError("Launch Failed", err?.data?.message || "Unable to save quiz launch settings.");
    } finally {
      setLaunching(false);
    }
  };

  const normalizeDetailQuestionsForUpdate = (rawQuestions) => {
    return (rawQuestions ?? []).map((question) => {
      const questionType = String(question?.question_type ?? "mcq_single");
      const rawOptions = Array.isArray(question?.options) ? question.options : [];

      const normalizedOptions = rawOptions
        .map((option) => ({
          text: normalizeRichTextValue(option?.text ?? option?.option_text ?? ""),
          is_correct: Boolean(option?.is_correct)
        }))
        .filter((option) => !isRichTextEffectivelyEmpty(option.text));

      return {
        question_type: questionType,
        prompt: normalizeRichTextValue(question?.prompt ?? ""),
        points: Number(question?.points || 1),
        explanation: normalizeRichTextValue(question?.explanation ?? "") || null,
        video_url: String(question?.video_url ?? "").trim() || null,
        options: questionType === "short_answer" ? [] : normalizedOptions
      };
    });
  };

  const handleDeleteQuestionFromDetails = async (questionIndex) => {
    if (!viewingQuiz) return;

    const currentQuestions = viewingQuiz.questions ?? viewingQuiz.questions_preview ?? [];
    if (currentQuestions.length <= 1) {
      await showWarning("Cannot Delete", "Quiz must keep at least one question.");
      return;
    }

    const confirm = await showConfirm({
      title: "Delete Question?",
      text: "This question will be removed from the quiz.",
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmButtonColor: "#fd7e14"
    });

    if (!confirm.isConfirmed) return;

    const nextQuestions = currentQuestions.filter((_, index) => index !== questionIndex);
    const payloadQuestions = normalizeDetailQuestionsForUpdate(nextQuestions);

    setSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("title", String(viewingQuiz.title || "").trim() || "Untitled Quiz");
      formData.append("description", normalizeRichTextValue(viewingQuiz.description) || "");
      formData.append("status", String(viewingQuiz.status || "draft"));
      formData.append("max_attempts", String(Number(viewingQuiz.max_attempts || 1)));
      formData.append("shuffle_questions", viewingQuiz.shuffle_questions ? "1" : "0");
      formData.append("shuffle_options", viewingQuiz.shuffle_options ? "1" : "0");
      formData.append("allow_back_navigation", viewingQuiz.allow_back_navigation ? "1" : "0");
      if (viewingQuiz.time_limit_seconds) {
        formData.append("time_limit_seconds", String(Number(viewingQuiz.time_limit_seconds)));
      }
      formData.append("questions_json", JSON.stringify(payloadQuestions));

      const response = isAdmin
        ? await updateAdminBlankQuiz(viewingQuiz.id, formData)
        : await updateTeacherBlankQuiz(viewingQuiz.id, formData);

      setViewingQuiz(response?.quiz ?? viewingQuiz);
      await showSuccess("Question Deleted", "Question removed successfully.");
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Unable to delete question.";
      await showError("Delete Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const actionButtonBase = "flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110 hover:brightness-95";
  const actionButtonStyle = {
    width: 38,
    height: 38,
    borderRadius: "50%",
    boxShadow: "0 6px 14px rgba(15,23,42,0.14)"
  };

  if (loading) {
    return <LoadingState text="Loading quizzes..." />;
  }

  if (error) {
    return (
      <ContentSection title="Quizzes Error" subtitle="Unable to load quizzes right now.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  if (isResultsPath) {
    if (resultsLoading) {
      return <LoadingState text="Loading live results..." />;
    }

    const resultsTitle = resultQuizIdFromPath && resultsQuiz ? `Live Results - ${resultsQuiz.title || "Quiz"}` : "Live Results";
    const resultsSubtitle = resultQuizIdFromPath
      ? "Review the latest attempt activity and scores for this quiz."
      : "Select a quiz from the list to view its live results.";
    const resultsRows = resultsAttempts.map((attempt) => ({
      id: attempt.id,
      attempt_no: attempt.attempt_no,
      student_name: attempt.student_name,
      status: attempt.status,
      score: attempt.score != null ? attempt.score : "-",
      duration_seconds: attempt.duration_seconds != null ? `${attempt.duration_seconds}s` : "-",
      started_at: formatDate(attempt.started_at),
      submitted_at: formatDate(attempt.submitted_at)
    }));

    const resultsColumns = [
      { key: "attempt_no", label: "Attempt" },
      { key: "student_name", label: "Student" },
      { key: "status", label: "Status", type: "status" },
      { key: "score", label: "Score" },
      { key: "duration_seconds", label: "Duration" },
      { key: "started_at", label: "Started" },
      { key: "submitted_at", label: "Submitted" }
    ];

    return (
      <ContentSection
        title={resultsTitle}
        subtitle={resultsSubtitle}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate(quizzesBasePath)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Quizzes
            </button>
          </div>
        }
      >
        {resultsError ? (
          <p className="text-sm text-red-600">{resultsError}</p>
        ) : resultQuizIdFromPath ? (
          resultsRows.length === 0 ? (
            <EmptyState title="No live results yet" description="No attempts have been recorded for this quiz yet." />
          ) : (
            <DataTable columns={resultsColumns} rows={resultsRows} emptyText="No attempt records." />
          )
        ) : (
          <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
            <p className="text-lg font-semibold">No quiz selected</p>
            <p className="text-sm text-slate-600">Choose a quiz from the Manage Quizzes table and click the Live Results button.</p>
          </div>
        )}
      </ContentSection>
    );
  }

  if (isDetailPath) {
    if (viewLoading || !viewingQuiz) {
      return <LoadingState text="Loading quiz details..." />;
    }

    const detailQuestions = viewingQuiz.questions ?? viewingQuiz.questions_preview ?? [];

    return (
      <ContentSection
        title={`Quiz Details - ${viewingQuiz.title || "-"}`}
        subtitle="Review full questions exactly as prepared."
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => openEditModal(viewingQuiz)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d]"
            >
              <Pencil className="h-4 w-4" />
              Edit Quiz
            </button>
            <button
              type="button"
              onClick={() => onNavigate(`${quizzesBasePath}/results/${viewingQuiz.id}`)}
              className="inline-flex items-center gap-2 rounded-xl bg-[#0f766e] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#115e59]"
            >
              <ClipboardCheck className="h-4 w-4" />
              Live Results
            </button>
            <button
              type="button"
              onClick={() => onNavigate(quizzesBasePath)}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
          </div>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Title</p>
            <p className="mt-1 text-sm font-semibold text-slate-800">{viewingQuiz.title || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</p>
            <p className="mt-1 text-sm text-slate-700">{viewingQuiz.status || "-"}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Time Limit</p>
            <p className="mt-1 text-sm text-slate-700">{viewingQuiz.time_limit_seconds ?? "-"} sec</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Max Attempts</p>
            <p className="mt-1 text-sm text-slate-700">{viewingQuiz.max_attempts ?? 1}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Questions</p>
            <p className="mt-1 text-sm text-slate-700">{viewingQuiz.question_count ?? detailQuestions.length ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created At</p>
            <p className="mt-1 text-sm text-slate-700">{formatDate(viewingQuiz.created_at)}</p>
          </div>
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
            {isRichTextEffectivelyEmpty(viewingQuiz.description) ? (
              <p className="mt-1 text-sm text-slate-700">-</p>
            ) : (
              <div
                className="mt-1 break-words text-sm text-slate-700 [&_a]:text-sky-700 [&_a]:underline"
                dangerouslySetInnerHTML={{ __html: viewingQuiz.description }}
              />
            )}
          </div>
        </div>

        <div className="mt-5 space-y-3">
          {detailQuestions.length > 0 ? (
            detailQuestions.map((q, index) => (
              <div key={q.id ?? index} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_44px]">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      Q{index + 1}.
                    </p>
                    {isRichTextEffectivelyEmpty(q.prompt) ? (
                      <p className="mt-1 text-sm text-slate-700">Question</p>
                    ) : (
                      <div
                        className="mt-1 break-words text-sm text-slate-700 [&_a]:text-sky-700 [&_a]:underline"
                        dangerouslySetInnerHTML={{ __html: q.prompt }}
                      />
                    )}
                    <p className="mt-1 text-xs text-slate-500">
                      Type: {String(q.question_type || "-").replaceAll("_", " ")} | Points: {q.points ?? "-"}
                    </p>

                    {(q.options ?? []).length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {(q.options ?? []).map((option, optionIndex) => (
                          <li
                            key={option.id ?? optionIndex}
                            className={`rounded-lg px-2 py-1 text-sm ${
                              option.is_correct ? "bg-emerald-100 text-emerald-800" : "bg-white text-slate-700"
                            }`}
                          >
                            <span className="mr-1 font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                            {isRichTextEffectivelyEmpty(option.text) ? (
                              <span>-</span>
                            ) : (
                              <span
                                className="break-words [&_a]:text-sky-700 [&_a]:underline"
                                dangerouslySetInnerHTML={{ __html: option.text }}
                              />
                            )}
                            {option.is_correct ? <span className="ml-1 font-semibold">(Correct)</span> : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    {q.explanation ? (
                      <div className="mt-2 text-xs text-slate-600">
                        <p className="font-semibold">Explanation:</p>
                        {isRichTextEffectivelyEmpty(q.explanation) ? null : (
                          <div
                            className="mt-1 break-words [&_a]:text-sky-700 [&_a]:underline"
                            dangerouslySetInnerHTML={{ __html: q.explanation }}
                          />
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-row gap-2 md:flex-col">
                    <button
                      type="button"
                      onClick={() => openEditModal(viewingQuiz)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-sky-500 text-white hover:bg-sky-600"
                      title="Edit question"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={submitting}
                      onClick={() => handleDeleteQuestionFromDetails(index)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-60"
                      title="Delete question"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500">No question details available.</p>
          )}
        </div>
      </ContentSection>
    );
  }

  return (
    <>
      <ContentSection
        title="Manage Quizzes"
        subtitle="Create and manage quiz records."
        actions={
          <>
            <div className="flex items-center gap-2">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search quizzes..."
                className="w-64 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setAppliedSearch(searchInput.trim())}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Search
              </button>
            </div>
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d]"
            >
              <Plus className="h-4 w-4" />
              Quiz
            </button>
          </>
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          emptyText="No quizzes found."
          onRowClick={(row) => handleViewQuiz(row._raw)}
          renderActions={(row) => (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleViewQuiz(row._raw)}
                disabled={viewLoading}
                className={actionButtonBase}
                style={{
                  ...actionButtonStyle,
                  backgroundColor: "#2563eb",
                  color: "#ffffff"
                }}
                title="View Quiz"
              >
                <Eye className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => onNavigate(`${quizzesBasePath}/results/${row.id}`)}
                className={actionButtonBase}
                style={{
                  ...actionButtonStyle,
                  backgroundColor: "#0f766e",
                  color: "#ffffff"
                }}
                title="Live Results"
              >
                <ClipboardCheck className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => openEditModal(row._raw)}
                className={actionButtonBase}
                style={{
                  ...actionButtonStyle,
                  backgroundColor: "#22c55e",
                  color: "#ffffff"
                }}
                title="Edit Quiz"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => handleDeleteQuiz(row._raw)}
                className={actionButtonBase}
                style={{
                  ...actionButtonStyle,
                  backgroundColor: "#fd7e14",
                  color: "#ffffff"
                }}
                title="Delete Quiz"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        />
      </ContentSection>

      {showCreateModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className={`max-h-[92vh] w-full overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl ${createStep === "launch" ? "max-w-6xl" : "max-w-5xl"}`}>
            {createStep === "launch" ? (
              <header className="mb-6 border-b border-slate-200 pb-6">
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={closeLaunchStep}
                    className="inline-flex items-center gap-3 text-left text-slate-800 transition hover:text-sky-700"
                  >
                    <ChevronLeft className="h-10 w-10 text-sky-700" />
                    <span className="text-3xl font-bold">
                      {selectedLaunchQuiz?.title || "Quiz"}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-2xl border border-slate-200 p-3 text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </header>
            ) : (
              <header className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-[#1E3A8A]">Quiz</h3>
                <button
                  type="button"
                  onClick={closeCreateModal}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                >
                  <X className="h-4 w-4" />
                </button>
              </header>
            )}

            {createStep === "launch" ? (
              <div className="space-y-8">
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.9fr)]">
                  <section>
                    <h4 className="text-3xl font-bold text-slate-800">Delivery Method</h4>
                    <div className="mt-5 space-y-4">
                      {LAUNCH_DELIVERY_METHODS.map((method) => {
                        const isSelected = launchConfig.delivery_method === method.value;
                        const MethodIcon = method.Icon;

                        return (
                          <button
                            key={method.value}
                            type="button"
                            onClick={() => chooseLaunchDeliveryMethod(method.value)}
                            className={`w-full rounded-[28px] border px-6 py-6 text-left transition ${
                              isSelected
                                ? "border-sky-500 bg-white shadow-[0_12px_30px_rgba(14,165,233,0.12)]"
                                : "border-slate-200 bg-white hover:border-sky-300"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <span className="flex items-center gap-5">
                                <span className="inline-flex h-[72px] w-[72px] items-center justify-center rounded-[22px] bg-sky-50 text-sky-600">
                                  <MethodIcon className="h-10 w-10" />
                                </span>
                                <span className="text-3xl font-semibold text-slate-800">{method.label}</span>
                              </span>

                              <span
                                className={`relative mt-1 inline-flex h-11 w-11 items-center justify-center rounded-full border-4 ${
                                  isSelected ? "border-sky-500 bg-sky-500" : "border-sky-500 bg-white"
                                }`}
                              >
                                {isSelected ? <span className="h-3.5 w-3.5 rounded-full bg-white" /> : null}
                              </span>
                            </div>

                            {isSelected ? (
                              <p className="mt-6 max-w-2xl text-2xl leading-relaxed text-slate-600">
                                {method.description}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  <section>
                    <h4 className="text-3xl font-bold text-slate-800">Room / Class</h4>
                    <div className="mt-5 rounded-[28px] border border-slate-200 bg-white px-6 py-6">
                      <p className="text-sm text-slate-500">Choose the room or class that students will use for live results.</p>
                      <div className="mt-4">
                        <select
                          value={launchRoomId}
                          onChange={(event) => setLaunchRoomId(event.target.value)}
                          disabled={launchRoomsLoading}
                          className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-700 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                        >
                          <option value="">Select room / class</option>
                          {launchRooms.map((room) => (
                            <option key={room.id} value={room.id}>
                              {room.name} {room.code ? `(${room.code})` : ""}
                            </option>
                          ))}
                        </select>
                        {launchRoomsLoading ? (
                          <p className="mt-3 text-sm text-slate-500">Loading available rooms...</p>
                        ) : launchRooms.length === 0 ? (
                          <p className="mt-3 text-sm text-slate-500">No active rooms found. Create a room in Room Management first.</p>
                        ) : null}
                      </div>
                    </div>
                    <h4 className="mt-8 text-3xl font-bold text-slate-800">Settings</h4>
                    <div className="mt-5 rounded-[28px] border border-slate-200 bg-white">
                      {launchSettingRows.map((setting, index) => {
                        const checked = Boolean(launchConfig[setting.key]);
                        const disabled = Boolean(setting.disabled);

                        return (
                          <div
                            key={setting.key}
                            className={`flex items-center justify-between gap-4 px-0 ${index < launchSettingRows.length - 1 ? "border-b border-slate-200" : ""}`}
                          >
                            <div className={`px-6 py-6 text-2xl ${disabled ? "text-slate-300" : "text-slate-700"}`}>
                              <span>{setting.label}</span>
                            </div>

                            <div className="px-6 py-6">
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleLaunchSetting(setting.key, disabled)}
                                className={`relative h-16 w-28 rounded-full transition ${
                                  disabled
                                    ? checked
                                      ? "bg-emerald-200"
                                      : "bg-slate-200"
                                    : checked
                                      ? "bg-emerald-500"
                                      : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`absolute top-1.5 h-[52px] w-[52px] rounded-full bg-white shadow-sm transition-all ${
                                    checked ? "left-[3.4rem]" : "left-1.5"
                                  }`}
                                />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleLaunchQuizPreview}
                      disabled={launching || !selectedLaunchQuiz}
                      className="min-w-[220px] rounded-2xl bg-[#16acd8] px-8 py-5 text-3xl font-bold text-white transition hover:bg-[#1094bb] disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      {launching ? "Launching..." : "Launch"}
                    </button>
                  </div>
                </div>
              </div>
            ) : createStep === "library" ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                    <Search className="h-5 w-5 text-slate-400" />
                    <input
                      type="text"
                      value={modalSearchInput}
                      onChange={(event) => setModalSearchInput(event.target.value)}
                      placeholder="Search quizzes"
                      className="w-full bg-transparent text-base text-slate-700 outline-none placeholder:text-slate-400"
                    />
                  </div>
                </div>

                <section className="overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[minmax(0,1fr)_170px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-[#0b80b7]">
                    <span>Name</span>
                    <span>Modified</span>
                  </div>

                  {modalQuizRows.length > 0 ? (
                    <div className="max-h-[52vh] overflow-y-auto bg-white">
                      {modalQuizRows.map((quiz) => (
                        <button
                          key={quiz.id}
                          type="button"
                          onClick={() => handleViewQuizFromLibrary(quiz._raw)}
                          className="grid w-full grid-cols-[minmax(0,1fr)_170px] gap-4 border-b border-slate-100 px-5 py-4 text-left transition hover:bg-sky-50/60"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="inline-flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                              <ClipboardCheck className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-lg font-semibold text-slate-800">{quiz.title}</span>
                            </span>
                          </span>
                          <span className="flex items-center text-base text-slate-500" title={quiz.modifiedValue}>
                            {quiz.modifiedLabel}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white px-5 py-12 text-center">
                      <p className="text-lg font-semibold text-slate-700">No quizzes found.</p>
                      <p className="mt-1 text-sm text-slate-500">Try another search or add a new quiz below.</p>
                    </div>
                  )}
                </section>

                <div className="flex justify-start pt-1">
                  <button
                    type="button"
                    onClick={openCreateOptions}
                    className="inline-flex items-center gap-3 rounded-2xl px-2 py-2 text-xl font-semibold text-sky-700 transition hover:text-sky-800"
                  >
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-sky-200 bg-sky-50">
                      <Plus className="h-6 w-6" />
                    </span>
                    Add Quiz
                  </button>
                </div>
              </div>
            ) : createStep === "chooser" ? (
              <div className="space-y-6">
                <div className="flex justify-start">
                  <button
                    type="button"
                    onClick={() => setCreateStep("library")}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Back to Quiz List
                  </button>
                </div>

                <section>
                  <h4 className="text-2xl font-bold text-slate-800">Create with AI ✨</h4>
                  <button
                    type="button"
                    onClick={openAiQuizForm}
                    className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="rounded-xl border border-sky-300 bg-sky-50 p-2 text-sky-600">
                      <BookOpen className="h-7 w-7" />
                    </span>
                    <span>
                      <p className="text-2xl font-semibold text-sky-700">Generate Questions</p>
                      <p className="text-xl text-slate-700">Create questions using prompt and optional file upload.</p>
                    </span>
                  </button>
                </section>

                <section>
                  <h4 className="text-2xl font-bold text-slate-800">Import Questions</h4>
                  <div className="mt-3 space-y-3">
                    <button
                      type="button"
                      onClick={() => showComingSoon("Copy-Paste Questions")}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-6 py-5 text-left transition hover:border-slate-300"
                    >
                      <span className="rounded-xl border border-sky-300 bg-sky-50 p-2 text-sky-600">
                        <ClipboardCheck className="h-7 w-7" />
                      </span>
                      <span>
                        <p className="text-2xl font-semibold text-sky-700">Copy-Paste Questions</p>
                        <p className="text-xl text-slate-700">Import questions by pasting them from another resource.</p>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showComingSoon("Extract Questions from Document")}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left transition hover:border-slate-300"
                    >
                      <span className="rounded-xl border border-sky-300 bg-sky-50 p-2 text-sky-600">
                        <BookOpen className="h-7 w-7" />
                      </span>
                      <span>
                        <p className="text-2xl font-semibold text-sky-700">Extract Questions from Document</p>
                        <p className="text-xl text-slate-700">Upload a file, and extract questions automatically.</p>
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => showComingSoon("Import Questions from Code or Excel Template")}
                      className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left transition hover:border-slate-300"
                    >
                      <span className="rounded-xl border border-sky-300 bg-sky-50 p-2 text-sky-600">
                        <ClipboardCheck className="h-7 w-7" />
                      </span>
                      <span>
                        <p className="text-2xl font-semibold text-sky-700">Import Questions from Code or Excel Template</p>
                        <p className="text-xl text-slate-700">Import from template or another user.</p>
                      </span>
                    </button>
                  </div>
                </section>

                <section>
                  <h4 className="text-2xl font-bold text-slate-800">Start From Scratch</h4>
                  <button
                    type="button"
                    onClick={openBlankQuizForm}
                    className="mt-3 flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white px-6 py-5 text-left transition hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className="rounded-xl border border-sky-300 bg-sky-50 p-2 text-sky-600">
                      <Plus className="h-7 w-7" />
                    </span>
                    <span>
                      <p className="text-2xl font-semibold text-sky-700">Blank Question</p>
                      <p className="text-xl text-slate-700">Open full page form and build quiz questions.</p>
                    </span>
                  </button>
                </section>
              </div>
                        ) : createStep === "ai" ? (
              <form className="mx-auto w-full max-w-4xl space-y-4" onSubmit={handleGenerateQuizWithAi}>
                <div className="rounded-2xl border border-slate-200 p-5">
                  <div className="mb-3 inline-flex rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                    AI Assisted
                  </div>
                  <h4 className="text-4xl font-bold text-slate-800">Generate Questions</h4>
                  <p className="mt-1 text-xl text-slate-600">Create questions using a prompt and/or a file upload.</p>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-2xl font-semibold text-slate-700">Describe what you want the questions to cover</label>
                      <span className="text-sm text-slate-500">{aiForm.prompt.length} / 3000</span>
                    </div>
                    <textarea
                      name="prompt"
                      value={aiForm.prompt}
                      onChange={onAiChange}
                      maxLength={3000}
                      rows={4}
                      placeholder="e.g., The solar system and natural satellites"
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-base outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                      required
                    />
                    <p className="mt-2 text-sm text-slate-500">Add topic, objective, and sample style for better quality.</p>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <label className="mb-2 block text-2xl font-semibold text-slate-700">Attach Document</label>
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="w-full rounded-xl border border-dashed border-slate-400 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-500 hover:bg-sky-50/40"
                    >
                      <p className="text-2xl font-semibold text-sky-700">Drag a file here or click to upload</p>
                      <p className="text-sm text-slate-500">Max 20MB - .pdf .csv .jpg .jpeg .png .txt .md .json</p>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.csv,.jpg,.jpeg,.png,.txt,.md,.json"
                      className="hidden"
                      onChange={onAiFileChange}
                    />
                    {aiFile ? (
                      <div className="mt-2 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2">
                        <span className="text-sm text-slate-700">{aiFile.name}</span>
                        <button
                          type="button"
                          onClick={clearAiFile}
                          className="rounded-md px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <label className="mb-2 block text-2xl font-semibold text-slate-700">Question Type</label>
                    <div className="space-y-2">
                      {QUESTION_TYPE_OPTIONS.map((option) => (
                        <label key={option.value} className="flex items-center gap-3 text-xl text-slate-700">
                          <input
                            type="checkbox"
                            checked={aiForm.question_types.includes(option.value)}
                            onChange={() => toggleAiQuestionType(option.value)}
                            className="h-5 w-5 rounded border-slate-300 text-[#0ea5e9] focus:ring-[#0ea5e9]"
                          />
                          <span>{option.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <div className="flex items-center justify-between">
                      <label className="text-2xl font-semibold text-slate-700">Generate explanations</label>
                      <button
                        type="button"
                        onClick={() =>
                          setAiForm((prev) => ({
                            ...prev,
                            generate_explanations: !prev.generate_explanations
                          }))
                        }
                        className={`relative h-8 w-14 rounded-full transition ${
                          aiForm.generate_explanations ? "bg-emerald-500" : "bg-slate-300"
                        }`}
                      >
                        <span
                          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${
                            aiForm.generate_explanations ? "left-7" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 border-t border-slate-200 pt-4">
                    <label className="mb-2 block text-2xl font-semibold text-slate-700">Number of Questions</label>
                    <div className="inline-flex rounded-xl border border-slate-300 bg-white p-1 shadow-sm">
                      {QUESTION_COUNT_OPTIONS.map((count, index) => (
                        <button
                          key={count}
                          type="button"
                          onClick={() => selectAiQuestionCount(count)}
                          className={`h-12 min-w-[64px] cursor-pointer rounded-xl px-5 text-2xl font-semibold transition ${
                            Number(aiForm.question_count) === count
                              ? "!bg-[#16acd8] !text-white shadow"
                              : "bg-white text-slate-700 hover:bg-slate-100"
                          }`}
                          style={
                            Number(aiForm.question_count) === count
                              ? { backgroundColor: "#16acd8", color: "#ffffff" }
                              : { backgroundColor: "#ffffff", color: "#334155" }
                          }
                          aria-pressed={Number(aiForm.question_count) === count}
                        >
                          <span className={index > 0 ? "ml-0.5" : ""}>{count}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-4">
                    <label className="mb-1 block text-sm font-medium text-slate-700">Quiz Title (optional)</label>
                    <input
                      name="title"
                      value={aiForm.title}
                      onChange={onAiChange}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="sticky bottom-0 z-10 mt-5 -mx-5 border-t border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
                    <div className="flex items-center justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => setCreateStep("chooser")}
                        className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Back
                      </button>
                      <button
                        type="submit"
                        disabled={submitting}
                        className="min-w-[190px] cursor-pointer rounded-2xl border border-[#1094bb] !bg-[#16acd8] px-10 py-3 text-xl font-bold tracking-wide !text-white shadow-[0_10px_24px_rgba(14,165,233,0.35)] transition hover:-translate-y-0.5 hover:scale-[1.02] hover:!bg-[#1094bb] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:translate-y-0 disabled:hover:scale-100"
                        style={{ backgroundColor: "#16acd8", color: "#ffffff" }}
                      >
                        {submitting ? "Generating..." : "Generate"}
                      </button>
                    </div>
                  </div>
                </div>

                {generatedResult ? (
                  <section ref={generatedRef} className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h5 className="text-xl font-bold text-emerald-900">Generated Questions</h5>
                      <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-700">
                        {generatedResult.count} questions
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-emerald-800">{generatedResult.title}</p>
                    <div className="mt-4 space-y-3">
                      {generatedResult.questions && generatedResult.questions.length > 0 ? (
                        generatedResult.questions.map((item, index) => (
                          <div key={item.id ?? index} className="rounded-xl border border-emerald-200 bg-white px-3 py-2.5">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-slate-800">
                                Q{index + 1}. {item.prompt || "Question"}
                              </p>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">
                                {String(item.question_type || "unknown").replace("_", " ")}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-slate-500">Options: {item.options_count ?? item.options?.length ?? 0}</p>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-slate-600">Quiz was generated successfully. Open Manage Quiz to view all questions.</p>
                      )}
                    </div>
                  </section>
                ) : null}
              </form>
            ) : (
              <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateQuiz}>
                <div className="md:col-span-2 flex items-center justify-between">
                  <h4 className="text-base font-semibold text-slate-700">Blank Quiz Setup</h4>
                  <button
                    type="button"
                    onClick={() => setCreateStep("chooser")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Back
                  </button>
                </div>
                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Quiz Title</label>
                  <input
                    name="title"
                    value={form.title}
                    onChange={onChange}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                  <RichTextEditor
                    value={form.description}
                    onChange={(nextValue) => setForm((prev) => ({ ...prev, description: nextValue }))}
                    placeholder="Write quiz description..."
                    minHeight={120}
                    compact
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Time Limit (seconds)</label>
                  <input
                    name="time_limit_seconds"
                    type="number"
                    min="30"
                    value={form.time_limit_seconds}
                    onChange={onChange}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-700">Max Attempts</label>
                  <input
                    name="max_attempts"
                    type="number"
                    min="1"
                    max="20"
                    value={form.max_attempts}
                    onChange={onChange}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                    required
                  />
                </div>

                <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="shuffle_questions"
                      checked={form.shuffle_questions}
                      onChange={onChange}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                    />
                    Shuffle Questions
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="shuffle_options"
                      checked={form.shuffle_options}
                      onChange={onChange}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                    />
                    Shuffle Options
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      name="allow_back_navigation"
                      checked={form.allow_back_navigation}
                      onChange={onChange}
                      className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                    />
                    Allow Back Navigation
                  </label>
                </div>

                <div className="md:col-span-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={closeCreateModal}
                    className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {submitting ? "Saving..." : "Create Quiz"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      ) : null}

      {editingQuiz ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Edit Quiz</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpdateQuiz}>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Quiz Title</label>
                <input
                  name="title"
                  value={editForm.title}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Description</label>
                <RichTextEditor
                  value={editForm.description}
                  onChange={(nextValue) => setEditForm((prev) => ({ ...prev, description: nextValue }))}
                  placeholder="Write quiz description..."
                  minHeight={120}
                  compact
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Time Limit (seconds)</label>
                <input
                  name="time_limit_seconds"
                  type="number"
                  min="30"
                  value={editForm.time_limit_seconds}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Max Attempts</label>
                <input
                  name="max_attempts"
                  type="number"
                  min="1"
                  max="20"
                  value={editForm.max_attempts}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>

              <div className="md:col-span-2 grid gap-2 sm:grid-cols-3">
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="shuffle_questions"
                    checked={editForm.shuffle_questions}
                    onChange={onEditChange}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  Shuffle Questions
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="shuffle_options"
                    checked={editForm.shuffle_options}
                    onChange={onEditChange}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  Shuffle Options
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    name="allow_back_navigation"
                    checked={editForm.allow_back_navigation}
                    onChange={onEditChange}
                    className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                  />
                  Allow Back Navigation
                </label>
              </div>

              <div className="md:col-span-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}

export default QuizManagementSection;
