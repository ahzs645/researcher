import {
  buildManuscriptBundle,
  type BuildBundleInput,
} from '@/local-db/research/manuscript/manuscriptAssembly';
import { validateSubmission } from '@/local-db/research/manuscript/manuscriptSubmission';

const baseInput: BuildBundleInput = {
  manuscript: {
    id: 'paper',
    name: 'Particulate matter-bound metals',
    authorLine: 'Ahmad Jalil; Ann Duong',
  },
  style: {
    name: 'Atmospheric Environment',
    profileKey: 'elsevier-atmospheric-environment',
    citationMode: 'NUMERIC',
    abstractWordLimit: 250,
    keywordMinimum: 1,
    keywordMaximum: 7,
    requiredArtifacts: ['COVER_LETTER', 'HIGHLIGHTS', 'COMPETING_INTERESTS'],
  },
  sections: [
    {
      id: 'abstract',
      name: 'Abstract',
      sectionType: 'ABSTRACT',
      placement: 'FRONT_MATTER',
      content: 'A concise summary of the study and its main result.',
    },
    {
      id: 'keywords',
      name: 'Keywords',
      sectionType: 'KEYWORDS',
      placement: 'FRONT_MATTER',
      content: 'Particulate matter; metals; air quality',
    },
    {
      id: 'funding',
      name: 'Funding',
      sectionType: 'FUNDING',
      placement: 'BACK_MATTER',
      content: 'No external funding.',
    },
    {
      id: 'conflicts',
      name: 'Competing interests',
      sectionType: 'CONFLICTS',
      placement: 'BACK_MATTER',
      content: 'Nothing to declare.',
    },
    {
      id: 'data',
      name: 'Data availability',
      sectionType: 'DATA_AVAILABILITY',
      placement: 'BACK_MATTER',
      content: 'Available on request.',
    },
  ],
  figures: [],
  references: [],
};

