'use client';

import * as React from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface IconTooltipProps {
  label: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  sideOffset?: number;
  delayDuration?: number;
  disabled?: boolean;
  children: React.ReactElement;
}

/**
 * Wraps an icon-only trigger (button, link, etc.) with a small floating
 * tooltip. The child must accept a ref + standard event props so Radix can
 * forward them via `asChild`.
 */
export function IconTooltip({
  label,
  side = 'bottom',
  align = 'center',
  sideOffset = 6,
  delayDuration = 200,
  disabled,
  children,
}: IconTooltipProps) {
  if (disabled || !label) return children;
  return (
    <Tooltip delayDuration={delayDuration}>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={sideOffset}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
