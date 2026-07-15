import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ImportIcon } from "../components/AppIcons";
import { PageHeader } from "../components/PageHeader";
import { Panel } from "../components/Panel";
import {
  clearAllNotifications,
  getVisibleNotifications,
  markNotificationRead,
  NOTIFICATION_FEED,
  NOTIFICATIONS_UPDATED_EVENT,
  readNotificationCenterState
} from "../lib/notificationCenter";
import { readNotificationPreferences } from "../lib/notificationPreferences";
import { api } from "../lib/api";

export function NotificationsPage() {
  const [, setRevision] = useState(0);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const notificationPreferences = readNotificationPreferences();
  const visibleFeed = getVisibleNotifications();
  const serverNotificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.notifications.list()
  });
  const markServerNotificationRead = useMutation({
    mutationFn: api.notifications.markRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  const markAllServerNotificationsRead = useMutation({
    mutationFn: api.notifications.markAllRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] })
  });
  const serverNotifications = serverNotificationsQuery.data || [];
  const { readIds } = readNotificationCenterState();
  const unreadCount = visibleFeed.filter((item) => !readIds.includes(item.id)).length + serverNotifications.filter((item) => item.status !== "read").length;
  const enabledEventCount = NOTIFICATION_FEED.filter((item) => notificationPreferences[item.preference]).length;
  const visibleIds = useMemo(() => visibleFeed.map((item) => item.id), [visibleFeed]);

  useEffect(() => {
    const refresh = () => setRevision((current) => current + 1);

    window.addEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(NOTIFICATIONS_UPDATED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleClearAll = () => {
    clearAllNotifications(visibleIds);
    void markAllServerNotificationsRead.mutateAsync();
    setRevision((current) => current + 1);
  };

  const handleOpenNotification = (id: string) => {
    markNotificationRead(id);
    setRevision((current) => current + 1);
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
          { label: "Recent events", value: visibleFeed.length + serverNotifications.length },
          { label: "Unread", value: unreadCount },
          { label: "In-app", value: notificationPreferences.inApp ? "Enabled" : "Off" },
          { label: "Event prefs", value: `${enabledEventCount}/${NOTIFICATION_FEED.length}` }
        ]}
      />

      <Panel
        actions={(
          <button className="ghost-button" disabled={!visibleFeed.length && !serverNotifications.length} onClick={handleClearAll} type="button">
            <ImportIcon />
            <span>Clear All</span>
          </button>
        )}
        title="Notification list"
        subtitle="Unread events stay highlighted until opened."
      >
        {visibleFeed.length || serverNotifications.length ? (
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
                  <span className="status-pill tone-info">{isUnread ? "Unread" : "Read"}</span>
                </button>
              );
            })}
            {visibleFeed.map((item) => {
              const isUnread = !readIds.includes(item.id);

              return (
                <button
                  className={isUnread ? "stack-item notification-list-item is-unread" : "stack-item notification-list-item"}
                  key={item.id}
                  onClick={() => handleOpenNotification(item.id)}
                  type="button"
                >
                  <div>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </div>
                  <span className={`status-pill tone-${item.tone}`}>{isUnread ? "Unread" : "Read"}</span>
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
