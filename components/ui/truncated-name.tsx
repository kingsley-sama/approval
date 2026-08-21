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
  const nodeRef = React.useRef<HTMLElement | null>(null)
  const observerRef = React.useRef<ResizeObserver | null>(null)
  const [isOverflowing, setIsOverflowing] = React.useState(false)

  const measure = React.useCallback(() => {
    const el = nodeRef.current
    if (!el) return
    // 1px slack: sub-pixel layout rounding otherwise reports a fitting
    // single-line label as overflowing.
    setIsOverflowing(
      el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1,
    )
  }, [])

  // A callback ref rather than an effect: crossing the overflow threshold
  // swaps the plain element for a tooltip-wrapped one, which remounts the DOM
  // node. An effect keyed on [name] would not re-run for that swap and would
  // leave the observer watching the discarded node.
  const attach = React.useCallback(
    (node: HTMLElement | null) => {
      observerRef.current?.disconnect()
      observerRef.current = null
      nodeRef.current = node
      if (!node) return

      measure()
      if (typeof ResizeObserver === 'undefined') return
      const observer = new ResizeObserver(measure)
      observer.observe(node)
      observerRef.current = observer
    },
    [measure],
  )

  React.useEffect(() => () => observerRef.current?.disconnect(), [])
  // Re-measure when the text itself changes under a stable node.
  React.useEffect(() => measure(), [measure, name])

  const label = (
    <Tag
      ref={attach as React.Ref<never>}
      className={className}
      // Covers layout shifts the observer on this element misses (a sibling
      // growing, a font swapping in) right before the hover matters.
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
