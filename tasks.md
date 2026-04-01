# Claude Code Prompt — Revision App (Internal Markup.io / Markupio Alternative)

## Project Context

You are completing and stabilising **Revision** — an internal image annotation and client feedback tool built for Exposeprofi, a 3D architectural rendering and visualisation company. It functions as our internal version of Markupio. Clients receive project render images, leave pinned comments directly on the renders, and our team responds. The goal is a polished, production-stable app that our clients use with confidence.

**Tech Stack (do not deviate from these):**
- Framework: Next.js 14+ (App Router)
- Styling: Tailwind CSS v4
- Component Library: shadcn/ui
- Animation: Framer Motion
- Backend/DB: Supabase (Postgres + Storage + Auth + Realtime)
- Language: TypeScript throughout
- Testing/QA: Playwright (E2E)

**Design Principle — non-negotiable:**
The homepage and login page are considered FINAL and PERFECT. The dashboard is mostly done and only needs micro-adjustments. Do NOT redesign any existing page. Match and extend the existing visual pattern — typography scale, color tokens, spacing system, border radius, component variants — across every new feature you add. Study the existing components before building anything new.

---

## Phase 1 — Codebase Audit & Playwright E2E Baseline

Before writing any new feature code, do the following:

1. **Read every file** in `src/` (or `app/`) thoroughly. Identify:
   - Every route and what it renders
   - The current auth flow (middleware, session handling, protected routes)
   - The Supabase client setup (server vs client components)
   - Existing comment, project, and upload logic
   - Any broken imports, unused components, or dead code

2. **Write a Playwright test suite** (`tests/e2e/`) covering:
   - Unauthenticated user → redirected to login ✓
   - Login with valid credentials → lands on dashboard ✓
   - Login with invalid credentials → shows error, does NOT navigate ✓
   - Dashboard renders project list ✓
   - Opening a project → renders the image annotation canvas ✓
   - Placing a comment pin on the render image ✓
   - Submitting a comment ✓
   - Comment appears immediately (optimistic UI) ✓
   - Logout → session cleared, redirected to login ✓

   Run the suite. Fix every failure before proceeding. Log test output.

---

## Phase 2 — Security Hardening

Implement all of the following. Do not skip any item.

### 2.1 Supabase Row Level Security (RLS)

Audit every table (`projects`, `orders`, `comments`, `attachments`, etc.) and ensure:
- **RLS is enabled** on all tables
- Authenticated users can only read/write rows they are authorised to access:
  - Internal team users → full read/write on all projects
  - Client users → read-only on their assigned projects, write-only on `comments` for those projects
- Service role key is NEVER exposed in client-side code
- All Supabase client calls in server components use the **server client** with the user's session JWT

Write the SQL migration files for all missing RLS policies. Place them in `supabase/migrations/`.

### 2.2 Auth & Session Security

- Ensure Next.js middleware (`middleware.ts`) protects ALL routes except `/login`, `/`, and `/api/auth/*`
- Use `@supabase/ssr` (not the legacy `auth-helpers`) for session handling in both Server Components and Route Handlers
- Refresh tokens are handled automatically — verify this is wired correctly
- Add `HttpOnly`, `Secure`, and `SameSite=Strict` cookie flags where configurable
- On logout, call `supabase.auth.signOut()` AND clear all local state

### 2.3 Input Sanitisation & Validation

- All user-submitted text (comments, project names, etc.) must be validated with **Zod** schemas before hitting the database
- File uploads: validate MIME type AND file size on the server side (not just client side)
  - Allowed types: `image/jpeg`, `image/png`, `image/webp`, `image/gif`, `application/pdf`
  - Max size: 20MB per file
- Reject and return descriptive errors for invalid inputs

### 2.4 API Route Hardening

- Every API route (`/api/*`) must verify the user's session at the top of the handler — return 401 if not authenticated
- Implement rate limiting on comment submission and file upload endpoints (use a simple in-memory store or Upstash Redis if available)
- Add CSRF protection for all mutating endpoints

---

## Phase 3 — Comment Attachments

Add the ability to attach files to comments. A comment can have zero or more attachments.

### Database

```sql
-- Add to supabase/migrations/
CREATE TABLE IF NOT EXISTS public.comment_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  comment_id UUID NOT NULL REFERENCES public.comments(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  storage_path TEXT NOT NULL,         -- path in Supabase Storage bucket
  original_filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size_bytes BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.comment_attachments ENABLE ROW LEVEL SECURITY;
-- Add RLS: users can insert attachments on comments in their projects
-- Users can read attachments on projects they have access to
```

### Storage

- Create a Supabase Storage bucket: `comment-attachments` (private, not public)
- Files are served via **signed URLs** (expire after 1 hour) — never expose the raw storage path to clients
- Storage path format: `{project_id}/{comment_id}/{uuid}-{sanitised_filename}`

### UI

- In the comment input area, add a paperclip icon button (using existing icon library)
- On click, open a file picker (multiple files allowed)
- Show selected files as a preview list below the input (filename + size + remove button)
- On submit, upload files to Supabase Storage first, then create the comment row, then insert attachment rows — do this in a single async flow with proper error rollback (delete uploaded files if comment insert fails)
- In the comment thread, render attachments below the comment text:
  - Images: show a thumbnail (click to open full size in a lightbox)
  - PDFs: show a PDF icon with filename + "View" button that opens in a new tab via signed URL
