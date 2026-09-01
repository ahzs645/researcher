import {
  collectScreeningFigures,
  runManuscriptScreening,
  screenManuscript,
  type ScreeningFinding,
} from '@/local-db/research/manuscript/manuscriptScreening';
import { buildScreeningReport } from '@/local-db/research/manuscript/manuscriptScreeningChecks';
import { type FigureLike } from '@/local-db/research/manuscript/manuscriptTypes';

const PIXEL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const SECTIONS = [
  {
    id: 'methods',
    name: 'Methods',
    sectionType: 'METHODS',
    content:
      'Filter samples were collected on quartz fibre filters and analysed by thermal-optical transmittance.',
  },
];

const figure = (overrides: Partial<FigureLike> = {}): FigureLike => ({
  id: 'figure-1',
  name: 'Figure 1',
  assetKind: 'FIGURE',
  caption: 'Black carbon time series at the urban background site.',
  altText: 'A line chart of black carbon concentration against time.',
  imageUrl: PIXEL,
  orderIndex: 0,
  ...overrides,
});

const figureFinding = (figures: FigureLike[]): ScreeningFinding => {
  const match = screenManuscript({ sections: SECTIONS, figures }).find(
    ({ key }) => key === 'FIGURE_DOCUMENTATION',
  );
  if (match === undefined) throw new Error('the figure check declined');
  return match;
};

describe('the figure axis', () => {
  describe('collectScreeningFigures', () => {
    it('reads a figure into a shape a check can match over', () => {
      expect(
        collectScreeningFigures({
          figures: [
            figure({ caption: '**Figure 1.** A [linked](url) chart.' }),
          ],
        }),
      ).toEqual([
        {
          id: 'figure-1',
          label: 'Figure 1',
          assetKind: 'FIGURE',
          caption: 'Figure 1. A linked url chart.',
          altText: 'A line chart of black carbon concentration against time.',
          imageUrl: PIXEL,
          hasImage: true,
        },
      ]);
    });

    it('reads them in the order they appear in the paper', () => {
      expect(
        collectScreeningFigures({
          figures: [
            figure({ id: 'second', name: 'Figure 2', orderIndex: 2 }),
            figure({ id: 'first', name: 'Figure 1', orderIndex: 1 }),
          ],
        }).map(({ id }) => id),
      ).toEqual(['first', 'second']);
    });

    it('names an unnamed asset by its cross-reference key, then its position', () => {
      expect(
        collectScreeningFigures({
          figures: [
            figure({ id: 'a', name: null, refKey: 'bc-timeseries' }),
            figure({ id: 'b', name: null, refKey: null, orderIndex: 1 }),
          ],
        }).map(({ label }) => label),
      ).toEqual(['bc-timeseries', 'Figure 2']);
    });

    // The pixels an image check needs are carried but never read here:
    // JetFighter and Barzooka are a later agent's job.
    it('counts a Mermaid diagram as an image even before export draws it', () => {
      expect(
        collectScreeningFigures({
          figures: [
            figure({ imageUrl: null, diagramSource: 'graph TD; A-->B;' }),
          ],
        })[0],
      ).toMatchObject({ imageUrl: null, hasImage: true });
    });
  });

  describe('figure captions and alt text', () => {
    it('names the figure, not a section, when a caption is missing', () => {
      const result = figureFinding([
        figure({ id: 'panel', name: 'Figure 3', caption: '  ' }),
      ]);

      expect(result).toMatchObject({
        verdict: 'ABSENT',
        tool: 'composer',
        figureId: 'panel',
        figureLabel: 'Figure 3',
        detail: 'Figure 3 has no caption.',
      });
      expect(result.sectionId).toBeUndefined();
      expect(result.sectionName).toBeUndefined();
    });

    it('counts the uncaptioned figures and names the first', () => {
      expect(
        figureFinding([
          figure({ id: 'one', name: 'Figure 1', caption: '', orderIndex: 1 }),
          figure({ id: 'two', name: 'Figure 2', caption: '', orderIndex: 2 }),
        ]).detail,
      ).toBe('2 figures have no caption, starting with Figure 1.');
    });

    it('treats a captioned figure with no alt text as weak, and quotes the caption', () => {
      const result = figureFinding([figure({ altText: null })]);

      expect(result.verdict).toBe('WEAK');
      expect(result.figureLabel).toBe('Figure 1');
      expect(result.evidence).toContain('Black carbon time series');
    });

    it('is found when every figure image carries both', () => {
      expect(figureFinding([figure()])).toMatchObject({
        verdict: 'PRESENT',
        detail: 'The figure image carries a caption and alternative text.',
      });
    });

    // A table is documented by its grid and an equation by its notation; alt
    // text is a claim about a picture.
    it('ignores tables and equations that carry no image', () => {
      expect(
        runManuscriptScreening({
          sections: SECTIONS,
          figures: [
            figure({
              id: 't',
              assetKind: 'TABLE',
              imageUrl: null,
              altText: '',
            }),
            figure({
              id: 'e',
              assetKind: 'EQUATION',
              imageUrl: null,
              caption: '',
            }),
          ],
        }).declinations.map(({ key }) => key),
      ).toContain('FIGURE_DOCUMENTATION');
    });

    it('declines on a manuscript with no figures at all', () => {
      const run = runManuscriptScreening({ sections: SECTIONS });

      expect(run.findings.map(({ key }) => key)).not.toContain(
        'FIGURE_DOCUMENTATION',
      );
      expect(
        run.declinations.find(({ key }) => key === 'FIGURE_DOCUMENTATION')
          ?.reason,
      ).toContain('no figure images');
    });
  });

  describe('carrying a figure finding onwards', () => {
    it('keeps the existing signature working for callers that pass sections alone', () => {
      expect(
        screenManuscript({
          sections: SECTIONS,
          competingInterests: 'The authors declare no competing interests.',
        }).map(({ key }) => key),
      ).toContain('COMPETING_INTERESTS');
    });

    it('names the figure in the report where a section finding names its section', () => {
      const report = buildScreeningReport(
        screenManuscript({
          sections: SECTIONS,
          figures: [figure({ name: 'Figure 4', caption: '' })],
        }),
        'A paper with an undocumented figure',
      );

      expect(report).toContain('[ABSENT] Figure captions and alt text');
      expect(report).toContain('Figure: Figure 4');
    });
  });
});
