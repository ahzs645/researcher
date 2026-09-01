import { fireEvent, render, screen } from '@testing-library/react';

import { ManuscriptSectionMetadataPanel } from '@/local-db/research/components/ManuscriptSectionMetadataPanel';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const updateOneRecord = jest.fn(() => Promise.resolve({}));

jest.mock('@/object-record/hooks/useUpdateOneRecord', () => ({
  useUpdateOneRecord: () => ({ updateOneRecord }),
}));
jest.mock('@/ui/feedback/snack-bar-manager/hooks/useSnackBar', () => ({
  useSnackBar: () => ({
    enqueueErrorSnackBar: jest.fn(),
    enqueueSuccessSnackBar: jest.fn(),
  }),
}));
jest.mock('@/ui/feedback/dialog-manager/hooks/useDialogManager', () => ({
  useDialogManager: () => ({ enqueueDialog: jest.fn() }),
}));
jest.mock('@/ui/input/components/Select', () => ({ Select: () => null }));

const REVIEWER_COMMENT =
  'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "The window is strictly aligned."]: Justify this window.';

const section = (notes?: string): SectionLike => ({
  id: 'res',
  name: 'Results',
  sectionType: 'RESULTS',
  placement: 'MAIN',
  content: 'The window is strictly aligned.',
  orderIndex: 0,
  ...(notes === undefined ? {} : { notes }),
});

const renderPanel = (notes?: string) =>
  render(
    <ManuscriptSectionMetadataPanel
      section={section(notes)}
      sections={[section(notes)]}
      figures={[]}
      onChanged={jest.fn()}
      onDelete={jest.fn(() => Promise.resolve())}
      onDuplicate={jest.fn(() => Promise.resolve())}
    />,
  );

describe('replying to an imported comment', () => {
  beforeEach(() => updateOneRecord.mockClear());

  it('shows the comment with its author and the words it was written about', () => {
    renderPanel(REVIEWER_COMMENT);

    expect(
      screen.getByText('1 comment from the imported document'),
    ).toBeInTheDocument();
    expect(screen.getByText('Rae Ivy (RI) · 2026-03-04')).toBeInTheDocument();
    expect(
      screen.getByText('on “The window is strictly aligned.”'),
    ).toBeInTheDocument();
    expect(screen.getByText('Justify this window.')).toBeInTheDocument();
  });

  it('writes the answer back into the notes the comment lives in', () => {
    renderPanel(['Chase the ethics approval.', REVIEWER_COMMENT].join('\n'));

    fireEvent.blur(screen.getByLabelText('Reply to Rae Ivy'), {
      target: { value: 'The window is set by the instrument duty cycle.' },
    });

    expect(updateOneRecord).toHaveBeenCalledWith({
      objectNameSingular: 'manuscriptSection',
      idToUpdate: 'res',
      updateOneRecordInput: {
        notes: [
          'Chase the ethics approval.',
          REVIEWER_COMMENT,
          'Reply — The window is set by the instrument duty cycle.',
        ].join('\n'),
      },
    });
  });

  it('saves nothing when the reply field is left as it was', () => {
    renderPanel(REVIEWER_COMMENT);

    fireEvent.blur(screen.getByLabelText('Reply to Rae Ivy'), {
      target: { value: '' },
    });

    expect(updateOneRecord).not.toHaveBeenCalled();
  });

  it('says nothing at all about comments when the section has none', () => {
    renderPanel('Chase the ethics approval.');

    expect(screen.queryByLabelText(/^Reply to /)).not.toBeInTheDocument();
  });
});
