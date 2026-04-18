import { useEffect, useState } from "react";
import Login from "../pages/auth/Login.jsx";
import Register from "../pages/auth/Register.jsx";
import StudentAccess from "../pages/auth/StudentAccess.jsx";
import AdminDashboard from "../pages/dashboard/AdminDashboard.jsx";
import StudentDashboard from "../pages/dashboard/StudentDashboard.jsx";
import TeacherDashboard from "../pages/dashboard/TeacherDashboard.jsx";
import { isPathInRoleMenu } from "../dashboard/config/menuConfig.js";
import {
  clearAuthData,
  clearStudentData,
  getStoredStudent,
  getStoredToken,
  getStoredUser,
  logoutUser
} from "../services/api.js";
import { showConfirm, showError, showSuccess, showWarning } from "../utils/alerts.js";

function AppRouter() {
  const [path, setPath] = useState(window.location.pathname || "/login");
  const [user, setUser] = useState(() => getStoredUser());
  const [student, setStudent] = useState(() => getStoredStudent());

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname || "/login");
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (path.startsWith("/admin/courses")) {
      window.history.replaceState({}, "", "/admin/dashboard");
      setPath("/admin/dashboard");
      return;
    }

    if (path.startsWith("/teacher/courses")) {
      window.history.replaceState({}, "", "/teacher/dashboard");
      setPath("/teacher/dashboard");
      return;
    }

    const isAdminPath = isPathInRoleMenu("admin", path);
    const isTeacherPath = isPathInRoleMenu("teacher", path);
    const isDashboardPath = isAdminPath || isTeacherPath || path === "/student/dashboard";

    if (!isDashboardPath) return;

    const token = getStoredToken();
    const storedUser = getStoredUser();
    const storedStudent = getStoredStudent();

    if (path === "/student/dashboard") {
      if (!storedStudent) {
        showWarning("Access Denied", "Please use student access link first.");
        clearStudentData();
        setStudent(null);
        if (window.location.pathname !== "/student/access") {
          window.history.pushState({}, "", "/student/access");
        }
        setPath("/student/access");
      }
      return;
    }

    const roleName = storedUser?.role?.name;
    const normalizedRole = roleName === "instructor" ? "teacher" : roleName;

    if (!token || !storedUser || !["admin", "teacher"].includes(normalizedRole)) {
      showWarning("Access Denied", "Please login to continue.");
      clearAuthData();
      setUser(null);
      if (window.location.pathname !== "/login") {
        window.history.pushState({}, "", "/login");
      }
      setPath("/login");
      return;
    }

    if (isAdminPath && normalizedRole !== "admin") {
      showWarning("Unauthorized", "You are not allowed to open the admin dashboard.");
      window.history.pushState({}, "", "/teacher/dashboard");
      setPath("/teacher/dashboard");
      return;
    }

    if (isTeacherPath && normalizedRole !== "teacher") {
      showWarning("Unauthorized", "You are not allowed to open the teacher dashboard.");
      window.history.pushState({}, "", "/admin/dashboard");
      setPath("/admin/dashboard");
    }
  }, [path]);

  const navigate = (nextPath) => {
    if (window.location.pathname !== nextPath) {
      window.history.pushState({}, "", nextPath);
    }
    setPath(nextPath);
    setUser(getStoredUser());
    setStudent(getStoredStudent());
  };

  const handleLogout = async () => {
    const confirm = await showConfirm({
      title: "Confirm Logout",
      text: "Are you sure you want to logout?",
      confirmText: "Yes, Logout",
      cancelText: "Cancel"
    });

    if (!confirm.isConfirmed) {
      return;
    }

    try {
      await logoutUser();
      await showSuccess("Logout Success", "You have been logged out successfully.");
    } catch (error) {
      if (error?.code === "NETWORK_ERROR") {
        await showError("Logout Failed", "Network issue while logging out. Local session will be cleared.");
      } else {
        await showError("Logout Failed", error?.data?.message || "Logout request failed. Local session will be cleared.");
      }
    } finally {
      clearAuthData();
      setUser(null);
      navigate("/login");
    }
  };

  const handleStudentExit = async () => {
    clearStudentData();
    setStudent(null);
    await showSuccess("Session Ended", "Student session was closed.");
    navigate("/student/access");
  };

  if (path === "/" || path === "/login") {
    return <Login onNavigate={navigate} />;
  }

  if (path === "/register") {
    return <Register onNavigate={navigate} />;
  }

  if (path === "/student/access") {
    return <StudentAccess onNavigate={navigate} />;
  }

  if (isPathInRoleMenu("admin", path)) {
    return (
      <AdminDashboard
        user={user}
        onLogout={handleLogout}
        currentPath={path}
        onNavigate={navigate}
      />
    );
  }

  if (isPathInRoleMenu("teacher", path)) {
    return (
      <TeacherDashboard
        user={user}
        onLogout={handleLogout}
        currentPath={path}
        onNavigate={navigate}
      />
    );
  }

  if (path === "/student/dashboard") {
    return <StudentDashboard student={student} onExit={handleStudentExit} />;
  }

  return <Login onNavigate={navigate} />;
}

export default AppRouter;
