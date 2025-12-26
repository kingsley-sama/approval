# Installation and Setup Guide

## Overview
This guide covers the installation and setup of three major features:
1. **Markup Folder Duplication** - Duplicate projects with configurable options
2. **Image Drawing/Markup System** - Canvas-based drawing on images
3. **Shareable Links** - Token-based sharing with permission control

## Prerequisites
- Next.js 14+ application
- Supabase project configured
- Node.js 18+

## Installation Steps

### 1. Install Dependencies

```bash
npm install konva react-konva nanoid zod
npm install --save-dev @types/konva
```

**Dependency breakdown:**
- `konva` & `react-konva`: Canvas-based drawing library
- `nanoid`: Secure token generation
- `zod`: Runtime type validation (already in your project)

### 2. Apply Database Migrations

Run these SQL migrations in your Supabase SQL Editor in order:

#### Migration 1: Drawing System
```sql
-- See migrations/001_add_drawings_table.sql
```

#### Migration 2: Share Links
```sql
-- See migrations/002_add_share_links_table.sql
```

#### Migration 3: Duplication Support
```sql
-- See migrations/003_add_duplication_support.sql
```

**Important**: Execute each migration file completely before moving to the next.

### 3. Update Supabase Types

After running migrations, regenerate your Supabase types:

```bash
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
```

Or manually add the new table types to `types/supabase.ts`.

### 4. Environment Variables

Add to your `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_key
NEXT_PUBLIC_APP_URL=http://localhost:3000  # Update for production
```

### 5. Row Level Security (RLS)

Apply these RLS policies in Supabase:

```sql
-- markup_drawings: Allow authenticated users to manage drawings
CREATE POLICY "Users can create drawings"
ON markup_drawings FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view drawings"
ON markup_drawings FOR SELECT
USING (true);

CREATE POLICY "Users can update their drawings"
ON markup_drawings FOR UPDATE
USING (created_by = auth.jwt() ->> 'name');

-- share_links: Admin/PM can create, everyone can read active links
CREATE POLICY "Admins can create share links"
ON share_links FOR INSERT
WITH CHECK (true);

CREATE POLICY "Everyone can view active share links"
ON share_links FOR SELECT
USING (is_active = true);

CREATE POLICY "Creators can update their share links"
ON share_links FOR UPDATE
USING (created_by = auth.jwt() ->> 'name');
```

## Feature Integration

### A. Drawing System

**In your project/thread page:**

```tsx
import EnhancedImageViewer from '@/components/enhanced-image-viewer';

export default function ThreadPage({ params }) {
  return (
    <EnhancedImageViewer
      threadId={params.threadId}
      threadName="Living Room Render"
      imagePath="/path/to/image.jpg"
      projectId={params.projectId}
      projectName="Downtown Condo Project"
      currentUser="john@example.com"
      canDraw={true}
    />
  );
}
```

**Features enabled:**
- ✏️ Freehand drawing
- ▢ Rectangle shapes
- → Arrow annotations
- 🖍️ Highlights
- ↶↷ Undo/Redo
- 💾 Save/Load drawings

### B. Project Duplication

**Add to your project list/card:**

```tsx
import ProjectDuplicator from '@/components/project-duplicator';

<ProjectDuplicator
  projectId={project.id}
  projectName={project.name}
  createdBy={currentUser}
  onSuccess={(newProjectId) => {
    router.push(`/project/${newProjectId}`);
  }}
/>
```

**Options available:**
- Copy images only (always included)
- Copy images + comments
- Copy images + drawings
- Copy everything

### C. Shareable Links

**Add to your project/thread toolbar:**

```tsx
import ShareLinkManager from '@/components/share-link-manager';

<ShareLinkManager
  resourceType="thread" // or "project"
  resourceId={thread.id}
  createdBy={currentUser}
  resourceName={thread.name}
/>
```

