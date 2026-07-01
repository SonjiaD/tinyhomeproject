import { FaFacebook, FaXTwitter, FaReddit } from 'react-icons/fa6'
import { Link2 } from 'lucide-react'

interface ShareButtonsProps {
  /** The URL to share — should be a public, non-auth-gated page. */
  url: string
  /** Share message text (used as the Reddit title / X tweet body). */
  text: string
  /** Called after the link is copied to the clipboard (e.g. to show a toast). */
  onCopyLink?: () => void
  className?: string
}

const BUTTON_CLASS =
  'flex flex-col items-center gap-1.5 flex-1 py-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors'

export function ShareButtons({ url, text, onCopyLink, className = '' }: ShareButtonsProps) {
  const encodedUrl = encodeURIComponent(url)
  const encodedText = encodeURIComponent(text)

  const links = [
    { label: 'Facebook', Icon: FaFacebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}` },
    { label: 'Reddit', Icon: FaReddit, href: `https://www.reddit.com/submit?url=${encodedUrl}&title=${encodedText}` },
    { label: 'X', Icon: FaXTwitter, href: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}` },
  ]

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // clipboard API can fail in insecure contexts — nothing more we can do here
    }
    onCopyLink?.()
  }

  return (
    <div className={`flex gap-2.5 ${className}`}>
      {links.map(({ label, Icon, href }) => (
        <a key={label} href={href} target="_blank" rel="noopener noreferrer" className={BUTTON_CLASS}>
          <Icon className="w-5 h-5" />
          <span className="text-[11px] font-medium">{label}</span>
        </a>
      ))}
      <button onClick={handleCopyLink} className={BUTTON_CLASS}>
        <Link2 className="w-5 h-5" strokeWidth={1.75} />
        <span className="text-[11px] font-medium">Copy Link</span>
      </button>
    </div>
  )
}
