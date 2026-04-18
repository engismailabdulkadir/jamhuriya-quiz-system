import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import ContentSection from "../components/ContentSection.jsx";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { iconMap } from "../components/iconMap.js";
import {
  assignAdminRoomStudent,
  assignTeacherRoomStudent,
  bulkAssignAdminRoomStudents,
  bulkAssignTeacherRoomStudents,
  createAdminRoom,
  deleteAdminRoomStudent,
  createTeacherRoom,
  deleteAdminRoom,
  deleteTeacherRoom,
  deleteTeacherRoomStudent,
  getAdminRoomAssignments,
  getAdminRooms,
  getTeacherRoomAssignments,
  getTeacherRooms,
  setAdminRoomStatus,
  setTeacherRoomStatus,
  updateAdminRoomStudent,
  updateAdminRoom,
  updateTeacherRoomStudent,
  updateTeacherRoom
} from "../../services/api.js";
import { showConfirm, showError, showSuccess, showWarning } from "../../utils/alerts.js";

const { Plus, Pencil, Trash2, Share2, X, Upload, GraduationCap } = iconMap;

const emptyRoomForm = {
  name: "",
  code: "",
  capacity: "30",
  instructor_id: "",
  status: "active"
};

const emptyAssignForm = {
  room_id: "",
  student_id: "",
  student_name: ""
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function normalizeKey(key) {
  return String(key || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function extractStudentFromRow(row) {
  if (!row || typeof row !== "object") return null;

  let studentId = "";
  let studentName = "";

  for (const [key, value] of Object.entries(row)) {
    const normalized = normalizeKey(key);
    const text = String(value ?? "").trim();
    if (!text) continue;

    if (
      !studentId &&
      (normalized === "id" ||
        normalized.includes("studentid") ||
        normalized.includes("registration") ||
        normalized.includes("regno") ||
        normalized.includes("admission"))
    ) {
      studentId = text;
    }

    if (!studentName && (normalized.includes("studentname") || normalized === "name" || normalized.includes("fullname"))) {
      studentName = text;
    }
  }

  if (!studentId || !studentName) {
    const values = Object.values(row)
      .map((value) => String(value ?? "").trim())
      .filter(Boolean);
    if (!studentId && values[0]) studentId = values[0];
    if (!studentName && values[1]) studentName = values[1];
  }

  if (!studentId || !studentName) return null;
  return { student_id: studentId, student_name: studentName };
}

function dedupeStudents(students) {
  const seen = new Set();
  const result = [];

  for (const student of students) {
    if (!student || typeof student !== "object") continue;
    const studentId = String(student.student_id ?? "").trim();
    const studentName = String(student.student_name ?? "").trim();
    if (!studentId || !studentName) continue;

    const key = studentId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ student_id: studentId, student_name: studentName });
  }

  return result;
}

async function parseStudentsFromExcel(file, options = {}) {
  const fileName = String(file?.name ?? "");
  const extension = fileName.split(".").pop()?.toLowerCase();
  const workbook =
    extension === "csv"
      ? XLSX.read(await file.text(), { type: "string" })
      : XLSX.read(await file.arrayBuffer(), { type: "array" });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) return [];

  const sheet = workbook.Sheets[firstSheetName];
  const hasHeaders = options?.hasHeaders !== false;

  if (!hasHeaders) {
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
    const parsed = rows
      .map((row) => {
        if (!Array.isArray(row)) return null;
        const studentId = String(row[0] ?? "").trim();
        const studentName = String(row[1] ?? "").trim();
        if (!studentId || !studentName) return null;
        return { student_id: studentId, student_name: studentName };
      })
      .filter(Boolean);

    return dedupeStudents(parsed);
  }

  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  const parsed = rows.map(extractStudentFromRow).filter(Boolean);
  return dedupeStudents(parsed);
}

