# 🔧 Troubleshooting Guide

## Error: "Failed to upload image"

This error occurs when Supabase Storage is not set up correctly. Follow these steps:

### Step 1: Test Your Setup

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Go to: **http://localhost:3000/test-supabase**

3. Click "Run Tests" to see what's wrong

### Step 2: Fix Based on Test Results

#### ❌ Connection Failed
- **Problem**: Can't connect to Supabase
- **Solution**: 
  - Check your `.env` file has correct credentials
  - Verify `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_KEY`
  - Restart dev server after changing `.env`

#### ❌ Bucket Not Found
- **Problem**: Storage bucket "screenshots" doesn't exist
- **Solution**:
  1. Go to https://supabase.com/dashboard
  2. Select your project
  3. Click **Storage** in sidebar
  4. Click **"New Bucket"**
  5. Name it: `screenshots`
  6. ✅ Check **"Public bucket"**
  7. Click **"Create bucket"**

#### ❌ Upload Failed (Permission Denied)
- **Problem**: Storage policies not configured
- **Solution**:
  1. In Supabase Dashboard, go to **Storage** > **screenshots** bucket
  2. Click **"Policies"** tab
  3. Click **"New Policy"** three times to create:

  **Policy 1: Allow Uploads**
  - Name: `Allow public uploads`
  - Allowed operation: `INSERT`
  - Policy definition: `true`

  **Policy 2: Allow Downloads**
  - Name: `Allow public reads`
  - Allowed operation: `SELECT`
  - Policy definition: `true`

  **Policy 3: Allow Deletes**
  - Name: `Allow public deletes`
  - Allowed operation: `DELETE`
  - Policy definition: `true`

### Step 3: Test Again

After fixing, go back to http://localhost:3000/test-supabase and run tests again. All should be ✅ green!

## Quick Visual Guide

### Creating Storage Bucket

```
Supabase Dashboard
  └─ Storage (left sidebar)
      └─ "New Bucket" button
          ├─ Bucket name: screenshots
          ├─ [✓] Public bucket  ← IMPORTANT!
          └─ "Create bucket"
```

### Adding Policies

```
Storage > screenshots bucket
  └─ Policies tab
      └─ "New Policy" (click 3 times)
          ├─ INSERT policy → true
          ├─ SELECT policy → true
          └─ DELETE policy → true
```

## Common Issues

### "Module not found: @supabase/supabase-js"
```bash
npm install @supabase/supabase-js --legacy-peer-deps
```

### Images not displaying after upload
- Check bucket is PUBLIC (not private)
- Check SELECT policy exists and is set to `true`
- Clear browser cache

### Can upload but can't delete
- Add DELETE policy set to `true`

## Still Having Issues?

1. Check browser console (F12) for detailed errors
2. Check Supabase Dashboard > Settings > API for correct keys
3. Verify your Supabase project is not paused/suspended
4. Make sure you're using the **anon/public** key, not the service key

## Success Checklist

- [ ] Supabase credentials in `.env` file
- [ ] Dev server running (`npm run dev`)
- [ ] Storage bucket "screenshots" created
- [ ] Bucket is set to PUBLIC
- [ ] INSERT policy added and enabled
- [ ] SELECT policy added and enabled
- [ ] DELETE policy added and enabled
- [ ] Test page shows all ✅ green

Once all checkboxes are complete, image uploads should work perfectly! 🎉
