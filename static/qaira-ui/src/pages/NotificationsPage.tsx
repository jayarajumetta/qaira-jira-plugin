import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import { NOTIFICATION_EVENT_PREFERENCES } from "../lib/notificationCenter";
import { readNotificationPreferences } from "../lib/notificationPreferences";
import { api } from "../lib/api";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notificationPreferences = readNotificationPreferences();
  const serverNotificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list(),
    refetchInterval: 60_000
  });
  const markServerNotificationRead = useMutation({
    mutationFn: api.notifications.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  const markAllServerNotificationsRead = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  const serverNotifications = (serverNotificationsQuery.data || []).filter((item) => {
    const preference = item.preference as keyof typeof notificationPreferences | undefined;
    return !preference || preference === "inApp" || preference === "digest" || notificationPreferences[preference] !== false;
  });
  const unreadCount = serverNotifications.filter((item) => item.status !== "read").length;
  const enabledEventCount = NOTIFICATION_EVENT_PREFERENCES.filter((preference) => notificationPreferences[preference]).length;

  const handleClearAll = () => {
    void markAllServerNotificationsRead.mutateAsync();
  };

  const handleOpenServerNotification = (id: string, targetUrl?: string | null) => {
    void markServerNotificationRead.mutateAsync(id);
    if (targetUrl) {
      navigate(targetUrl);
    }
  };

  return (
    <div className="page-content">
      <PageHeader
        eyebrow="Notifications"
        title="Notification Center"
        description="Review recent in-app quality, governance, integration, and execution events."
        meta={[
          { label: "Recent events", value: serverNotifications.length },
          { label: "Unread", value: unreadCount },
          { label: "In-app", value: notificationPreferences.inApp ? "Enabled" : "Off" },
          { label: "Event prefs", value: `${enabledEventCount}/${NOTIFICATION_EVENT_PREFERENCES.length}` }
        ]}
      />

      <Panel
        actions={(
          <button className="ghost-button" disabled={!serverNotifications.some((item) => item.status !== "read")} onClick={handleClearAll} type="button">
            <span>Mark all read</span>
          </button>
        )}
        title="Notification list"
        subtitle="Unread events stay highlighted until opened."
      >
        {serverNotifications.length ? (
          <div className="stack-list notification-list">
            {serverNotifications.map((item) => {
              const isUnread = item.status !== "read";

              return (
                <button
                  className={isUnread ? "stack-item notification-list-item is-unread" : "stack-item notification-list-item"}
                  key={item.id}
                  onClick={() => handleOpenServerNotification(item.id, item.target_url)}
                  type="button"
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.message}</span>
                  </div>
                  <span className={`status-pill tone-${item.tone || "info"}`}>{isUnread ? "Unread" : "Read"}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="empty-state compact">No notifications to show.</div>
        )}
      </Panel>
    </div>
  );
}
