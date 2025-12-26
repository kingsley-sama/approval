# Required NPM Packages

## Install Command

Run this command to install all required dependencies:

```bash
npm install konva react-konva nanoid
```

## Package Details

### konva
- **Version**: ^9.3.0 (or latest)
- **Purpose**: Core canvas library for 2D drawing
- **Size**: ~500KB
- **License**: MIT
- **Documentation**: https://konvajs.org/

**Why we need it:**
- Hardware-accelerated canvas rendering
- Shape manipulation (rectangles, arrows, lines)
- Event handling for mouse interactions
- Export capabilities

### react-konva
- **Version**: ^18.2.0 (or latest)
- **Purpose**: React bindings for Konva
- **Size**: ~50KB
- **License**: MIT
- **Documentation**: https://konvajs.org/docs/react/

**Why we need it:**
- React component wrappers for Konva shapes
- React lifecycle integration
- Declarative canvas rendering
- State management compatibility

### nanoid
- **Version**: ^5.0.0 (or latest)
- **Purpose**: Secure, URL-friendly unique ID generator
- **Size**: ~2KB
- **License**: MIT
- **Documentation**: https://github.com/ai/nanoid

**Why we need it:**
- Generate unguessable share tokens
- Small size, high entropy
- URL-safe (no special characters)
- Faster than UUID

## Dev Dependencies

```bash
npm install --save-dev @types/konva
```

### @types/konva
- **Version**: ^9.0.0 (or latest)
- **Purpose**: TypeScript type definitions for Konva
- **Size**: ~100KB
- **License**: MIT

**Why we need it:**
- TypeScript IntelliSense support
- Type safety for Konva API
- Better developer experience

## Already Installed (No Action Needed)

These packages are already in your project:

✅ **zod** - Runtime validation for server actions  
✅ **@supabase/supabase-js** - Database client  
✅ **next** - Framework  
✅ **react** & **react-dom** - UI library  
✅ **typescript** - Type checking  
✅ **@radix-ui/* packages** - UI components (dialog, select, etc.)

## Package.json Addition

Your package.json should include these in dependencies:

```json
{
  "dependencies": {
    // ... existing dependencies ...
    "konva": "^9.3.0",
    "react-konva": "^18.2.0",
    "nanoid": "^5.0.0"
  },
  "devDependencies": {
    // ... existing devDependencies ...
    "@types/konva": "^9.0.0"
  }
}
```

## Verification

After installation, verify packages are installed:

```bash
npm list konva react-konva nanoid
```

Expected output:
```
my-v0-project@0.1.0
├── konva@9.3.0
├── react-konva@18.2.0
└── nanoid@5.0.0
```

## Bundle Size Impact

Total addition to your bundle:
- **Client bundle**: ~550KB (gzipped: ~150KB)
- **Tree-shakeable**: Yes (Konva unused features won't be bundled)
- **Code splitting**: Automatic (Next.js)

**Note**: The drawing features only load when needed, minimizing impact on initial page load.

## Alternative Packages (Not Used)

We chose Konva over alternatives because:

❌ **Fabric.js** - Larger bundle, more complex API  
❌ **Paper.js** - SVG-based (slower for our use case)  
❌ **PixiJS** - WebGL focus (overkill for 2D annotations)  
❌ **Canvas API directly** - Too low-level, more code to maintain  

✅ **Konva** - Best balance of features, performance, and bundle size

## Compatibility

All packages are compatible with:
- ✅ Next.js 14+
- ✅ React 18+
- ✅ TypeScript 5+
- ✅ Node.js 18+
- ✅ Modern browsers (Chrome, Firefox, Safari, Edge)

## Environment Support

- ✅ **Server-side rendering**: nanoid works on server
- ✅ **Client-side rendering**: Konva is client-only (as expected)
- ✅ **Edge runtime**: nanoid compatible
- ⚠️ **Konva**: Client-only (use dynamic import if needed)

## Dynamic Import (Optional)

If you want to reduce initial bundle size:

```tsx
import dynamic from 'next/dynamic';

const DrawingCanvas = dynamic(
  () => import('@/components/drawing-canvas'),
  { ssr: false }
);
```

This loads the drawing component only when needed.

## Troubleshooting

### Issue: "Cannot find module 'konva'"
```bash
rm -rf node_modules package-lock.json
npm install
```

### Issue: TypeScript errors with Konva
```bash
npm install --save-dev @types/konva
```

### Issue: "window is not defined" error
Make sure DrawingCanvas is only rendered client-side:
```tsx
'use client';  // Add this at top of component file
```

## Production Build Test

After installation, test the build:

```bash
npm run build
```

Check bundle sizes:
```bash
npm run build -- --analyze
```

Expected: Drawing components in separate chunks, lazy-loaded.

## CDN Alternative (Not Recommended)

If you prefer CDN (not recommended for this project):

```html
<script src="https://unpkg.com/konva@9/konva.min.js"></script>
```

We use npm packages for:
- Better version control
- TypeScript support
- Tree shaking
- Bundle optimization

---

## Quick Install Script

Copy and run:

```bash
#!/bin/bash

echo "Installing required packages..."
npm install konva react-konva nanoid

echo "Installing dev dependencies..."
npm install --save-dev @types/konva

echo "Verifying installation..."
npm list konva react-konva nanoid @types/konva

echo "Installation complete! ✅"
echo "Next: Apply database migrations"
```

Save as `install-dependencies.sh` and run:
```bash
chmod +x install-dependencies.sh
./install-dependencies.sh
```

---

That's it! Three packages to install, and you're ready to go. 🚀
