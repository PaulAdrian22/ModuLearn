import React, { useEffect, useRef, useState } from 'react';
import { registerThemedConfirmHandler } from '../utils/themedConfirm';

const ThemedConfirmHost = () => {
  const [dialog, setDialog] = useState(null);
  const resolverRef = useRef(null);

  useEffect(() => {
    const unregister = registerThemedConfirmHandler((options) =>
      new Promise((resolve) => {
        resolverRef.current = resolve;
        setDialog(options);
      })
    );

    return () => {
      if (resolverRef.current) {
        resolverRef.current(false);
        resolverRef.current = null;
      }
      unregister();
    };
  }, []);

  const closeDialog = (result) => {
    if (resolverRef.current) {
      const resolve = resolverRef.current;
      resolverRef.current = null;
      resolve(result);
    }
    setDialog(null);
  };

  useEffect(() => {
    if (!dialog) return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        closeDialog(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  if (!dialog) return null;

  const isDanger = dialog.variant === 'danger';
  const showCancel = dialog.showCancel !== false;

  return (
    <div className="fixed inset-0 z-[1100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
        <div className={`px-6 py-4 ${isDanger ? 'bg-[#EF5350]' : 'bg-highlight'}`}>
          <h3 className="text-white text-xl font-bold">{dialog.title || 'Confirmation'}</h3>
        </div>

        <div className="px-6 py-5">
          <p className="text-gray-700 leading-relaxed">{dialog.message}</p>
        </div>

        <div className="px-6 pb-6 flex justify-end gap-3">
          {showCancel && (
            <button
              type="button"
              onClick={() => closeDialog(false)}
              className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 font-semibold hover:bg-gray-100 transition-colors"
            >
              {dialog.cancelText || 'Cancel'}
            </button>
          )}
          <button
            type="button"
            onClick={() => closeDialog(true)}
            className={`px-4 py-2 rounded-lg text-white font-semibold transition-colors ${
              isDanger ? 'bg-[#EF5350] hover:bg-[#E53935]' : 'bg-highlight hover:bg-[#346C9A]'
            }`}
          >
            {dialog.confirmText || 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemedConfirmHost;
