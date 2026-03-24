# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start development server (Next.js on port 3000)
npm run build     # Production build
npm run lint      # Run ESLint
```

There are no automated tests in this project.

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SUPABASE_BUCKET_NAME=screenshots
AUTH_SECRET=                  # Secret for JWT signing (jose HS256)
POSTGRES_URL=                 # PostgreSQL connection string for Drizzle ORM
```

## Architecture

This is a **Next.js 16 image annotation tool** (App Router, React 19, TypeScript). Users upload images into projects, then place pins/comments and draw annotations on them. Projects can be shared via public tokens.

### Dual Database Architecture

The app uses **two databases in parallel**:

1. **Supabase (primary data store)** — All core data (projects, threads, comments, share links) lives in Supabase via the `@supabase/supabase-js` client. The TypeScript schema is in `types/supabase.ts`. Two clients exist:
   - `lib/supabase/server.ts` — SSR-safe client using `@supabase/ssr` (used in Server Actions)
   - `lib/supabase.ts` — Direct clients (`supabase`, `supabaseAdmin`) + `StorageService` class for file uploads/management

2. **Drizzle ORM + PostgreSQL** — Used only for the `users` table (`lib/db/schema.ts`). Migrations live in `lib/db/migrations/`. Config: `drizzle.config.ts`.

### Authentication

Custom JWT auth (not Supabase Auth):
- `lib/auth/session.ts` — `signToken`/`verifyToken` (jose, HS256), `hashPassword`/`comparePasswords` (bcryptjs), `setSession`/`getSession` using httpOnly cookies
- `lib/db/queries.ts` — `getUser()` reads the session cookie and fetches from the `users` Drizzle table
- `middleware.ts` — Protects `/` route, redirects unauthenticated users to `/sign-in`, refreshes the session cookie on every GET request
- Auth pages: `app/(login)/sign-in/`, `app/(login)/sign-up/`

### Data Model (Supabase Tables)

- `markup_projects` — Top-level project folders (UUID PK)
- `markup_threads` — One thread = one uploaded image, belongs to a project
- `markup_comments` — Pins on an image; stores `x_position`/`y_position` as percentages (0–100), `drawing_data` JSONB for shape annotations
- `share_links` — Shareable tokens (`view | comment | draw_and_comment` permissions, scoped to `thread` or `project`)
- `users` — Managed by Drizzle, not Supabase

SQL migrations for Supabase are in `migrations/` (run manually in Supabase SQL Editor; `000_complete_schema.sql` is the canonical full schema).

### Server Actions (`app/actions/`)

All data mutations are Next.js Server Actions (`'use server'`):
- `projects.ts` — CRUD for `markup_projects`
- `threads.ts` — `getProjectThreads`, `createThread`
- `comments.ts` — `createComment`, `getThreadComments`, `resolveComment`, `deleteComment`, `getCurrentUser`
- `share-links.ts` — `createShareLink`, `validateShareToken`
- `storage.ts` — File upload helpers
- `auth.ts` — Sign-in/sign-up server actions
- `duplicate-project.ts` — Deep-copy a project including threads, comments, and storage files

### Key Pages

- `/` (`app/page.tsx`) — Dashboard; lists all projects, client component
- `/project/[id]` (`app/project/[id]/page.tsx`) — Core annotation workspace; manages all pin/comment state, image navigation, drawing shapes
- `/share/[token]` (`app/share/[token]/page.tsx`) — Public share view; validates token server-side then renders `ShareViewer`
- `/sign-in`, `/sign-up` — Auth pages inside `app/(login)/` route group

### Annotation Workspace

The project page (`app/project/[id]/page.tsx`) orchestrates:
- **ImageViewer** (`components/annotation/image-viewer.tsx`) — Renders the current image with pan/zoom, pin markers, and a Konva drawing layer
- **DrawingCanvas** (`components/drawing-canvas.tsx`) — Konva Stage with freehand pen, rectangle, arrow, and highlight tools. Dynamically imported (no SSR) to avoid Konva issues
- **DrawingToolbar** (`components/drawing-toolbar.tsx`) — Tool/color/stroke selector
- **CommentsSidebar** — Lists all pins for the current project
- **ThumbnailsSidebar** — Image navigation + upload trigger
- **CommentModal** — Floating form that appears after a click/draw to submit a comment

### Optimistic Comment Queue (`hooks/use-comment-queue.ts`)

Comments are enqueued to `localStorage` (`annot8_comment_queue`) before the server round-trip. The pin appears instantly in the UI, then `drainQueue()` syncs to the DB in the background with up to 3 retries. On page load, stale local items are merged with server data.

### Shapes / Drawing Types (`types/drawing.ts`)

`Shape` is a discriminated union: `FreehandShape` (pen), `RectangleShape`, `ArrowShape`, `HighlightShape`. Each shape carries `id`, `color`, `strokeWidth`, and tool-specific point data. Shapes are stored as `drawing_data` JSONB on a `markup_comment` row.

### Storage

`StorageService` class in `lib/supabase.ts` wraps Supabase Storage. Files are stored in a bucket (default: `screenshots`) under the path `{projectName}/{fileName}`. Use `storageServiceAdmin` (service role key) for server-side operations; `storageService` (anon key) for client-side.

### UI

Built with shadcn/ui components (in `components/ui/`), Tailwind CSS v4, and Radix UI primitives. The design system config is in `design-system.json`.
