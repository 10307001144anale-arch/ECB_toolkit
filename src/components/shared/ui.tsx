// Shared UI building blocks. Kept deliberately small and consistent.

import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, ChevronRight, Info, Loader2, Pencil, Search, X, XCircle } from 'lucide-react';
import { Link } from '../../lib/router';
import { BrandIcon } from './brand';

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(' ');
}

// ------------------------------------------------------------------ Button

type Variant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'subtle';
const VARIANTS: Record<Variant, string> = {
  // Primary = navy/white, secondary = white/navy border, accent = orange with navy text.
  // Disabled stays readable: dark gray text on light gray.
  primary: 'bg-navy text-white hover:bg-navy-tint active:bg-navy-shade disabled:bg-slate-100 disabled:text-slate-500 disabled:border disabled:border-slate-200',
  accent: 'bg-orange text-navy hover:bg-orange-shade disabled:bg-slate-100 disabled:text-slate-500 disabled:border disabled:border-slate-200',
  secondary: 'bg-white text-navy border border-navy hover:bg-brand-50 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200',
  ghost: 'text-navy hover:bg-brand-50 disabled:text-slate-500',
  subtle: 'bg-brand-50 text-navy hover:bg-brand-100 disabled:bg-slate-100 disabled:text-slate-500',
  danger: 'bg-red-600 text-white hover:bg-red-800 disabled:bg-slate-100 disabled:text-slate-500',
};
const SIZES = { sm: 'h-8 px-3 text-sm gap-1.5', md: 'h-10 px-4 text-sm gap-2', lg: 'h-11 px-5 text-base gap-2' };

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: keyof typeof SIZES;
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center rounded-lg font-medium transition-colors whitespace-nowrap disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2',
        VARIANTS[variant],
        SIZES[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, className, children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-navy hover:bg-brand-50 disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent', className)}
      {...rest}
    >
      {children}
    </button>
  );
}

// ------------------------------------------------------------------ Layout

