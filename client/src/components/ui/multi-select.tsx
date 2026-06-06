import { useState, useRef, useEffect } from "react";
import { Check, ChevronDown, X } from "lucide-react";

interface Option {
  value: string;
  label: string;
}

interface MultiSelectProps {
  /** 全部选中的占位文案，如 "全部迭代" */
  allLabel: string;
  options: Option[];
  value: string[];
  onChange: (vals: string[]) => void;
  className?: string;
}

export function MultiSelect({ allLabel, options, value, onChange, className }: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = value.length > 0 ? value : [];
  const display = selected.length === 0
    ? allLabel
    : selected.length <= 2
      ? selected.join(", ")
      : `${selected[0]}, ${selected[1]}...(${selected.length})`;

  const toggle = (v: string) => {
    if (selected.includes(v)) {
      onChange(selected.filter(s => s !== v));
    } else {
      onChange([...selected, v]);
    }
  };

  const clear = () => onChange([]);

  return (
    <div ref={ref} className={`relative ${className || ""}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-9 px-3 text-sm rounded-lg border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
          selected.length > 0
            ? "border-[#2563EB]/40 bg-[#F1F5FD] text-[#2563EB]"
            : "border-[#E4ECFC] bg-white text-[#64748B] hover:border-[#CBD5E1]"
        }`}
      >
        <span className="truncate max-w-[120px]">{display}</span>
        {selected.length > 0 ? (
          <X
            className="w-3.5 h-3.5 shrink-0 hover:text-[#DC2626]"
            onClick={(e) => { e.stopPropagation(); clear(); }}
          />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 w-56 bg-white border border-[#E4ECFC] rounded-lg shadow-lg max-h-64 overflow-auto">
          {options.map(opt => {
            const checked = selected.includes(opt.value);
            return (
              <div
                key={opt.value}
                onClick={() => toggle(opt.value)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-[#F8FAFC] transition-colors ${
                  checked ? "text-[#2563EB] font-medium" : "text-[#0F172A]"
                }`}
              >
                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  checked ? "bg-[#2563EB] border-[#2563EB]" : "border-[#CBD5E1]"
                }`}>
                  {checked && <Check className="w-3 h-3 text-white" />}
                </div>
                <span className="truncate">{opt.label}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}