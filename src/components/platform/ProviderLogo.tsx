import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Brand marks are loaded from the Simple Icons CDN at request time, so the logo
 * is the provider's real mark rather than a hand-drawn imitation. When the CDN
 * has no mark (or the network is offline) the provider's initial is shown.
 */
export function ProviderLogo({
  name,
  slug,
  accent,
  className,
}: {
  name: string
  slug?: string
  accent: string
  className?: string
}) {
  const [failed, setFailed] = React.useState(false)
  const hex = accent.replace("#", "")
  return (
    <span
      className={cn(
        "relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-md border bg-background",
        className
      )}
      style={failed ? { borderColor: `${accent}55` } : undefined}
    >
      {slug && !failed ? (
        <img
          src={`https://cdn.simpleicons.org/${slug}/${hex}`}
          alt=""
          loading="lazy"
          className="size-5 object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <span
          className="text-[13px] font-semibold"
          style={{ color: accent }}
          aria-hidden
        >
          {name.slice(0, 1).toUpperCase()}
        </span>
      )}
      <span className="sr-only">{name}</span>
    </span>
  )
}
