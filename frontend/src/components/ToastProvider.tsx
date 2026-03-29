import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastContextValue = {
  showSuccess: (title: string, description?: string) => void;
  showError: (title: string, description?: string) => void;
  showInfo: (title: string, description?: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const toneStyles: Record<ToastTone, { wrapper: string; badge: string }> = {
  success: {
    wrapper: 'border-green-200 bg-green-50 text-green-900',
    badge: 'bg-green-100 text-green-700',
  },
  error: {
    wrapper: 'border-red-200 bg-red-50 text-red-900',
    badge: 'bg-red-100 text-red-700',
  },
  info: {
    wrapper: 'border-blue-200 bg-blue-50 text-blue-900',
    badge: 'bg-blue-100 text-blue-700',
  },
};

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timersRef = useRef<Map<number, number>>(new Map());

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const addToast = useCallback((tone: ToastTone, title: string, description?: string) => {
    idRef.current += 1;
    const id = idRef.current;

    setToasts((prev) => [...prev, { id, tone, title, description }]);

    const timerId = window.setTimeout(() => {
      removeToast(id);
    }, 5000);
    timersRef.current.set(id, timerId);
  }, [removeToast]);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({
      showSuccess: (title, description) => addToast('success', title, description),
      showError: (title, description) => addToast('error', title, description),
      showInfo: (title, description) => addToast('info', title, description),
    }),
    [addToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-2rem)]">
        {toasts.map((toast) => {
          const styles = toneStyles[toast.tone];
          return (
            <div
              key={toast.id}
              className={`rounded-lg border shadow-sm px-3 py-3 ${styles.wrapper}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className={`inline-block text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full ${styles.badge}`}>
                    {toast.tone}
                  </span>
                  <p className="text-sm font-medium mt-1">{toast.title}</p>
                  {toast.description && <p className="text-xs mt-1 opacity-90">{toast.description}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => removeToast(toast.id)}
                  className="text-xs px-1 py-0.5 rounded hover:bg-black/5"
                >
                  x
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = (): ToastContextValue => {
  const context = useContext(ToastContext);
  if (context) return context;
  return {
    showSuccess: () => undefined,
    showError: () => undefined,
    showInfo: () => undefined,
  };
};
