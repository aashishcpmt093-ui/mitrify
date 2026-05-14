import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Home, Bell, Phone } from "lucide-react";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { useLanguage } from "@/lib/language";
import { useHomeRoute } from "@/hooks/use-auth";

interface NotificationItem {
  id: number;
  userId: string;
  title: string;
  message: string;
  type: string;
  isRead: boolean;
  createdAt: string | null;
}

export default function NotificationsPage() {
  const [, setLocation] = useLocation();
  const { t } = useLanguage();
  const homeRoute = useHomeRoute();

  const { data: notifications, isLoading } = useQuery<NotificationItem[]>({
    queryKey: ["/api/notifications"],
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/notifications/read-all", {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
      queryClient.invalidateQueries({ queryKey: ["/api/notifications/unread-count"] });
    },
  });

  // On mount, mark every notification as read so the menu badge clears
  // immediately. We do this once per page open so the user sees the
  // unread-vs-read styling on the *current* visit, then everything is
  // marked read going forward.
  useEffect(() => {
    markAllRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formatTime = (iso: string | null) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-card border-b px-4 py-3 flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setLocation(homeRoute)}
          data-testid="button-home"
        >
          <Home className="w-5 h-5" />
        </Button>
        <h1 className="font-semibold text-lg" data-testid="text-page-title">{t("notifications")}</h1>
      </header>

      <main className="p-4 max-w-2xl mx-auto space-y-3">
        {isLoading && (
          <p className="text-center text-muted-foreground py-8" data-testid="text-loading">
            {t("loading")}
          </p>
        )}

        {!isLoading && (!notifications || notifications.length === 0) && (
          <div className="text-center py-16 text-muted-foreground" data-testid="empty-notifications">
            <Bell className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">{t("noNotifications")}</p>
            <p className="text-sm mt-1">{t("noNotificationsHint")}</p>
          </div>
        )}

        {notifications?.map((n) => {
          const isCall = n.type === "call";
          return (
            <Card
              key={n.id}
              className={n.isRead ? "" : "border-primary/40 bg-primary/5"}
              data-testid={`card-notification-${n.id}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCall ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : "bg-primary/10 text-primary"}`}>
                    {isCall ? <Phone className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm" data-testid={`text-title-${n.id}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span
                          className="w-2 h-2 rounded-full bg-primary shrink-0 mt-1.5"
                          data-testid={`dot-unread-${n.id}`}
                        />
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-1" data-testid={`text-message-${n.id}`}>
                      {n.message}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-2" data-testid={`text-time-${n.id}`}>
                      {formatTime(n.createdAt)}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
