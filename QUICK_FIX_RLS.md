# 🔧 Quick Fix: Row-Level Security Policy Error

## The Problem

You're seeing: **"new row violates row-level security policy"**

This means your Supabase `screenshots` bucket exists but doesn't have the required policies to allow uploads.

## Quick Fix (2 minutes)

### Step 1: Go to Supabase Dashboard
👉 https://supabase.com/dashboard

### Step 2: Navigate to Storage
1. Select your project
2. Click **"Storage"** in the left sidebar
3. Click on the **"screenshots"** bucket

### Step 3: Add Policies
Click the **"Policies"** tab at the top

### Step 4: Create INSERT Policy
1. Click **"New Policy"**
2. Choose **"For full customization"** or custom
3. Fill in:
   - **Policy name**: `Allow public uploads`
   - **Policy definition**: `true` (just type the word "true")
   - **Target roles**: Default (public)
   - **Operation**: Check **INSERT**
4. Click **"Save"** or **"Create policy"**

### Step 5: Create SELECT Policy
1. Click **"New Policy"** again
2. Fill in:
   - **Policy name**: `Allow public reads`
   - **Policy definition**: `true`
   - **Target roles**: Default (public)
   - **Operation**: Check **SELECT**
3. Click **"Save"** or **"Create policy"**

### Step 6: (Optional) Create DELETE Policy
1. Click **"New Policy"** again
2. Fill in:
   - **Policy name**: `Allow public deletes`
   - **Policy definition**: `true`
   - **Target roles**: Default (public)
   - **Operation**: Check **DELETE**
3. Click **"Save"**

## Visual Guide

```
Supabase Dashboard
  └─ Storage
      └─ screenshots bucket
          └─ Policies tab
              └─ New Policy (click 3 times)
                  
Policy 1: INSERT
  ├─ Name: Allow public uploads
  ├─ Definition: true
  └─ Operation: [✓] INSERT

Policy 2: SELECT
  ├─ Name: Allow public reads
  ├─ Definition: true
  └─ Operation: [✓] SELECT

Policy 3: DELETE
  ├─ Name: Allow public deletes
  ├─ Definition: true
  └─ Operation: [✓] DELETE
```

## Alternative: Use SQL Editor

If you prefer, you can run this SQL in the Supabase SQL Editor:

```sql
-- Allow INSERT (uploads)
CREATE POLICY "Allow public uploads" ON storage.objects
FOR INSERT TO public
WITH CHECK (bucket_id = 'screenshots');

-- Allow SELECT (downloads/reads)
CREATE POLICY "Allow public reads" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'screenshots');

-- Allow DELETE (optional)
CREATE POLICY "Allow public deletes" ON storage.objects
FOR DELETE TO public
USING (bucket_id = 'screenshots');
```

## Test It

After adding the policies:

1. Go to your app: http://localhost:3000/test-supabase
2. Click **"Run Tests"**
3. All checks should be ✅ green!

## Still Having Issues?

### Make sure:
- ✅ Bucket name is exactly `screenshots` (lowercase, no spaces)
- ✅ Bucket is set to **PUBLIC** (not private)
- ✅ Policy definition is `true` (not TRUE, not True, just `true`)
- ✅ Operations are checked correctly (INSERT, SELECT, DELETE)

### Check Policy Status:
In Supabase Dashboard → Storage → screenshots → Policies:
- You should see 2-3 policies listed
- Each should show as "Enabled"

## Need More Help?

See the full setup guide: `SUPABASE_SETUP.md`

---

Once policies are added, try uploading an image again! 🚀
