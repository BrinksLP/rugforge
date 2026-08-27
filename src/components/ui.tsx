/* Small shared UI primitives. Kept deliberately plain. */
import type { ReactNode } from 'react'

export function Button({
  children,
  onClick,
  variant = 'primary',
  disabled,
  type = 'button',
  title,
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'ghost' | 'subtle'
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const base =
    'inline-flex items-center gap-2 rounded-[10px] px-4 py-2 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed'
  const styles = {
    primary: 'bg-accent text-white hover:brightness-95',
    ghost: 'border border-line bg-surface text-ink hover:bg-canvas',
    subtle: 'text-ink-soft hover:text-ink',
  }[variant]
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${styles}`}
    >
      {children}
    </button>
  )
}

export function Card({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-[var(--radius-lg)] border border-line bg-surface ${className}`}
    >
      {children}
    </div>
  )
}

/** hover-explained term */
export function Info({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-line text-[10px] font-bold text-ink-soft align-middle"
    >
      ?
    </span>
  )
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-ink">
        {label}
        {hint ? <Info text={hint} /> : null}
      </span>
      {children}
    </label>
  )
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
}: {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  step?: number
  suffix?: string
}) {
  return (
    <span className="flex items-center gap-2">
      <input
        type="number"
        value={Number.isFinite(value) ? value : ''}
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          const v = parseFloat(e.target.value)
          if (!Number.isNaN(v)) onChange(v)
        }}
        className="w-28 rounded-[8px] border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      {suffix ? <span className="text-ink-soft text-sm">{suffix}</span> : null}
    </span>
  )
}

export function Warning({
  children,
  action,
}: {
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[10px] border border-[#e9d8b6] bg-[#fdf6e7] px-3 py-2 text-sm text-warn">
      <span>{children}</span>
      {action}
    </div>
  )
}
