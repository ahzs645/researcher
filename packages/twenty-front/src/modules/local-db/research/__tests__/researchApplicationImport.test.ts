import { importedCommentsNote } from '@/local-db/research/manuscript/manuscriptDocImport';
import {
  applicationSectionsFromMarkdown,
  applicationSectionsFromWordXml,
  classifyApplicationHeading,
} from '@/local-db/research/researchApplicationImport';

const wordDocument = (body: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;

const heading = (text: string): string =>
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`;

const commentedParagraph = (commentId: string, text: string): string =>
  `<w:p><w:commentRangeStart w:id="${commentId}"/><w:r><w:t>${text}</w:t></w:r><w:commentRangeEnd w:id="${commentId}"/><w:r><w:commentReference w:id="${commentId}"/></w:r></w:p>`;

const REVIEWED_PROPOSAL = wordDocument(
  [
    heading('Lay Summary'),
    commentedParagraph('7', 'We will place sensors in schools.'),
    heading('Budget Justification'),
    commentedParagraph('8', 'Sensors cost $200 each.'),
  ].join(''),
);

const PROPOSAL_COMMENTS_XML = `<?xml version="1.0" encoding="UTF-8"?><w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:comment w:id="7" w:author="Rae Ivy" w:initials="RI" w:date="2026-03-04T09:12:00Z"><w:p><w:r><w:t>Name the school board partner.</w:t></w:r></w:p></w:comment><w:comment w:id="8" w:author="Dana Okoro" w:date="2026-03-05T11:00:00Z"><w:p><w:r><w:t>Quote the sensor supplier.</w:t></w:r></w:p></w:comment></w:comments>`;

describe('classifyApplicationHeading', () => {
  it('maps proposal headings to canonical application content types', () => {
    expect(classifyApplicationHeading('Lay Summary')).toBe('LAY_SUMMARY');
    expect(classifyApplicationHeading('1. Background and Rationale')).toBe(
      'BACKGROUND',
    );
    expect(classifyApplicationHeading('Research Objectives')).toBe('OBJECTIVES');
    expect(classifyApplicationHeading('Methodology')).toBe('METHODOLOGY');
    expect(classifyApplicationHeading('Knowledge Translation & Impact')).toBe(
      'IMPACT',
    );
    expect(classifyApplicationHeading('Budget Justification')).toBe(
      'BUDGET_JUSTIFICATION',
    );
    expect(classifyApplicationHeading('Workplan and Timeline')).toBe('TIMELINE');
    expect(classifyApplicationHeading('Team and Expertise')).toBe('TEAM');
    expect(classifyApplicationHeading('EDI Considerations')).toBe('EDI');
  });

  it('falls back to OTHER', () => {
    expect(classifyApplicationHeading('Random heading')).toBe('OTHER');
  });
});

describe('applicationSectionsFromMarkdown', () => {
  it('turns a proposal document into application-section drafts', () => {
    const drafts = applicationSectionsFromMarkdown(
      [
        '# Air Quality Monitoring Proposal',
        '',
        '## Lay Summary',
        'We will place sensors in schools.',
        '',
        '## Objectives',
        'Quantify classroom PM2.5 exposure.',
        '',
        '## Budget Justification',
        'Sensors cost $200 each.',
      ].join('\n'),
    );
    expect(drafts.map((draft) => draft.sectionType)).toEqual([
      'LAY_SUMMARY',
      'OBJECTIVES',
      'BUDGET_JUSTIFICATION',
    ]);
    expect(drafts.every((draft) => draft.status === 'DRAFTING')).toBe(true);
    expect(drafts[0].wordCount).toBeGreaterThan(0);
    expect(drafts.map((d) => d.orderIndex)).toEqual([0, 1, 2]);
  });
});

describe('imported proposal comments', () => {
  it('carries each reviewer comment into the notes of the section it sits in', () => {
    const drafts = applicationSectionsFromWordXml(
      REVIEWED_PROPOSAL,
      PROPOSAL_COMMENTS_XML,
    );

    expect(drafts.map((draft) => draft.notes)).toEqual([
      'Imported comment — Rae Ivy (RI) on 2026-03-04 [on "We will place sensors in schools."]: Name the school board partner.',
      'Imported comment — Dana Okoro on 2026-03-05 [on "Sensors cost $200 each."]: Quote the sensor supplier.',
    ]);
  });

  it('renders a note identically to the manuscript wizard', () => {
    const [draft] = applicationSectionsFromWordXml(
      REVIEWED_PROPOSAL,
      PROPOSAL_COMMENTS_XML,
    );

    expect(draft.notes).toBe(
      importedCommentsNote([
        {
          commentId: '7',
          author: 'Rae Ivy',
          initials: 'RI',
          date: '2026-03-04T09:12:00Z',
          text: 'Name the school board partner.',
          anchoredText: 'We will place sensors in schools.',
        },
      ]),
    );
  });

  it('leaves notes unset when the source carried no comments, so nothing is overwritten with nothing', () => {
    const drafts = applicationSectionsFromMarkdown(
      ['## Lay Summary', 'We will place sensors in schools.'].join('\n'),
    );

    expect(drafts.every((draft) => !('notes' in draft))).toBe(true);
  });
});
