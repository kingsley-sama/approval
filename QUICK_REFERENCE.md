# Quick Reference Guide

## Installation Commands

```bash
# Install required dependencies
npm install konva react-konva nanoid

# Install type definitions
npm install --save-dev @types/konva
```

## Database Setup

```bash
# Apply migrations in Supabase SQL Editor
# 1. migrations/001_add_drawings_table.sql
# 2. migrations/002_add_share_links_table.sql
# 3. migrations/003_add_duplication_support.sql

# Regenerate types (optional)
npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts
```

## Component Quick Reference

### Drawing on Images

```tsx
import EnhancedImageViewer from '@/components/enhanced-image-viewer';

<EnhancedImageViewer
  threadId="uuid"
  threadName="Image Name"
  imagePath="/path/to/image.jpg"
  projectId="uuid"
  projectName="Project Name"
  currentUser="user@email.com"
  canDraw={true}
/>
```

### Duplicate Projects

```tsx
import ProjectDuplicator from '@/components/project-duplicator';

<ProjectDuplicator
  projectId={project.id}
  projectName={project.name}
  createdBy={currentUser}
  onSuccess={(newProjectId) => router.push(`/project/${newProjectId}`)}
/>
```

### Share Links

```tsx
import ShareLinkManager from '@/components/share-link-manager';

<ShareLinkManager
  resourceType="thread" // or "project"
  resourceId={resource.id}
  createdBy={currentUser}
  resourceName={resource.name}
/>
```

## Server Actions Quick Reference

### Drawings

```typescript
import { saveDrawing, getDrawingsByThread, updateDrawing } from '@/app/actions/drawings';

// Save new drawing
const result = await saveDrawing({
  threadId: 'uuid',
  drawingData: {
    version: '1.0',
    shapes: [...],
    metadata: {}
  },
  createdBy: 'user@email.com'
});

// Load drawings
const { drawings } = await getDrawingsByThread('thread-uuid');

// Update drawing
await updateDrawing({
  drawingId: 'drawing-uuid',
  drawingData: { ... }
});
```

### Duplication

```typescript
import { duplicateProject } from '@/app/actions/duplicate-project';

const result = await duplicateProject({
  sourceProjectId: 'uuid',
  newProjectName: 'Project Copy',
  options: {
    copyComments: true,
    copyDrawings: true
  },
  createdBy: 'user@email.com'
});

console.log(result.newProjectId);
console.log(result.details); // { threadsCopied, commentsCopied, drawingsCopied }
```

### Share Links

```typescript
import { 
  createShareLink, 
  validateShareToken, 
  revokeShareLink 
} from '@/app/actions/share-links';

// Create link
const { url, shareLink } = await createShareLink({
  resourceType: 'project',
  resourceId: 'uuid',
  permissions: 'draw_and_comment',
  createdBy: 'user@email.com',
  expiresInDays: 30
});

// Validate token
const { shareLink } = await validateShareToken('token-string');

// Revoke link
await revokeShareLink('share-link-uuid');
```

## Environment Variables

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_supabase_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Permission Levels

| Permission | View | Comment | Draw |
|------------|------|---------|------|
| `view` | ✅ | ❌ | ❌ |
| `comment` | ✅ | ✅ | ❌ |
| `draw_and_comment` | ✅ | ✅ | ✅ |

## Drawing Tools

| Tool | Type | Description |
|------|------|-------------|
| ✏️ Pen | `pen` | Freehand drawing |
| ▢ Rectangle | `rectangle` | Draw rectangles |
| → Arrow | `arrow` | Draw arrows |
| 🖍️ Highlight | `highlight` | Semi-transparent highlights |

## Database Tables

### markup_drawings
- `id`: UUID (PK)
- `thread_id`: UUID (FK → markup_threads)
- `drawing_data`: JSONB
- `created_by`: VARCHAR(150)
- `is_duplicated`: BOOLEAN
- `original_drawing_id`: UUID (FK → markup_drawings)

### share_links
- `id`: UUID (PK)
- `token`: VARCHAR(64) UNIQUE
- `resource_type`: ENUM('thread', 'project')
- `resource_id`: UUID
- `permissions`: ENUM('view', 'comment', 'draw_and_comment')
- `expires_at`: TIMESTAMPTZ
- `is_active`: BOOLEAN
- `access_count`: INTEGER

## Common Patterns

### Check if user can draw

```typescript
const canDraw = shareLink.permissions === 'draw_and_comment';

{canDraw && (
  <DrawingToolbar ... />
)}
```

### Handle drawing save

```typescript
const handleSaveDrawing = async (data: DrawingData) => {
  const result = await saveDrawing({
    threadId,
    drawingData: data,
    createdBy: userName
  });
  
  if (result.success) {
    toast.success('Drawing saved!');
  } else {
    toast.error(result.error);
  }
};
```

### Copy share link to clipboard

```typescript
const copyLink = (url: string) => {
  navigator.clipboard.writeText(url);
  toast.success('Link copied!');
};
```

## Troubleshooting

### Drawing not saving
- Check `threadId` is valid
- Verify `created_by` is not empty
- Check browser console for errors
- Verify Supabase connection

### Share link returns 404
- Check token is correct
- Verify link is active (`is_active = true`)
- Check expiration date
- Run `is_share_link_valid()` in SQL

### Duplication failing
- Verify source project exists
- Check for database constraint violations
- Review Supabase function logs
- Ensure RLS policies allow operation

## Testing Endpoints

### Test share link validation

```typescript
// In browser console on share page
const token = window.location.pathname.split('/').pop();
console.log('Token:', token);

// Check database
SELECT * FROM share_links WHERE token = 'your-token';
```

### Test drawing save

```typescript
// In React component
console.log('Drawing data:', drawingData);
console.log('Thread ID:', threadId);
console.log('User:', createdBy);
```

## File Locations

```
/migrations/
  ├── 001_add_drawings_table.sql
  ├── 002_add_share_links_table.sql
  └── 003_add_duplication_support.sql

/types/
  └── drawing.ts

/app/actions/
  ├── duplicate-project.ts
  ├── drawings.ts
  └── share-links.ts

/app/api/share/
  └── comment/route.ts

/app/share/[token]/
  └── page.tsx

/components/
  ├── drawing-canvas.tsx
  ├── drawing-toolbar.tsx
  ├── enhanced-image-viewer.tsx
  ├── share-link-manager.tsx
  ├── share-viewer.tsx
  └── project-duplicator.tsx
```

## Support

📚 See detailed docs:
- `IMPLEMENTATION_GUIDE.md` - Setup instructions
- `ARCHITECTURE.md` - System design
- Migration files - Database schema

🐛 Debugging:
1. Check browser console
2. Review Supabase logs
3. Verify RLS policies
4. Test with curl/Postman
