import { createContext, type ReactNode, useContext, useMemo } from 'react';

import {
  buildCitationContext,
  type CitationContext,
} from '@/local-db/research/manuscript/manuscriptCitations';
import {
  buildAssetLookup,
  numberAssets,
} from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
  type ReferenceLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptEditorContextValue = {
  assetLookup: Map<string, NumberedFigure>;
  citationContext: CitationContext;
  figures: NumberedFigure[];
  references: ReferenceLike[];
};

const ManuscriptEditorContext = createContext<
  ManuscriptEditorContextValue | undefined
>(undefined);

type ManuscriptEditorContextProviderProps = {
  children: ReactNode;
  citationKeys: string[];
  figures: FigureLike[];
  references: ReferenceLike[];
  style: JournalStyle;
};

const referenceKey = (reference: ReferenceLike): string =>
  reference.citationKey?.trim() || reference.id;

export const ManuscriptEditorContextProvider = ({
  children,
  citationKeys,
  figures,
  references,
  style,
}: ManuscriptEditorContextProviderProps) => {
  const value = useMemo<ManuscriptEditorContextValue>(() => {
    const referencesByKey = new Map<string, ReferenceLike>();
    references.forEach((reference) =>
      referencesByKey.set(referenceKey(reference), reference),
    );
    const orderedKeys = [...citationKeys];
    const seenKeys = new Set(orderedKeys);
    references.forEach((reference) => {
      const key = referenceKey(reference);
      if (!seenKeys.has(key)) {
        orderedKeys.push(key);
        seenKeys.add(key);
      }
    });
    const { context } = buildCitationContext(
      orderedKeys,
      referencesByKey,
      style.citationMode,
    );
    const numberedFigures = numberAssets(figures, style);
    return {
      assetLookup: buildAssetLookup(numberedFigures),
      citationContext: context,
      figures: numberedFigures,
      references,
    };
  }, [citationKeys, figures, references, style]);

  return (
    <ManuscriptEditorContext.Provider value={value}>
      {children}
    </ManuscriptEditorContext.Provider>
  );
};

export const useManuscriptEditorContext = (): ManuscriptEditorContextValue => {
  const value = useContext(ManuscriptEditorContext);
  if (value === undefined) {
    throw new Error(
      'Manuscript editor nodes must render inside ManuscriptEditorContextProvider',
    );
  }
  return value;
};

export const manuscriptReferenceKey = referenceKey;
