# Supabase Setup Instructions

## Prerequisites
Your Supabase credentials are already configured in `.env`:
- URL: `https://atutgxnwrkuuqwyziahj.supabase.co`
- Anon Key: Configured

## Required Setup Steps

### 1. Create Storage Bucket

Go to your Supabase Dashboard:
1. Navigate to **Storage** in the left sidebar
2. Click **"New Bucket"**
3. Create a bucket with these settings:
   - **Name**: `screenshots`
   - **Public bucket**: ✅ **Yes** (check this box)
   - Click **"Create bucket"**

### 2. Configure Storage Policies (Important!)

After creating the bucket, you need to set up policies to allow uploads:

1. Click on the `screenshots` bucket
2. Go to **"Policies"** tab
3. Click **"New Policy"**

#### Policy 1: Allow Public Uploads
- **Policy name**: `Allow public uploads`
- **Allowed operation**: `INSERT`
- **Policy definition**:
  ```sql
  true
  ```

#### Policy 2: Allow Public Reads
- **Policy name**: `Allow public reads`
- **Allowed operation**: `SELECT`
- **Policy definition**:
  ```sql
  true
  ```

#### Policy 3: Allow Public Deletes
- **Policy name**: `Allow public deletes`
- **Allowed operation**: `DELETE`
- **Policy definition**:
  ```sql
  true
  ```

### 3. Verify Configuration

After setup, your storage bucket should:
- ✅ Be named `screenshots`
- ✅ Be set as public
- ✅ Have upload, read, and delete policies enabled

## Testing

1. Start your development server:
   ```bash
   npm run dev
   ```

2. Navigate to a project and try uploading an image
3. The image should upload to Supabase and display properly
4. You should be able to open it for annotation

## Troubleshooting

### Images not uploading?
- Check if the `screenshots` bucket exists in Supabase Storage
- Verify the bucket is set to **public**
- Check browser console for error messages

### Images not displaying?
- Ensure the bucket policies allow public reads
- Verify the URL format in browser console

### Permission errors?
- Double-check all three policies (INSERT, SELECT, DELETE) are enabled
- Make sure they're set to `true` (allowing all requests)

## Features Implemented

✅ **Supabase Storage Integration**
- Images uploaded directly to Supabase Cloud Storage
- No more localStorage size limits
- Persistent image storage
- Fast CDN delivery

✅ **Improved UI/UX**
- Sleek modern design with gradients and shadows
- Smooth animations and transitions
- Better visual feedback during uploads
- Enhanced image grid with hover effects
- Improved annotation canvas display
- Loading states and error handling

✅ **Better Image Handling**
- Proper image URL loading from Supabase
- Error handling for failed image loads
- Lazy loading for better performance
- Responsive image display

## Next Steps

Consider adding:
- User authentication with Supabase Auth
- Database tables for projects and annotations
- Real-time collaboration with Supabase Realtime
- Image optimization and thumbnails