function RoomManagementSection({ role, currentPath, onNavigate }) {
  const isAdmin = role === "admin";
  const [rooms, setRooms] = useState([]);
  const [assignmentRooms, setAssignmentRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roomForm, setRoomForm] = useState(emptyRoomForm);
  const [editingRoomId, setEditingRoomId] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [assignForm, setAssignForm] = useState(emptyAssignForm);
  const [importingExcel, setImportingExcel] = useState(false);
  const [importedFileName, setImportedFileName] = useState("");
  const [savingRoom, setSavingRoom] = useState(false);
  const [savingAssign, setSavingAssign] = useState(false);
  const [studentSearch, setStudentSearch] = useState("");
  const [editingStudent, setEditingStudent] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState("");
  const [shareRoomInfo, setShareRoomInfo] = useState(null);
  const [copyingShareText, setCopyingShareText] = useState(false);
  const [editingStudentName, setEditingStudentName] = useState("");
  const [savingStudentEdit, setSavingStudentEdit] = useState(false);
  const [deletingStudentId, setDeletingStudentId] = useState("");
  const [quickImportingRoomId, setQuickImportingRoomId] = useState("");
  const [lastManageImport, setLastManageImport] = useState(null);
  const [statusUpdatingRoomId, setStatusUpdatingRoomId] = useState("");
  const [rosterMenuRoomId, setRosterMenuRoomId] = useState("");
  const [showRosterImportModal, setShowRosterImportModal] = useState(false);
  const [rosterImportRoom, setRosterImportRoom] = useState(null);
  const [rosterImportFile, setRosterImportFile] = useState(null);
  const [rosterImportFileType, setRosterImportFileType] = useState("XLSX");
  const [rosterImportHasHeaders, setRosterImportHasHeaders] = useState(true);
  const [showRosterManualModal, setShowRosterManualModal] = useState(false);
  const [rosterManualRoom, setRosterManualRoom] = useState(null);
  const [manualRosterStudents, setManualRosterStudents] = useState([{ student_id: "", student_name: "" }]);
  const rosterFileInputRef = useRef(null);

  const isAddPath = currentPath === "/admin/rooms/add";
  const assignBasePath = isAdmin ? "/admin/rooms/assign-students" : "/teacher/rooms/assign-students";
  const assignDetailPrefix = `${assignBasePath}/student-list/`;
  const isAssignListPath = currentPath === assignBasePath;
  const isAssignDetailPath = currentPath.startsWith(assignDetailPrefix);
  const selectedAssignmentRoomIdFromPath = isAssignDetailPath
    ? currentPath.slice(assignDetailPrefix.length).split("/")[0]
    : "";
  const isAssignPath = isAssignListPath || isAssignDetailPath;
  const isActivePath = currentPath === "/admin/rooms/active" || currentPath === "/teacher/rooms/active";

  const fetchRooms = async () => {
    const params = {
      status: isActivePath ? "active" : "all",
      search: appliedSearch || undefined
    };
    const response = isAdmin ? await getAdminRooms(params) : await getTeacherRooms(params);
    setRooms(response?.rooms ?? []);
  };

  const fetchAssignments = async () => {
    const response = isAdmin ? await getAdminRoomAssignments() : await getTeacherRoomAssignments();
    const normalized = (response?.assignments ?? []).map((row) => {
      const students = (row.students ?? [])
        .map((student) => ({
          student_id: String(student.student_id ?? "").trim(),
          student_name: String(student.student_name ?? "").trim()
        }))
        .filter((student) => student.student_id && student.student_name)
        .sort((a, b) =>
          a.student_id.localeCompare(b.student_id, undefined, { numeric: true, sensitivity: "base" })
        );

      return {
        room_id: row.room_id,
        room_name: row.room_name || "-",
        room_code: row.room_code || "-",
        students_count: row.students_count ?? students.length,
        students
      };
    });

    setAssignmentRooms(normalized);
  };

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        await fetchRooms();
        if (isAssignPath) {
          await fetchAssignments();
        } else if (active) {
          setAssignmentRooms([]);
          setEditingStudent(null);
          setStudentSearch("");
        }
      } catch (err) {
        if (!active) return;
        setError(err?.data?.message || "Failed to load rooms.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, currentPath, isAdmin, isAssignPath, isActivePath, refreshKey]);

  useEffect(() => {
    if (!isAdmin) return;
    if (isAddPath) {
      setShowAddModal(true);
      setEditingRoomId(null);
      setRoomForm(emptyRoomForm);
    } else {
      setShowAddModal(false);
    }
  }, [isAddPath, isAdmin]);

  const roomRows = useMemo(
    () =>
      rooms.map((room) => ({
        id: room.id,
        name: room.name || "-",
        code: room.code || "-",
        capacity: room.capacity || "-",
        instructor: room.instructor_name || "-",
        students_count: room.students_count ?? 0,
        status: room.status || (room.is_active ? "active" : "inactive"),
        created_at: formatDate(room.created_at),
        _raw: room
      })),
    [rooms]
  );

  const roomColumns = [
    { key: "name", label: "Room Name" },
    { key: "code", label: "Room Code" },
    {
      key: "status",
      label: "Status",
      render: (row) => {
        const currentStatus =
          String(row?._raw?.status || (row?._raw?.is_active ? "active" : "inactive")).toLowerCase() === "inactive"
            ? "inactive"
            : "active";
        const isUpdating = statusUpdatingRoomId === String(row?._raw?.id);

        return (
          <select
            value={currentStatus}
            disabled={isUpdating}
            onChange={(event) => changeRoomStatus(row._raw, event.target.value)}
            className="min-w-28 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-700 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100 disabled:opacity-60"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        );
      }
    }
  ];

  const selectedAssignmentRoom = useMemo(
    () =>
      assignmentRooms.find((room) => String(room.room_id) === String(selectedAssignmentRoomIdFromPath)) ?? null,
    [assignmentRooms, selectedAssignmentRoomIdFromPath]
  );

  const filteredStudents = useMemo(() => {
    if (!selectedAssignmentRoom) return [];
    const query = studentSearch.trim().toLowerCase();
    if (!query) return selectedAssignmentRoom.students;

    return selectedAssignmentRoom.students.filter(
      (student) =>
        String(student.student_id).toLowerCase().includes(query) ||
        String(student.student_name).toLowerCase().includes(query)
    );
  }, [selectedAssignmentRoom, studentSearch]);

  const closeAddModal = () => {
    setShowAddModal(false);
    setRoomForm(emptyRoomForm);
    setEditingRoomId(null);
    if (currentPath === "/admin/rooms/add") {
      onNavigate("/admin/rooms");
    }
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setRoomForm(emptyRoomForm);
    setEditingRoomId(null);
  };

  const onRoomFormChange = (event) => {
    const { name, value } = event.target;
    setRoomForm((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmitRoom = async (event) => {
    event.preventDefault();

    if (!roomForm.name.trim()) {
      await showWarning("Validation", "Room name is required.");
      return;
    }

    const payload = {
      name: roomForm.name.trim(),
      status: editingRoomId ? roomForm.status || "active" : "active"
    };
    if (isAdmin && roomForm.instructor_id) {
      payload.instructor_id = Number(roomForm.instructor_id);
    }

    setSavingRoom(true);
    try {
      if (editingRoomId) {
        if (isAdmin) await updateAdminRoom(editingRoomId, payload);
        else await updateTeacherRoom(editingRoomId, payload);
        await showSuccess("Updated", "Room updated successfully.");
        closeEditModal();
      } else {
        if (isAdmin) await createAdminRoom(payload);
        else await createTeacherRoom(payload);
        await showSuccess("Created", "Room created successfully.");
        if (showAddModal || isAddPath) closeAddModal();
        else setRoomForm(emptyRoomForm);
      }

      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      await showError("Save Failed", err?.data?.message || "Unable to save room.");
    } finally {
      setSavingRoom(false);
    }
  };

  const openEditRoom = (room) => {
    setEditingRoomId(room.id);
    setShowEditModal(true);
    setRoomForm({
      name: room.name || "",
      code: room.code || "",
      capacity: String(room.capacity || 30),
      instructor_id: room.instructor_id ? String(room.instructor_id) : "",
      status: room.status || "active"
    });
  };

  const closeShareRoomModal = () => {
    setShareRoomInfo(null);
  };

  const copyShareDetails = async () => {
    if (!shareRoomInfo) return;
    if (!navigator.clipboard?.writeText) {
      await showWarning("Share", "Copy not available in this browser.");
      return;
    }

    try {
      setCopyingShareText(true);
      await navigator.clipboard.writeText(shareRoomInfo.shareText);
      await showSuccess("Copied", "Room share details copied to clipboard.");
    } catch (err) {
      await showWarning("Share", "Unable to copy share details.");
    } finally {
      setCopyingShareText(false);
    }
  };

  const shareRoom = async () => {
    if (!shareRoomInfo) return;

    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: `Room: ${shareRoomInfo.roomName}`,
          text: shareRoomInfo.shareText,
          url: shareRoomInfo.shareUrl
        });
        return;
      }

      await copyShareDetails();
    } catch (error) {
      if (error?.name === "AbortError") {
        return;
      }
      await showWarning("Share", "Sharing is not available. Copy the details instead.");
    }
  };

  const openShareRoomModal = (room) => {
    const roomName = String(room?.name ?? "Room").trim() || "Room";
    const roomCode = String(room?.code ?? "").trim() || "N/A";
    const shareUrl = String(room?.share_url ?? `${window.location.origin}/student/access`);
    const shareText = `Room Name: ${roomName}\nRoom Code: ${roomCode}\nStudent Access: ${shareUrl}`;
    const shareQrUrl = String(room?.share_qr_url ?? `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(shareUrl)}`);

    setShareRoomInfo({
      room,
      roomName,
      roomCode,
      shareUrl,
      shareText,
      shareQrUrl
    });
  };

  const removeRoom = async (room) => {
    const confirm = await showConfirm({
      title: "Delete Room?",
      text: `Room "${room.name}" will be deleted.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmButtonColor: "#fd7e14"
    });
    if (!confirm.isConfirmed) return;

    try {
      if (isAdmin) await deleteAdminRoom(room.id);
      else await deleteTeacherRoom(room.id);
      await showSuccess("Deleted", "Room deleted successfully.");
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      await showError("Delete Failed", err?.data?.message || "Unable to delete room.");
    }
  };

  const changeRoomStatus = async (room, nextStatusValue) => {
    const nextStatus = String(nextStatusValue).toLowerCase() === "inactive" ? "inactive" : "active";
    const currentStatus =
      String(room?.status || (room?.is_active ? "active" : "inactive")).toLowerCase() === "inactive"
        ? "inactive"
        : "active";

    if (!room?.id || nextStatus === currentStatus) return;

    setStatusUpdatingRoomId(String(room.id));
    try {
      if (isAdmin) await setAdminRoomStatus(room.id, nextStatus);
      else await setTeacherRoomStatus(room.id, nextStatus);

      setRooms((prev) =>
        prev.map((item) =>
          Number(item.id) === Number(room.id)
            ? { ...item, status: nextStatus, is_active: nextStatus === "active" }
            : item
        )
      );
      await showSuccess("Updated", `Room status changed to ${nextStatus}.`);
    } catch (err) {
      await showError("Update Failed", err?.data?.message || "Unable to update room status.");
    } finally {
      setStatusUpdatingRoomId("");
    }
  };


  const openRosterImportModal = (room) => {
    if (!room?.id) return;
    setRosterMenuRoomId("");
    setRosterImportRoom(room);
    setRosterImportFile(null);
    setRosterImportFileType("XLSX");
    setRosterImportHasHeaders(true);
    if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
    setShowRosterImportModal(true);
  };

  const closeRosterImportModal = () => {
    setShowRosterImportModal(false);
    setRosterImportRoom(null);
    setRosterImportFile(null);
    if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
  };

  const openRosterFilePicker = () => {
    if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
    rosterFileInputRef.current?.click();
  };

  const onRosterFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setRosterImportFile(file);
    importRosterFromModal(file);
  };

  const downloadRosterTemplate = () => {
    const workbook = XLSX.utils.book_new();
    const data = [
      ["Student ID", "Full Name", "Email"]
    ];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, "Students");
    XLSX.writeFile(workbook, "students_template.xlsx");
  };

  const importRosterFromModal = async (fileOverride) => {
    if (!rosterImportRoom?.id) return;
    const fileToImport = fileOverride || rosterImportFile;
    if (!fileToImport) {
      await showWarning("Select File", "Choose Excel/CSV file first.");
      return;
    }

    setQuickImportingRoomId(String(rosterImportRoom.id));
    try {
      const parsedStudents = await parseStudentsFromExcel(fileToImport, { hasHeaders: rosterImportHasHeaders });
      if (parsedStudents.length === 0) {
        await showWarning(
          "No Students Found",
          "File must contain columns for Student ID and Full Name. (Email is optional.)"
        );
        return;
      }

      const students = dedupeStudents(parsedStudents);
      if (isAdmin) {
        await bulkAssignAdminRoomStudents(rosterImportRoom.id, students);
      } else {
        await bulkAssignTeacherRoomStudents(rosterImportRoom.id, students);
      }

      setLastManageImport({
        roomId: rosterImportRoom.id,
        roomName: rosterImportRoom.name,
        fileName: fileToImport.name
      });

      await showSuccess("Import Complete", `${students.length} students imported to ${rosterImportRoom.name}.`);
      closeRosterImportModal();
      await fetchRooms();
    } catch (err) {
      await showError("Import Failed", err?.data?.message || "Could not import students from file.");
    } finally {
      setQuickImportingRoomId("");
      setRosterImportFile(null);
      if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
    }
  };

  const openRosterManualModal = (room) => {
    if (!room?.id) return;
    setRosterMenuRoomId("");
    setRosterManualRoom(room);
    setManualRosterStudents([{ student_id: "", student_name: "" }]);
    setShowRosterManualModal(true);
  };

  const closeRosterManualModal = () => {
    setShowRosterManualModal(false);
    setRosterManualRoom(null);
    setManualRosterStudents([{ student_id: "", student_name: "" }]);
  };

  const updateManualRosterStudent = (index, field, value) => {
    setManualRosterStudents((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, [field]: value } : row))
    );
  };

  const addManualRosterStudent = () => {
    setManualRosterStudents((prev) => [...prev, { student_id: "", student_name: "" }]);
  };

  const removeManualRosterStudent = (index) => {
    setManualRosterStudents((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      return next.length > 0 ? next : [{ student_id: "", student_name: "" }];
    });
  };

  const saveManualRosterStudents = async () => {
    if (!rosterManualRoom?.id) return;

    const candidates = manualRosterStudents
      .map((row) => ({
        student_id: String(row.student_id ?? "").trim(),
        student_name: String(row.student_name ?? "").trim()
      }))
      .filter((row) => row.student_id && row.student_name);

    const students = dedupeStudents(candidates);
    if (students.length === 0) {
      await showWarning("Validation", "Please enter Student ID and Full Name.");
      return;
    }

    setQuickImportingRoomId(String(rosterManualRoom.id));
    try {
      if (isAdmin) {
        await bulkAssignAdminRoomStudents(rosterManualRoom.id, students);
      } else {
        await bulkAssignTeacherRoomStudents(rosterManualRoom.id, students);
      }

      setLastManageImport({
        roomId: rosterManualRoom.id,
        roomName: rosterManualRoom.name,
        fileName: "Manual Entry"
      });

      await showSuccess("Saved", `${students.length} students added to ${rosterManualRoom.name}.`);
      closeRosterManualModal();
      await fetchRooms();
    } catch (err) {
      await showError("Save Failed", err?.data?.message || "Could not save students.");
    } finally {
      setQuickImportingRoomId("");
    }
  };

  const importStudentsFromManageRow = async (room, event) => {
    const fileInput = event.target;
    const file = fileInput.files?.[0];
    if (!file || !room?.id) return;

    setQuickImportingRoomId(String(room.id));
    try {
      const parsedStudents = await parseStudentsFromExcel(file);
      if (parsedStudents.length === 0) {
        await showWarning(
          "No Students Found",
          "Excel file must contain columns for Student ID and Full Name."
        );
        return;
      }

      const students = dedupeStudents(parsedStudents);
      if (isAdmin) {
        await bulkAssignAdminRoomStudents(room.id, students);
      } else {
        await bulkAssignTeacherRoomStudents(room.id, students);
      }

      setLastManageImport({
        roomId: room.id,
        roomName: room.name,
        fileName: file.name
      });

      await showSuccess("Import Complete", `${students.length} students imported to ${room.name}.`);
      await fetchRooms();
    } catch (err) {
      await showError("Import Failed", err?.data?.message || "Could not import students from file.");
    } finally {
      setQuickImportingRoomId("");
      fileInput.value = "";
    }
  };

  const onAssignChange = (event) => {
    const { name, value } = event.target;
    setAssignForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAssignmentRoomPage = (roomId) => {
    setStudentSearch("");
    setEditingStudent(null);
    onNavigate(`${assignBasePath}/student-list/${roomId}`);
  };

  const closeAssignmentRoomPage = () => {
    setStudentSearch("");
    setEditingStudent(null);
    onNavigate(assignBasePath);
  };

  const startEditStudent = (student) => {
    setEditingStudent(student);
    setEditingStudentId(student.student_id);
    setEditingStudentName(student.student_name);
  };

  const cancelEditStudent = () => {
    setEditingStudent(null);
    setEditingStudentId("");
    setEditingStudentName("");
  };

  const saveEditStudent = async (options = {}) => {
    const { closeAfterSave = true } = options;
    if (!selectedAssignmentRoom || !editingStudent) return;
    const nextId = editingStudentId.trim();
    const nextName = editingStudentName.trim();
    if (!nextId || !nextName) {
      await showWarning("Validation", "Student ID and Full Name are required.");
      return;
    }

    const noChanges =
      nextId === String(editingStudent.student_id || "").trim() &&
      nextName === String(editingStudent.student_name || "").trim();
    if (noChanges) {
      if (closeAfterSave) cancelEditStudent();
      return;
    }

    setSavingStudentEdit(true);
    try {
      if (isAdmin) {
        await updateAdminRoomStudent(selectedAssignmentRoom.room_id, editingStudent.student_id, {
          student_id: nextId,
          student_name: nextName
        });
      } else {
        await updateTeacherRoomStudent(selectedAssignmentRoom.room_id, editingStudent.student_id, {
          student_id: nextId,
          student_name: nextName
        });
      }
      await fetchAssignments();
      await fetchRooms();
      setEditingStudent({ student_id: nextId, student_name: nextName });
      setEditingStudentId(nextId);
      setEditingStudentName(nextName);
      if (closeAfterSave) {
        await showSuccess("Updated", "Student updated successfully.");
        cancelEditStudent();
      }
    } catch (err) {
      await showError("Update Failed", err?.data?.message || "Unable to update student.");
    } finally {
      setSavingStudentEdit(false);
    }
  };

  const removeStudent = async (student) => {
    if (!selectedAssignmentRoom) return;
    const confirm = await showConfirm({
      title: "Delete Student?",
      text: `${student.student_name} (${student.student_id}) will be removed from this class.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmButtonColor: "#fd7e14"
    });
    if (!confirm.isConfirmed) return;

    setDeletingStudentId(student.student_id);
    try {
      if (isAdmin) {
        await deleteAdminRoomStudent(selectedAssignmentRoom.room_id, student.student_id);
      } else {
        await deleteTeacherRoomStudent(selectedAssignmentRoom.room_id, student.student_id);
      }
      await showSuccess("Deleted", "Student removed successfully.");
      await fetchAssignments();
      await fetchRooms();
    } catch (err) {
      await showError("Delete Failed", err?.data?.message || "Unable to remove student.");
    } finally {
      setDeletingStudentId("");
    }
  };

  const assignStudent = async (event) => {
    event.preventDefault();

    if (!assignForm.room_id || !assignForm.student_id.trim() || !assignForm.student_name.trim()) {
      await showWarning("Validation", "Choose room and enter Student ID and Full Name.");
      return;
    }

    const payload = {
      student_id: assignForm.student_id.trim(),
      student_name: assignForm.student_name.trim()
    };

    setSavingAssign(true);
    try {
      if (isAdmin) await assignAdminRoomStudent(assignForm.room_id, payload);
      else await assignTeacherRoomStudent(assignForm.room_id, payload);
      await showSuccess("Assigned", "Student assigned to room.");
      setAssignForm((prev) => ({ ...prev, student_id: "", student_name: "" }));
      await fetchAssignments();
      await fetchRooms();
    } catch (err) {
      await showError("Assign Failed", err?.data?.message || "Unable to assign student.");
    } finally {
      setSavingAssign(false);
    }
  };

  const importStudentsFromExcel = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!assignForm.room_id) {
      await showWarning("Select Room", "Choose room first, then upload Excel.");
      event.target.value = "";
      return;
    }

    setImportingExcel(true);
    try {
      const parsedStudents = await parseStudentsFromExcel(file);
      if (parsedStudents.length === 0) {
        await showWarning(
          "No Students Found",
          "Excel file must contain columns for Student ID and Full Name."
        );
        return;
      }

      const students = dedupeStudents(parsedStudents);
      if (isAdmin) await bulkAssignAdminRoomStudents(assignForm.room_id, students);
      else await bulkAssignTeacherRoomStudents(assignForm.room_id, students);

      setImportedFileName(file.name);
      await showSuccess("Import Complete", `${students.length} students imported from ${file.name}.`);
      await fetchAssignments();
      await fetchRooms();
    } catch (err) {
      console.error("Excel import failed:", err);
      await showError("Import Failed", err?.data?.message || "Could not import students from file.");
    } finally {
      setImportingExcel(false);
      event.target.value = "";
    }
  };

  if (loading) {
    return <LoadingState text="Loading rooms..." />;
  }

  if (error) {
    return (
      <ContentSection title="Rooms Error" subtitle="Unable to load room data.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  return (
    <div className="space-y-6">
      {shareRoomInfo ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-[28px] bg-white shadow-2xl ring-1 ring-slate-900/10">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-5 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-900">Share room link</h2>
                <p className="mt-1 text-sm text-slate-500">Students can open the access page and enter the room code.</p>
              </div>
              <button
                type="button"
                onClick={closeShareRoomModal}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50"
                aria-label="Close share dialog"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-6 p-5 sm:grid-cols-[1fr_260px]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Student Access URL</p>
                  <p className="mt-2 break-words text-sm font-medium text-slate-900">{shareRoomInfo.shareUrl}</p>
                </div>
                <div className="rounded-3xl border border-slate-200 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Room Code</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900">{shareRoomInfo.roomCode}</p>
                </div>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="button"
                    onClick={shareRoom}
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#1E3A8A] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
                  >
                    Share now
                  </button>
                  <button
                    type="button"
                    onClick={copyShareDetails}
                    disabled={copyingShareText}
                    className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 disabled:opacity-70"
                  >
                    {copyingShareText ? "Copying..." : "Copy details"}
                  </button>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Sharing note</p>
                  <p className="mt-2 text-sm text-slate-600">
                    Students should open the access page and enter the room code shown above.
                  </p>
                </div>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4 text-center">
                <p className="text-xs uppercase tracking-wide text-slate-500">QR Code</p>
                <img
                  src={shareRoomInfo.shareQrUrl}
                  alt="Room share QR code"
                  className="mx-auto mt-4 h-60 w-60 rounded-3xl bg-white object-contain"
                />
                <p className="mt-3 text-sm text-slate-600">Scan to open the student access page.</p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
      {rosterMenuRoomId ? (
        <button
          type="button"
          aria-label="Close roster menu"
          onClick={() => setRosterMenuRoomId("")}
          className="fixed inset-0 z-20 cursor-default bg-transparent"
        />
      ) : null}
      {!isAssignPath ? (
        <ContentSection
          title={isAdmin ? "Room Management" : "My Rooms"}
          subtitle={isActivePath ? "Only active rooms are shown." : "Create, update and manage rooms."}
          actions={
            <div className="flex items-center gap-2">
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search room..."
                className="w-56 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
              />
              <button
                type="button"
                onClick={() => setAppliedSearch(searchInput.trim())}
                className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Search
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => onNavigate("/admin/rooms/add")}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d]"
                >
                  <Plus className="h-4 w-4" />
                  Add Room
                </button>
              ) : null}
            </div>
          }
        >
          <div className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <label className="text-sm font-semibold text-slate-700">Add Students (Import or Manual)</label>
            <p className="mt-1 text-xs text-slate-500">
              Import columns: <strong>Student ID</strong>, <strong>Full Name</strong> (Email optional).
            </p>
            {lastManageImport ? (
              <p className="mt-1 text-xs text-slate-600">
                Last imported file: {lastManageImport.fileName} ({lastManageImport.roomName})
              </p>
            ) : null}
          </div>

          <DataTable
            columns={roomColumns}
            rows={roomRows}
            emptyText="No rooms found."
            renderActions={(row) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openShareRoomModal(row._raw)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-500 text-white"
                  title="Share room"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setRosterMenuRoomId((prev) =>
                        prev === String(row._raw.id) ? "" : String(row._raw.id)
                      )
                    }
                    disabled={quickImportingRoomId === String(row._raw.id)}
                    className={`flex h-9 w-9 items-center justify-center rounded-full bg-sky-500 text-white ${
                      quickImportingRoomId === String(row._raw.id) ? "pointer-events-none opacity-60" : ""
                    }`}
                    title={quickImportingRoomId === String(row._raw.id) ? "Working..." : "Roster options"}
                  >
                    <Upload className="h-4 w-4" />
                  </button>

                  {rosterMenuRoomId === String(row._raw.id) ? (
                    <div className="absolute right-0 top-11 z-30 w-44 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                      <button
                        type="button"
                        onClick={() => openRosterImportModal(row._raw)}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Import
                      </button>
                      <button
                        type="button"
                        onClick={() => openRosterManualModal(row._raw)}
                        className="w-full px-4 py-2.5 text-left text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Manual (Type In)
                      </button>
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => openEditRoom(row._raw)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white"
                  title="Edit room"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeRoom(row._raw)}
                  className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-500 text-white"
                  title="Delete room"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          />
        </ContentSection>
      ) : null}

      {isAssignPath ? (
        <>
          {isAssignListPath ? (
            <ContentSection title="Assign Students" subtitle="Add manually or import Excel (Student ID + Full Name).">
              <form onSubmit={assignStudent} className="grid gap-4 md:grid-cols-[1fr_1fr_1fr_auto]">
                <select
                  name="room_id"
                  value={assignForm.room_id}
                  onChange={onAssignChange}
                  className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="">Select room</option>
                  {rooms.map((room) => (
                    <option key={room.id} value={room.id}>
                      {room.name} ({room.code})
                    </option>
                  ))}
                </select>

                <input
                  name="student_id"
                  value={assignForm.student_id}
                  onChange={onAssignChange}
                  placeholder="Student ID"
                  className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                />

                <input
                  name="student_name"
                  value={assignForm.student_name}
                  onChange={onAssignChange}
                  placeholder="Full Name"
                  className="rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                />

                <button
                  type="submit"
                  disabled={savingAssign}
                  className="inline-flex items-center justify-center rounded-xl bg-[#1E3A8A] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
                >
                  {savingAssign ? "Assigning..." : "Assign"}
                </button>
              </form>

              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">
                  <Upload className="h-4 w-4" />
                  {importingExcel ? "Importing..." : "Upload Excel (.xlsx/.xls/.csv)"}
                  <input
                    type="file"
                    accept=".xlsx,.xls,.csv"
                    className="hidden"
                    onChange={importStudentsFromExcel}
                    disabled={importingExcel}
                  />
                </label>
                <p className="mt-2 text-xs text-slate-500">
                  Required columns: <strong>Student ID</strong> and <strong>Full Name</strong>.
                </p>
                {importedFileName ? (
                  <p className="mt-1 text-xs text-slate-600">Last imported file: {importedFileName}</p>
                ) : null}
              </div>
            </ContentSection>
          ) : null}

          {isAssignListPath ? (
            <ContentSection
              title="Class Cards"
              subtitle="Select a class card to open the student list page."
            >
              {assignmentRooms.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No class assignments found yet.
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {assignmentRooms.map((room) => (
                    <button
                      key={room.room_id}
                      type="button"
                      onClick={() => openAssignmentRoomPage(room.room_id)}
                      className="group rounded-3xl border border-slate-200 bg-white px-5 py-3.5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#1E3A8A] hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xl font-extrabold text-[#1E3A8A]">{room.room_name}</p>
                          <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                            Code: {room.room_code}
                          </p>
                        </div>
                        <div className="rounded-full bg-blue-50 p-2 text-[#3149D6]">
                          <GraduationCap className="h-5 w-5" />
                        </div>
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-2">
                        <span className="text-4xl font-extrabold leading-none text-[#1E3A8A]">
                          {room.students_count}
                        </span>
                        <span className="text-sm font-bold uppercase tracking-wide text-slate-600">
                          Students
                        </span>
                      </div>

                    </button>
                  ))}
                </div>
              )}
            </ContentSection>
          ) : (
            <ContentSection
              title={selectedAssignmentRoom ? `${selectedAssignmentRoom.room_name} - Student List` : "Class Student List"}
              subtitle={
                selectedAssignmentRoom
                  ? `Class Code: ${selectedAssignmentRoom.room_code} | Total Students: ${selectedAssignmentRoom.students_count}`
                  : "Class data not found."
              }
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search student by ID or Name..."
                    className="w-64 rounded-xl border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  />
                  <button
                    type="button"
                    onClick={closeAssignmentRoomPage}
                    className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Back To Class Cards
                  </button>
                </div>
              }
            >
              {!selectedAssignmentRoom ? (
                <p className="text-sm text-slate-500">Class not found.</p>
              ) : selectedAssignmentRoom.students.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No students have been assigned to this class yet.
                </p>
              ) : filteredStudents.length === 0 ? (
                <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                  No students match your search.
                </p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200 bg-white text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">No</th>
                        <th className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">Student ID</th>
                        <th className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">Full Name</th>
                        <th className="px-4 py-3 text-left font-semibold text-[#1E3A8A]">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredStudents.map((student, index) => (
                      <tr key={`${selectedAssignmentRoom.room_id}-${student.student_id}-${index}`} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-slate-700">{index + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-700">{student.student_id}</td>
                        <td className="px-4 py-3 text-slate-700">{student.student_name}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => startEditStudent(student)}
                                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-[#1E3A8A] hover:text-[#1E3A8A]"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => removeStudent(student)}
                                disabled={deletingStudentId === student.student_id}
                                className="inline-flex items-center gap-1 rounded-lg border border-orange-300 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-60"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                {deletingStudentId === student.student_id ? "Deleting..." : "Delete"}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </ContentSection>
          )}
        </>
      ) : null}

      {showAddModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Add Room</h3>
              <button
                type="button"
                onClick={closeAddModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={onSubmitRoom} className="grid gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Room Name</label>
                <input
                  name="name"
                  value={roomForm.name}
                  onChange={onRoomFormChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeAddModal}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingRoom}
                  className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
                >
                  {savingRoom ? "Saving..." : "Save Room"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showEditModal && editingRoomId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Edit Room</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form onSubmit={onSubmitRoom} className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Room Name</label>
                <input
                  name="name"
                  value={roomForm.name}
                  onChange={onRoomFormChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Status</label>
                <select
                  name="status"
                  value={roomForm.status}
                  onChange={onRoomFormChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
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
                  disabled={savingRoom}
                  className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
                >
                  {savingRoom ? "Saving..." : "Update Room"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingStudent ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-semibold text-[#1E3A8A]">Edit Student</h3>
            <p className="mt-1 text-sm text-slate-500">When you leave a field, it saves automatically.</p>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Student ID</label>
              <input
                value={editingStudentId}
                onChange={(event) => setEditingStudentId(event.target.value)}
                onBlur={() => {
                  if (!savingStudentEdit) {
                    saveEditStudent({ closeAfterSave: false });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveEditStudent({ closeAfterSave: false });
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
              <input
                value={editingStudentName}
                onChange={(event) => setEditingStudentName(event.target.value)}
                onBlur={() => {
                  if (!savingStudentEdit) {
                    saveEditStudent({ closeAfterSave: false });
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    saveEditStudent({ closeAfterSave: false });
                  }
                }}
                className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelEditStudent}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => saveEditStudent({ closeAfterSave: true })}
                disabled={savingStudentEdit}
                className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
              >
                {savingStudentEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRosterImportModal && rosterImportRoom ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#1E3A8A]">Import Roster</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Room: <span className="font-semibold text-slate-700">{rosterImportRoom.name}</span>{" "}
                  <span className="text-slate-400">({rosterImportRoom.code})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeRosterImportModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Settings</p>
              <p className="mt-1 text-xs text-slate-600">
                Required: <strong>Student ID</strong> and <strong>Full Name</strong>.{" "}
                <span className="text-slate-500">Email is optional.</span>
              </p>

              <div className="mt-3 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Column Order</label>
                  <select
                    value="id_name_email"
                    disabled
                    className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none"
                  >
                    <option value="id_name_email">Student ID, Full Name, Email (Optional)</option>
                  </select>
                </div>

                <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div>
                    <label className="mb-1 block text-xs font-semibold text-slate-600">File Type</label>
                    <select
                      value={rosterImportFileType}
                      onChange={(event) => {
                        setRosterImportFileType(event.target.value);
                        setRosterImportFile(null);
                        if (rosterFileInputRef.current) rosterFileInputRef.current.value = "";
                      }}
                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                    >
                      <option value="XLSX">XLSX</option>
                      <option value="CSV">CSV</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={downloadRosterTemplate}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                  >
                    Download Template
                  </button>
                </div>
              </div>

              <label className="mt-3 inline-flex items-center gap-2 text-xs font-medium text-slate-600">
                <input
                  type="checkbox"
                  checked={rosterImportHasHeaders}
                  onChange={(event) => setRosterImportHasHeaders(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                />
                Includes column headers
              </label>
            </div>

            <input
              ref={rosterFileInputRef}
              type="file"
              accept={rosterImportFileType === "CSV" ? ".csv" : ".xlsx,.xls"}
              className="hidden"
              onChange={onRosterFileChange}
            />

            <div className="mt-6 flex flex-col gap-2">
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeRosterImportModal}
                  className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={openRosterFilePicker}
                  disabled={quickImportingRoomId === String(rosterImportRoom.id)}
                  className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
                >
                  {quickImportingRoomId === String(rosterImportRoom.id) ? "Importing..." : "Choose File"}
                </button>
              </div>

              <p className="text-xs text-slate-500">Maximum of 300 students</p>
            </div>
          </div>
        </div>
      ) : null}

      {showRosterManualModal && rosterManualRoom ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-[#1E3A8A]">Add Students</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Room: <span className="font-semibold text-slate-700">{rosterManualRoom.name}</span>{" "}
                  <span className="text-slate-400">({rosterManualRoom.code})</span>
                </p>
              </div>
              <button
                type="button"
                onClick={closeRosterManualModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
                title="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">Manual (Type In)</p>
              <p className="mt-1 text-xs text-slate-600">
                Fields: <strong>Student ID</strong> and <strong>Full Name</strong>.
              </p>
            </div>

            <div className="mt-4 space-y-3">
              {manualRosterStudents.map((row, index) => (
                <div
                  key={`${index}-${rosterManualRoom.id}`}
                  className="grid gap-3 md:grid-cols-[1fr_2fr_auto] md:items-end"
                >
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Student ID</label>
                    <input
                      value={row.student_id}
                      onChange={(event) => updateManualRosterStudent(index, "student_id", event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                      placeholder="e.g., S001"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                    <input
                      value={row.student_name}
                      onChange={(event) => updateManualRosterStudent(index, "student_name", event.target.value)}
                      className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                      placeholder="e.g., Ismail Abdulkadir"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => removeManualRosterStudent(index)}
                    className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-orange-600"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <button
                type="button"
                onClick={addManualRosterStudent}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
              >
                <Plus className="h-4 w-4" />
                Add Another
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeRosterManualModal}
                className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveManualRosterStudents}
                disabled={quickImportingRoomId === String(rosterManualRoom.id)}
                className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:opacity-70"
              >
                {quickImportingRoomId === String(rosterManualRoom.id) ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default RoomManagementSection;
