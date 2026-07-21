'use client';

import React, { useCallback, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { ArrowLeft, Eye, Pencil, Upload } from 'lucide-react';
import ShareLinkManager from '@/components/share-link-manager';
import TourScenesSidebar, { type TourSidebarScene } from '@/components/tour/tour-scenes-sidebar';
import TourLinkModal, { type LinkCandidateScene } from '@/components/tour/tour-link-modal';
import { Button } from '@/components/ui/button';
import { IconTooltip } from '@/components/ui/icon-tooltip';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/confirm-dialog';
import { mapScenesToPlayer, tourSceneName } from '@/lib/tours';
import {
  getTourWorkspaceData,
  type TourHotspotRecord,
  type TourWorkspaceData,
} from '@/app/actions/tour-projects';
import {
  deleteTourScene,
  renameTourScene,
  reorderTourScenes,
  setTourStartScene,
  updateTourSceneView,
} from '@/app/actions/tour-scenes';
import {
  createTourHotspot,
  deleteTourHotspot,
  updateTourHotspot,
} from '@/app/actions/tour-hotspots';

// Pannellum touches `window` at module scope — load the viewers browser-side only.
const viewerLoading = () => (
  <div className="flex-1 flex items-center justify-center bg-gray-900">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white" />
  </div>
);
const TourEditorViewer = dynamic(() => import('@/components/tour/tour-editor-viewer'), {
  ssr: false,
  loading: viewerLoading,
});
const TourPlayer = dynamic(() => import('@/components/tour/tour-player'), {
  ssr: false,
  loading: viewerLoading,
});

interface TourEditorProps {
  projectId: string;
  initialData: TourWorkspaceData;
  fallbackName?: string;
}

export default function TourEditor({ projectId, initialData, fallbackName }: TourEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [projectName, setProjectName] = useState(initialData.projectName ?? fallbackName ?? 'Tour');
  const [scenes, setScenes] = useState(initialData.scenes);
  const [hotspotsByScene, setHotspotsByScene] = useState(initialData.hotspotsByScene);
  const [startSceneId, setStartSceneId] = useState(initialData.startSceneId);
  const [currentSceneId, setCurrentSceneId] = useState<string>(
    initialData.startSceneId ?? initialData.scenes[0]?.id ?? ''
  );
  const [mode, setMode] = useState<'edit' | 'preview'>('edit');
  const [linkMode, setLinkMode] = useState(false);
  const [pendingCoords, setPendingCoords] = useState<{ pitch: number; yaw: number } | null>(null);
  const [editingHotspot, setEditingHotspot] = useState<TourHotspotRecord | null>(null);
  const [isSavingLink, setIsSavingLink] = useState(false);
  const [isSavingView, setIsSavingView] = useState(false);

  const canEdit = (initialData.currentUser.role || 'member') !== 'guest';

  const currentScene = scenes.find(s => s.id === currentSceneId) ?? scenes[0] ?? null;
  const sceneNameById = useMemo(
    () => new Map(scenes.map(s => [s.id, tourSceneName(s)])),
    [scenes],
  );

  const editorHotspots = useMemo(() => {
    if (!currentScene) return [];
    return (hotspotsByScene[currentScene.id] ?? [])
      .filter(h => sceneNameById.has(h.target_scene_id))
      .map(h => ({
        id: h.id,
        pitch: h.pitch,
        yaw: h.yaw,
        label: h.label || sceneNameById.get(h.target_scene_id) || 'Scene',
      }));
  }, [currentScene, hotspotsByScene, sceneNameById]);

  const playerScenes = useMemo(
    () => mapScenesToPlayer(scenes, hotspotsByScene),
    [scenes, hotspotsByScene],
  );

  const sidebarScenes = useMemo<TourSidebarScene[]>(
    () => scenes.map(s => ({
      id: s.id,
      name: tourSceneName(s),
      url: s.image_path,
      hotspotCount: (hotspotsByScene[s.id] ?? []).length,
      isStart: s.id === startSceneId,
    })),
    [scenes, hotspotsByScene, startSceneId],
  );

  const candidateScenes = useMemo<LinkCandidateScene[]>(
    () => scenes
      .filter(s => s.id !== currentScene?.id)
      .map(s => ({ id: s.id, name: tourSceneName(s), url: s.image_path })),
    [scenes, currentScene],
  );

  const refreshWorkspace = useCallback(async () => {
    try {
      const data = await getTourWorkspaceData(projectId);
      if (data.projectName) setProjectName(data.projectName);
      setScenes(data.scenes);
      setHotspotsByScene(data.hotspotsByScene);
      setStartSceneId(data.startSceneId);
      setCurrentSceneId(prev => (
        data.scenes.some(s => s.id === prev)
          ? prev
          : data.startSceneId ?? data.scenes[0]?.id ?? ''
      ));
    } catch (error) {
      console.error('Failed to refresh tour workspace', error);
    }
  }, [projectId]);

  // ── scenes ────────────────────────────────────────────────────────────────

  const handleSelectScene = useCallback((id: string) => {
    setCurrentSceneId(id);
    setPendingCoords(null);
    setEditingHotspot(null);
    // link-mode persists across scene switches until toggled off
  }, []);

  const handleSetStart = async (sceneId: string) => {
    const previous = startSceneId;
    setStartSceneId(sceneId);
    const result = await setTourStartScene(projectId, sceneId);
    if (!result.success) {
      setStartSceneId(previous);
      toast({ title: 'Failed to set start scene', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const handleRenameScene = async (sceneId: string, name: string) => {
    const result = await renameTourScene(sceneId, name, projectId);
    if (result.success) {
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, name } : s));
    }
    return result;
  };

  const handleMoveScene = async (sceneId: string, direction: 'up' | 'down') => {
    const index = scenes.findIndex(s => s.id === sceneId);
    const swapWith = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || swapWith < 0 || swapWith >= scenes.length) return;

    const reordered = [...scenes];
    [reordered[index], reordered[swapWith]] = [reordered[swapWith], reordered[index]];
    const previous = scenes;
    setScenes(reordered);

    const result = await reorderTourScenes(projectId, reordered.map(s => s.id));
    if (!result.success) {
      setScenes(previous);
      toast({ title: 'Failed to reorder scenes', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const handleDeleteScene = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    const ok = await confirm({
      title: `Delete "${scene ? tourSceneName(scene) : 'this scene'}"?`,
      description: 'Navigation links pointing to and from this scene will be removed too. This cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      destructive: true,
    });
    if (!ok) return;

    const result = await deleteTourScene(sceneId, projectId);
    if (!result.success) {
      toast({ title: 'Failed to delete scene', description: result.error ?? 'Please try again.', variant: 'destructive' });
      return;
    }
    // Deletion cascades (hotspots in/out, start scene fallback) — re-sync from the server.
    await refreshWorkspace();
  };

  const handleCaptureView = async (view: { pitch: number; yaw: number; hfov: number }) => {
    if (!currentScene) return;
    setIsSavingView(true);
    const result = await updateTourSceneView(currentScene.id, view, projectId);
    setIsSavingView(false);
    if (!result.success) {
      toast({ title: 'Failed to save entry view', description: result.error ?? 'Please try again.', variant: 'destructive' });
      return;
    }
    setScenes(prev => prev.map(s => s.id === currentScene.id
      ? { ...s, initial_pitch: view.pitch, initial_yaw: view.yaw, initial_hfov: view.hfov }
      : s
    ));
    toast({ title: 'Entry view saved', description: 'Visitors will arrive in this scene facing this direction.' });
  };

  // ── navigation links (hotspots) ───────────────────────────────────────────

  const handleToggleLinkMode = () => {
    setLinkMode(v => !v);
    setPendingCoords(null);
    setEditingHotspot(null);
  };

  const handlePlaceHotspot = useCallback((pitch: number, yaw: number) => {
    setEditingHotspot(null);
    setPendingCoords({ pitch, yaw });
  }, []);

  const handleSelectHotspot = useCallback((id: string) => {
    const hotspot = Object.values(hotspotsByScene).flat().find(h => h.id === id);
    if (!hotspot) return;
    setPendingCoords(null);
    setEditingHotspot(hotspot);
  }, [hotspotsByScene]);

  const closeLinkModal = () => {
    setPendingCoords(null);
    setEditingHotspot(null);
  };

  const handleSubmitLink = async (targetSceneId: string, label: string) => {
    if (!currentScene) return;
    setIsSavingLink(true);

    if (pendingCoords) {
      const result = await createTourHotspot({
        sceneId: currentScene.id,
        targetSceneId,
        pitch: pendingCoords.pitch,
        yaw: pendingCoords.yaw,
        label: label || undefined,
      }, projectId);
      setIsSavingLink(false);
      if (!result.success || !result.hotspot) {
        toast({ title: 'Failed to add link', description: result.error ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      const hotspot = result.hotspot;
      setHotspotsByScene(prev => ({
        ...prev,
        [currentScene.id]: [...(prev[currentScene.id] ?? []), hotspot],
      }));
      // Keep link-mode ON so several exits can be placed in a row (like comment mode).
      closeLinkModal();
      return;
    }

    if (editingHotspot) {
      const result = await updateTourHotspot({
        hotspotId: editingHotspot.id,
        targetSceneId,
        label: label || null,
      }, projectId);
      setIsSavingLink(false);
      if (!result.success || !result.hotspot) {
        toast({ title: 'Failed to update link', description: result.error ?? 'Please try again.', variant: 'destructive' });
        return;
      }
      const hotspot = result.hotspot;
      setHotspotsByScene(prev => ({
        ...prev,
        [hotspot.scene_id]: (prev[hotspot.scene_id] ?? []).map(h => h.id === hotspot.id ? hotspot : h),
      }));
      closeLinkModal();
    }
  };

  const handleDeleteLink = async () => {
    if (!editingHotspot) return;
    const hotspot = editingHotspot;
    closeLinkModal();

    const snapshot = hotspotsByScene;
    setHotspotsByScene(prev => ({
      ...prev,
      [hotspot.scene_id]: (prev[hotspot.scene_id] ?? []).filter(h => h.id !== hotspot.id),
    }));

    const result = await deleteTourHotspot(hotspot.id, projectId);
    if (!result.success) {
      setHotspotsByScene(snapshot);
      toast({ title: 'Failed to remove link', description: result.error ?? 'Please try again.', variant: 'destructive' });
    }
  };

  const switchMode = (next: 'edit' | 'preview') => {
    setMode(next);
    setLinkMode(false);
    closeLinkModal();
  };

  const linkModalOpen = !!pendingCoords || !!editingHotspot;

  return (
    <div className="h-screen bg-background text-foreground flex flex-col">
      {/* ── top nav ── */}
      <header className="h-14 flex items-center justify-between px-4 border-b border-border/50 bg-background shrink-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <IconTooltip label="Back to tours">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={() => router.push('/tours')}
              aria-label="Back to tours"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </IconTooltip>
          <div className="w-8 h-8 flex items-center justify-center overflow-hidden shrink-0">
            <Image src="/logo.png" alt="Company logo" width={32} height={32} className="object-contain h-full w-full" />
          </div>
          <div className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
            — ExposéProfi
          </div>
          <span className="text-sm font-medium text-foreground truncate max-w-[16rem]">{projectName}</span>
        </div>

        {/* Edit / Preview segmented toggle */}
        <div className="flex items-center rounded-lg bg-muted p-0.5">
          <button
            onClick={() => switchMode('edit')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'edit' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Pencil size={12} />
            Edit
          </button>
          <button
            onClick={() => switchMode('preview')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === 'preview' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Eye size={12} />
            Preview
          </button>
        </div>

        <div className="flex items-center gap-2">
          <ShareLinkManager
            resourceType="tour_project"
            resourceId={projectId}
            createdBy="user"
            resourceName={projectName}
          />
        </div>
      </header>

      {/* ── body ── */}
      <div className="flex-1 flex overflow-hidden">
        {scenes.length === 0 ? (
          <div className="flex-1 flex items-center justify-center bg-gray-100">
            <div className="bg-white p-8 rounded-lg shadow-lg max-w-md w-full text-center">
              <div className="mb-4 flex justify-center">
                <div className="p-4 bg-blue-50 rounded-full">
                  <Upload className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <h2 className="text-xl font-semibold mb-2">No scenes yet</h2>
              <p className="text-gray-500">
                Use “Add scenes” in the right panel to upload one 360° equirectangular
                photo per room, then link them into a walkable tour.
              </p>
            </div>
          </div>
        ) : mode === 'preview' ? (
          <TourPlayer
            tourName={projectName}
            scenes={playerScenes}
            startSceneId={startSceneId}
          />
        ) : currentScene ? (
          <TourEditorViewer
            scene={{
              id: currentScene.id,
              name: tourSceneName(currentScene),
              url: currentScene.image_path,
              initialPitch: currentScene.initial_pitch ?? 0,
              initialYaw: currentScene.initial_yaw ?? 0,
              initialHfov: currentScene.initial_hfov ?? 110,
            }}
            hotspots={editorHotspots}
            selectedHotspotId={editingHotspot?.id ?? null}
            linkMode={linkMode}
            onToggleLinkMode={handleToggleLinkMode}
            onPlaceHotspot={handlePlaceHotspot}
            onSelectHotspot={handleSelectHotspot}
            onCaptureView={handleCaptureView}
            isSavingView={isSavingView}
            readOnly={!canEdit}
          />
        ) : null}

        {mode === 'edit' && (
          <TourScenesSidebar
            scenes={sidebarScenes}
            currentSceneId={currentScene?.id ?? ''}
            projectId={projectId}
            onSelectScene={handleSelectScene}
            onScenesChanged={refreshWorkspace}
            onSetStart={handleSetStart}
            onRename={handleRenameScene}
            onMove={handleMoveScene}
            onDelete={handleDeleteScene}
            canEdit={canEdit}
          />
        )}
      </div>

      <TourLinkModal
        open={linkModalOpen}
        mode={pendingCoords ? 'create' : 'edit'}
        candidateScenes={candidateScenes}
        initialTargetId={editingHotspot?.target_scene_id ?? null}
        initialLabel={editingHotspot?.label ?? ''}
        isSaving={isSavingLink}
        onSubmit={handleSubmitLink}
        onDelete={editingHotspot ? handleDeleteLink : undefined}
        onClose={closeLinkModal}
      />
    </div>
  );
}
