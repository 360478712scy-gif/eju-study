import { PageHeader } from '../components/ui.tsx';
export function Stub({ title }: { title: string }) {
  return (
    <div className="page">
      <PageHeader title={title} desc="建设中" />
    </div>
  );
}
