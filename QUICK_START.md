# 🚀 Quick Start Guide

## 📦 Installation

First, make sure all dependencies are installed:

```bash
cd /home/kingsley-sama/annotation/my-app
npm install
```

## ⚙️ Supabase Setup (CRITICAL - DO THIS FIRST!)

### Step 1: Access Supabase Dashboard
Go to: https://supabase.com/dashboard/project/atutgxnwrkuuqwyziahj

### Step 2: Create Storage Bucket

1. Click **"Storage"** in the left sidebar
2. Click **"New Bucket"** button
3. Configure:
   - **Name**: `images` (must be exactly this!)
   - **Public bucket**: ✅ **CHECK THIS BOX** (very important!)
4. Click **"Create bucket"**

### Step 3: Set Storage Policies

Click on the `images` bucket, then go to **"Policies"** tab:

#### Policy 1 - Allow Uploads
- Click **"New Policy"** → **"Create a policy"**
- **Policy name**: `Allow public uploads`
- **Allowed operation**: `INSERT`
- Toggle to **"Use SQL editor"** and paste:
  ```sql
  true
  ```
- Click **"Review"** then **"Save policy"**

#### Policy 2 - Allow Reading
- Click **"New Policy"** → **"Create a policy"**
- **Policy name**: `Allow public reads`
- **Allowed operation**: `SELECT`
- Toggle to **"Use SQL editor"** and paste:
  ```sql
  true
  ```
- Click **"Review"** then **"Save policy"**

#### Policy 3 - Allow Deletion
- Click **"New Policy"** → **"Create a policy"**
- **Policy name**: `Allow public deletes`
- **Allowed operation**: `DELETE`
- Toggle to **"Use SQL editor"** and paste:
  ```sql
  true
  ```
- Click **"Review"** then **"Save policy"**

### ✅ Verify Setup
Your `images` bucket should now show:
- 🟢 Public access enabled
- 🟢 3 policies (INSERT, SELECT, DELETE)

## 🏃 Running the App

```bash
npm run dev
```

Open http://localhost:3000

## 🎯 Using the App

### 1. First Time Setup
- Enter your name and email
- This creates your user profile (stored locally)

### 2. Create a Project
- Click **"New Project"**
- Enter project name and description
- Click **"Create Project"**

### 3. Upload Images
- Click **"Add Images"** in your project
- Drag & drop images OR click **"Select Files"**
- Wait for upload to Supabase (you'll see progress)
- Click **"Add X Images to Project"**

### 4. Annotate Images
- Click on any image to open annotation view
- Use the toolbar to select tools:
  - ✏️ **Pen** - Draw freehand lines
  - ➡️ **Arrow** - Draw arrows
  - ⬜ **Box** - Draw rectangles
  - ⭕ **Circle** - Draw circles
- Select color from palette
- Adjust stroke width with slider
- Draw on the image!

### 5. Manage Annotations
- **List panel** (right sidebar) shows all annotations
- Click annotation to select/highlight it
- **Copy** button duplicates an annotation
- **Delete** button removes it
- **Names toggle** shows/hides creator names

### 6. Download & Share
- **Download** button saves annotated image
- **Clear** removes all annotations
- **Share** button creates shareable link

## 🎨 UI Features

### Modern Design Elements
- ✨ Gradient backgrounds
- 🌊 Glass-morphism effects (blur + transparency)
- 💫 Smooth animations on hover
- 🎪 Scale effects on buttons
- 🌈 Color-coded tools and annotations
- 📱 Fully responsive layout

### Visual Feedback
- Upload progress indicators
- Success/error states
- Loading states with spinners
- Hover effects everywhere
- Selected state highlighting
- Tool emoji indicators

## 🔍 Troubleshooting

### Images Won't Upload
**Symptom**: Error message or stuck on "Uploading..."

**Solutions**:
1. Check Supabase bucket exists and is named `images`
2. Verify bucket is set to PUBLIC
3. Confirm INSERT policy is enabled
4. Check browser console (F12) for detailed error
5. Try refreshing the page

### Images Won't Display
**Symptom**: Broken image icon or "Failed to load image"

**Solutions**:
1. Verify SELECT policy is enabled
2. Check image URL in console - should start with `https://atutgxnwrkuuqwyziahj.supabase.co/storage/v1/object/public/images/`
3. Open the URL directly in browser to test
4. Check Supabase dashboard for the uploaded file

### Upload Button Disabled
**Symptom**: Can't click "Select Files"

**Solutions**:
1. Wait for any current upload to finish
2. Clear the upload list and try again
3. Refresh the page

### Annotations Not Saving
**Symptom**: Drawings disappear after page reload

**Note**: Annotations are saved in localStorage (browser storage)
- They persist per image
- Clearing browser data removes them
- They're not uploaded to Supabase (feature for future)

### TypeScript Errors in Editor
**Symptom**: Red underlines in code editor

**Note**: These are pre-existing type definition issues
- App functionality works fine
- Can be ignored for now
- Won't affect runtime behavior

## 📊 Storage Information

### Where Things Are Stored

#### Supabase Storage (Cloud):
- ✅ Uploaded images
- ✅ Original image files
- ✅ Accessible via CDN

#### Browser localStorage (Local):
- ✅ User profile (name, email)
- ✅ Project list
- ✅ Annotations per image
- ✅ User list per image

**Note**: localStorage has ~5-10MB limit but since images are now in Supabase, you won't hit this limit!

## 🎓 Tips & Best Practices

### Image Upload
- ✅ Use PNG or JPG format
- ✅ Keep files under 50MB
- ✅ Use descriptive filenames
- ✅ Upload in batches if you have many

### Annotations
- ✅ Use different colors for different types
- ✅ Thicker strokes (10-15px) for highlights
- ✅ Thinner strokes (2-5px) for details
- ✅ Use arrows to point out specific areas
- ✅ Rectangles for bounding areas
- ✅ Circles for focus points

### Performance
- ✅ Images load fast from Supabase CDN
- ✅ Lazy loading prevents slowdowns
- ✅ Canvas optimized for smooth drawing
- ✅ Clear annotations if canvas feels sluggish

## 🐛 Known Issues

1. **TypeScript warnings** - Pre-existing, doesn't affect functionality
2. **Annotations are local** - Not synced to cloud (future feature)
3. **No real-time collaboration** - Users see own annotations only

## 🔮 Future Enhancements

Potential improvements you could add:
- 🔐 User authentication with Supabase Auth
- 💾 Save annotations to Supabase Database
- 🔄 Real-time collaboration
- 📱 Mobile app version
- 🔍 Search and filter projects
- 📧 Email notifications
- 💬 Comments system
- 🎨 More drawing tools
- 🖼️ Image thumbnails and previews
- 📊 Analytics dashboard

## 📞 Support

If you encounter issues:
1. Check browser console (F12 → Console tab)
2. Verify Supabase setup is complete
3. Review error messages carefully
4. Check `SUPABASE_SETUP.md` for detailed config
5. Review `UPDATE_SUMMARY.md` for what changed

## 🎉 That's It!

You're ready to start annotating! 

**Quick checklist:**
- ✅ npm install completed
- ✅ Supabase bucket created
- ✅ 3 storage policies enabled
- ✅ npm run dev running
- ✅ Browser open to localhost:3000

Happy annotating! 🎨✨
