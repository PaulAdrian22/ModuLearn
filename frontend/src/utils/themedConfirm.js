let confirmHandler = null;

export const registerThemedConfirmHandler = (handler) => {
  confirmHandler = handler;

  return () => {
    if (confirmHandler === handler) {
      confirmHandler = null;
    }
  };
};

export const themedConfirm = (options = {}) => {
  const normalized =
    typeof options === 'string'
      ? { message: options }
      : {
          title: options.title || 'Confirmation',
          message: options.message || 'Are you sure you want to continue?',
          confirmText: options.confirmText || 'Confirm',
          cancelText: options.cancelText || 'Cancel',
          variant: options.variant || 'default',
          showCancel: options.showCancel !== false,
        };

  if (!confirmHandler) {
    return Promise.resolve(false);
  }

  return confirmHandler(normalized);
};
