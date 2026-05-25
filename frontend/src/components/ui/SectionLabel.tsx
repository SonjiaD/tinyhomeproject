import { type ReactNode } from 'react'

interface SectionLabelProps {
  children: ReactNode
  className?: string
}

export function SectionLabel({ children, className = '' }: SectionLabelProps) {
  return (
    <p className={`text-xs font-semibold tracking-[0.2em] uppercase text-teal-600 ${className}`}>
      {children}
    </p>
  )
}
