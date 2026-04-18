import { useEffect, useMemo, useState } from "react";
import ContentSection from "../components/ContentSection.jsx";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { getAdminAttempts, getTeacherAttempts } from "../../services/api.js";

function resolveStatusFilter(role, currentPath) {
  if (role === "admin") {
    if (currentPath === "/admin/attempts/ongoing") return "ongoing";
    if (currentPath === "/admin/attempts/cancelled") return "cancelled";
    if (currentPath === "/admin/attempts/completed") return "completed";
    return "all";
  }

  if (currentPath === "/teacher/attempts/ongoing") return "ongoing";
  if (currentPath === "/teacher/attempts/cancelled") return "cancelled";
  if (currentPath === "/teacher/attempts/submitted") return "submitted";
  return "all";
}

function resolveSectionTitle(role, currentPath) {
  if (role === "admin") {
    if (currentPath === "/admin/attempts/ongoing") return "Ongoing Attempts";
    if (currentPath === "/admin/attempts/cancelled") return "Cancelled Attempts";
    if (currentPath === "/admin/attempts/completed") return "Completed Attempts";
    return "View Attempts";
  }

  if (currentPath === "/teacher/attempts/ongoing") return "Ongoing Attempts";
  if (currentPath === "/teacher/attempts/cancelled") return "Cancelled Attempts";
  if (currentPath === "/teacher/attempts/submitted") return "Submitted Attempts";
  return "View Attempts";
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatLabel(value) {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, " ");
  if (!normalized) return "-";
  return normalized
    .split(" ")
    .map((chunk) => (chunk ? chunk[0].toUpperCase() + chunk.slice(1) : ""))
    .join(" ");
}

function formatScore(value) {
  if (value === null || typeof value === "undefined") return "-";
  const score = Number(value);
  if (Number.isNaN(score)) return "-";
  return score.toFixed(2);
}

function AttemptManagementSection({ role, currentPath }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempts, setAttempts] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    ongoing: 0,
    submitted: 0,
    cancelled: 0,
    expired: 0,
    completed: 0
  });
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const statusFilter = useMemo(() => resolveStatusFilter(role, currentPath), [role, currentPath]);
  const sectionTitle = useMemo(() => resolveSectionTitle(role, currentPath), [role, currentPath]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const requestParams = {
          status: statusFilter,
          search: appliedSearch || undefined,
          limit: 200
        };

        const response =
          role === "admin"
            ? await getAdminAttempts(requestParams)
            : await getTeacherAttempts(requestParams);

        if (!active) return;

        setAttempts(response?.attempts ?? []);
        setSummary(
          response?.summary ?? {
            total: 0,
            ongoing: 0,
            submitted: 0,
            cancelled: 0,
            expired: 0,
            completed: 0
          }
        );
      } catch (err) {
        if (!active) return;
        setError(err?.data?.message || "Failed to load attempts.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();

    return () => {
      active = false;
    };
  }, [role, statusFilter, appliedSearch, refreshKey]);

  const columns = useMemo(
    () => [
      { key: "attempt_code", label: "Attempt" },
      { key: "student_id", label: "Student ID" },
      { key: "student_name", label: "Student Name" },
      { key: "quiz_title", label: "Quiz" },
      { key: "status", label: "Status", type: "status" },
      { key: "score", label: "Score" },
      { key: "risk_level", label: "Risk" },
      { key: "started_at", label: "Started At" },
      { key: "ended_at", label: "Ended At" }
    ],
    []
  );

  const rows = useMemo(
    () =>
      attempts.map((attempt) => ({
        id: attempt.id,
        attempt_code: `#${attempt.id} (No.${attempt.attempt_no ?? 1})`,
        student_id: attempt.student_id || "-",
        student_name: attempt.student_name || "-",
        quiz_title: attempt.quiz_title || "-",
        status: formatLabel(attempt.status_label || attempt.status || "ongoing"),
        score: formatScore(attempt.score),
        risk_level: formatLabel(attempt.risk_level || "low"),
        started_at: formatDate(attempt.started_at || attempt.created_at),
        ended_at: formatDate(attempt.submitted_at || attempt.cancelled_at)
      })),
    [attempts]
  );

  const summaryCards = useMemo(() => {
    const cards = [
      { key: "total", label: "Total", value: summary.total ?? 0 },
      { key: "ongoing", label: "Ongoing", value: summary.ongoing ?? 0 },
      {
        key: role === "admin" ? "completed" : "submitted",
        label: role === "admin" ? "Completed" : "Submitted",
        value: role === "admin" ? summary.completed ?? 0 : summary.submitted ?? 0
      },
      { key: "cancelled", label: "Cancelled", value: summary.cancelled ?? 0 }
    ];

    return cards;
  }, [summary, role]);

  if (loading) {
    return <LoadingState text="Loading attempts..." />;
  }

  if (error) {
    return (
      <ContentSection title="Attempts Error" subtitle="Unable to load attempt records.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  return (
    <ContentSection
      title={sectionTitle}
      subtitle="Track quiz attempt activity with status and risk details."
      actions={
        <div className="flex items-center gap-2">
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setAppliedSearch(searchInput.trim());
              }
            }}
            placeholder="Search student or quiz..."
            className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          />
          <button
            type="button"
            onClick={() => setAppliedSearch(searchInput.trim())}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Search
          </button>
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.key} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-bold text-[#1E3A8A]">{card.value}</p>
          </div>
        ))}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        hideActions
        emptyText="No attempt records found for this filter."
      />
    </ContentSection>
  );
}

export default AttemptManagementSection;