**Permission levels:**
- 👁️ View only
- 💬 View + Comment
- 🎨 View + Comment + Draw

**Share URL format:**
```
https://yourapp.com/share/[token]
```

## Usage Examples

### Example 1: Duplicate a Project with Comments

```typescript
import { duplicateProject } from '@/app/actions/duplicate-project';

const result = await duplicateProject({
  sourceProjectId: '123e4567-e89b-12d3-a456-426614174000',
  newProjectName: 'Project Copy - Q1 2024',
  options: {
    copyComments: true,
    copyDrawings: false,
  },
  createdBy: 'vivien@company.com',
});

console.log(result.details);
// { threadsCopied: 12, commentsCopied: 45 }
```

### Example 2: Create a Share Link with Expiration

```typescript
import { createShareLink } from '@/app/actions/share-links';

const result = await createShareLink({
  resourceType: 'project',
  resourceId: projectId,
  permissions: 'draw_and_comment',
  createdBy: 'admin@company.com',
  expiresInDays: 7,
});

console.log(result.url);
// https://yourapp.com/share/abc123xyz789...
```

### Example 3: Save a Drawing

```typescript
import { saveDrawing } from '@/app/actions/drawings';

const result = await saveDrawing({
  threadId: threadId,
  drawingData: {
    version: '1.0',
    shapes: [
      {
        id: 'shape-1',
        type: 'rectangle',
        x: 100,
        y: 200,
        width: 300,
        height: 200,
        color: '#FF0000',
        strokeWidth: 4,
        createdAt: new Date().toISOString(),
      },
    ],
    metadata: {
      imageWidth: 1200,
      imageHeight: 800,
    },
  },
  createdBy: 'designer@company.com',
});
```

## API Endpoints

### Public Share API

**POST /api/share/comment**
```typescript
{
  token: string;
  threadId: string;
  userName: string;
  content: string;
}
```

## Architecture Notes

### Data Flow
```
User Action → Server Action → Supabase RPC/Query → Response
```

### Drawing Storage
- Drawings stored as JSONB in PostgreSQL
- Shapes use Konva's format for easy rendering
- Versioning supported through multiple drawing records

### Security
- Share tokens are 32-char nanoid (unguessable)
- Token validation on every access
- Permission checks at API level
- No authentication required for share links

### Transaction Safety
- Project duplication uses PostgreSQL function
- Atomic operations ensure consistency
- Rollback on any failure

## Testing Checklist

- [ ] Run all database migrations
- [ ] Verify RLS policies are active
- [ ] Test drawing tools (pen, rectangle, arrow, highlight)
- [ ] Test undo/redo functionality
- [ ] Create and validate share links
- [ ] Test permission restrictions (view/comment/draw)
- [ ] Duplicate a project with various options
- [ ] Verify duplicated data integrity
- [ ] Test share link expiration
- [ ] Test comment submission via share link

## Troubleshooting

### Issue: "Table does not exist"
- Ensure all migrations are applied in order
- Check Supabase dashboard for table creation

### Issue: "RPC function not found"
- Run migration 003 which creates the `duplicate_project` function
- Verify in Supabase SQL Editor

### Issue: Drawing canvas not responding
- Check that `konva` and `react-konva` are installed
- Verify `isEnabled` prop is true
- Check browser console for errors

### Issue: Share link returns 404
- Verify share token is valid and not expired
- Check `is_active` status in database
- Ensure `share_links` table has data

## Production Considerations

1. **Image Storage**: Consider using Supabase Storage for images
2. **Rate Limiting**: Add rate limits to share endpoints
3. **Monitoring**: Track share link access patterns
4. **Cleanup**: Implement cron job to remove expired links
5. **Caching**: Cache share link validation results
6. **Analytics**: Track duplication and share usage

## Support

For issues or questions:
1. Check migration files are complete
2. Verify environment variables
3. Review Supabase logs
4. Check browser console for client errors

## License

MIT
