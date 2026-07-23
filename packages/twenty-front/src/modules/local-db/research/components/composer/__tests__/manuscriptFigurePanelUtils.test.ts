import {
  deriveFigureNameFromCaption,
  syncFigureNameFromCaption,
} from '@/local-db/research/components/composer/manuscriptFigurePanelUtils';

describe('manuscriptFigurePanelUtils', () => {
  describe('deriveFigureNameFromCaption', () => {
    it('normalizes whitespace in a short caption', () => {
      expect(
        deriveFigureNameFromCaption('  Indoor   air\nquality by site  '),
      ).toBe('Indoor air quality by site');
    });

    it('shortens a long caption at a word boundary near 60 characters', () => {
      const derivedName = deriveFigureNameFromCaption(
        'Indoor air quality measurements across participating study sites during winter',
      );

      expect(derivedName).toBe(
        'Indoor air quality measurements across participating study',
      );
      expect(derivedName.length).toBeLessThanOrEqual(60);
    });
  });

  describe('syncFigureNameFromCaption', () => {
    it('derives the name when it is empty', () => {
      expect(
        syncFigureNameFromCaption({
          currentName: '',
          previousCaption: 'Old caption',
          nextCaption: 'Updated caption',
        }),
      ).toBe('Updated caption');
    });

    it('keeps an auto-derived name synced as the caption changes', () => {
      expect(
        syncFigureNameFromCaption({
          currentName: 'Old caption',
          previousCaption: 'Old caption',
          nextCaption: 'Updated caption with more context',
        }),
      ).toBe('Updated caption with more context');
    });

    it('recognizes a legacy full-caption name as auto-derived', () => {
      const previousCaption =
        'Indoor air quality measurements across participating study sites during winter';

      expect(
        syncFigureNameFromCaption({
          currentName: previousCaption,
          previousCaption,
          nextCaption: 'Updated caption',
        }),
      ).toBe('Updated caption');
    });

    it('preserves a manually edited name when the caption changes', () => {
      expect(
        syncFigureNameFromCaption({
          currentName: 'Custom short name',
          previousCaption: 'Old caption',
          nextCaption: 'Updated caption',
        }),
      ).toBe('Custom short name');
    });
  });
});
