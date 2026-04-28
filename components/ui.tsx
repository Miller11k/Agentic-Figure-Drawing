import type { ButtonHTMLAttributes, HTMLAttributes, LabelHTMLAttributes, TextareaHTMLAttributes } from "react";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-[24px] border border-white/70 bg-white/82 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur-2xl",
        className
      )}
      {...props}
    />
  );
}

export function Section({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("rounded-[20px] border border-slate-200/70 bg-white/70 p-4 shadow-sm", className)} {...props} />;
}

export function SectionTitle({ eyebrow, title }: { eyebrow?: string; title: string }) {
  return (
    <div className="space-y-1">
      {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p> : null}
      <h2 className="text-sm font-semibold tracking-tight text-slate-950">{title}</h2>
    </div>
  );
}

export function Button({
  className,
  variant = "secondary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "ghost" | "danger" }) {
  return (
    <button
      className={cx(
        "inline-flex h-10 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition duration-200 ease-out disabled:pointer-events-none disabled:opacity-45",
        variant === "primary" &&
          "bg-slate-950 text-white shadow-[0_10px_26px_rgba(15,23,42,0.18)] hover:bg-slate-800",
        variant === "secondary" &&
          "border border-slate-200/80 bg-white/76 text-slate-800 shadow-sm hover:bg-white",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100/80 hover:text-slate-950",
        variant === "danger" && "border border-red-200 bg-white text-red-700 hover:bg-red-50",
        className
      )}
      {...props}
    />
  );
}

export function FieldLabel({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cx("text-xs font-semibold uppercase tracking-[0.14em] text-slate-500", className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cx(
        "w-full resize-none rounded-[20px] border border-slate-200/80 bg-white/74 p-4 text-sm leading-6 text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-400 focus:bg-white focus:shadow-[0_0_0_4px_rgba(148,163,184,0.16)]",
        className
      )}
      {...props}
    />
  );
}

export function Pill({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full border border-slate-200/80 bg-white/70 px-2.5 py-1 text-xs font-medium text-slate-600",
        className
      )}
      {...props}
    />
  );
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="grid rounded-full border border-slate-200/70 bg-slate-100/70 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((option) => (
        <button
          key={option.value}
          className={cx(
            "h-9 rounded-full text-sm font-semibold transition",
            value === option.value ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"
          )}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SkeletonPanel() {
  return (
    <div className="flex h-full min-h-[520px] items-center justify-center rounded-[32px] border border-white/70 bg-white/70 p-8 shadow-sm backdrop-blur-xl">
      <div className="w-full max-w-md space-y-4">
        <div className="h-4 w-32 animate-pulse rounded-full bg-slate-200" />
        <div className="h-10 w-full animate-pulse rounded-2xl bg-slate-200" />
        <div className="h-24 w-full animate-pulse rounded-3xl bg-slate-100" />
      </div>
    </div>
  );
}
