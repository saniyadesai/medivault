import { CheckIcon, BellIcon } from './icons';
import type { ToastItem } from './useToast';

export function ToastStack({ toasts }: { toasts: ToastItem[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="mv-toast-stack">
      {toasts.map((toast) => (
        <div key={toast.id} className={`mv-toast${toast.tone === 'info' ? ' is-info' : ''}`}>
          {toast.tone === 'info' ? <BellIcon size={15} /> : <CheckIcon size={15} />}
          <span>{toast.message}</span>
        </div>
      ))}
    </div>
  );
}
