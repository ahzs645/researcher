import {
  buildSubmissionTransposeUpdate,
  hasTransposableSubmissionDeclarations,
} from '@/local-db/research/manuscript/manuscriptSubmissionTranspose';
import { parseManuscriptSubmissionExtras } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

const section = (sectionType: string, content: string, orderIndex: number) => ({
  name: sectionType,
  sectionType,
  placement: 'BACK_MATTER',
  content,
  orderIndex,
  wordCount: 3,
  includeInExport: true,
});

describe('submission declaration transposition', () => {
  it('maps declarations into empty journal targets without overwriting values', () => {
    const update = buildSubmissionTransposeUpdate({
      sections: [
        section('FUNDING', 'Imported funding', 0),
        section('CONFLICTS', 'Imported conflicts', 1),
        section('DATA_AVAILABILITY', 'Imported data statement', 2),
        section('ETHICS', 'Imported ethics statement', 3),
        section('ACKNOWLEDGMENTS', 'Thanks to everyone', 4),
        section('AUTHOR_CONTRIBUTIONS', 'A wrote; B reviewed', 5),
      ],
      template: { id: 'journal-id', profileKey: 'journal-key' },
      manuscript: {
        competingInterests: '',
        submissionExtras: JSON.stringify({
          'journal-key': { DATA_AVAILABILITY: 'Existing data statement' },
          other: { FUNDING: 'Other journal funding' },
        }),
      },
    });

    expect(update.competingInterests).toBe('Imported conflicts');
    expect(parseManuscriptSubmissionExtras(update.submissionExtras)).toEqual({
      'journal-key': {
        FUNDING: 'Imported funding',
        DATA_AVAILABILITY: 'Existing data statement',
        ETHICS_APPROVAL: 'Imported ethics statement',
        AUTHOR_CONTRIBUTIONS: 'A wrote; B reviewed',
      },
      other: { FUNDING: 'Other journal funding' },
    });
  });

  it('does not overwrite the canonical competing-interests value', () => {
    const update = buildSubmissionTransposeUpdate({
      sections: [section('CONFLICTS', 'Imported conflicts', 0)],
      template: { id: 'journal-id' },
      manuscript: { competingInterests: 'Existing conflicts' },
    });

    expect(update).toEqual({});
  });

  it('uses the funding declaration key declared by the target checklist', () => {
    const update = buildSubmissionTransposeUpdate({
      sections: [section('FUNDING', 'Imported funding', 0)],
      template: {
        id: 'journal-id',
        profileKey: 'journal-key',
        submissionRequirements: JSON.stringify([
          { key: 'FUNDING_DECLARATION', required: true },
        ]),
      },
      manuscript: {},
    });

    expect(parseManuscriptSubmissionExtras(update.submissionExtras)).toEqual({
      'journal-key': { FUNDING_DECLARATION: 'Imported funding' },
    });
  });

  it('only offers transposition for supported non-empty declarations', () => {
    expect(
      hasTransposableSubmissionDeclarations([
        section('ACKNOWLEDGMENTS', 'Thanks', 0),
        section('FUNDING', '', 1),
      ]),
    ).toBe(false);
    expect(
      hasTransposableSubmissionDeclarations([
        section('AUTHOR_CONTRIBUTIONS', 'A designed the study', 0),
      ]),
    ).toBe(true);
  });
});