export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('rounded-card border border-slate-200 bg-white shadow-card', className)} {...rest}>
      {children}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  useEffect(() => {
    document.title = `${title} · CertiGen`;
  }, [title]);
  return (
    <div className="mb-6">
      {breadcrumbs && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-sm text-slate-500">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-navy hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span className="text-slate-700">{b.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-h1 text-navy">{title}</h1>
          <span className="mt-2 block h-[3px] w-10 rounded-full bg-orange" aria-hidden="true" />
          {description && <p className="mt-2 max-w-3xl text-sm text-slate-500">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      {icon && <div className="mb-3 rounded-full bg-brand-50 p-3 text-navy">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 max-w-md text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <div className={cx('flex items-center justify-center gap-2 py-10 text-sm text-slate-500', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" />
      {label || 'Loading…'}
    </div>
  );
}

// ------------------------------------------------------------------ Badges & alerts

type Tone = 'gray' | 'green' | 'amber' | 'red' | 'blue' | 'violet';
const TONES: Record<Tone, string> = {
  gray: 'bg-slate-100 text-slate-700 ring-slate-300',
  green: 'bg-emerald-50 text-emerald-800 ring-emerald-600',
  amber: 'bg-amber-50 text-amber-900 ring-amber-600',
  red: 'bg-red-50 text-red-800 ring-red-600',
  blue: 'bg-brand-50 text-navy ring-brand-300',
  violet: 'bg-violet-50 text-violet-800 ring-violet-300',
};
/** Status colours are always paired with an icon and the text label. */
const TONE_ICON: Partial<Record<Tone, React.ReactNode>> = {
  green: <CheckCircle2 className="h-3 w-3 shrink-0" aria-hidden="true" />,
  amber: <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />,
  red: <XCircle className="h-3 w-3 shrink-0" aria-hidden="true" />,
};
export function Badge({ tone = 'gray', children, className, icon }: { tone?: Tone; children: React.ReactNode; className?: string; icon?: React.ReactNode | false }) {
  const shown = icon === false ? null : icon ?? TONE_ICON[tone];
  return (
    <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {shown}
      {children}
    </span>
  );
}

export function Alert({ tone = 'info', title, children, className }: { tone?: 'info' | 'success' | 'warning' | 'error'; title?: string; children?: React.ReactNode; className?: string }) {
  const map = {
    info: ['bg-brand-50 border-brand-200 text-slate-700', <Info key="i" className="h-5 w-5 text-navy" />],
    success: ['bg-emerald-50 border-emerald-600 text-emerald-900', <CheckCircle2 key="s" className="h-5 w-5 text-emerald-600" />],
    warning: ['bg-amber-50 border-amber-600 text-amber-900', <AlertTriangle key="w" className="h-5 w-5 text-amber-700" />],
    error: ['bg-red-50 border-red-600 text-red-900', <XCircle key="e" className="h-5 w-5 text-red-600" />],
  } as const;
  const [cls, icon] = map[tone];
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', cls, className)} role={tone === 'error' ? 'alert' : undefined}>
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5')}>{children}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Form controls

export function Field({ label, hint, error, children, htmlFor, optional, className }: { label?: React.ReactNode; hint?: React.ReactNode; error?: string | null; children: React.ReactNode; htmlFor?: string; optional?: boolean; className?: string }) {
  return (
    <div className={className}>
      {label && (
        <label htmlFor={htmlFor} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-slate-700">
          {label}
          {optional && <span className="font-normal text-slate-500">(optional)</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600">{error}</p> : hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

const inputCls =
  'block w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-navy focus:outline-none focus:ring-2 focus:ring-navy/20 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(inputCls, 'h-10', className)} {...rest} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cx(inputCls, 'py-2 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cx(inputCls, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: React.ReactNode; description?: React.ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className="flex items-start justify-between gap-3">
      <label htmlFor={id} className="min-w-0 text-sm">
        <span className="font-medium text-slate-700">{label}</span>
        {description && <span className="block text-xs text-slate-500">{description}</span>}
      </label>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx('relative mt-0.5 inline-flex h-5 w-9 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60', checked ? 'bg-navy' : 'bg-slate-300')}
      >
        <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-4' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', ariaLabel }: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; title?: string }[]; size?: 'sm' | 'md'; ariaLabel?: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-lg border border-slate-300 bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cx(
            'inline-flex items-center justify-center gap-1 rounded-md font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2 text-xs' : 'h-8 px-3 text-sm',
            value === o.value ? 'bg-navy text-white' : 'text-slate-700 hover:bg-white hover:text-navy'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function ProgressBar({ value, className, tone = 'brand' }: { value: number; className?: string; tone?: 'brand' | 'green' }) {
  return (
    <div className={cx('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cx('h-full rounded-full transition-[width] duration-200', tone === 'green' ? 'bg-emerald-600' : 'bg-orange')} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[] }) {
  return (
    <div className="border-b border-slate-200" role="tablist">
      <div className="-mb-px flex gap-6 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={value === t.value}
            onClick={() => onChange(t.value)}
            className={cx(
              'flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-3 pt-1 text-sm font-medium',
              value === t.value ? 'border-orange text-navy' : 'border-transparent text-slate-500 hover:text-navy'
            )}
          >
            {t.label}
            {t.count !== undefined && <span className={cx('rounded-full px-2 text-xs', value === t.value ? 'bg-navy text-white' : 'bg-slate-100 text-slate-700')}>{t.count}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Modal

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('[data-autofocus], input, textarea, select, button:not([data-close])');
      el?.focus();
    }, 20);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [open, onClose]);
  if (!open) return null;
  const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cx('relative flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-float sm:rounded-2xl', widths[size])}>
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-h3 font-bold text-navy">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          <IconButton label="Close" data-close onClick={onClose}>
            <X className="h-4 w-4" />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3 sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ Confirm dialog

interface ConfirmOptions {
  title: string;
  message?: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
const ConfirmContext = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        title={state?.title || ''}
        size="sm"
        footer={
          <>
            <Button onClick={() => close(false)}>Cancel</Button>
            <Button variant={state?.danger ? 'danger' : 'primary'} onClick={() => close(true)} data-autofocus>
              {state?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        <div className="text-sm text-slate-700">{state?.message}</div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  return useContext(ConfirmContext);
}

// ------------------------------------------------------------------ Dropdown menu

export function Menu({ trigger, items, align = 'right' }: { trigger: (open: () => void) => React.ReactNode; items: ({ label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean } | 'divider')[]; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      {trigger(() => setOpen((o) => !o))}
      {open && (
        <div role="menu" className={cx('absolute z-30 mt-1 min-w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-float', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it, i) =>
            it === 'divider' ? (
              <div key={i} className="my-1 border-t border-slate-100" />
            ) : (
              <button
                key={i}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cx('flex w-full items-center gap-2 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:text-slate-400 disabled:hover:bg-transparent', it.danger ? 'text-red-700 hover:bg-red-50' : 'text-slate-700 hover:bg-brand-50 hover:text-navy')}
              >
                {it.icon}
                {it.label}
              </button>
            )
          )}
        </div>
      )}
    </div>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {icon && <BrandIcon className="h-9 w-9">{icon}</BrandIcon>}
      </div>
      <p className="mt-2 text-[30px] font-bold leading-tight text-navy">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

// ------------------------------------------------------------------ Skeletons, search, inline edit

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className)} aria-hidden="true" />;
}

/** Placeholder rows while a table loads. */
export function SkeletonRows({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-slate-100" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex items-center gap-4 px-5 py-4">
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className={cx('h-4', c === 0 ? 'w-1/3' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, i) => (
        <Card key={i} className="overflow-hidden">
          <Skeleton className="aspect-[1.414] rounded-none" />
          <div className="space-y-2 p-4">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder = 'Search…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cx(inputCls, 'h-10 pl-9')}
      />
    </div>
  );
}

/** Table shell: a card with a toolbar (search, filters) on top. */
export function TableCard({ toolbar, children, className }: { toolbar?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <Card className={cx('overflow-hidden', className)}>
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-4 py-3">{toolbar}</div>}
      <div className="overflow-x-auto">{children}</div>
    </Card>
  );
}

/** Table header cell: navy row with white text (colours come from the theme). */
export const th = 'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide';
export const td = 'px-4 py-3 align-middle text-sm text-slate-700';

/**
 * Text that becomes an input when clicked (or via the pencil icon).
 * Saves on Enter or blur; Escape cancels.
 */
export function InlineEdit({
  value,
  onSave,
  className,
  inputClassName,
  maxLength = 120,
  label = 'Rename',
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  className?: string;
  inputClassName?: string;
  maxLength?: number;
  label?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  const commit = async () => {
    const v = draft.trim();
    if (!v || v === value) {
      setEditing(false);
      setDraft(value);
      return;
    }
    setBusy(true);
    try {
      await onSave(v);
      setEditing(false);
    } catch {
      ref.current?.focus();
    } finally {
      setBusy(false);
    }
  };
  if (editing) {
    return (
      <span className={cx('inline-flex min-w-0 items-center gap-1', className)} onClick={(e) => e.stopPropagation()}>
        <input
          ref={ref}
          value={draft}
          maxLength={maxLength}
          disabled={busy}
          aria-label={label}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              setDraft(value);
              setEditing(false);
            }
          }}
          className={cx('min-w-0 flex-1 rounded-md border border-brand-400 bg-white px-1.5 py-0.5 text-slate-900 outline-none ring-2 ring-brand-500/20', inputClassName)}
        />
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : <Check className="h-3.5 w-3.5 text-slate-400" />}
      </span>
    );
  }
  return (
    <span className={cx('group/ie inline-flex min-w-0 items-center gap-1', className)}>
      <button
        type="button"
        title="Click to rename"
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="min-w-0 truncate rounded px-0.5 text-left hover:bg-brand-50"
      >
        {value}
      </button>
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setEditing(true);
        }}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-brand-50 hover:text-navy"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
