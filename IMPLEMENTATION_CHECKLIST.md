# Implementation Checklist

Use this checklist to implement all three features step by step.

## ☑️ Phase 1: Setup & Dependencies (15 minutes)

### 1.1 Install NPM Packages
```bash
npm install konva react-konva nanoid
npm install --save-dev @types/konva
```

- [ ] Run install command
- [ ] Verify installation: `npm list konva react-konva nanoid`
- [ ] Check for errors in terminal
- [ ] Commit package.json and package-lock.json

### 1.2 Environment Variables
- [ ] Open `.env.local`
- [ ] Add `NEXT_PUBLIC_APP_URL=http://localhost:3000`
- [ ] Update for production URL when deploying
- [ ] Verify other Supabase vars are present

---

## ☑️ Phase 2: Database Setup (20 minutes)

### 2.1 Apply Migrations
- [ ] Open Supabase Dashboard
- [ ] Navigate to SQL Editor
- [ ] Run `migrations/001_add_drawings_table.sql`
- [ ] Verify `markup_drawings` table exists
- [ ] Run `migrations/002_add_share_links_table.sql`
- [ ] Verify `share_links` table exists
- [ ] Run `migrations/003_add_duplication_support.sql`
- [ ] Verify new columns added to existing tables
- [ ] Check for SQL errors

### 2.2 Verify Functions
- [ ] In Supabase SQL Editor, run:
```sql
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_name IN ('duplicate_project', 'is_share_link_valid', 'increment_share_link_access');
```
- [ ] Verify all 3 functions exist

### 2.3 Test Database
- [ ] Insert a test drawing:
```sql
INSERT INTO markup_drawings (thread_id, drawing_data, created_by)
SELECT id, '{"version": "1.0", "shapes": []}'::jsonb, 'test'
FROM markup_threads LIMIT 1;
```
- [ ] Verify insert succeeded
- [ ] Delete test record

---

## ☑️ Phase 3: Row Level Security (10 minutes)

### 3.1 Apply RLS Policies
Copy policies from `IMPLEMENTATION_GUIDE.md` section "Row Level Security"

- [ ] Apply policies for `markup_drawings`
- [ ] Apply policies for `share_links`
- [ ] Verify policies in Supabase Dashboard → Authentication → Policies
- [ ] Test access with different user roles

---

## ☑️ Phase 4: Type Definitions (5 minutes)

### 4.1 Update Supabase Types (Optional but Recommended)
- [ ] Get your project ID from Supabase Dashboard
- [ ] Run: `npx supabase gen types typescript --project-id YOUR_PROJECT_ID > types/supabase.ts`
- [ ] Or manually add types for new tables (see `ARCHITECTURE.md`)

### 4.2 Verify Types
- [ ] Open `types/supabase.ts`
- [ ] Check for `markup_drawings` table types
- [ ] Check for `share_links` table types
- [ ] No TypeScript errors when importing

---

## ☑️ Phase 5: Test Server Actions (15 minutes)

### 5.1 Test Drawing Actions
Create a test file: `test-drawings.ts`

```typescript
import { saveDrawing, getDrawingsByThread } from '@/app/actions/drawings';

// Get a thread ID from your database
const threadId = 'your-thread-id';

const result = await saveDrawing({
  threadId,
  drawingData: {
    version: '1.0',
    shapes: [],
    metadata: {}
  },
  createdBy: 'test-user'
});

console.log('Save result:', result);
```

- [ ] Run test
- [ ] Verify drawing saved in database
- [ ] Check for errors

### 5.2 Test Share Link Actions
```typescript
import { createShareLink } from '@/app/actions/share-links';

const result = await createShareLink({
  resourceType: 'thread',
  resourceId: threadId,
  permissions: 'comment',
  createdBy: 'test-user',
  expiresInDays: 7
});

console.log('Share link:', result.url);
```

- [ ] Run test
- [ ] Copy generated URL
- [ ] Verify link in database
- [ ] Visit URL in browser

