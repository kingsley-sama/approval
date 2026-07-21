import { getTourWorkspaceData } from '@/app/actions/tour-projects';
import TourEditor from './tour-editor';

interface TourPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ name?: string }>;
}

export default async function TourProjectPage({ params, searchParams }: TourPageProps) {
  const [{ id }, { name }] = await Promise.all([params, searchParams]);
  const initialData = await getTourWorkspaceData(id);

  return (
    <TourEditor
      projectId={id}
      initialData={initialData}
      fallbackName={name ? decodeURIComponent(name) : undefined}
    />
  );
}
