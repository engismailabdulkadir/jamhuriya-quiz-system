const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api";

const TOKEN_KEY = "just_quizz_token";
const USER_KEY = "just_quizz_user";
const STUDENT_KEY = "just_quizz_student";

async function apiRequest(path, options = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    Accept: "application/json",
    "X-Requested-With": "XMLHttpRequest",
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers ?? {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers
    });
  } catch (error) {
    const networkError = new Error(
      "Network/CORS error. Please check backend server and CORS configuration."
    );
    networkError.status = 0;
    networkError.code = "NETWORK_ERROR";
    networkError.data = {};
    throw networkError;
  }

  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : { message: "Unexpected non-JSON response from API." };

  if (!response.ok) {
    const error = new Error(data.message || "Request failed.");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export function registerUser(payload) {
  return apiRequest("/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function loginUser(payload) {
  return apiRequest("/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function studentAccess(payload) {
  return apiRequest("/student/access", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getStudentAvailableQuizzes(payload) {
  return apiRequest("/student/quizzes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function getStudentQuizForAttempt(quizId, payload) {
  return apiRequest(`/student/quizzes/${quizId}`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function submitStudentQuizAttempt(quizId, payload) {
  return apiRequest(`/student/quizzes/${quizId}/attempt`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function logStudentProctorEvent(attemptId, payload) {
  return apiRequest(`/student/attempts/${attemptId}/proctor-events`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function logoutUser() {
  return apiRequest("/logout", {
    method: "POST"
  });
}

export function getMe() {
  return apiRequest("/me");
}

export function getAdminDashboardSummary() {
  return apiRequest("/admin/dashboard/summary");
}

export function getTeacherDashboardSummary() {
  return apiRequest("/teacher/dashboard/summary");
}

export function getAdminUsers(params = {}) {
  const query = new URLSearchParams();

  if (params.status) query.set("status", params.status);
  if (params.role) query.set("role", params.role);
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return apiRequest(`/admin/users${qs ? `?${qs}` : ""}`);
}

export function getAdminUserRoleSummary() {
  return apiRequest("/admin/users/roles/summary");
}

export function createAdminUser(payload) {
  return apiRequest("/admin/users", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminUser(userId, payload) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function setAdminUserStatus(userId, isActive) {
  return apiRequest(`/admin/users/${userId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ is_active: Boolean(isActive) })
  });
}

export function deleteAdminUser(userId) {
  return apiRequest(`/admin/users/${userId}`, {
    method: "DELETE"
  });
}

export function getAdminRoles(params = {}) {
  const query = new URLSearchParams();
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return apiRequest(`/admin/roles${qs ? `?${qs}` : ""}`);
}

export function createAdminRole(payload) {
  return apiRequest("/admin/roles", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminRole(roleId, payload) {
  return apiRequest(`/admin/roles/${roleId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteAdminRole(roleId) {
  return apiRequest(`/admin/roles/${roleId}`, {
    method: "DELETE"
  });
}

export function getAdminPermissions() {
  return apiRequest("/admin/permissions");
}

export function getAdminRolePermissions(roleId) {
  return apiRequest(`/admin/roles/${roleId}/permissions`);
}

export function assignAdminRolePermissions(roleId, permissionIds) {
  return apiRequest(`/admin/roles/${roleId}/permissions`, {
    method: "PUT",
    body: JSON.stringify({ permission_ids: permissionIds })
  });
}

export function getAdminQuizzes(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return apiRequest(`/admin/quizzes${qs ? `?${qs}` : ""}`);
}

export function createAdminQuiz(payload) {
  return apiRequest("/admin/quizzes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createAdminBlankQuiz(payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  return apiRequest("/admin/quizzes/blank", {
    method: "POST",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function updateAdminBlankQuiz(quizId, payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  if (isFormData) {
    payload.set("_method", "PUT");
  }
  return apiRequest(`/admin/quizzes/${quizId}/blank`, {
    method: isFormData ? "POST" : "PUT",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function getAdminQuizById(quizId) {
  return apiRequest(`/admin/quizzes/${quizId}`);
}

export function updateAdminQuiz(quizId, payload) {
  return apiRequest(`/admin/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteAdminQuiz(quizId) {
  return apiRequest(`/admin/quizzes/${quizId}`, {
    method: "DELETE"
  });
}

export function generateAdminQuizWithAi(payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  return apiRequest("/admin/quizzes/generate-questions", {
    method: "POST",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function getTeacherQuizzes(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);

  const qs = query.toString();
  return apiRequest(`/teacher/quizzes${qs ? `?${qs}` : ""}`);
}

export function createTeacherQuiz(payload) {
  return apiRequest("/teacher/quizzes", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function createTeacherBlankQuiz(payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  return apiRequest("/teacher/quizzes/blank", {
    method: "POST",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function updateTeacherBlankQuiz(quizId, payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  if (isFormData) {
    payload.set("_method", "PUT");
  }
  return apiRequest(`/teacher/quizzes/${quizId}/blank`, {
    method: isFormData ? "POST" : "PUT",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function getTeacherQuizById(quizId) {
  return apiRequest(`/teacher/quizzes/${quizId}`);
}

export function updateTeacherQuiz(quizId, payload) {
  return apiRequest(`/teacher/quizzes/${quizId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteTeacherQuiz(quizId) {
  return apiRequest(`/teacher/quizzes/${quizId}`, {
    method: "DELETE"
  });
}

export function generateTeacherQuizWithAi(payload) {
  const isFormData = typeof FormData !== "undefined" && payload instanceof FormData;
  return apiRequest("/teacher/quizzes/generate-questions", {
    method: "POST",
    body: isFormData ? payload : JSON.stringify(payload)
  });
}

export function getAdminRooms(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest(`/admin/rooms${qs ? `?${qs}` : ""}`);
}

export function createAdminRoom(payload) {
  return apiRequest("/admin/rooms", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateAdminRoom(roomId, payload) {
  return apiRequest(`/admin/rooms/${roomId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteAdminRoom(roomId) {
  return apiRequest(`/admin/rooms/${roomId}`, {
    method: "DELETE"
  });
}

export function setAdminRoomStatus(roomId, status) {
  return apiRequest(`/admin/rooms/${roomId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function getAdminRoomAssignments() {
  return apiRequest("/admin/rooms/assignments");
}

export function assignAdminRoomStudent(roomId, payload) {
  return apiRequest(`/admin/rooms/${roomId}/students`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function bulkAssignAdminRoomStudents(roomId, students) {
  return apiRequest(`/admin/rooms/${roomId}/students/bulk`, {
    method: "POST",
    body: JSON.stringify({ students })
  });
}

export function updateAdminRoomStudent(roomId, studentId, payload) {
  return apiRequest(`/admin/rooms/${roomId}/students/${encodeURIComponent(studentId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteAdminRoomStudent(roomId, studentId) {
  return apiRequest(`/admin/rooms/${roomId}/students/${encodeURIComponent(studentId)}`, {
    method: "DELETE"
  });
}

export function getTeacherRooms(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  const qs = query.toString();
  return apiRequest(`/teacher/rooms${qs ? `?${qs}` : ""}`);
}

export function createTeacherRoom(payload) {
  return apiRequest("/teacher/rooms", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTeacherRoom(roomId, payload) {
  return apiRequest(`/teacher/rooms/${roomId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteTeacherRoom(roomId) {
  return apiRequest(`/teacher/rooms/${roomId}`, {
    method: "DELETE"
  });
}

export function setTeacherRoomStatus(roomId, status) {
  return apiRequest(`/teacher/rooms/${roomId}/status`, {
    method: "PATCH",
    body: JSON.stringify({ status })
  });
}

export function getTeacherRoomAssignments() {
  return apiRequest("/teacher/rooms/assignments");
}

export function assignTeacherRoomStudent(roomId, payload) {
  return apiRequest(`/teacher/rooms/${roomId}/students`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function bulkAssignTeacherRoomStudents(roomId, students) {
  return apiRequest(`/teacher/rooms/${roomId}/students/bulk`, {
    method: "POST",
    body: JSON.stringify({ students })
  });
}

export function updateTeacherRoomStudent(roomId, studentId, payload) {
  return apiRequest(`/teacher/rooms/${roomId}/students/${encodeURIComponent(studentId)}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deleteTeacherRoomStudent(roomId, studentId) {
  return apiRequest(`/teacher/rooms/${roomId}/students/${encodeURIComponent(studentId)}`, {
    method: "DELETE"
  });
}

export function getAdminAttempts(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.quiz_id) query.set("quiz_id", String(params.quiz_id));
  const qs = query.toString();
  return apiRequest(`/admin/attempts${qs ? `?${qs}` : ""}`);
}

export function getTeacherAttempts(params = {}) {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  if (params.limit) query.set("limit", String(params.limit));
  if (params.quiz_id) query.set("quiz_id", String(params.quiz_id));
  const qs = query.toString();
  return apiRequest(`/teacher/attempts${qs ? `?${qs}` : ""}`);
}

export function setAuthData(token, user) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuthData() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function setStudentData(student) {
  localStorage.setItem(STUDENT_KEY, JSON.stringify(student));
}

export function clearStudentData() {
  localStorage.removeItem(STUDENT_KEY);
}

export function getStoredStudent() {
  const raw = localStorage.getItem(STUDENT_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredUser() {
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getStoredToken() {
  return localStorage.getItem(TOKEN_KEY);
}
