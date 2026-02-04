interface PageHeaderProps {
  title: string
  description?: string
}

export function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="bg-white border-b border-border">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-800">{title}</h1>
        {description && (
          <p className="mt-2 text-gray-600 leading-relaxed max-w-2xl">{description}</p>
        )}
      </div>
    </div>
  )
}
