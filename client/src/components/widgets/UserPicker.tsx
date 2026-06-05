import { useState, useEffect, useCallback } from "react";
import { cn, wpsApi } from "@/utils";

export interface WpsUser {
  id: string;
  user_name: string;
  avatar?: string;
  status?: string;
  def_dept_name?: string;
  high_light?: Record<string, string[]>;
}

interface SearchResponse {
  code?: number;
  data?: {
    items?: WpsUser[];
    next_page_token?: string;
    total?: number;
  };
}

export interface UserPickerProps {
  value?: string[];
  onChange: (userIds: string[], users: WpsUser[]) => void;
  multiple?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function UserPicker({
  value,
  onChange,
  multiple = false,
  placeholder = "搜索用户...",
  disabled = false,
  className,
}: UserPickerProps) {
  const [users, setUsers] = useState<WpsUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(value ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value !== undefined) {
      setSelectedIds(value);
    }
  }, [value]);

  const fetchUsers = useCallback(async (query: string) => {
    if (!query.trim()) {
      setUsers([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await wpsApi.get<SearchResponse>("/v7/users/search", {
        params: {
          keyword: query,
          status: "active",
          search_field: "user_name",
          search_source: "company_user",
          page_size: "50",
        },
      });
      setUsers(data.data?.items ?? []);
    } catch (e) {
      const err = e as Error & { status?: number };
      setError(
        err.status === 401
          ? "未授权，请先完成 WPS 登录"
          : (err.message ?? "加载失败"),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => fetchUsers(search), 300);
    return () => clearTimeout(timer);
  }, [fetchUsers, search]);

  function handleToggle(user: WpsUser) {
    if (disabled) return;

    let nextIds: string[];
    let nextUsers: WpsUser[];

    if (multiple) {
      const isSelected = selectedIds.includes(user.id);
      nextIds = isSelected
        ? selectedIds.filter((id) => id !== user.id)
        : [...selectedIds, user.id];
      nextUsers = isSelected
        ? users.filter((u) => nextIds.includes(u.id))
        : [...users.filter((u) => selectedIds.includes(u.id)), user];
    } else {
      nextIds = [user.id];
      nextUsers = [user];
    }

    if (value === undefined) {
      setSelectedIds(nextIds);
    }
    onChange(nextIds, nextUsers);
  }

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-input bg-background",
        className,
      )}
    >
      <div className="border-b border-input p-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className="h-8 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
        />
      </div>

      <div className="max-h-60 overflow-y-auto p-1">
        {loading && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            加载中...
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-6 text-sm text-destructive">
            {error}
          </div>
        )}

        {!loading && !error && search.trim() !== "" && users.length === 0 && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            未找到匹配用户
          </div>
        )}

        {!loading && !error && search.trim() === "" && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            输入关键词搜索用户
          </div>
        )}

        {!loading &&
          !error &&
          users.map((user) => {
            const isSelected = selectedIds.includes(user.id);
            return (
              <button
                key={user.id}
                type="button"
                disabled={disabled}
                onClick={() => handleToggle(user)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "bg-accent/60 font-medium",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <UserAvatar user={user} />
                <div className="flex-1 truncate">
                  <div className="truncate">
                    <HighlightedText
                      html={user.high_light?.user_name?.[0]}
                      fallback={user.user_name}
                    />
                  </div>
                  {user.def_dept_name && (
                    <div className="truncate text-xs text-muted-foreground">
                      {user.def_dept_name}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <svg
                    className="h-4 w-4 shrink-0 text-primary"
                    viewBox="0 0 16 16"
                    fill="currentColor"
                  >
                    <path d="M12.207 4.793a1 1 0 010 1.414l-5 5a1 1 0 01-1.414 0l-2-2a1 1 0 011.414-1.414L6.5 9.086l4.293-4.293a1 1 0 011.414 0z" />
                  </svg>
                )}
              </button>
            );
          })}
      </div>
    </div>
  );
}

function HighlightedText({
  html,
  fallback,
}: {
  html?: string;
  fallback: string;
}) {
  if (!html) return <>{fallback}</>;

  const parts = html.split(/(<em>.*?<\/em>)/g);
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^<em>(.*)<\/em>$/);
        if (match) {
          return (
            <span key={i} className="text-blue-600 dark:text-blue-400">
              {match[1]}
            </span>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function UserAvatar({ user }: { user: WpsUser }) {
  const initials = user.user_name?.slice(0, 1) ?? "?";

  if (user.avatar) {
    return (
      <img
        src={user.avatar}
        alt={user.user_name}
        className="h-7 w-7 shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-blue-500 to-violet-500 text-xs font-semibold text-white">
      {initials}
    </div>
  );
}
