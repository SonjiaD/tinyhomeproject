import { type ReactNode } from 'react'

interface PageLayoutProps {
  children: ReactNode
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const maxWidths = {
  sm:  'max-w-xl',
  md:  'max-w-3xl',
  lg:  'max-w-4xl',
  xl:  'max-w-6xl',
}

export function PageLayout({ children, maxWidth = 'md', className = '' }: PageLayoutProps) {
  return (
    <div className={`min-h-full bg-surface-page py-12 px-6 pb-24 ${className}`}>
      <div className={`${maxWidths[maxWidth]} mx-auto`}>
        {children}
      </div>
    </div>
  )
}
