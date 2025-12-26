'use client'

import * as React from 'react'
import * as Dialog from '@radix-ui/react-dialog'

import { cn } from '@/lib/utils'

function Drawer({
  ...props
}: React.ComponentProps<typeof Dialog.Root>) {
  return <Dialog.Root {...props} />
}

function DrawerTrigger({
  ...props
}: React.ComponentProps<typeof Dialog.Trigger>) {
  return <Dialog.Trigger {...props} />
}

function DrawerPortal({
  ...props
}: React.ComponentProps<typeof Dialog.Portal>) {
  return <Dialog.Portal {...props} />
}

function DrawerClose({
  ...props
}: React.ComponentProps<typeof Dialog.Close>) {
  return <Dialog.Close {...props} />
}

function DrawerOverlay({ className, ...props }: React.ComponentProps<typeof Dialog.Overlay>) {
  return (
    <Dialog.Overlay
      className={cn(
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50',
        className,
      )}
      {...props}
    />
  )
}

function DrawerContent({ className, children, side = 'right', ...props }: React.ComponentProps<typeof Dialog.Content> & { side?: 'right' | 'left' | 'top' | 'bottom' }) {
  return (
    <Dialog.Portal>
      <DrawerOverlay />
      <Dialog.Content
        data-side={side}
        className={cn(
          'group/drawer-content bg-background fixed z-50 flex h-auto flex-col',
          // top
          'data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:mb-24 data-[side=top]:max-h-[80vh] data-[side=top]:rounded-b-lg data-[side=top]:border-b',
          // bottom
          'data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:mt-24 data-[side=bottom]:max-h-[80vh] data-[side=bottom]:rounded-t-lg data-[side=bottom]:border-t',
          // right
          'data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:w-3/4 data-[side=right]:border-l data-[side=right]:sm:max-w-sm',
          // left
          'data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:w-3/4 data-[side=left]:border-r data-[side=left]:sm:max-w-sm',
          className,
        )}
        {...props}
      >
        <div className="bg-muted mx-auto mt-4 hidden h-2 w-[100px] shrink-0 rounded-full group-data-[side=bottom]/drawer-content:block" />
        {children}
      </Dialog.Content>
    </Dialog.Portal>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 p-4 group-data-[side=bottom]/drawer-content:text-center group-data-[side=top]/drawer-content:text-center md:gap-1.5 md:text-left',
        className,
      )}
      {...props}
    />
  )
}

function DrawerFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('mt-auto flex flex-col gap-2 p-4', className)} {...props} />
  )
}

function DrawerTitle({ className, ...props }: React.ComponentProps<typeof Dialog.Title>) {
  return <Dialog.Title className={cn('text-foreground font-semibold', className)} {...props} />
}

function DrawerDescription({ className, ...props }: React.ComponentProps<typeof Dialog.Description>) {
  return <Dialog.Description className={cn('text-muted-foreground text-sm', className)} {...props} />
}

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}
