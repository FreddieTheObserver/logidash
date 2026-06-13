import { EmptyState } from '../components/ui/EmptyState';

export function RouteStub({ title, slice }: { title: string; slice: string }) {
  return (
    <div className="mx-auto max-w-[1200px] p-6">
      <EmptyState
        icon="sparkles"
        title={title}
        body={`Coming soon — lands in Phase 8 ${slice}.`}
      />
    </div>
  );
}