- Match the attachment UI exactly to the existing comment card design language

---

## Phase 4 — Cross-Project References in Comments

Allow users to reference another project inside a comment using an `@project` mention syntax.

### How it works

- While typing a comment, if the user types `@` followed by characters, show a floating autocomplete dropdown listing matching project names
- Selecting a project inserts a mention token: `@[Project Name](project-id)`
- Store comment text with mention tokens as-is in the database
- When rendering comments, parse the mention tokens and render them as styled, clickable links that navigate to the referenced project
- Autocomplete fetches projects the current user has access to (respects RLS)

### UI Details

- Autocomplete dropdown: positioned above the text input, maximum 5 results, keyboard navigable (arrow keys + Enter to select, Escape to dismiss)
- Mention chip in rendered comment: subtle highlighted style consistent with the app's design tokens (not a garish colour — something like a low-opacity background with the accent colour border)
- If a referenced project is deleted, render the mention as plain struck-through text: `~~@Project Name~~`

### Implementation

- Parse and render logic: build a `CommentBody` component that handles both plain text and mention tokens
- Use a lightweight parser (regex-based is fine, no need for a full AST)
- Store an index of mentioned project IDs in a `mentioned_project_ids UUID[]` column on the `comments` table for efficient querying

---

## Phase 5 — Real-Time Comment Updates

Comments must appear immediately for all connected users without a page refresh.

### Strategy

Use **two complementary mechanisms:**

1. **Optimistic UI** (for the comment author):
   - When the user submits a comment, immediately insert it into the local comment list with a `pending` status and a temporary ID
   - If the server insert succeeds, replace the temporary entry with the real row
   - If it fails, remove the temporary entry and show an inline error toast

2. **Supabase Realtime** (for all other connected users):
   - Subscribe to `INSERT` events on the `comments` table, filtered by the current `project_id`
   - When a new comment arrives via the channel, append it to the comment list
   - De-duplicate: if the incoming comment ID matches an existing optimistic entry, replace it rather than appending
   - On component unmount, unsubscribe from the channel

### Implementation Notes

- Use a `useComments(projectId)` custom hook that encapsulates both the initial fetch and the Realtime subscription
- The hook should return: `{ comments, isLoading, error, addComment, deleteComment }`
- `addComment` handles the optimistic insert + server call
- Realtime channel name: `comments:project:${projectId}`
- Handle Realtime connection errors gracefully — if the channel drops, attempt reconnect up to 3 times then show a subtle "Live updates paused" banner

---

## Phase 6 — Dashboard Micro-Adjustments

Make only the following targeted changes to the dashboard. Do not restructure the layout.

- Project cards: ensure hover state has a smooth, consistent transition (150ms ease-out) matching the app's motion design
- Project status badges: verify colour tokens match the design system exactly
- Empty state: if no projects exist, show a well-designed empty state (illustration-optional, but text + CTA must be present)
- Loading state: skeleton loaders for project cards while data is fetching — match the card dimensions exactly so there is no layout shift
- Ensure the sidebar (if present) has correct active-route highlighting

---

## Phase 7 — Final Playwright Regression Suite

After all features are implemented, expand the Playwright suite to cover:

- Attaching a file to a comment → attachment appears in comment thread ✓
- Clicking an image attachment → lightbox opens ✓
- Typing `@` in comment input → autocomplete dropdown appears ✓
- Selecting a project mention → mention token rendered correctly ✓
- Second browser context (simulating another user) → submitting a comment in context A → appears in context B without refresh (Realtime) ✓
- Uploading a file with invalid MIME type → rejected with error ✓
- Unauthenticated request to `/api/comments` → 401 returned ✓

Run the full suite. All tests must pass before considering the app stable.

---

## Code Quality Rules

- TypeScript strict mode — no `any` types
- Every async function has try/catch with typed error handling
- No `console.log` in production paths — use a logger utility
- Supabase client: never use the service role key on the client side
- Environment variables: all Supabase keys in `.env.local`, validated at startup with Zod
- Reuse existing UI components — do not introduce new component libraries
- File naming: kebab-case for files, PascalCase for components
- Every new DB table has a migration file — no direct schema edits

---

## Deliverables Checklist

When done, confirm each item:

- [ ] Playwright baseline suite: all existing flows pass
- [ ] RLS policies written and applied for all tables
- [ ] Middleware protects all private routes
- [ ] Input validation with Zod on all mutations
- [ ] Comment attachments: upload, storage, signed URL retrieval, UI rendering
- [ ] Cross-project `@mentions` with autocomplete and clickable links
- [ ] Optimistic UI for comment submission
- [ ] Supabase Realtime subscription for live comment updates
- [ ] Dashboard skeleton loaders and empty state
- [ ] Full Playwright regression suite: all tests pass
- [ ] No TypeScript errors (`tsc --noEmit` passes)
- [ ] No ESLint errors

---

*This prompt is for Claude Code (claude code CLI). Run it from the root of the Revision project directory.*