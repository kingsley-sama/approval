/**
 * ShareViewer Component
 * Client-side viewer for shared content with permission-based features
 */

'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import type { ShareLink } from '@/app/actions/share-links';
import DrawingCanvas from '@/components/drawing-canvas';
import DrawingToolbar from '@/components/drawing-toolbar';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import type { DrawingTool, DrawingData } from '@/types/drawing';
import { saveDrawing } from '@/app/actions/drawings';

interface ShareViewerProps {
  shareLink: ShareLink;
  resourceData: any;
  token: string;
}

export default function ShareViewer({
  shareLink,
  resourceData,
  token,
}: ShareViewerProps) {
  const [currentThreadIndex, setCurrentThreadIndex] = useState(0);
  const [userName, setUserName] = useState('');
  const [commentText, setCommentText] = useState('');
  const [isDrawingEnabled, setIsDrawingEnabled] = useState(false);
  const [currentTool, setCurrentTool] = useState<DrawingTool>('pen');
  const [currentColor, setCurrentColor] = useState('#FF0000');
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [submitStatus, setSubmitStatus] = useState('');

  const canComment = shareLink.permissions === 'comment' || shareLink.permissions === 'draw_and_comment';
  const canDraw = shareLink.permissions === 'draw_and_comment';

  // Handle single thread vs project
  const currentThread = resourceData.type === 'thread' 
    ? resourceData.thread 
    : resourceData.threads[currentThreadIndex];

  const comments = resourceData.type === 'thread' ? resourceData.comments : [];
  const drawings = resourceData.type === 'thread' ? resourceData.drawings : [];

  const handleSubmitComment = async () => {
    if (!userName.trim() || !commentText.trim()) {
      setSubmitStatus('Please enter your name and comment');
      return;
    }

    setSubmitStatus('Submitting...');

    try {
      const response = await fetch('/api/share/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          threadId: currentThread.id,
          userName: userName.trim(),
          content: commentText.trim(),
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSubmitStatus('Comment submitted successfully!');
        setCommentText('');
        // Refresh page to show new comment
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setSubmitStatus(`Error: ${result.error}`);
      }
    } catch (error) {
      setSubmitStatus('Failed to submit comment');
      console.error(error);
    }
  };

  const handleSaveDrawing = async (data: DrawingData) => {
    if (!userName.trim()) {
      setSubmitStatus('Please enter your name before saving drawings');
      return;
    }

    setSubmitStatus('Saving drawing...');

    const result = await saveDrawing({
      threadId: currentThread.id,
      drawingData: data,
      createdBy: userName.trim(),
    });

    if (result.success) {
      setSubmitStatus('Drawing saved successfully!');
      setTimeout(() => setSubmitStatus(''), 3000);
    } else {
      setSubmitStatus(`Error: ${result.error}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b p-4">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800">
            {resourceData.type === 'project' 
              ? resourceData.project.project_name 
              : resourceData.thread.markup_projects?.project_name || 'Shared Image'}
          </h1>
          <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
            <span>
              Access: {shareLink.permissions === 'view' ? 'View Only' : 
                       shareLink.permissions === 'comment' ? 'View & Comment' : 
                       'View, Comment & Draw'}
            </span>
            {shareLink.expiresAt && (
              <span>Expires: {new Date(shareLink.expiresAt).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Image Viewer */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg overflow-hidden">
            {/* Drawing Toolbar */}
            {canDraw && (
              <DrawingToolbar
                currentTool={currentTool}
                currentColor={currentColor}
                strokeWidth={strokeWidth}
                isEnabled={isDrawingEnabled}
                onToolChange={setCurrentTool}
                onColorChange={setCurrentColor}
                onStrokeWidthChange={setStrokeWidth}
                onToggleDrawing={() => setIsDrawingEnabled(!isDrawingEnabled)}
              />
            )}

            {/* Image + Drawing Layer */}
            <div className="relative">
              <Image
                src={currentThread.image_path || '/placeholder.jpg'}
                alt={currentThread.thread_name || 'Image'}
                width={1200}
                height={800}
                className="w-full h-auto"
              />
              
              {canDraw && (
                <div className="absolute inset-0">
                  <DrawingCanvas
                    imageWidth={1200}
                    imageHeight={800}
                    initialShapes={drawings[0]?.drawing_data?.shapes || []}
                    currentTool={currentTool}
                    currentColor={currentColor}
                    strokeWidth={strokeWidth}
                    isEnabled={isDrawingEnabled}
                    onSave={handleSaveDrawing}
                  />
                </div>
              )}
            </div>

            {/* Project Navigation */}
            {resourceData.type === 'project' && resourceData.threads.length > 1 && (
              <div className="p-4 border-t flex items-center justify-between">
                <Button
                  onClick={() => setCurrentThreadIndex(Math.max(0, currentThreadIndex - 1))}
                  disabled={currentThreadIndex === 0}
                  variant="outline"
                >
                  ← Previous
                </Button>
                <span className="text-sm text-gray-600">
                  Image {currentThreadIndex + 1} of {resourceData.threads.length}
                </span>
                <Button
                  onClick={() => setCurrentThreadIndex(Math.min(resourceData.threads.length - 1, currentThreadIndex + 1))}
                  disabled={currentThreadIndex === resourceData.threads.length - 1}
                  variant="outline"
                >
                  Next →
                </Button>
              </div>
            )}
          </div>

          {/* Comments Sidebar */}
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-bold mb-4">
              {canComment ? 'Comments' : 'View Only'}
            </h2>

            {/* User Identification */}
            {canComment && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Your Name
                </label>
                <Input
                  type="text"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full"
                />
              </div>
            )}

            {/* Existing Comments */}
            <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
              {comments.map((comment: any) => (
                <div key={comment.id} className="border-l-4 border-blue-500 pl-3 py-2">
                  <div className="text-sm font-semibold text-gray-800">
                    {comment.user_name}
                  </div>
                  <div className="text-sm text-gray-600 mt-1">
                    {comment.content}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">
                    {new Date(comment.created_at).toLocaleString()}
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="text-sm text-gray-500 italic">No comments yet</p>
              )}
            </div>

            {/* Add Comment */}
            {canComment && (
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Add Comment
                </label>
                <Textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Type your comment here..."
                  rows={4}
                  className="w-full"
                />
                <Button
                  onClick={handleSubmitComment}
                  className="w-full mt-3"
                  disabled={!userName.trim() || !commentText.trim()}
                >
                  Submit Comment
                </Button>
                {submitStatus && (
                  <p className={`text-sm mt-2 ${submitStatus.includes('Error') ? 'text-red-600' : 'text-green-600'}`}>
                    {submitStatus}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
