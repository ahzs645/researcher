import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import {
  buildCitationContext,
  type CitationContext,
} from '@/local-db/research/manuscript/manuscriptCitations';
import {
  createCiteprocEngine,
  formatCslCitations,
  isVendoredCslStyleId,
} from '@/local-db/research/manuscript/manuscriptCiteproc';
import {
  buildAssetLookup,
  numberAssets,
} from '@/local-db/research/manuscript/manuscriptNumbering';
import {
  type FigureLike,
  type JournalStyle,
  type NumberedFigure,
  type ReferenceLike,
  type SectionLike,
} from '@/local-db/research/manuscript/manuscriptTypes';

type ManuscriptEditorContextValue = {
  assetLookup: Map<string, NumberedFigure>;
  citationContext: CitationContext;
  citationLabelsByKey: Map<string, string>;
  figures: NumberedFigure[];
  isCitationStyleLoading: boolean;
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
  sections?: SectionLike[];
  style: JournalStyle;
};

const referenceKey = (reference: ReferenceLike): string =>
  reference.citationKey?.trim() || reference.id;

export const ManuscriptEditorContextProvider = ({
  children,
  citationKeys,
  figures,
  references,
  sections,
  style,
}: ManuscriptEditorContextProviderProps) => {
  const [citationLabelsByKey, setCitationLabelsByKey] = useState(
    new Map<string, string>(),
  );
  const [isCitationStyleLoading, setIsCitationStyleLoading] = useState(false);
  const coreValue = useMemo(() => {
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
    const numberedFigures = numberAssets(figures, style, sections);
    return {
      assetLookup: buildAssetLookup(numberedFigures),
      citationContext: context,
      figures: numberedFigures,
      references,
    };
  }, [citationKeys, figures, references, sections, style]);
  const citationStyleId = style.citationStyleId;
  const referenceSignature = references
    .map((reference) => `${reference.id}:${reference.cslJson ?? ''}`)
    .join('|');
  const citationSignature = citationKeys.join('|');

  useEffect(() => {
    if (!isVendoredCslStyleId(citationStyleId)) {
      setCitationLabelsByKey(new Map());
      setIsCitationStyleLoading(false);
      return;
    }
    let isActive = true;
    setCitationLabelsByKey(new Map());
    setIsCitationStyleLoading(true);
    void createCiteprocEngine({ styleId: citationStyleId, references })
      .then((engine) => {
        if (!isActive || engine === null) return;
        const labels = formatCslCitations(
          engine,
          citationKeys.map((citationKey) => [citationKey]),
        );
        setCitationLabelsByKey(
          new Map(
            citationKeys.map((citationKey, index) => [
              citationKey,
              labels[index],
            ]),
          ),
        );
      })
      .catch(() => {
        if (isActive) setCitationLabelsByKey(new Map());
      })
      .finally(() => {
        if (isActive) setIsCitationStyleLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [
    citationSignature,
    citationStyleId,
    referenceSignature,
    references,
    citationKeys,
  ]);

  const value = useMemo<ManuscriptEditorContextValue>(
    () => ({
      ...coreValue,
      citationLabelsByKey,
      isCitationStyleLoading,
    }),
    [citationLabelsByKey, coreValue, isCitationStyleLoading],
  );

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
