import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useCurrentUser } from "@/components/UserProvider";

export function UserInfo() {
  const { user, loading } = useCurrentUser();

  if (loading) {
    return (
      <div className="flex items-center gap-3 rounded-full bg-muted/50 py-1.5 pl-1.5 pr-4">
        <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
        <div className="h-3.5 w-14 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2.5 rounded-full border border-border/50 bg-background/80 py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur-sm">
        <Avatar size="default">
          <AvatarFallback className="bg-muted text-muted-foreground text-xs">
            ?
          </AvatarFallback>
        </Avatar>
        <span className="text-sm text-muted-foreground">未登录</span>
      </div>
    );
  }

  const initials = user.user_name?.slice(0, 1) ?? "?";

  return (
    <div className="group flex items-center gap-2.5 rounded-full border border-border/50 bg-background/80 py-1.5 pl-1.5 pr-4 shadow-sm backdrop-blur-sm transition-all hover:border-border hover:shadow-md">
      <div className="relative">
        <Avatar size="default">
          <AvatarImage src={user.avatar} alt={user.user_name} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-violet-500 text-white text-xs font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <span className="absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-green-500" />
      </div>
      <span className="text-sm font-medium text-foreground/90 transition-colors group-hover:text-foreground">
        {user.user_name}
      </span>
    </div>
  );
}