describe('validateSubmission', () => {
  it('requires an abstract even when the journal only defines a maximum', () => {
    const readiness = validateSubmission(
      buildManuscriptBundle({
        ...baseInput,
        sections: baseInput.sections.filter(
          (section) => section.sectionType !== 'ABSTRACT',
        ),
      }),
      {},
    );

    expect(
      readiness.checks.find((check) => check.id === 'abstract')?.severity,
    ).toBe('ERROR');
  });

  it('reports missing required companion files', () => {
    const readiness = validateSubmission(buildManuscriptBundle(baseInput), {});

    expect(readiness.ready).toBe(false);
    expect(
      readiness.checks.find((check) => check.id === 'artifact-HIGHLIGHTS')
        ?.severity,
    ).toBe('ERROR');
  });

  it('enforces the Atmospheric Environment highlight rules', () => {
    const readiness = validateSubmission(buildManuscriptBundle(baseInput), {
      coverLetter: 'Dear Editor, please consider our manuscript.',
      competingInterests: 'The authors have nothing to declare.',
      highlights: ['One result', 'Second result', 'Third result'].join('\n'),
    });

    expect(readiness.errorCount).toBe(0);
    expect(
      readiness.checks.find((check) => check.id === 'atmenv-highlights-format')
        ?.severity,
    ).toBe('READY');
  });

  it('flags a highlight longer than 85 characters', () => {
    const readiness = validateSubmission(buildManuscriptBundle(baseInput), {
      coverLetter: 'Dear Editor.',
      competingInterests: 'Nothing to declare.',
      highlights: ['A'.repeat(86), 'Second result', 'Third result'].join('\n'),
    });

    expect(
      readiness.checks.find((check) => check.id === 'atmenv-highlights-format')
        ?.severity,
    ).toBe('ERROR');
  });

  it('warns without blocking when a dynamic journal requirement is empty', () => {
    const bundle = buildManuscriptBundle({
      ...baseInput,
      style: {
        ...baseInput.style,
        id: 'journal-id',
        name: 'Test Journal',
        profileKey: 'test-journal',
        submissionRequirements: JSON.stringify([
          { key: 'DATA_AVAILABILITY', required: true },
          { key: 'FUNDING', required: true },
        ]),
      },
    });
    const readiness = validateSubmission(bundle, {
      coverLetter: 'Dear Editor.',
      competingInterests: 'Nothing to declare.',
      highlights: ['One result', 'Second result', 'Third result'].join('\n'),
      submissionExtras: JSON.stringify({
        'test-journal': { DATA_AVAILABILITY: 'Available on request.' },
      }),
    });

    expect(
      readiness.checks.find(
        (check) => check.id === 'journal-requirement-FUNDING',
      ),
    ).toEqual({
      id: 'journal-requirement-FUNDING',
      label: 'Funding',
      detail: 'Required by Test Journal: Funding',
      severity: 'WARNING',
      target: 'submission',
    });
    expect(readiness.ready).toBe(true);
  });

  it('does not double-report artifacts that are also journal requirements', () => {
    const bundle = buildManuscriptBundle({
      ...baseInput,
      style: {
        ...baseInput.style,
        id: 'journal-id',
        name: 'Test Journal',
        profileKey: 'test-journal',
        requiredArtifacts: ['COVER_LETTER'],
        submissionRequirements: JSON.stringify([
          { key: 'COVER_LETTER', required: true },
        ]),
      },
    });
    const readiness = validateSubmission(bundle, {});

    const mentions = readiness.checks.filter(
      (check) => check.label === 'Cover letter',
    );
    expect(mentions).toHaveLength(1);
    expect(mentions[0].severity).toBe('ERROR');
  });

  it('satisfies separate-figure requirements only with shipped image files', () => {
    const withStyle = {
      ...baseInput.style,
      requiredArtifacts: ['SEPARATE_FIGURES'],
      submissionRequirements: JSON.stringify([
        { key: 'SEPARATE_FIGURES', required: true },
      ]),
    };
    const figureless = validateSubmission(
      buildManuscriptBundle({
        ...baseInput,
        style: withStyle,
        figures: [
          {
            id: 't1',
            refKey: 'grid',
            assetKind: 'TABLE',
            placement: 'MAIN',
            tableData: '| A |\n| --- |\n| 1 |',
          },
        ],
      }),
      {},
    );
    // Tables are not figure files — the requirement stays unmet, once.
    const separateChecks = figureless.checks.filter(
      (check) => check.label === 'Separate figure files',
    );
    expect(separateChecks).toHaveLength(1);
    expect(separateChecks[0].severity).toBe('WARNING');

    const withImage = validateSubmission(
      buildManuscriptBundle({
        ...baseInput,
        style: withStyle,
        figures: [
          {
            id: 'f1',
            refKey: 'plot',
            assetKind: 'FIGURE',
            placement: 'MAIN',
            imageUrl: 'data:image/png;base64,AAAA',
            imageSource: 'UPLOAD',
          },
        ],
      }),
      {},
    );
    expect(
      withImage.checks.find((check) => check.id === 'artifact-SEPARATE_FIGURES')
        ?.severity,
    ).toBe('READY');
    expect(
      withImage.checks.filter(
        (check) => check.id === 'journal-requirement-SEPARATE_FIGURES',
      ),
    ).toHaveLength(0);
  });

  it('blocks submission when bundle integrity warnings identify broken content', () => {
    const readiness = validateSubmission(
      buildManuscriptBundle({
        ...baseInput,
        sections: [
          ...baseInput.sections,
          {
            id: 'body',
            name: 'Results',
            sectionType: 'RESULTS',
            placement: 'MAIN',
            content: 'Missing citation [@missing] and asset [#missing-figure].',
          },
        ],
        figures: [
          {
            id: 'equation',
            refKey: 'empty-equation',
            assetKind: 'EQUATION',
            placement: 'MAIN',
            equationLatex: '',
          },
        ],
      }),
      {
        coverLetter: 'Dear Editor.',
        competingInterests: 'Nothing to declare.',
        highlights: ['One result', 'Second result', 'Third result'].join('\n'),
      },
    );

    expect(readiness.ready).toBe(false);
    expect(
      readiness.checks.find((check) => check.label === 'Unresolved citation')
        ?.target,
    ).toBe('references');
    expect(
      readiness.checks.find((check) => check.label === 'Broken cross-reference')
        ?.target,
    ).toBe('write');
    expect(
      readiness.checks.find((check) => check.label === 'Empty equation')
        ?.target,
    ).toBe('figures');
  });
});
// The checks a caller has to compute for us — the Crossref retraction scan, the
// screening of the manuscript's sections — have to count for exactly as much as
// the ones raised here, or supplying one would be decoration.
describe('validateSubmission with caller-supplied checks', () => {
  const readyMaterials = {
    coverLetter: 'Dear Editor.',
    competingInterests: 'Nothing to declare.',
    highlights: ['One result', 'Second result', 'Third result'].join('\n'),
  };

  it('changes nothing when no extra checks are supplied', () => {
    const withoutExtras = validateSubmission(
      buildManuscriptBundle(baseInput),
      readyMaterials,
    );
    const withEmptyExtras = validateSubmission(
      buildManuscriptBundle(baseInput),
      readyMaterials,
      [],
    );

    expect(withoutExtras.ready).toBe(true);
    expect(withEmptyExtras).toEqual(withoutExtras);
  });

  it('lets a supplied error gate the export', () => {
    const readiness = validateSubmission(
      buildManuscriptBundle(baseInput),
      readyMaterials,
      [
        {
          id: 'retraction-ref-1',
          label: 'Retracted reference',
          detail: '[@smith2019] A retracted paper — Retraction (2021)',
          severity: 'ERROR',
          target: 'references',
        },
      ],
    );

    expect(readiness.ready).toBe(false);
    expect(readiness.errorCount).toBe(1);
    expect(
      readiness.checks.find((check) => check.id === 'retraction-ref-1')?.target,
    ).toBe('references');
  });

  it('counts a supplied warning without gating the export', () => {
    const baseline = validateSubmission(
      buildManuscriptBundle(baseInput),
      readyMaterials,
    );
    const readiness = validateSubmission(
      buildManuscriptBundle(baseInput),
      readyMaterials,
      [
        {
          id: 'automated-screening',
          label: 'Automated screening',
          detail: 'not found: Open data statement',
          severity: 'WARNING',
          target: 'submission',
        },
      ],
    );

    expect(readiness.ready).toBe(true);
    expect(readiness.warningCount).toBe(baseline.warningCount + 1);
    expect(readiness.checks).toHaveLength(baseline.checks.length + 1);
  });
});
