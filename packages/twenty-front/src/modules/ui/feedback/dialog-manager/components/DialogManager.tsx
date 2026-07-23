import { dialogInternalComponentState } from '@/ui/feedback/dialog-manager/states/dialogInternalComponentState';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { createPortal } from 'react-dom';

import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';
import { Dialog } from './Dialog';
import { DialogManagerEffect } from './DialogManagerEffect';

export const DialogManager = ({ children }: React.PropsWithChildren) => {
  const dialogInternal = useAtomComponentStateValue(
    dialogInternalComponentState,
  );
  const { closeDialog } = useDialogManager();
  const activeDialog = dialogInternal.queue[0];
  const activeDialogElement =
    activeDialog === undefined ? null : (
      <Dialog
        key={activeDialog.id}
        id={activeDialog.id}
        title={activeDialog.title}
        message={activeDialog.message}
        buttons={activeDialog.buttons}
        className={activeDialog.className}
        onClose={() => closeDialog(activeDialog.id)}
      >
        {activeDialog.children}
      </Dialog>
    );

  return (
    <>
      <DialogManagerEffect />
      {children}
      {activeDialog === undefined
        ? null
        : // A portal keeps fixed positioning out of transformed page ancestors,
          // and rendering one queue head avoids competing global dialog listeners.
          createPortal(activeDialogElement, document.body)}
    </>
  );
};
