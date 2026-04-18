import { useEffect, useMemo, useState } from "react";
import ContentSection from "../components/ContentSection.jsx";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { iconMap } from "../components/iconMap.js";
import {
  assignAdminRolePermissions,
  createAdminRole,
  deleteAdminRole,
  getAdminPermissions,
  getAdminRolePermissions,
  getAdminRoles,
  updateAdminRole
} from "../../services/api.js";
import { formatValidationErrors, showConfirm, showError, showSuccess } from "../../utils/alerts.js";

const { Plus, Pencil, Trash2, X, ShieldCheck } = iconMap;

const initialRoleForm = {
  name: ""
};

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function labelRole(roleName) {
  const key = String(roleName || "").toLowerCase();
  if (!key) return "-";
  return key
    .replace(/_/g, " ")
    .split(" ")
    .map((segment) => (segment ? `${segment[0].toUpperCase()}${segment.slice(1)}` : ""))
    .join(" ");
}

function RolePermissionSection({ currentPath, onNavigate }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [summary, setSummary] = useState({ total_roles: 0, total_permissions: 0 });
  const [searchInput, setSearchInput] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(initialRoleForm);
  const [editingRole, setEditingRole] = useState(null);
  const [editForm, setEditForm] = useState(initialRoleForm);

  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [selectedPermissionIds, setSelectedPermissionIds] = useState([]);
  const [loadingAssigned, setLoadingAssigned] = useState(false);

  const isAddPath = currentPath === "/admin/roles/add";
  const isAssignPath = currentPath === "/admin/roles/assign-permissions";
  const isListPath = currentPath === "/admin/roles/list";

  const groupedPermissions = useMemo(() => {
    const groups = {};
    for (const permission of permissions) {
      const group = permission.group || "GENERAL";
      if (!groups[group]) groups[group] = [];
      groups[group].push(permission);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [permissions]);

  const roleColumns = [
    { key: "name", label: "Role" },
    { key: "users_count", label: "Users" },
    { key: "permissions_count", label: "Permissions" },
    { key: "permission_preview", label: "Permission Preview" },
    { key: "created_at", label: "Created At" }
  ];

  const roleRows = roles.map((role) => ({
    id: role.id,
    name: labelRole(role.name),
    users_count: role.users_count ?? 0,
    permissions_count: role.permissions_count ?? 0,
    permission_preview: role.permissions?.slice(0, 3).map((permission) => permission.name).join(", ") || "-",
    created_at: formatDate(role.created_at),
    _raw: role
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
        const [rolesResponse, permissionsResponse] = await Promise.all([
          getAdminRoles({ search: appliedSearch }),
          getAdminPermissions()
        ]);

        if (!active) return;
        const nextRoles = rolesResponse?.roles ?? [];
        setRoles(nextRoles);
        setSummary(rolesResponse?.summary ?? { total_roles: 0, total_permissions: 0 });
        setPermissions(permissionsResponse?.permissions ?? []);

        if (!selectedRoleId && nextRoles.length > 0) {
          setSelectedRoleId(String(nextRoles[0].id));
        } else if (selectedRoleId && !nextRoles.some((role) => String(role.id) === String(selectedRoleId))) {
          setSelectedRoleId(nextRoles.length > 0 ? String(nextRoles[0].id) : "");
        }
      } catch (err) {
        if (!active) return;
        setError(err?.data?.message || "Failed to load roles and permissions.");
      } finally {
        if (active) setLoading(false);
      }
    };

    load();
    return () => {
      active = false;
    };
  }, [appliedSearch, refreshKey]);

  useEffect(() => {
    if (!isAssignPath || !selectedRoleId) return;
    let active = true;

    const loadAssigned = async () => {
      setLoadingAssigned(true);
      try {
        const response = await getAdminRolePermissions(selectedRoleId);
        if (!active) return;
        setSelectedPermissionIds(response?.permission_ids ?? []);
      } catch (err) {
        if (!active) return;
        await showError("Load Failed", err?.data?.message || "Failed to load role permissions.");
      } finally {
        if (active) setLoadingAssigned(false);
      }
    };

    loadAssigned();
    return () => {
      active = false;
    };
  }, [isAssignPath, selectedRoleId]);

  const reload = () => setRefreshKey((prev) => prev + 1);

  const openCreateModal = () => {
    setShowCreateModal(true);
    if (!isAddPath) {
      onNavigate("/admin/roles/add");
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setCreateForm(initialRoleForm);
    if (isAddPath) {
      onNavigate("/admin/roles");
    }
  };

  const openEditModal = (role) => {
    setEditingRole(role);
    setEditForm({ name: role.name });
  };

  const closeEditModal = () => {
    setEditingRole(null);
    setEditForm(initialRoleForm);
  };

  const openAssignPage = (roleId) => {
    setSelectedRoleId(String(roleId));
    onNavigate("/admin/roles/assign-permissions");
  };

  const handleCreateRole = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      await createAdminRole(createForm);
      await showSuccess("Role Created", "Role has been created successfully.");
      closeCreateModal();
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Create role failed.";
      await showError("Create Role Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (event) => {
    event.preventDefault();
    if (!editingRole) return;

    setSubmitting(true);
    try {
      await updateAdminRole(editingRole.id, editForm);
      await showSuccess("Role Updated", "Role updated successfully.");
      closeEditModal();
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Update role failed.";
      await showError("Update Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteRole = async (role) => {
    const confirm = await showConfirm({
      title: "Delete Role?",
      text: `Role "${labelRole(role.name)}" will be deleted.`,
      confirmText: "Delete",
      cancelText: "Cancel",
      confirmButtonColor: "#fd7e14"
    });

    if (!confirm.isConfirmed) return;

    setSubmitting(true);
    try {
      await deleteAdminRole(role.id);
      await showSuccess("Role Deleted", "Role deleted successfully.");
      reload();
    } catch (err) {
      await showError("Delete Failed", err?.data?.message || "Unable to delete role.");
    } finally {
      setSubmitting(false);
    }
  };

  const togglePermission = (permissionId) => {
    setSelectedPermissionIds((prev) => {
      if (prev.includes(permissionId)) {
        return prev.filter((id) => id !== permissionId);
      }
      return [...prev, permissionId];
    });
  };

  const handleSaveAssignments = async () => {
    if (!selectedRoleId) {
      await showError("Missing Role", "Please select a role first.");
      return;
    }

    setSubmitting(true);
    try {
      await assignAdminRolePermissions(selectedRoleId, selectedPermissionIds);
      await showSuccess("Permissions Updated", "Role permissions updated successfully.");
      reload();
    } catch (err) {
      const text = formatValidationErrors(err?.data?.errors) || err?.data?.message || "Assign permissions failed.";
      await showError("Assign Failed", text);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState text="Loading roles and permissions..." />;
  }

  if (error) {
    return (
      <ContentSection title="Roles & Permissions Error" subtitle="Unable to load data right now.">
        <p className="text-sm text-red-600">{error}</p>
      </ContentSection>
    );
  }

  const actionButtonBase = "flex items-center justify-center rounded-full transition-all duration-300 hover:scale-110 hover:brightness-95";
  const actionButtonStyle = {
    width: 38,
    height: 38,
    borderRadius: "50%",
    boxShadow: "0 6px 14px rgba(15,23,42,0.14)"
  };

  return (
    <>
      {isAssignPath ? (
        <ContentSection
          title="Assign Permissions"
          subtitle={`Roles: ${summary.total_roles} | Permissions: ${summary.total_permissions}`}
          actions={
            <button
              type="button"
              onClick={() => onNavigate("/admin/roles")}
              className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Back to Roles
            </button>
          }
        >
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role</label>
                <select
                  value={selectedRoleId}
                  onChange={(event) => setSelectedRoleId(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {labelRole(role.name)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedPermissionIds(permissions.map((permission) => permission.id))}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Select All
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPermissionIds([])}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clear
                </button>
              </div>
            </div>

            {loadingAssigned ? (
              <p className="text-sm text-slate-500">Loading assigned permissions...</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {groupedPermissions.map(([group, groupPermissions]) => (
                  <div key={group} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-sm font-semibold text-[#1E3A8A]">{group}</p>
                    <div className="space-y-1.5">
                      {groupPermissions.map((permission) => (
                        <label key={permission.id} className="flex items-start gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selectedPermissionIds.includes(permission.id)}
                            onChange={() => togglePermission(permission.id)}
                            className="mt-1 h-4 w-4 rounded border-slate-300 text-[#1E3A8A] focus:ring-[#1E3A8A]"
                          />
                          <span>
                            <span className="block font-medium">{permission.label}</span>
                            <span className="block text-xs text-slate-500">{permission.name}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={handleSaveAssignments}
                disabled={submitting}
                className="rounded-xl bg-[#1E3A8A] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting ? "Saving..." : "Save Permissions"}
              </button>
            </div>
          </div>
        </ContentSection>
      ) : (
        <ContentSection
          title="Manage Roles"
          subtitle={`Total roles: ${summary.total_roles} | Total permissions: ${summary.total_permissions}`}
          actions={
            <>
              <div className="flex items-center gap-2">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search roles..."
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
              {!isListPath ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#1E3A8A] px-3 py-2 text-sm font-semibold text-white transition hover:bg-[#172d6d]"
                >
                  <Plus className="h-4 w-4" />
                  Add Role
                </button>
              ) : null}
            </>
          }
        >
          <DataTable
            columns={roleColumns}
            rows={roleRows}
            hideActions={isListPath}
            emptyText="No roles found."
            renderActions={(row) => (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => openAssignPage(row._raw.id)}
                  className={actionButtonBase}
                  style={{
                    ...actionButtonStyle,
                    backgroundColor: "#2563eb",
                    color: "#ffffff"
                  }}
                  title="Assign Permissions"
                >
                  <ShieldCheck className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => openEditModal(row._raw)}
                  disabled={row._raw.is_protected}
                  className={actionButtonBase}
                  style={{
                    ...actionButtonStyle,
                    backgroundColor: row._raw.is_protected ? "#9ca3af" : "#22c55e",
                    color: "#ffffff",
                    cursor: row._raw.is_protected ? "not-allowed" : "pointer",
                    opacity: row._raw.is_protected ? 0.7 : 1
                  }}
                  title={row._raw.is_protected ? "Protected role" : "Edit Role"}
                >
                  <Pencil className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteRole(row._raw)}
                  disabled={row._raw.is_protected}
                  className={actionButtonBase}
                  style={{
                    ...actionButtonStyle,
                    backgroundColor: row._raw.is_protected ? "#9ca3af" : "#fd7e14",
                    color: "#ffffff",
                    cursor: row._raw.is_protected ? "not-allowed" : "pointer",
                    opacity: row._raw.is_protected ? 0.7 : 1
                  }}
                  title={row._raw.is_protected ? "Protected role" : "Delete Role"}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          />
        </ContentSection>
      )}

      {showCreateModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Add Role</h3>
              <button
                type="button"
                onClick={closeCreateModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="space-y-4" onSubmit={handleCreateRole}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role Name</label>
                <input
                  name="name"
                  value={createForm.name}
                  onChange={(event) => setCreateForm({ name: event.target.value })}
                  placeholder="e.g. proctor"
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
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
                  {submitting ? "Saving..." : "Create Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editingRole ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <header className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[#1E3A8A]">Edit Role</h3>
              <button
                type="button"
                onClick={closeEditModal}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:border-slate-300"
              >
                <X className="h-4 w-4" />
              </button>
            </header>

            <form className="space-y-4" onSubmit={handleUpdateRole}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Role Name</label>
                <input
                  name="name"
                  value={editForm.name}
                  onChange={(event) => setEditForm({ name: event.target.value })}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-[#1E3A8A] focus:ring-2 focus:ring-blue-100"
                  required
                />
              </div>
              <div className="flex justify-end gap-2">
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

export default RolePermissionSection;
