import { useState, useEffect, useCallback } from "react";
import { cn, wpsApi } from "@/utils";

export interface WpsFile {
  id: string;
  name: string;
  type: string;
  size: number;
  updated_at: string;
  creator_id: string;
}

export interface FileSelectorProps {
  value?: string[];
  onChange: (fileIds: string[], files: WpsFile[]) => void;
  multiple?: boolean;
  accept?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function FileSelector({
  value,
  onChange,
  multiple = false,
  accept,
  placeholder = "搜索文件...",
  disabled = false,
  className,
}: FileSelectorProps) {
  const [files, setFiles] = useState<WpsFile[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>(value ?? []);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (value !== undefined) {
      setSelectedIds(value);
    }
  }, [value]);

  const fetchFiles = useCallback(async (query: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await wpsApi.get<{ files?: WpsFile[] }>("/v7/files", {
        params: {
          search: query || undefined,
          types: accept?.length ? accept : undefined,
        },
      });
      setFiles(data.files ?? []);
    } catch (e) {
      const err = e as Error & { status?: number };
      if (err.status === 401) {
        setError("未授权，请先完成 WPS 登录");
      } else {
        setError(err.message ?? "加载失败");
      }
    } finally {
      setLoading(false);
    }
  }, [accept]);

  useEffect(() => {
    fetchFiles(search);
  }, [fetchFiles, search]);

  function handleToggle(file: WpsFile) {
    if (disabled) return;

    let nextIds: string[];
    let nextFiles: WpsFile[];

    if (multiple) {
      const isSelected = selectedIds.includes(file.id);
      nextIds = isSelected
        ? selectedIds.filter((id) => id !== file.id)
        : [...selectedIds, file.id];
      nextFiles = isSelected
        ? files.filter((f) => nextIds.includes(f.id))
        : [...files.filter((f) => selectedIds.includes(f.id)), file];
    } else {
      nextIds = [file.id];
      nextFiles = [file];
    }

    if (value === undefined) {
      setSelectedIds(nextIds);
    }
    onChange(nextIds, nextFiles);
  }

  return (
    <div className={cn("w-full rounded-lg border border-input bg-background", className)}>
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

        {!loading && !error && files.length === 0 && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            暂无文件
          </div>
        )}

        {!loading &&
          !error &&
          files.map((file) => {
            const isSelected = selectedIds.includes(file.id);
            return (
              <button
                key={file.id}
                type="button"
                disabled={disabled}
                onClick={() => handleToggle(file)}
                className={cn(
                  "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent",
                  isSelected && "bg-accent/60 font-medium",
                  disabled && "cursor-not-allowed opacity-50",
                )}
              >
                <FileIcon type={file.type} />
                <span className="flex-1 truncate">{file.name}</span>
                {isSelected && (
                  <svg className="h-4 w-4 shrink-0 text-primary" viewBox="0 0 16 16" fill="currentColor">
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

function FileIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    doc: "text-blue-500",
    sheet: "text-green-500",
    slide: "text-orange-500",
    pdf: "text-red-500",
    folder: "text-yellow-500",
  };
  return (
    <svg
      className={cn("h-4 w-4 shrink-0", colors[type] ?? "text-muted-foreground")}
      viewBox="0 0 16 16"
      fill="currentColor"
    >
      <path d="M4 1.5A1.5 1.5 0 002.5 3v10A1.5 1.5 0 004 14.5h8a1.5 1.5 0 001.5-1.5V5.621a1.5 1.5 0 00-.44-1.06l-2.12-2.122A1.5 1.5 0 009.878 2H4z" />
    </svg>
  );
}
