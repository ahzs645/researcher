import { render, screen } from '@testing-library/react';

import { DialogManager } from '@/ui/feedback/dialog-manager/components/DialogManager';
import { useDialogManager } from '@/ui/feedback/dialog-manager/hooks/useDialogManager';
import { useAtomComponentStateValue } from '@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue';

jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager');
jest.mock('@/ui/utilities/state/jotai/hooks/useAtomComponentStateValue');
jest.mock(
  '@/ui/feedback/dialog-manager/components/DialogManagerEffect',
  () => ({
    DialogManagerEffect: () => null,
  }),
);
jest.mock('@/ui/feedback/dialog-manager/components/Dialog', () => ({
  Dialog: ({ title }: { title?: string }) => (
    <div data-testid="rendered-dialog">{title}</div>
  ),
}));

describe('DialogManager', () => {
  it('portals only the queue head outside page stacking contexts', () => {
    jest.mocked(useAtomComponentStateValue).mockReturnValue({
      maxQueue: 2,
      queue: [
        { id: 'first', title: 'First dialog' },
        { id: 'second', title: 'Second dialog' },
      ],
    });
    jest.mocked(useDialogManager).mockReturnValue({
      closeDialog: jest.fn(),
      enqueueDialog: jest.fn(),
    });

    render(
      <div data-testid="transformed-page" style={{ transform: 'scale(1)' }}>
        <DialogManager>
          <span>Page content</span>
        </DialogManager>
      </div>,
    );

    const dialog = screen.getByTestId('rendered-dialog');
    expect(dialog).toHaveTextContent('First dialog');
    expect(screen.queryByText('Second dialog')).not.toBeInTheDocument();
    expect(dialog.parentElement).toBe(document.body);
    expect(screen.getByText('Page content')).toBeInTheDocument();
  });
});
