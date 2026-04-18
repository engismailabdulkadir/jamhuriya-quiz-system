import { useEffect, useMemo, useState } from "react";
import ContentSection from "../components/ContentSection.jsx";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { iconMap } from "../components/iconMap.js";
import {
  createAdminUser,
  getAdminUserRoleSummary,
  getAdminUsers,
  setAdminUserStatus,
  updateAdminUser
} from "../../services/api.js";
import { formatValidationErrors, showConfirm, showError, showSuccess } from "../../utils/alerts.js";

const { Plus, Pencil, X, ShieldAlert, CheckCircle2 } = iconMap;

const initialForm = {
  full_name: "",
  role: "admin",
  password: "",
  password_confirmation: "",
  is_active: true
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function labelRole(roleName) {
  const key = String(roleName || "").toLowerCase();
  if (key === "admin") return "Admin";
  if (key === "teacher") return "Teacher";
  if (key === "instructor") return "Instructor";
  if (key === "student") return "Student";
  return roleName || "-";
}

function resolveStatusByPath(path) {
  if (path === "/admin/users/active") return "active";
  if (path === "/admin/users/blocked") return "blocked";
  return "all";
}

function UserManagementSection({ currentPath, onNavigate }) {
  const [users, setUsers] = useState([]);
  const [rolesSummary, setRolesSummary] = useState([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, blocked: 0 });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [createForm, setCreateForm] = useState(initialForm);
  const [editForm, setEditForm] = useState(initialForm);
  const [editingUser, setEditingUser] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const isAddPath = currentPath === "/admin/users/add";
  const isRolesPath = currentPath === "/admin/users/roles";
  const statusFilter = useMemo(() => resolveStatusByPath(currentPath), [currentPath]);

  const usersColumns = [
    { key: "full_name", label: "Full Name" },
    { key: "role_label", label: "Role" },
    { key: "status", label: "Status", type: "status" },
    { key: "created_at", label: "Created At" }
  ];

  const roleColumns = [
    { key: "name", label: "Role" },
    { key: "users_count", label: "Users Count" }
  ];

  const rows = users.map((user) => ({
    id: user.id,
    full_name: user.full_name || "-",
    role_label: labelRole(user.role?.name),
    status: user.status || (user.is_active ? "active" : "blocked"),
    created_at: formatDate(user.created_at),
    _raw: user
  }));

  useEffect(() => {
    if (isAddPath) {
      setShowCreateModal(true);
    }
  }, [isAddPath]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const usersResponse = await getAdminUsers({
          status: isRolesPath ? "all" : statusFilter,
          search: appliedSearch
        });

        if (!active) return;
        setUsers(usersResponse?.users ?? []);
        setSummary(usersResponse?.summary ?? { total: 0, active: 0, blocked: 0 });

        if (isRolesPath) {
          const roleResponse = await getAdminUserRoleSummary();
          if (!active) return;
          setRolesSummary(roleResponse?.roles ?? []);
        } else {
          setRolesSummary([]);
        }
      } catch (err) {
        if (!active) return;
        setError(err?.data?.message || "Failed to load users.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, currentPath, isRolesPath, refreshKey, statusFilter]);

  const onCreateChange = (event) => {
    const { name, value, type, checked } = event.target;
    setCreateForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const onEditChange = (event) => {
    const { name, value, type, checked } = event.target;
    setEditForm((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value
    }));
  };

  const reloadUsers = () => setRefreshKey((prev) => prev + 1);

  const openCreateModal = () => {
    setShowCreateModal(true);
    if (currentPath !== "/admin/users/add") {
      onNavigate("/admin/users/add");
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm(initialForm);
    if (currentPath === "/admin/users/add") {
      onNavigate("/admin/users");
    }
  };

  const handleCreateUser = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      await createAdminUser(createForm);
      await showSuccess("User Created", "New user has been created successfully.");
      closeCreateModal();
      reloadUsers();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Create user failed.";
      await showError("Create User Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const openEditModal = (user) => {
    setEditingUser(user);
    setEditForm({
      full_name: user.full_name || "",
      role: user.role?.name || "teacher",
      password: "",
      password_confirmation: "",
      is_active: Boolean(user.is_active)
    });
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setEditForm(initialForm);
  };

  const handleUpdateUser = async (event) => {
    event.preventDefault();
    if (!editingUser) return;

    const payload = {
      full_name: editForm.full_name,
      role: editForm.role,
      is_active: Boolean(editForm.is_active)
    };

    if (editForm.password) {
      payload.password = editForm.password;
      payload.password_confirmation = editForm.password_confirmation;
    }

    setSubmitting(true);
    try {
      await updateAdminUser(editingUser.id, payload);
      await showSuccess("User Updated", "User information updated successfully.");
      closeEditModal();
      reloadUsers();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Update user failed.";
      await showError("Update Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetUserActiveStatus = async (user, nextStatus) => {
    if (!user) return;

    const currentStatus = Boolean(user.is_active);
    if (currentStatus === Boolean(nextStatus)) return;

    const confirm = await showConfirm({
      title: nextStatus ? "Activate User?" : "Block User?",
      text: `User "${user.full_name}" will be ${nextStatus ? "activated" : "blocked"}.`,
      confirmText: nextStatus ? "Activate" : "Block",
      cancelText: "Cancel",
      confirmButtonColor: nextStatus ? "#16a34a" : "#2563eb"
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      await setAdminUserStatus(user.id, nextStatus);
      await showSuccess("Status Updated", `User is now ${nextStatus ? "active" : "blocked"}.`);
      if (!nextStatus && currentPath !== "/admin/users/blocked") {
        onNavigate("/admin/users/blocked");
      } else if (nextStatus && currentPath === "/admin/users/blocked") {
        onNavigate("/admin/users/active");
      }
      reloadUsers();
    } catch (err) {
      await showError("Status Update Failed", err?.data?.message || "Could not update user status.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState text="Loading users..." />;
  }

  if (error) {
    return (
      <ContentSection title="Users Error" subtitle="Unable to load users right now.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  const createFormUi = (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
      <div className="md:col-span-2">
        <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
        <input
          name="full_name"
          value={createForm.full_name}
          onChange={onCreateChange}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
        <select
          name="role"
          value={createForm.role}
          onChange={onCreateChange}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          required
        >
          <option value="admin">Admin</option>
          <option value="teacher">Teacher</option>
          <option value="instructor">Instructor</option>
          <option value="student">Student</option>
        </select>
      </div>
      <div className="flex items-center gap-2 pt-6">
        <input
          id="create-is-active"
          name="is_active"
          type="checkbox"
          checked={createForm.is_active}
          onChange={onCreateChange}
          className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
        />
        <label htmlFor="create-is-active" className="text-sm font-medium text-slate-700">
          Active user
        </label>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Password</label>
        <input
          name="password"
          type="password"
          value={createForm.password}
          onChange={onCreateChange}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">Confirm Password</label>
        <input
          name="password_confirmation"
          type="password"
          value={createForm.password_confirmation}
          onChange={onCreateChange}
          className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
          required
        />
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
          {submitting ? "Saving..." : "Create User"}
        </button>
      </div>
    </form>
  );

  const actionButtonBase = "flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110 hover:brightness-95";
  const actionButtonStyle = {
    width: 38,
    height: 38,
    borderRadius: "50%",
    boxShadow: "0 6px 14px rgba(15,23,42,0.14)"
  };

  const managementActions = (
    <>
      <div className="flex items-center gap-2">
        <input
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by full name"
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
        Add User
      </button>
    </>
  );

  const managementTable = (
    <DataTable
      columns={usersColumns}
      rows={rows}
      emptyText="No users found."
      renderActions={(row) => (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleSetUserActiveStatus(row._raw, true)}
            disabled={submitting || Boolean(row._raw.is_active)}
            className={actionButtonBase}
            style={{
              ...actionButtonStyle,
              backgroundColor: row._raw.is_active ? "#94a3b8" : "#2563eb",
              color: "#ffffff",
              cursor: row._raw.is_active ? "not-allowed" : "pointer",
              opacity: row._raw.is_active ? 0.65 : 1
            }}
            title={row._raw.is_active ? "Already Active" : "Activate User"}
          >
            <CheckCircle2 className="h-4 w-4" />
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
            title="Edit User"
          >
            <Pencil className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => handleSetUserActiveStatus(row._raw, false)}
            disabled={submitting || !Boolean(row._raw.is_active)}
            className={actionButtonBase}
            style={{
              ...actionButtonStyle,
              backgroundColor: row._raw.is_active ? "#fd7e14" : "#94a3b8",
              color: "#ffffff",
              cursor: row._raw.is_active ? "pointer" : "not-allowed",
              opacity: row._raw.is_active ? 1 : 0.65
            }}
            title={row._raw.is_active ? "Block User" : "Already Blocked"}
          >
            <ShieldAlert className="h-4 w-4" />
          </button>
        </div>
      )}
    />
  );

  return (
    <>
      <div className="space-y-6">
        <ContentSection
          title="Users Summary"
          subtitle={`Total: ${summary.total} | Active: ${summary.active} | Blocked: ${summary.blocked}`}
          actions={managementActions}
        >
          {managementTable}
        </ContentSection>

        {isRolesPath ? (
          <ContentSection title="User Roles" subtitle="Role distribution summary.">
            <DataTable columns={roleColumns} rows={rolesSummary} hideActions emptyText="No roles found." />
          </ContentSection>
        ) : null}
      </div>

      {showCreateModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Add User</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            {createFormUi}
          </div>
        </div>
      ) : null}

      {editingUser ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Edit User</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="grid gap-4 md:grid-cols-2" onSubmit={handleUpdateUser}>
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">Full Name</label>
                <input
                  name="full_name"
                  value={editForm.full_name}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                <select
                  name="role"
                  value={editForm.role}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                >
                  <option value="admin">Admin</option>
                  <option value="teacher">Teacher</option>
                  <option value="instructor">Instructor</option>
                  <option value="student">Student</option>
                </select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <input
                  id="edit-is-active"
                  name="is_active"
                  type="checkbox"
                  checked={editForm.is_active}
                  onChange={onEditChange}
                  className="h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                />
                <label htmlFor="edit-is-active" className="text-sm font-medium text-slate-700">
                  Active user
                </label>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">New Password (optional)</label>
                <input
                  name="password"
                  type="password"
                  value={editForm.password}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Confirm Password</label>
                <input
                  name="password_confirmation"
                  type="password"
                  value={editForm.password_confirmation}
                  onChange={onEditChange}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                />
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

export default UserManagementSection;
