import {
  deriveFigureNameFromCaption,
  syncFigureNameFromCaption,
  uniqueFigureKey,
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

  describe('uniqueFigureKey', () => {
    it('adds a stable suffix when the caption slug is already used', () => {
      expect(
        uniqueFigureKey(
          'Study workflow',
          ['study-workflow', 'study-workflow-2'],
          'asset',
        ),
      ).toBe('study-workflow-3');
    });

    it('keeps suffixed keys within the storage limit', () => {
      const key = uniqueFigureKey(
        'A very long descriptive figure caption for the study',
        ['a-very-long-descriptive'],
        'asset',
      );

      expect(key.length).toBeLessThanOrEqual(24);
    });
  });
});
