import { FormEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { AddIcon, ExportIcon } from "../components/AppIcons";
import { api } from "../lib/api";
import { CatalogSearchFilter } from "../components/CatalogSearchFilter";
import { CatalogSelectionControls } from "../components/CatalogSelectionControls";
import { CatalogViewToggle } from "../components/CatalogViewToggle";
import { DataTable, type DataTableColumn } from "../components/DataTable";
import { FormField } from "../components/FormField";
import { InfoTooltip } from "../components/InfoTooltip";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { SubnavTabs } from "../components/SubnavTabs";
import { TileCardSkeletonGrid } from "../components/TileCardSkeletonGrid";
import { TileCardFact, TileCardIconFrame, TileCardStatusIndicator, TileCardUsersIcon } from "../components/TileCardPrimitives";
import { ToastMessage } from "../components/ToastMessage";
import { WorkspaceBackButton, WorkspaceMasterDetail } from "../components/WorkspaceMasterDetail";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { useAuth } from "../auth/AuthContext";
import { useWorkspaceData } from "../hooks/useWorkspaceData";
import { hasPermission } from "../lib/permissions";
import { resolveVisibleEmail } from "../lib/userDisplay";
import { readDefaultCatalogViewMode } from "../lib/viewPreferences";
import type { Permission, PermissionGroup, Role, User } from "../types";

type PeopleView = "users" | "roles";
type FeedbackTone = "success" | "error";

const EMPTY_ROLE_DRAFT = { name: "" };
const displayUserRoleName = (user: User) => user.role_name || (user.role === "admin" ? "Jira administrator" : "Viewer");
const JIRA_DERIVED_PERMISSION_CODES = new Set([
  "settings.manage",
  "feature_flag.manage",
  "project.manage",
  "project.delete",
  "role.manage",
  "project_member.manage",
  "integration.manage",
  "ops.manage"
]);
const formatPermissionLabel = (code: string) =>
  code
    .split(".")
    .map((part) => part.replace(/_/g, " "))
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" / ");