### 5.3 Test Duplication
```typescript
import { duplicateProject } from '@/app/actions/duplicate-project';

// Get a project ID
const projectId = 'your-project-id';

const result = await duplicateProject({
  sourceProjectId: projectId,
  newProjectName: 'Test Copy',
  options: {
    copyComments: true,
    copyDrawings: true
  },
  createdBy: 'test-user'
});

console.log('New project:', result.newProjectId);
```

- [ ] Run test
- [ ] Verify new project in database
- [ ] Check threads were copied
- [ ] Check comments were copied (if applicable)

---

## ☑️ Phase 6: Component Integration (30 minutes)

### 6.1 Add Drawing to Image Viewer
In your existing thread/image page:

- [ ] Import `EnhancedImageViewer`
- [ ] Replace existing image display
- [ ] Test drawing tools work
- [ ] Test undo/redo
- [ ] Test save functionality
- [ ] Test drawing loads on page refresh

### 6.2 Add Project Duplicator
In your project list or project detail page:

- [ ] Import `ProjectDuplicator`
- [ ] Add button to trigger duplicator
- [ ] Test duplication with different options
- [ ] Test redirect to new project
- [ ] Verify all data copied correctly

### 6.3 Add Share Link Manager
In your project or thread toolbar:

- [ ] Import `ShareLinkManager`
- [ ] Add share button
- [ ] Test creating share links
- [ ] Test copying links
- [ ] Test different permission levels
- [ ] Test link expiration

---

## ☑️ Phase 7: Share Page Testing (20 minutes)

### 7.1 Test View Only Permission
- [ ] Create share link with 'view' permission
- [ ] Open link in incognito browser
- [ ] Verify image visible
- [ ] Verify no comment form
- [ ] Verify no drawing tools

### 7.2 Test Comment Permission
- [ ] Create share link with 'comment' permission
- [ ] Open link in incognito browser
- [ ] Verify image visible
- [ ] Submit a comment
- [ ] Verify comment appears
- [ ] Verify no drawing tools

### 7.3 Test Draw & Comment Permission
- [ ] Create share link with 'draw_and_comment' permission
- [ ] Open link in incognito browser
- [ ] Test drawing tools appear
- [ ] Draw something
- [ ] Save drawing
- [ ] Submit a comment
- [ ] Verify both saved

---

## ☑️ Phase 8: Error Handling (15 minutes)

### 8.1 Test Error Cases
- [ ] Test invalid share token (should show 404)
- [ ] Test expired share link (should show error)
- [ ] Test saving drawing without thread ID
- [ ] Test duplicating non-existent project
- [ ] Test creating share link for non-existent resource

### 8.2 Verify Error Messages
- [ ] User-friendly error messages shown
- [ ] No stack traces exposed to users
- [ ] Errors logged to console
- [ ] Network errors handled gracefully

---

## ☑️ Phase 9: UI/UX Polish (20 minutes)

### 9.1 Drawing Experience
- [ ] Test all drawing tools (pen, rectangle, arrow, highlight)
- [ ] Test color picker
- [ ] Test stroke width selector
- [ ] Test undo/redo (at least 10 steps)
- [ ] Test clear all
- [ ] Verify smooth drawing (no lag)

### 9.2 Share Experience
- [ ] Copy to clipboard works
- [ ] Share links are readable
- [ ] Permission labels are clear
- [ ] Access count displays correctly
- [ ] Expiration date shows properly

### 9.3 Duplication Experience
- [ ] Progress feedback during duplication
- [ ] Success message with statistics
- [ ] Error messages are helpful
- [ ] Form validation works
- [ ] Redirect works after success

---

## ☑️ Phase 10: Performance Testing (15 minutes)

### 10.1 Load Testing
- [ ] Load project with 50+ images
- [ ] Load project with 100+ comments
- [ ] Open share link with many drawings
- [ ] Verify no performance issues

### 10.2 Drawing Performance
- [ ] Draw 50+ shapes on one image
- [ ] Test undo/redo with many shapes
- [ ] Verify smooth rendering
- [ ] Check memory usage (browser dev tools)

### 10.3 Database Performance
- [ ] Duplicate large project (monitor time)
- [ ] Load drawings for image (check query time in Supabase)
- [ ] Create multiple share links (check speed)

---

## ☑️ Phase 11: Mobile Testing (15 minutes)

