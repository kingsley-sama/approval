'use client';

import { useState } from 'react';
import UploadUi from '@/components/upload_ui/upload_ui';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const router = useRouter();
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ url: string; path: string; name: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const handleUploadComplete = (files: Array<{ url: string; path: string; name: string }>) => {
    console.log('Upload complete:', files);
    setUploadedFiles(files);
    setError(null);
    
    // Optional: Navigate to project page or do something with the uploaded files
    // router.push('/dashboard');
  };

  const handleUploadError = (error: Error) => {
    console.error('Upload error:', error);
    setError(error.message);
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">Upload Images</h1>
          <p className="text-muted-foreground">
            Upload your images to start annotating. Supported formats: JPG, PNG, GIF, WebP
          </p>
        </div>

        {error && (
          <div className="mb-4 p-4 bg-destructive/10 border border-destructive rounded-lg text-destructive">
            <p className="font-semibold">Upload Error</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        <div className="bg-card rounded-lg border border-border p-6">
          <UploadUi
            bucketName="screenshots"
            folder="annotations"
            onUploadComplete={handleUploadComplete}
            onUploadError={handleUploadError}
            allowedFileTypes={['image/*']}
            maxFileSize={10 * 1024 * 1024} // 10MB
            maxNumberOfFiles={10}
          />
        </div>

        {uploadedFiles.length > 0 && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold mb-4">Uploaded Files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {uploadedFiles.map((file, index) => (
                <div key={index} className="border border-border rounded-lg overflow-hidden">
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full h-48 object-cover"
                  />
                  <div className="p-3">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{file.path}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
