import { Bell } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { cn } from "@/lib/utils";

export function NotificationBell() {
  const { notifications, unreadCount, needsAttention, markRead, markAllRead } = useNotifications();
  const nav = useNavigate();

  const handleClick = (n: any) => {
    markRead(n.id);
    if (n.entity_type === "approval_requests" && n.entity_id) {
      // approval_requested → admin/manager should approve/reject
      // approval_reminder → same
      // approval_decided → requester just views
      const action =
        n.type === "approval_decided" ? "view" :
        n.type === "approval_requested" || n.type === "approval_reminder" ? "approve" :
        "view";
      nav({ to: "/dashboard", search: { approval: n.entity_id, action } as any });
    } else if (n.entity_type === "assets" && n.entity_id) {
      nav({ to: "/assets", search: { focus: n.entity_id } as any });
    } else {
      nav({ to: "/dashboard" });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <span className={cn("relative flex items-center justify-center", needsAttention && "animate-pulse")}>
            {needsAttention && (
              <span className="absolute inline-flex h-7 w-7 rounded-full bg-destructive/40 motion-safe:animate-ping" aria-hidden />
            )}
            <Bell className={cn("relative h-5 w-5", needsAttention ? "text-destructive" : unreadCount > 0 && "text-primary")} />
          </span>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          {unreadCount > 0 && (
            <button className="text-xs font-normal text-primary hover:underline" onClick={markAllRead}>
              Mark all read
            </button>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {notifications.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">No notifications</p>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            {notifications.slice(0, 20).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className={cn("flex flex-col items-start gap-0.5 py-2", !n.read_at && "bg-accent/40")}
                onClick={() => handleClick(n)}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read_at && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <p className="text-sm font-medium">{n.title}</p>
                </div>
                {n.body && <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>}
                <p className="text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
              </DropdownMenuItem>
            ))}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
