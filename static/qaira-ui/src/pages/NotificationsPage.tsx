import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { TrashIcon } from "../components/AppIcons";
import { useDeleteConfirmation } from "../components/DeleteConfirmationDialog";
import { HierarchyLoadMoreButton } from "../components/HierarchyLoadMoreButton";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { useCurrentProject } from "../hooks/useCurrentProject";
import { NOTIFICATION_EVENT_PREFERENCES } from "../lib/notificationCenter";
import { readNotificationPreferences } from "../lib/notificationPreferences";
import { api } from "../lib/api";
import { getVerifiedNextPageCursor, normalizePagedResult } from "../lib/collectionGuards";
import { hasPermission } from "../lib/permissions";
import type { AppNotification } from "../types";

function formatNotificationTime(value?: string) {
  if (!value) return "Time unavailable";
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? "Time unavailable" : timestamp.toLocaleString();
}

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { session } = useAuth();
  const [projectId] = useCurrentProject();
  const { confirmDelete, confirmationDialog } = useDeleteConfirmation();
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const operationLockRef = useRef(false);
  const [activeOperation, setActiveOperation] = useState<"mark-one" | "mark-all" | `delete:${string}` | "delete-all" | null>(null);
  const notificationPreferences = readNotificationPreferences();
  const notificationScope = projectId || "workspace";
  const notificationQueryKey = ["notifications", "feed", notificationScope] as const;
  const unreadNotificationQueryKey = ["notifications", "unread", notificationScope] as const;
  const canManageNotifications = hasPermission(session, "notification.manage");
  const notificationsBusy = activeOperation !== null;
  const serverNotificationsQuery = useInfiniteQuery({
    queryKey: notificationQueryKey,
    queryFn: async ({ pageParam }) => {
      const response = await api.notifications.list({ cursor: pageParam, limit: 25 });
      const normalized = normalizePagedResult<AppNotification>(response);
      const unreadCount = !Array.isArray(response) && Number.isFinite(Number(response?.unread_count))
        ? Math.max(0, Number(response.unread_count))
        : normalized.items.filter((item) => item.status !== "read").length;
      return { ...normalized, unread_count: unreadCount };
    },
    enabled: Boolean(session),
    getNextPageParam: (lastPage, _allPages, _lastPageParam, allPageParams) => {
      const nextCursor = getVerifiedNextPageCursor(lastPage);
      return nextCursor && !allPageParams.includes(nextCursor) ? nextCursor : undefined;
    },
    initialPageParam: undefined as string | undefined,
    staleTime: 60_000
  });
  const markServerNotificationRead = useMutation({
    mutationFn: api.notifications.markRead
  });
  const markAllServerNotificationsRead = useMutation({
    mutationFn: api.notifications.markAllRead
  });
  const deleteServerNotification = useMutation({
    mutationFn: api.notifications.delete
  });
  const deleteAllServerNotifications = useMutation({
    mutationFn: api.notifications.deleteAll
  });
  const notificationPages = serverNotificationsQuery.data?.pages || [];
  const allServerNotifications = notificationPages.flatMap((page) => page.items);
  const totalNotificationCount = notificationPages[0]?.total ?? allServerNotifications.length;
  const serverNotifications = allServerNotifications.filter((item) => {
    const preference = item.preference as keyof typeof notificationPreferences | undefined;
    return !preference || preference === "inApp" || preference === "digest" || notificationPreferences[preference] !== false;
  });
  const unreadCount = notificationPages[0]?.unread_count ?? serverNotifications.filter((item) => item.status !== "read").length;
  const enabledEventCount = NOTIFICATION_EVENT_PREFERENCES.filter((preference) => notificationPreferences[preference]).length;

  const beginNotificationOperation = (operation: NonNullable<typeof activeOperation>) => {
    if (operationLockRef.current) return false;
    operationLockRef.current = true;
    setActiveOperation(operation);
    return true;
  };

  const endNotificationOperation = () => {
    operationLockRef.current = false;
    setActiveOperation(null);
  };

  useEffect(() => {
    if (!session) return undefined;
    const timer = window.setInterval(() => {
      if (operationLockRef.current) return;
      // Reset before the fallback refresh so an infinite feed only reloads its
      // first 25-item page, regardless of how many continuations were viewed.
      void queryClient.resetQueries({ queryKey: notificationQueryKey, exact: true });
    }, 300_000);
    return () => window.clearInterval(timer);
  }, [notificationScope, queryClient, session]);

  const refreshNotifications = async () => {
    await Promise.all([
      // Resetting an infinite query discards loaded continuations before the
      // active first page refetches, keeping post-mutation refresh bounded.
      queryClient.resetQueries({ queryKey: notificationQueryKey, exact: true }),
      queryClient.invalidateQueries({ queryKey: unreadNotificationQueryKey, exact: true })
    ]);
  };

  const handleMarkAllRead = async () => {
    if (!canManageNotifications || !unreadCount || !beginNotificationOperation("mark-all")) return;
    setFeedback(null);
    try {
      const result = await markAllServerNotificationsRead.mutateAsync();
      setFeedback({
        tone: result.partial ? "error" : "success",
        message: result.partial
          ? `${result.count} notification${result.count === 1 ? "" : "s"} marked as read, but ${result.remaining} remain. Retry Mark all read to finish safely.`
          : `${result.count} notification${result.count === 1 ? "" : "s"} marked as read.`
      });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to mark all notifications as read."
      });
    } finally {
      try {
        await refreshNotifications();
      } finally {
        endNotificationOperation();
      }
    }
  };

  const handleOpenServerNotification = async (item: AppNotification) => {
    if (operationLockRef.current) return;
    setFeedback(null);
    if (canManageNotifications && item.status !== "read") {
      if (!beginNotificationOperation("mark-one")) return;
      try {
        const result = await markServerNotificationRead.mutateAsync(item.id);
        if (!result.updated) setFeedback({ tone: "error", message: "This notification was removed while it was being opened." });
      } catch (error) {
        setFeedback({
          tone: "error",
          message: error instanceof Error ? error.message : "Unable to mark the notification as read."
        });
      } finally {
        try {
          await refreshNotifications();
        } finally {
          endNotificationOperation();
        }
      }
    }
    if (item.target_url) {
      navigate(item.target_url);
    }
  };

  const handleDeleteNotification = async (item: AppNotification) => {
    if (!canManageNotifications || !beginNotificationOperation(`delete:${item.id}`)) return;
    let mutationStarted = false;
    try {
      const confirmed = await confirmDelete({
        title: "Delete notification?",
        message: `Delete “${item.title}”? This removes it only from your notification center in this Jira project.`,
        confirmLabel: "Delete notification"
      });
      if (!confirmed) return;

      mutationStarted = true;
      setFeedback(null);
      await deleteServerNotification.mutateAsync(item.id);
      setFeedback({ tone: "success", message: "Notification deleted." });
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to delete the notification."
      });
    } finally {
      try {
        if (mutationStarted) await refreshNotifications();
      } finally {
        endNotificationOperation();
      }
    }
  };

  const handleDeleteAllNotifications = async () => {
    if (!canManageNotifications || !totalNotificationCount || !beginNotificationOperation("delete-all")) return;
    const count = totalNotificationCount;
    let mutationStarted = false;
    try {
      const confirmed = await confirmDelete({
        title: "Delete all notifications?",
        message: `Delete all ${count} notification${count === 1 ? "" : "s"} currently in your notification center for this Jira project? New notifications that arrive during cleanup will be kept.`,
        confirmLabel: "Delete all"
      });
      if (!confirmed) return;

      mutationStarted = true;
      setFeedback(null);
      const result = await deleteAllServerNotifications.mutateAsync();
      if (result.deleted) {
        setFeedback({
          tone: "success",
          message: `${result.count} notification${result.count === 1 ? "" : "s"} deleted.`
        });
      } else {
        setFeedback({
          tone: "error",
          message: `${result.count} notification${result.count === 1 ? "" : "s"} deleted, but ${result.remaining} could not be removed yet. Retry Delete all to finish safely.`
        });
      }
    } catch (error) {
      setFeedback({
        tone: "error",
        message: error instanceof Error ? error.message : "Unable to delete all notifications."
      });
    } finally {
      try {
        if (mutationStarted) await refreshNotifications();
      } finally {
        endNotificationOperation();
      }
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Notifications"
        title="Notification Center"
        description="Review recent in-app quality, governance, integration, and execution events."
        meta={[
          { label: "Recent events", value: totalNotificationCount },
          { label: "Unread", value: unreadCount },
          { label: "In-app", value: notificationPreferences.inApp ? "Enabled" : "Off" },
          { label: "Event prefs", value: `${enabledEventCount}/${NOTIFICATION_EVENT_PREFERENCES.length}` }
        ]}
      />

      <Panel
        actions={(
          <div className="notification-toolbar-actions">
            <button
              className="ghost-button"
              disabled={!canManageNotifications || !unreadCount || notificationsBusy}
              onClick={() => void handleMarkAllRead()}
              type="button"
            >
              <span>{activeOperation === "mark-all" ? "Marking read…" : "Mark all read"}</span>
            </button>
            <button
              className="ghost-button notification-delete-all-button"
              disabled={!canManageNotifications || !totalNotificationCount || notificationsBusy}
              onClick={() => void handleDeleteAllNotifications()}
              type="button"
            >
              <TrashIcon size={16} />
              <span>{activeOperation === "delete-all" ? "Deleting…" : "Delete all"}</span>
            </button>
          </div>
        )}
        title="Notification list"
        subtitle="Unread events stay highlighted until opened."
      >
        {feedback ? (
          <p aria-live="polite" className={feedback.tone === "error" ? "inline-message error-message" : "inline-message success-message"}>
            {feedback.message}
          </p>
        ) : null}

        {serverNotificationsQuery.isPending ? (
          <LoadingState label="Loading notifications" description="Retrieving this project's notification history." />
        ) : serverNotificationsQuery.isError ? (
          <div className="empty-state compact notification-error-state" role="alert">
            <p>{serverNotificationsQuery.error instanceof Error ? serverNotificationsQuery.error.message : "Unable to load notifications."}</p>
            <button className="ghost-button compact" disabled={notificationsBusy} onClick={() => void refreshNotifications()} type="button">Retry</button>
          </div>
        ) : (
          <>
            {serverNotifications.length ? (
              <div className="stack-list notification-list">
                {serverNotifications.map((item) => {
                  const isUnread = item.status !== "read";
                  const isDeleting = deleteServerNotification.isPending && deleteServerNotification.variables === item.id;

                  return (
                    <article
                      className={isUnread ? "stack-item notification-list-item is-unread" : "stack-item notification-list-item"}
                      key={item.id}
                    >
                      <button
                        aria-busy={activeOperation === "mark-one" && markServerNotificationRead.variables === item.id}
                        className="notification-open-button"
                        disabled={notificationsBusy}
                        onClick={() => void handleOpenServerNotification(item)}
                        type="button"
                      >
                        <span className="notification-list-copy">
                          <strong>{item.title}</strong>
                          <span>{item.message}</span>
                          <small>{formatNotificationTime(item.created_at)}</small>
                        </span>
                        <span className={`status-pill tone-${item.tone || "info"}`}>{isUnread ? "Unread" : "Read"}</span>
                      </button>
                      {canManageNotifications ? (
                        <button
                          aria-label={`Delete notification: ${item.title}`}
                          className="notification-delete-button"
                          disabled={notificationsBusy}
                          onClick={() => void handleDeleteNotification(item)}
                          title="Delete notification"
                          type="button"
                        >
                          {isDeleting ? <span aria-hidden="true" className="notification-action-spinner" /> : <TrashIcon size={16} />}
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="empty-state compact">No notifications to show.</div>
            )}
            {serverNotificationsQuery.hasNextPage ? (
              <HierarchyLoadMoreButton
                isLoading={serverNotificationsQuery.isFetchingNextPage}
                loaded={allServerNotifications.length}
                onLoad={() => serverNotificationsQuery.fetchNextPage()}
                placement="footer"
                scopeLabel="notifications"
                total={totalNotificationCount}
              />
            ) : null}
          </>
        )}
      </Panel>
      {confirmationDialog}
    </div>
  );
}
