'use client'

import * as React from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

type TruncatedNameTag = 'span' | 'p' | 'div' | 'h1' | 'h2' | 'h3'

interface TruncatedNameProps {
  /** Full text. Rendered as-is; the visual clipping comes from `className`. */
  name: string
  /** Element to render. Defaults to `span`. */
  as?: TruncatedNameTag
  /** Truncation styling (`truncate`, `line-clamp-2`, widths, typography). */
  className?: string
  side?: 'top' | 'right' | 'bottom' | 'left'
}

/**
 * A name that may be visually clipped, with the full text revealed in a
 * tooltip on hover.
 *
 * The tooltip is attached only while the text actually overflows its box, so
 * short names that are fully visible don't get a redundant hover card. Both
 * axes are measured: `truncate` clips horizontally, `line-clamp-*` vertically.
 */
export function TruncatedName({
  name,
  as: Tag = 'span',
  className,
  side = 'bottom',
}: TruncatedNameProps) {
  const ref = React.useRef<HTMLElement>(null)
  const [isOverflowing, setIsOverflowing] = React.useState(false)

  const measure = React.useCallback(() => {
    const el = ref.current
    if (!el) return
    // 1px slack: sub-pixel layout rounding otherwise reports a fitting
    // single-line label as overflowing.
    setIsOverflowing(
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    )
  }, [])

  React.useEffect(() => {
    measure()
    const el = ref.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [measure, name])

  const label = (
    <Tag
      ref={ref as React.Ref<never>}
      className={className}
      // Covers layout shifts a ResizeObserver on this element misses (a
      // sibling growing, a font swapping in) right before the hover matters.
      onPointerEnter={measure}
    >
      {name}
    </Tag>
  )

  if (!isOverflowing) return label

  return (
    <Tooltip>
      <TooltipTrigger asChild>{label}</TooltipTrigger>
      <TooltipContent side={side} sideOffset={6} className="max-w-xs break-words">
        {name}
      </TooltipContent>
    </Tooltip>
  )
}
