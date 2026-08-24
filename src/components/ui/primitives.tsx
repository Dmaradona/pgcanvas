"use client";

import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */

type ButtonVariant = "primary" | "subtle" | "ghost" | "danger" | "dado";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: "sm" | "md";
}

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-elephant text-white border-elephant hover:bg-[#27587c] disabled:bg-line-strong disabled:border-line-strong",
  dado: "bg-dado text-white border-dado hover:bg-[#0c5c49] disabled:bg-line-strong disabled:border-line-strong",
  subtle: "bg-surface text-ink border-line hover:bg-surface-2 hover:border-line-strong",
  ghost: "bg-transparent text-ink-soft border-transparent hover:bg-surface-2 hover:text-ink",
  danger: "bg-surface text-alerta border-line hover:bg-alerta-soft hover:border-alerta",
};

export function Button({
  variant = "subtle",
  size = "md",
  className,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md border font-medium",
        "transition-colors disabled:cursor-not-allowed disabled:opacity-60",
        size === "sm" ? "h-8 px-2.5 text-[12px]" : "h-9 px-3.5 text-[13px]",
        VARIANTS[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: "default" | "danger";
}

export function IconButton({ label, tone = "default", className, children, ...rest }: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent",
        "text-ink-faint transition-colors hover:bg-surface-2 hover:text-ink",
        "disabled:cursor-not-allowed disabled:opacity-40",
        tone === "danger" && "hover:bg-alerta-soft hover:text-alerta",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className }: FieldProps) {
  return (
    <label className={cn("block", className)}>
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span> : null}
    </label>
  );
}

export function TextInput({
  mono,
  className,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { mono?: boolean }) {
  return <input className={cn("field", mono && "field-mono", className)} {...rest} />;
}

export function SelectInput({
  className,
  children,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("field cursor-pointer", className)} {...rest}>
      {children}
    </select>
  );
}

/* ------------------------------------------------------------------ */

interface ToggleProps {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}

export function Toggle({ checked, onChange, label, description }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-surface-2"
    >
      <span className="min-w-0">
        <span className="block text-[13px] font-medium text-ink">{label}</span>
        {description ? (
          <span className="block text-[11px] leading-tight text-ink-faint">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          "relative h-[18px] w-8 shrink-0 rounded-full border transition-colors",
          checked ? "border-elephant bg-elephant" : "border-line-strong bg-surface-3",
        )}
      >
        <span
          className={cn(
            "absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all",
            checked ? "left-[16px]" : "left-[2px]",
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */

interface SegmentedProps<T extends string> {
  value: T;
  options: Array<{ value: T; label: string; icon?: ReactNode }>;
  onChange: (value: T) => void;
  accent?: "elephant" | "dado";
  className?: string;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  accent = "elephant",
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-2 p-0.5",
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-[12.5px] font-medium transition-colors",
              active
                ? accent === "dado"
                  ? "bg-dado text-white shadow-sm"
                  : "bg-elephant text-white shadow-sm"
                : "text-ink-soft hover:bg-surface hover:text-ink",
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}

export function Modal({ open, title, onClose, children, footer, width = 520 }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Fechar"
        className="absolute inset-0 bg-ink/25 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="panel relative z-10 max-h-[85vh] overflow-hidden shadow-xl"
      >
        <header className="flex items-center justify-between border-b border-line px-4 py-3">
          <h2 className="text-[15px] font-semibold">{title}</h2>
          <IconButton label="Fechar" onClick={onClose}>
            <X size={15} />
          </IconButton>
        </header>
        <div className="max-h-[60vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <footer className="flex items-center justify-end gap-2 border-t border-line bg-surface-2 px-4 py-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function KeyBadge({ role }: { role: "pk" | "fk" | "pfk" }) {
  const map = {
    pk: { text: "PK", className: "bg-brass-soft text-brass" },
    fk: { text: "FK", className: "bg-violet-soft text-violet" },
    pfk: { text: "PFK", className: "bg-brass-soft text-brass ring-1 ring-violet/40" },
  } as const;
  const item = map[role];
  return (
    <span
      className={cn(
        "inline-flex h-[15px] items-center rounded-[3px] px-1 font-mono text-[9px] font-semibold leading-none tracking-wide",
        item.className,
      )}
    >
      {item.text}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      <p className="max-w-[38ch] text-[12.5px] leading-relaxed text-ink-faint">{description}</p>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

type ChipTone = "neutral" | "brass" | "violet" | "dado" | "alerta" | "elephant";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "border-line bg-surface-2 text-ink-soft",
  brass: "border-brass/30 bg-brass-soft text-brass",
  violet: "border-violet/30 bg-violet-soft text-violet",
  dado: "border-dado/30 bg-dado-soft text-dado",
  alerta: "border-alerta/30 bg-alerta-soft text-alerta",
  elephant: "border-elephant/30 bg-elephant-soft text-elephant",
};

/** etiqueta curta de atributo, do tipo NOT NULL ou UNIQUE */
export function Chip({
  tone = "neutral",
  title,
  className,
  children,
}: {
  tone?: ChipTone;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex h-[19px] items-center gap-1 rounded-[4px] border px-1.5 font-mono text-[10px] font-semibold leading-none",
        CHIP_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