### 11.1 Responsive Design
- [ ] Test on mobile viewport (375px width)
- [ ] Test on tablet viewport (768px width)
- [ ] Verify all components are responsive
- [ ] Check touch interactions

### 11.2 Touch Drawing
- [ ] Test drawing with touch on mobile
- [ ] Test pinch to zoom (if applicable)
- [ ] Test toolbar on small screens

---

## ☑️ Phase 12: Security Audit (10 minutes)

### 12.1 Share Link Security
- [ ] Verify token is unguessable (32+ chars)
- [ ] Test expired link returns 403
- [ ] Test revoked link returns 403
- [ ] Test permission enforcement

### 12.2 Data Access
- [ ] Verify users can't access other users' drawings
- [ ] Verify RLS policies working
- [ ] Test with different user roles
- [ ] No sensitive data exposed in client

---

## ☑️ Phase 13: Documentation (10 minutes)

### 13.1 Code Documentation
- [ ] Review inline comments
- [ ] Add comments where needed
- [ ] Document custom logic
- [ ] Update README if necessary

### 13.2 User Documentation
- [ ] Create user guide for drawing (optional)
- [ ] Create user guide for sharing (optional)
- [ ] Document keyboard shortcuts (if any)

---

## ☑️ Phase 14: Production Preparation (20 minutes)

### 14.1 Environment Variables
- [ ] Update `NEXT_PUBLIC_APP_URL` for production
- [ ] Verify all Supabase vars correct
- [ ] Check no secrets in client code

### 14.2 Build Test
- [ ] Run `npm run build`
- [ ] Fix any build errors
- [ ] Check bundle size
- [ ] Verify no warnings

### 14.3 Deployment Checklist
- [ ] Database migrations applied in production
- [ ] RLS policies active in production
- [ ] Environment variables set
- [ ] Test in production environment

---

## ☑️ Phase 15: Final Testing (20 minutes)

### 15.1 End-to-End Test
Complete this workflow without errors:

1. [ ] Create a new project
2. [ ] Upload images
3. [ ] Draw on first image
4. [ ] Add comments
5. [ ] Create share link (comment permission)
6. [ ] Share link with "client" (use incognito)
7. [ ] Client submits comment via share link
8. [ ] Duplicate project (with comments)
9. [ ] Verify duplicate has all data
10. [ ] Create share link for duplicate
11. [ ] Test new share link works

### 15.2 Edge Cases
- [ ] Test with empty project
- [ ] Test with project with no images
- [ ] Test with very long project names
- [ ] Test with special characters in names
- [ ] Test with many concurrent users (if possible)

---

## ✅ Completion

When all checkboxes are marked:
- [ ] All features working
- [ ] No critical bugs
- [ ] Performance acceptable
- [ ] Documentation complete
- [ ] Ready for users

---

## 🎉 You're Done!

Congratulations! All three features are now fully implemented and tested.

**What you've accomplished:**
✅ Drawing system with 4 tools  
✅ Undo/redo functionality  
✅ Project duplication with options  
✅ Secure shareable links  
✅ Permission-based access  
✅ Client comment submission  

**Quick Links:**
- [Implementation Guide](IMPLEMENTATION_GUIDE.md)
- [Architecture Docs](ARCHITECTURE.md)
- [Quick Reference](QUICK_REFERENCE.md)
- [Dependencies](DEPENDENCIES.md)

---

## 📊 Estimated Time: 4-5 hours

- Setup: 15 min
- Database: 20 min
- RLS: 10 min
- Types: 5 min
- Testing: 15 min
- Integration: 30 min
- Share testing: 20 min
- Error handling: 15 min
- Polish: 20 min
- Performance: 15 min
- Mobile: 15 min
- Security: 10 min
- Docs: 10 min
- Production: 20 min
- Final testing: 20 min

**Total: ~4 hours**

With breaks and troubleshooting: **~5 hours**

---

## 🆘 Need Help?

If stuck on any step:
1. Check the error message
2. Review relevant documentation file
3. Check Supabase logs
4. Check browser console
5. Review code comments
6. Check SQL migration file

**Common issues solved in `IMPLEMENTATION_GUIDE.md` → Troubleshooting section**

Good luck! 🚀