export function PeoplePage({
  forcedView,
  embedded = false
}: {
  forcedView?: PeopleView;
  embedded?: boolean;
} = {}) {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const { session } = useAuth();
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const { users, roles } = useWorkspaceData();
  const permissions = useQuery({
    queryKey: ["permissions"],
    queryFn: api.roles.permissions,
    enabled: Boolean(session)
  });
  const [feedback, setFeedback] = useState<{ message: string; tone: FeedbackTone } | null>(null);
  const [view, setView] = useState<PeopleView>(forcedView || (searchParams.get("view") === "roles" ? "roles" : "users"));
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [roleDraft, setRoleDraft] = useState(EMPTY_ROLE_DRAFT);
  const [rolePermissionDraft, setRolePermissionDraft] = useState<string[]>([]);
  const [createRolePermissionDraft, setCreateRolePermissionDraft] = useState<string[]>([]);
  const [isCreateRoleModalOpen, setIsCreateRoleModalOpen] = useState(false);
  const [isCreateRolePermissionExpanded, setIsCreateRolePermissionExpanded] = useState(false);
  const [activeCreateRolePermissionGroup, setActiveCreateRolePermissionGroup] = useState("");
  const [activeEditRolePermissionGroup, setActiveEditRolePermissionGroup] = useState("");
  const [userCatalogViewMode, setUserCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [roleCatalogViewMode, setRoleCatalogViewMode] = useState<"tile" | "list">(() => readDefaultCatalogViewMode());
  const [selectedActionRoleIds, setSelectedActionRoleIds] = useState<string[]>([]);
  const [isExportingRoles, setIsExportingRoles] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [createRoleDraft, setCreateRoleDraft] = useState(EMPTY_ROLE_DRAFT);
  const selectedRolePermissions = useQuery({
    queryKey: ["roles", selectedRoleId, "permissions"],
    queryFn: () => api.roles.rolePermissions(selectedRoleId),
    enabled: Boolean(session && selectedRoleId)
  });

  const userItems = users.data || [];
  const roleItems = roles.data || [];
  const isUserCatalogLoading = users.isPending;
  const isRoleCatalogLoading = roles.isPending || users.isPending;
  const selectedUser = useMemo(
    () => userItems.find((item) => item.id === selectedUserId) || null,
    [selectedUserId, userItems]
  );
  const selectedRole = useMemo(
    () => roleItems.find((item) => item.id === selectedRoleId) || null,
    [selectedRoleId, roleItems]
  );
  const isAdmin = session?.user.role === "admin";
  const canManageRoles = isAdmin && hasPermission(session, "role.manage");
  const canViewUsers = hasPermission(session, "user.view");
  const visibleUserEmail = (email?: string | null) => resolveVisibleEmail(email, canViewUsers);
  const permissionGroups = permissions.data || [];
  const allPermissionCodes = useMemo(
    () => permissionGroups.flatMap((group) => group.permissions.map((permission) => permission.code)),
    [permissionGroups]
  );
  const memberDefaultPermissionCodes = useMemo(
    () => allPermissionCodes.filter((code) => ![
      "project.delete",
      "settings.manage",
      "workspace_preferences.manage",
      "api_key.manage",
      "localization.manage",
      "ai_prompt.manage",
      "feature_flag.manage",
      "user.manage",
      "user.import",
      "role.manage",
      "project_member.manage",
      "requirement.delete",
      "testcase.delete",
      "suite.delete",
      "run.delete",
      "schedule.delete",
      "integration.manage",
      "integration.import_export",
      "transaction.manage",
      "ops.manage"
    ].includes(code)),
    [allPermissionCodes]
  );
  const userCountByRoleName = useMemo(
    () =>
      userItems.reduce<Record<string, number>>((counts, user) => {
        const roleName = displayUserRoleName(user);
        counts[roleName] = (counts[roleName] || 0) + 1;
        return counts;
      }, {}),
    [userItems]
  );
  const filteredUserItems = useMemo(() => {
    const normalizedSearch = userSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return userItems;
    }

    return userItems.filter((user) =>
      [user.id, user.name, visibleUserEmail(user.email), user.role_name, user.role_id, user.role]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [userItems, userSearch, visibleUserEmail]);
  const filteredRoleItems = useMemo(() => {
    const normalizedSearch = roleSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return roleItems;
    }

    return roleItems.filter((role) =>
      [role.id, role.name, `${userCountByRoleName[role.name] || 0} assigned`]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch)
    );
  }, [roleItems, roleSearch, userCountByRoleName]);
  const visibleRoleIds = useMemo(() => filteredRoleItems.map((role) => role.id), [filteredRoleItems]);
  const areAllFilteredRolesSelected = visibleRoleIds.length > 0 && visibleRoleIds.every((id) => selectedActionRoleIds.includes(id));
  const userListColumns = useMemo<Array<DataTableColumn<User>>>(() => [
    {
      key: "name",
      label: "User",
      canToggle: false,
      width: 260,
      minWidth: 180,
      sortValue: (user) => user.name || visibleUserEmail(user.email),
      render: (user) => (
        <div className="data-table-multiline">
          <strong>{user.name || "Unnamed user"}</strong>
          <span className="data-table-multiline-line">{visibleUserEmail(user.email)}</span>
        </div>
      )
    },
    {
      key: "role",
      label: "Role",
      width: 140,
      minWidth: 110,
      sortValue: displayUserRoleName,
      render: displayUserRoleName
    },
    {
      key: "email",
      label: "Email",
      defaultVisible: false,
      width: 260,
      minWidth: 160,
      render: (user) => visibleUserEmail(user.email)
    }
  ], [visibleUserEmail]);
  const roleListColumns = useMemo<Array<DataTableColumn<Role>>>(() => [
    {
      key: "role",
      label: "Role",
      canToggle: false,
      width: 240,
      minWidth: 160,
      sortValue: (role) => role.name,
      render: (role) => <strong>{role.name}</strong>
    },
    {
      key: "assigned",
      label: "Assigned users",
      width: 150,
      minWidth: 120,
      sortValue: (role) => userCountByRoleName[role.name] || 0,
      render: (role) => userCountByRoleName[role.name] || 0
    }
  ], [userCountByRoleName]);
  useEffect(() => {
    if (selectedRole) {
      setRoleDraft({ name: selectedRole.name });
      return;
    }

    setRoleDraft(EMPTY_ROLE_DRAFT);
  }, [selectedRole]);

  useEffect(() => {
    setRolePermissionDraft((selectedRolePermissions.data || []).map((permission) => permission.code));
  }, [selectedRolePermissions.data]);

  useEffect(() => {
    setActiveEditRolePermissionGroup("");
  }, [selectedRoleId]);

  useEffect(() => {
    if (forcedView) {
      if (view !== forcedView) {
        setView(forcedView);
      }
      return;
    }

    const requestedView = searchParams.get("view");
    if ((requestedView === "users" || requestedView === "roles") && requestedView !== view) {
      setView(requestedView);
    }
  }, [forcedView, searchParams, view]);

  useEffect(() => {
    if (view !== "users") {
      return;
    }

    const requestedUserId = searchParams.get("userId") || "";

    if (!requestedUserId) {
      if (selectedUserId) {
        setSelectedUserId("");
      }
      return;
    }

    if (requestedUserId === selectedUserId) {
      return;
    }

    if (userItems.some((item) => item.id === requestedUserId)) {
      setSelectedUserId(requestedUserId);
    }
  }, [searchParams, selectedUserId, userItems, view]);

  useEffect(() => {
    if (view !== "roles") {
      return;
    }

    const requestedRoleId = searchParams.get("roleId") || "";

    if (!requestedRoleId) {
      if (selectedRoleId) {
        setSelectedRoleId("");
      }
      return;
    }

    if (requestedRoleId === selectedRoleId) {
      return;
    }

    if (roleItems.some((item) => item.id === requestedRoleId)) {
      setSelectedRoleId(requestedRoleId);
    }
  }, [roleItems, searchParams, selectedRoleId, view]);

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["users"] }),
      queryClient.invalidateQueries({ queryKey: ["roles"] }),
      queryClient.invalidateQueries({ queryKey: ["permissions"] })
    ]);
  };

  const showFeedback = (message: string, tone: FeedbackTone) => {
    setFeedback({ message, tone });
  };

  const syncPeopleSearchParams = (nextView: PeopleView, nextUserId?: string | null, nextRoleId?: string | null) => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.set("view", nextView);

    if (nextView === "users") {
      if (nextUserId) {
        nextParams.set("userId", nextUserId);
      } else {
        nextParams.delete("userId");
      }
      nextParams.delete("roleId");
    } else {
      if (nextRoleId) {
        nextParams.set("roleId", nextRoleId);
      } else {
        nextParams.delete("roleId");
      }
      nextParams.delete("userId");
    }

    if (nextParams.toString() !== searchParams.toString()) {
      setSearchParams(nextParams, { replace: true });
    }
  };

  const openUserWorkspace = (userId: string) => {
    setView("users");
    setSelectedRoleId("");
    setSelectedUserId(userId);
    syncPeopleSearchParams("users", userId, null);
  };

  const openRoleWorkspace = (roleId: string) => {
    setView("roles");
    setSelectedUserId("");
    setSelectedRoleId(roleId);
    setActiveEditRolePermissionGroup("");
    syncPeopleSearchParams("roles", null, roleId);
  };

  const handleViewChange = (nextView: PeopleView) => {
    setView(nextView);

    if (nextView === "users") {
      setSelectedRoleId("");
      syncPeopleSearchParams("users", selectedUserId || null, null);
      return;
    }

    setSelectedUserId("");
    syncPeopleSearchParams("roles", null, selectedRoleId || null);
  };

  const openCreateRoleModal = () => {
    setCreateRoleDraft(EMPTY_ROLE_DRAFT);
    setCreateRolePermissionDraft(memberDefaultPermissionCodes);
    setIsCreateRolePermissionExpanded(false);
    setActiveCreateRolePermissionGroup("");
    setIsCreateRoleModalOpen(true);
  };

  const closeCreateRoleModal = () => {
    if (createRole.isPending) {
      return;
    }

    setIsCreateRoleModalOpen(false);
    setIsCreateRolePermissionExpanded(false);
    setActiveCreateRolePermissionGroup("");
    setCreateRoleDraft(EMPTY_ROLE_DRAFT);
    setCreateRolePermissionDraft(memberDefaultPermissionCodes);
  };

  const createRole = useMutation({
    mutationFn: api.roles.create,
    onSuccess: async (response) => {
      showFeedback("Role created.", "success");
      openRoleWorkspace(response.id);
      setIsCreateRoleModalOpen(false);
      setIsCreateRolePermissionExpanded(false);
      setActiveCreateRolePermissionGroup("");
      setCreateRoleDraft(EMPTY_ROLE_DRAFT);
      await invalidate();
    },
    onError: (error) => showFeedback(error instanceof Error ? error.message : "Unable to create role", "error")
  });

  const updateRole = useMutation({
    mutationFn: ({ id, input }: { id: string; input: { name: string; permission_codes?: string[] } }) => api.roles.update(id, input),
    onSuccess: async () => {
      showFeedback("Role updated.", "success");
      await invalidate();
    },
    onError: (error) => showFeedback(error instanceof Error ? error.message : "Unable to update role", "error")
  });

  const deleteRole = useMutation({
    mutationFn: api.roles.delete,
    onSuccess: async () => {
      showFeedback("Role removed.", "success");
      setSelectedRoleId("");
      syncPeopleSearchParams("roles", null, null);
      await invalidate();
    },
    onError: (error) => showFeedback(error instanceof Error ? error.message : "Unable to delete role", "error")
  });

  const replaceRolePermissions = useMutation({
    mutationFn: ({ id, permissionCodes }: { id: string; permissionCodes: string[] }) =>
      api.roles.replacePermissions(id, permissionCodes),
    onSuccess: async () => {
      showFeedback("Role permissions updated.", "success");
      await queryClient.invalidateQueries({ queryKey: ["roles", selectedRoleId, "permissions"] });
    },
    onError: (error) => showFeedback(error instanceof Error ? error.message : "Unable to update role permissions", "error")
  });

  const handleRoleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    createRole.mutate({ name: createRoleDraft.name, permission_codes: createRolePermissionDraft });
  };

  const togglePermission = (code: string, target: "create" | "edit") => {
    const setter = target === "create" ? setCreateRolePermissionDraft : setRolePermissionDraft;
    setter((current) => current.includes(code) ? current.filter((item) => item !== code) : [...current, code].sort());
  };

  const setPermissionGroup = (group: PermissionGroup, checked: boolean, target: "create" | "edit") => {
    const groupCodes = group.permissions.map((permission) => permission.code);
    const setter = target === "create" ? setCreateRolePermissionDraft : setRolePermissionDraft;

    setter((current) => {
      const next = new Set(current);
      for (const code of groupCodes) {
        if (checked) {
          next.add(code);
        } else {
          next.delete(code);
        }
      }
      return [...next].sort();
    });
  };

  const renderPermissionMatrix = (selectedCodes: string[], target: "create" | "edit") => {
    const isJiraAdministratorProfile = target === "edit" && selectedRole?.id === "jira-admin";
    const matrixPermissionGroups = permissionGroups.map((group) => ({
      ...group,
      permissions: isJiraAdministratorProfile
        ? group.permissions
        : group.permissions.filter((permission) => !JIRA_DERIVED_PERMISSION_CODES.has(permission.code))
    })).filter((group) => group.permissions.length);
    const selectedSet = new Set(selectedCodes);
    const selectedPermissions = matrixPermissionGroups.flatMap((group) =>
      group.permissions
        .filter((permission) => selectedSet.has(permission.code))
        .map((permission) => ({ ...permission, groupLabel: group.label }))
    );
    const availablePermissions = matrixPermissionGroups.flatMap((group) =>
      group.permissions
        .filter((permission) => !selectedSet.has(permission.code))
        .map((permission) => ({ ...permission, groupLabel: group.label }))
    );

    const setAllPermissions = (checked: boolean) => {
      const setter = target === "create" ? setCreateRolePermissionDraft : setRolePermissionDraft;
      const assignableCodes = matrixPermissionGroups.flatMap((group) => group.permissions.map((permission) => permission.code));
      setter(checked ? assignableCodes : []);
    };

    const totalPermissionCount = matrixPermissionGroups.reduce((total, group) => total + group.permissions.length, 0);
    const selectedPercent = totalPermissionCount ? Math.round((selectedPermissions.length / totalPermissionCount) * 100) : 0;
    const activeGroupKey = target === "create"
      ? activeCreateRolePermissionGroup
      : activeEditRolePermissionGroup;
    const setActiveGroupKey = target === "create" ? setActiveCreateRolePermissionGroup : setActiveEditRolePermissionGroup;

    return (
      <div className="permission-designer">
        <div className={target === "create" ? "permission-designer-summary permission-designer-summary--create-role" : "permission-designer-summary"}>
          {target === "create" ? (
            <div className="permission-create-role-inline">
              <FormField label="Role name" required>
                <input
                  autoFocus
                  name="name"
                  placeholder="qa-manager"
                  value={createRoleDraft.name}
                  onChange={(event) => setCreateRoleDraft({ name: event.target.value })}
                />
              </FormField>
              <div className="detail-summary permission-create-role-default-copy">
                <strong>Default permissions</strong>
                <span>Member-safe permissions are selected by default. Adjust the list below before creating the role.</span>
              </div>
            </div>
          ) : null}
          <div className="permission-designer-counts">
            <strong>{selectedPermissions.length} selected</strong>
            <span>{availablePermissions.length} available to add</span>
          </div>
          <div className="permission-designer-actions">
            <button className="ghost-button compact-button" disabled={isJiraAdministratorProfile} onClick={() => setAllPermissions(true)} type="button">
              Add All
            </button>
            <button className="ghost-button compact-button danger" disabled={isJiraAdministratorProfile} onClick={() => setAllPermissions(false)} type="button">
              Clear
            </button>
          </div>
        </div>
        <div className="permission-designer-progress">
          <strong>{selectedPermissions.length} of {totalPermissionCount} permissions selected</strong>
          <span aria-hidden="true"><i style={{ width: `${selectedPercent}%` }} /></span>
        </div>

        {!isJiraAdministratorProfile ? (
          <div className="jira-authority-note" role="note">
            <strong>Jira administration stays Jira-derived</strong>
            <span>Project, role, integration, feature, and operations administration cannot be granted through a Qaira membership role.</span>
          </div>
        ) : null}

        <div className="permission-group-strip permission-group-strip--accordion">
          {matrixPermissionGroups.map((group) => {
            const groupCodes = group.permissions.map((permission) => permission.code);
            const selectedCount = groupCodes.filter((code) => selectedCodes.includes(code)).length;
            const isAllSelected = selectedCount === groupCodes.length && groupCodes.length > 0;
            const isExpanded = group.key === activeGroupKey;

            return (
              <section className={isExpanded ? "permission-group-card is-expanded" : "permission-group-card is-collapsed"} key={group.key}>
                <div className="permission-group-head">
                  <button
                    aria-expanded={isExpanded}
                    className="permission-group-expand-button"
                    onClick={() => setActiveGroupKey((current) => current === group.key ? "" : group.key)}
                    type="button"
                  >
                    <span aria-hidden="true" className="permission-group-chevron">{isExpanded ? "-" : "+"}</span>
                    <span className="permission-group-copy">
                      <strong>{group.label}</strong>
                      <span>{selectedCount} of {groupCodes.length} selected</span>
                    </span>
                  </button>
                  <label className="permission-toggle-all">
                    <input
                      checked={isAllSelected}
                      disabled={isJiraAdministratorProfile}
                      onChange={(event) => setPermissionGroup(group, event.target.checked, target)}
                      type="checkbox"
                    />
                    <span>All</span>
                  </label>
                </div>
                {isExpanded ? (
                  <div className="permission-option-list">
                    {group.permissions.map((permission) => (
                      <label className="permission-option" key={permission.code}>
                        <input
                          checked={selectedCodes.includes(permission.code)}
                          disabled={isJiraAdministratorProfile}
                          onChange={() => togglePermission(permission.code, target)}
                          type="checkbox"
                        />
                        <span className="permission-option-copy">
                          <strong className="permission-option-title">{formatPermissionLabel(permission.code)}</strong>
                          <code className="permission-option-code">{permission.code}</code>
                          {permission.description ? <small className="permission-option-description">{permission.description}</small> : null}
                        </span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    );
  };

  const confirmDeleteRole = async (role: Role) => {
    if (!(await confirmDelete({ message: `Delete role "${role.name}"? Users currently assigned to this role may need reassignment first.` }))) {
      return;
    }

    deleteRole.mutate(role.id);
  };

  useEffect(() => {
    if (!isCreateRoleModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !createRole.isPending) {
        closeCreateRoleModal();
      }
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [createRole.isPending, isCreateRoleModalOpen]);

  const closeUserWorkspace = () => {
    setSelectedUserId("");
    syncPeopleSearchParams("users", null, null);
  };

  const closeRoleWorkspace = () => {
    setSelectedRoleId("");
    setRoleDraft(EMPTY_ROLE_DRAFT);
    syncPeopleSearchParams("roles", null, null);
  };

  const downloadJsonFile = (filename: string, value: unknown) => {
    const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");

    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
  };

  const handleExportUsers = () => {
    downloadJsonFile(`qaira-users-${new Date().toISOString().slice(0, 10)}.json`, {
      exported_at: new Date().toISOString(),
      users: userItems.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        visible_email: visibleUserEmail(user.email),
        jira_access: user.role,
        qaira_role_id: user.role_id,
        qaira_role_name: displayUserRoleName(user)
      }))
    });
  };

  const groupRolePermissionsForExport = (rolePermissions: Permission[]) => {
    const permissionByCode = new Map(rolePermissions.map((permission) => [permission.code, permission]));
    const groupedCodes = new Set<string>();
    const groupedPermissions = permissionGroups
      .map((group) => {
        const permissionsForGroup = group.permissions
          .filter((permission) => permissionByCode.has(permission.code))
          .map((permission) => {
            groupedCodes.add(permission.code);
            return {
              code: permission.code,
              description: permission.description
            };
          });

        return {
          key: group.key,
          label: group.label,
          permissions: permissionsForGroup
        };
      })
      .filter((group) => group.permissions.length > 0);

    const ungroupedPermissions = rolePermissions
      .filter((permission) => !groupedCodes.has(permission.code))
      .map((permission) => ({
        code: permission.code,
        description: permission.description
      }));

    if (ungroupedPermissions.length) {
      groupedPermissions.push({
        key: "ungrouped",
        label: "Ungrouped permissions",
        permissions: ungroupedPermissions
      });
    }

    return groupedPermissions;
  };

  const handleExportRoles = async () => {
    if (isExportingRoles) {
      return;
    }

    setIsExportingRoles(true);

    try {
      const rolesWithPermissions = await Promise.all(roleItems.map(async (role) => {
        const rolePermissions = await api.roles.rolePermissions(role.id);
        const permissionCodes = rolePermissions.map((permission) => permission.code).sort();

        return {
          id: role.id,
          name: role.name,
          assigned_users: userCountByRoleName[role.name] || 0,
          permission_codes: permissionCodes,
          permission_groups: groupRolePermissionsForExport(rolePermissions)
        };
      }));

      downloadJsonFile(`qaira-roles-${new Date().toISOString().slice(0, 10)}.json`, {
        exported_at: new Date().toISOString(),
        permission_catalog: permissionGroups.map((group) => ({
          key: group.key,
          label: group.label,
          permission_codes: group.permissions.map((permission) => permission.code)
        })),
        roles: rolesWithPermissions
      });
      showFeedback(`${rolesWithPermissions.length} role${rolesWithPermissions.length === 1 ? "" : "s"} exported with permissions.`, "success");
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Unable to export roles", "error");
    } finally {
      setIsExportingRoles(false);
    }
  };

  const handleDeleteSelectedRoles = async () => {
    const selectedIds = selectedActionRoleIds.filter((id) => roleItems.some((role) => role.id === id));

    if (!selectedIds.length || !(await confirmDelete({ message: `Delete ${selectedIds.length} selected role${selectedIds.length === 1 ? "" : "s"}? Assigned users may need reassignment.` }))) {
      return;
    }

    try {
      await Promise.all(selectedIds.map((id) => api.roles.delete(id)));
      setSelectedActionRoleIds([]);
      if (selectedIds.includes(selectedRoleId)) {
        setSelectedRoleId("");
        syncPeopleSearchParams("roles", null, null);
      }
      showFeedback(`${selectedIds.length} role${selectedIds.length === 1 ? "" : "s"} removed.`, "success");
      await invalidate();
    } catch (error) {
      showFeedback(error instanceof Error ? error.message : "Unable to delete selected roles", "error");
    }
  };

  const accessActions = view === "users" ? (
    <button className="ghost-button" disabled={!userItems.length} onClick={handleExportUsers} type="button"><ExportIcon />Export Jira directory</button>
  ) : canManageRoles ? (
      <>
        <button className="ghost-button" disabled={!roleItems.length || isExportingRoles} onClick={() => void handleExportRoles()} type="button">
          <ExportIcon />{isExportingRoles ? "Exporting roles..." : "Export roles"}
        </button>
        <button className="primary-button" onClick={openCreateRoleModal} type="button"><AddIcon />Create role</button>
      </>
  ) : null;

  return (
    <div className={embedded ? "admin-embedded-page people-access-page" : "page-content people-access-page"}>
      {confirmationDialog}
      {!embedded ? (
        <PageHeader
          eyebrow="People & Access"
          title={forcedView === "roles" ? "Roles" : forcedView === "users" ? "Users" : "User Management"}
          description={forcedView === "roles" ? "Review role definitions, selected permissions, and reusable access labels." : "Review the active Jira directory and the Qaira project role derived for each Atlassian account."}
          meta={[
            { label: "Users", value: userItems.length },
            { label: "Roles", value: roleItems.length },
            { label: "Your access", value: canManageRoles ? "Role manager" : isAdmin ? "Admin" : "Member" }
          ]}
        />
      ) : null}

      {feedback ? (
        <ToastMessage message={feedback.message} onDismiss={() => setFeedback(null)} tone={feedback.tone} />
      ) : null}

      {!forcedView ? (
        <SubnavTabs
          value={view}
          onChange={handleViewChange}
          items={[
            { value: "users", label: "Users", meta: `${userItems.length} records` },
            { value: "roles", label: "Roles", meta: `${roleItems.length} records` }
          ]}
        />
      ) : null}

      {view === "users" ? (
        <WorkspaceMasterDetail
          className="people-roles-workspace"
          browseView={(
            <Panel
              title="Users"
              titleVariant="eyebrow"
              subtitle="Jira remains the identity and product-access authority; Qaira presents the active project directory without duplicating accounts."
            >
              <div className="design-list-toolbar people-catalog-toolbar">
                <CatalogSearchFilter
                  activeFilterCount={userSearch.trim() ? 1 : 0}
                  ariaLabel="Search users"
                  onChange={setUserSearch}
                  placeholder="Search users"
                  subtitle="Search by name, email, or role."
                  title="User search"
                  type="search"
                  value={userSearch}
                >
                  <div className="catalog-filter-grid">
                    <div className="catalog-filter-actions">
                      <button className="ghost-button" disabled={!userSearch.trim()} onClick={() => setUserSearch("")} type="button">
                        Clear search
                      </button>
                    </div>
                  </div>
                </CatalogSearchFilter>
                <CatalogViewToggle onChange={setUserCatalogViewMode} value={userCatalogViewMode} />
                {accessActions ? <div className="catalog-toolbar-actions">{accessActions}</div> : null}
              </div>
              {isUserCatalogLoading ? <TileCardSkeletonGrid /> : null}
              {!isUserCatalogLoading && filteredUserItems.length && userCatalogViewMode === "tile" ? (
                <div className="tile-browser-grid">
                  {filteredUserItems.map((user) => (
                    <button
                      className={selectedUser?.id === user.id ? "record-card tile-card is-active" : "record-card tile-card"}
                      key={user.id}
                      onClick={() => openUserWorkspace(user.id)}
                      type="button"
                    >
                      <div className="tile-card-main">
                        <div className="tile-card-header">
                          <TileCardIconFrame tone={user.role === "admin" ? "info" : "success"}>
                            <TileCardUsersIcon />
                          </TileCardIconFrame>
                          <div className="tile-card-title-group">
                            <strong>{user.name || "Unnamed user"}</strong>
                            <span className="tile-card-kicker">{visibleUserEmail(user.email)}</span>
                          </div>
                          <TileCardStatusIndicator title={`${displayUserRoleName(user)} access`} tone={user.role === "admin" ? "info" : "success"} />
                        </div>
                        <p className="tile-card-description">{user.role === "admin" ? "Jira administration is derived from live Jira permissions." : "Qaira access is scoped to the selected Jira project."}</p>
                        <div className="people-card-footer">
                          <span className="count-pill">{displayUserRoleName(user)}</span>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {!isUserCatalogLoading && filteredUserItems.length && userCatalogViewMode === "list" ? (
                <DataTable
                  columns={userListColumns}
                  enableColumnResize
                  enableHeaderColumnReorder
                  emptyMessage="No users match the current search."
                  getRowClassName={(user) => (selectedUser?.id === user.id ? "is-active-row" : "")}
                  getRowKey={(user) => user.id}
                  hideToolbarCopy
                  onRowClick={(user) => openUserWorkspace(user.id)}
                  rows={filteredUserItems}
                  storageKey="qaira:users:list-columns"
                />
              ) : null}
              {!isUserCatalogLoading && !userItems.length ? <div className="empty-state compact">No users found yet.</div> : null}
              {!isUserCatalogLoading && userItems.length > 0 && !filteredUserItems.length ? <div className="empty-state compact">No users match the current search.</div> : null}
            </Panel>
          )}
          detailView={(
            <Panel
              actions={<WorkspaceBackButton label="Back to user tiles" onClick={closeUserWorkspace} />}
              title="Selected user"
              subtitle={selectedUser ? "Identity details come from Jira; Qaira does not create, rename, password-manage, or delete Atlassian accounts." : "Select a Jira user to review project access."}
            >
              {selectedUser ? (
                <div className="detail-stack">
                  <div className="detail-summary">
                    <strong>{selectedUser.name || "Unnamed user"}</strong>
                    <span>{visibleUserEmail(selectedUser.email)}</span>
                    <span>{displayUserRoleName(selectedUser)} · {selectedUser.role_id || "viewer"}</span>
                  </div>
                  <div className="jira-authority-note" role="note">
                    <strong>Managed by Atlassian</strong>
                    <span>Invite, suspend, rename, group, product-access, and password operations belong in Atlassian Administration. Qaira only applies its project-scoped role and permissions.</span>
                    <a href="https://admin.atlassian.com" rel="noreferrer" target="_blank">Open Atlassian Administration</a>
                  </div>
                </div>
              ) : (
                <div className="empty-state compact">No user selected.</div>
              )}
            </Panel>
          )}
          isDetailOpen={Boolean(selectedUser)}
        />
      ) : (
        <WorkspaceMasterDetail
          className="people-roles-workspace"
          browseView={(
            <Panel
              title="Roles"
              titleVariant="eyebrow"
              subtitle="Keep role definitions scannable, then open one label into a focused editor when needed."
            >
              <div className="design-list-toolbar people-catalog-toolbar">
                <CatalogSearchFilter
                  activeFilterCount={roleSearch.trim() ? 1 : 0}
                  ariaLabel="Search roles"
                  onChange={setRoleSearch}
                  placeholder="Search roles"
                  subtitle="Search by role name or assigned-user count."
                  title="Role search"
                  type="search"
                  value={roleSearch}
                >
                  <div className="catalog-filter-grid">
                    <div className="catalog-filter-actions">
                      <button className="ghost-button" disabled={!roleSearch.trim()} onClick={() => setRoleSearch("")} type="button">
                        Clear search
                      </button>
                    </div>
                  </div>
                </CatalogSearchFilter>
                <CatalogSelectionControls
                  allSelected={areAllFilteredRolesSelected}
                  canSelectAll={Boolean(visibleRoleIds.length)}
                  deleteAction={{
                    label: "Delete roles",
                    onClick: () => void handleDeleteSelectedRoles()
                  }}
                  onClear={() => setSelectedActionRoleIds([])}
                  onSelectAll={() => setSelectedActionRoleIds((current) => Array.from(new Set([...current, ...visibleRoleIds])))}
                  selectedCount={selectedActionRoleIds.length}
                />
                <CatalogViewToggle onChange={setRoleCatalogViewMode} value={roleCatalogViewMode} />
                {accessActions ? <div className="catalog-toolbar-actions">{accessActions}</div> : null}
              </div>
              {isRoleCatalogLoading ? <TileCardSkeletonGrid /> : null}
              {!isRoleCatalogLoading && filteredRoleItems.length && roleCatalogViewMode === "tile" ? (
                <div className="tile-browser-grid">
                  {filteredRoleItems.map((role) => (
                    <button
                      key={role.id}
                      className={selectedRole?.id === role.id ? "record-card tile-card is-active" : "record-card tile-card"}
                      onClick={() => openRoleWorkspace(role.id)}
                      type="button"
                    >
                      <div className="tile-card-main">
                        <div className="tile-card-select-row" onClick={(event) => event.stopPropagation()}>
                          <label className="checkbox-field">
                            <input
                              aria-label={`Select ${role.name}`}
                              checked={selectedActionRoleIds.includes(role.id)}
                              onChange={() =>
                                setSelectedActionRoleIds((current) =>
                                  current.includes(role.id) ? current.filter((id) => id !== role.id) : [...current, role.id]
                                )
                              }
                              type="checkbox"
                            />
                            <span className="sr-only">Select role</span>
                          </label>
                        </div>
                        <div className="tile-card-header">
                          <TileCardIconFrame tone={role.name === "admin" ? "info" : "success"}>
                            <TileCardUsersIcon />
                          </TileCardIconFrame>
                          <div className="tile-card-title-group">
                            <strong>{role.name}</strong>
                            <span className="tile-card-kicker">{userCountByRoleName[role.name] || 0} assigned</span>
                          </div>
                          <TileCardStatusIndicator title="Reusable role" tone={role.name === "admin" ? "info" : "success"} />
                        </div>
                        <p className="tile-card-description">Project membership label used across assignments and access views.</p>
                        <div className="tile-card-facts" aria-label={`${role.name} facts`}>
                          <TileCardFact label={String(userCountByRoleName[role.name] || 0)} title={`${userCountByRoleName[role.name] || 0} user${(userCountByRoleName[role.name] || 0) === 1 ? "" : "s"} assigned`} tone={(userCountByRoleName[role.name] || 0) ? "success" : "neutral"}>
                            <TileCardUsersIcon />
                          </TileCardFact>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
              {!isRoleCatalogLoading && filteredRoleItems.length && roleCatalogViewMode === "list" ? (
                <DataTable
                  columns={roleListColumns}
                  enableColumnResize
                  enableHeaderColumnReorder
                  emptyMessage="No roles match the current search."
                  getRowClassName={(role) => (selectedRole?.id === role.id ? "is-active-row" : "")}
                  getRowKey={(role) => role.id}
                  hideToolbarCopy
                  onRowClick={(role) => openRoleWorkspace(role.id)}
                  rows={filteredRoleItems}
                  storageKey="qaira:roles:list-columns"
                />
              ) : null}
              {!isRoleCatalogLoading && !roleItems.length ? <div className="empty-state compact">No roles defined yet.</div> : null}
              {!isRoleCatalogLoading && roleItems.length > 0 && !filteredRoleItems.length ? <div className="empty-state compact">No roles match the current search.</div> : null}
            </Panel>
          )}
          detailView={(
            <Panel
              actions={<WorkspaceBackButton label="Back to role tiles" onClick={closeRoleWorkspace} />}
              title="Selected role"
              subtitle={selectedRole ? "Adjust the role name in place." : "Create a role to start reusing it in memberships."}
            >
              {selectedRole ? (
                <div className="detail-stack">
                  <div className="detail-summary">
                    <strong>{selectedRole.name}</strong>
                    <span>{rolePermissionDraft.length} permissions selected</span>
                  </div>
                  {canManageRoles ? (
                    <>
                      <form
                        className="form-grid"
                        onSubmit={(event) => {
                          event.preventDefault();
                          updateRole.mutate({ id: selectedRole.id, input: { name: roleDraft.name, permission_codes: rolePermissionDraft } });
                        }}
                      >
                        <FormField label="Role name">
                          <input
                            disabled={selectedRole.id === "jira-admin"}
                            name="name"
                            value={roleDraft.name}
                            onChange={(event) => setRoleDraft({ name: event.target.value })}
                          />
                        </FormField>
                        <div className="action-row">
                          <button className="primary-button" disabled={updateRole.isPending || selectedRole.id === "jira-admin"} type="submit">
                            {updateRole.isPending ? "Saving…" : "Save role"}
                          </button>
                          <button className="ghost-button danger" disabled={Boolean(selectedRole.system) || deleteRole.isPending || updateRole.isPending} onClick={() => void confirmDeleteRole(selectedRole)} type="button">
                            Delete role
                          </button>
                        </div>
                      </form>

                      <div className="role-permission-editor role-permission-editor--edit people-role-existing-permissions">
                        <div className="detail-summary">
                          <strong>Permissions</strong>
                          <span>Bind feature access and CRUD actions to this role. Changes apply anywhere this role is assigned.</span>
                        </div>
                        {permissions.isLoading || selectedRolePermissions.isLoading ? <TileCardSkeletonGrid /> : renderPermissionMatrix(rolePermissionDraft, "edit")}
                        <div className="action-row">
                          <button
                            className="primary-button"
                            disabled={selectedRole.id === "jira-admin" || replaceRolePermissions.isPending || updateRole.isPending || selectedRolePermissions.isLoading}
                            onClick={() => replaceRolePermissions.mutate({ id: selectedRole.id, permissionCodes: rolePermissionDraft })}
                            type="button"
                          >
                            {replaceRolePermissions.isPending ? "Saving permissions…" : "Save permissions"}
                          </button>
                          <button
                            className="ghost-button"
                            disabled={selectedRole.id === "jira-admin" || replaceRolePermissions.isPending || selectedRolePermissions.isLoading}
                            onClick={() => setRolePermissionDraft((selectedRolePermissions.data || []).map((permission) => permission.code))}
                            type="button"
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="empty-state compact">Read-only access. Ask an admin to change role definitions.</div>
                  )}
                </div>
              ) : (
                <div className="empty-state compact">No role selected.</div>
              )}
            </Panel>
          )}
          isDetailOpen={Boolean(selectedRole)}
          variant="split"
        />
      )}

      {isCreateRoleModalOpen ? (
        <div className="modal-backdrop" onClick={closeCreateRoleModal} role="presentation">
          <div
            aria-labelledby="create-role-title"
            aria-modal="true"
            className={`modal-card people-modal-card people-role-modal-card people-role-create-card${isCreateRolePermissionExpanded ? " is-permission-expanded" : ""}`}
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <div className="people-modal-header">
              <div className="people-modal-title">
                <p className="dialog-context-label">People &amp; access</p>
                <div className="modal-title-info-row">
                  <h2 className="dialog-title" id="create-role-title">Create role</h2>
                  <InfoTooltip content="Keep the role library concise and reusable across assignments." label="Create role information" />
                </div>
              </div>
              <button
                aria-label="Close create role dialog"
                className="ghost-button"
                onClick={closeCreateRoleModal}
                type="button"
              >
                Close
              </button>
            </div>

            <form className="people-modal-form" onSubmit={handleRoleCreate}>
              <div className="people-modal-body people-role-modal-body people-role-create-body">
                <section className="people-role-permissions-panel people-role-create-permissions">
                  <div className="role-permission-editor role-permission-editor--create">
                    {permissions.isLoading ? <TileCardSkeletonGrid /> : renderPermissionMatrix(createRolePermissionDraft, "create")}
                  </div>
                </section>
              </div>

              <div className="action-row people-modal-actions">
                <button className="primary-button" disabled={createRole.isPending} type="submit">
                  {createRole.isPending ? "Creating…" : "Create role"}
                </button>
                <button className="ghost-button" disabled={createRole.isPending} onClick={closeCreateRoleModal} type="button">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
