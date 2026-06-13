import { ICONS } from './icons';
import { Button } from './Button';

export function ErrorState({
  title = "Couldn't load this view",
  body,
  onRetry,
}: {
  title?: string;
  body?: string;
  onRetry?: () => void;
}) {
  const Alert = ICONS.alert;
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div
        className="mb-4 flex items-center justify-center rounded-full"
        style={{
          width: 52,
          height: 52,
          background: 'var(--tint-danger)',
          color: 'var(--color-danger)',
        }}
      >
        <Alert size={24} />
      </div>
      <div
        className="text-[16px] font-semibold"
        style={{ color: 'var(--color-text)' }}
      >
        {title}
      </div>
      {body && (
        <div
          className="mt-1 max-w-sm text-[13px]"
          style={{ color: 'var(--color-text-muted)' }}
        >
          {body}
        </div>
      )}
      {onRetry && (
        <div className="mt-4">
          <Button variant="secondary" icon="refresh" onClick={onRetry}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
