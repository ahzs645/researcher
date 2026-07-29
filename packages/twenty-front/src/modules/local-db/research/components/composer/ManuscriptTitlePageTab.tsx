import { styled } from '@linaria/react';
import { useEffect, useState } from 'react';
import { H2Title } from 'twenty-ui/display';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  type ManuscriptRecord,
  type SectionRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';
import { ManuscriptFrontMatterSections } from '@/local-db/research/components/composer/ManuscriptFrontMatterSections';
import { parseManuscriptTitlePageExtraLines } from '@/local-db/research/manuscript/manuscriptTitlePage';
import {
  type FigureLike,
  type JournalStyle,
  type ReferenceLike,
  type SectionPlacement,
} from '@/local-db/research/manuscript/manuscriptTypes';
import { useSnackBar } from '@/ui/feedback/snack-bar-manager/hooks/useSnackBar';

import { type ManuscriptContributorValues } from './ManuscriptContributorsEditor';
import { ManuscriptTitlePageFields } from './ManuscriptTitlePageFields';
import { ManuscriptTitlePageFragments } from './ManuscriptTitlePageFragments';
import { ManuscriptTitlePagePreview } from './ManuscriptTitlePagePreview';
import { StyledTitlePageColumns } from './manuscriptTitlePageStyles';

export type ManuscriptTitlePageDetails = ManuscriptContributorValues & {
  name: string;
  titlePageExtraLines: string[];
  keywords: string;
  keywordsSectionId?: string;
};

type ManuscriptTitlePageTabProps = {
  manuscript: ManuscriptRecord;
  sections: SectionRecord[];
  figures: FigureLike[];
  references: ReferenceLike[];
  selectedSectionId?: string;
  style: JournalStyle;
  onSave: (values: ManuscriptTitlePageDetails) => Promise<void>;
  onAddKeywordsSection: () => Promise<void>;
  onChangeSectionIncludeInExport: (
    sectionId: string,
    includeInExport: boolean,
  ) => Promise<void>;
  onChangeSectionPlacement: (
    sectionId: string,
    placement: SectionPlacement,
  ) => Promise<void>;
  onDeleteSection: (sectionId: string) => Promise<void>;
  onPersistSection: (sectionId: string, markdown: string) => void;
};

const StyledTab = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[3]};

  & h2 {
    margin-bottom: 0;
  }
`;

export const ManuscriptTitlePageTab = ({
  manuscript,
  sections,
  figures,
  references,
  selectedSectionId,
  style,
  onSave,
  onAddKeywordsSection,
  onChangeSectionIncludeInExport,
  onChangeSectionPlacement,
  onDeleteSection,
  onPersistSection,
}: ManuscriptTitlePageTabProps) => {
  const keywordsSection = sections.find(
    (section) => section.sectionType?.toUpperCase() === 'KEYWORDS',
  );
  const fragments = sections.filter(
    (section) =>
      section.placement === 'FRONT_MATTER' &&
      ['OTHER', 'TITLE_PAGE'].includes(
        section.sectionType?.toUpperCase() ?? 'OTHER',
      ),
  );
  const [name, setName] = useState(manuscript.name ?? '');
  const [contributors, setContributors] = useState<ManuscriptContributorValues>(
    {
      authorLine: manuscript.authorLine ?? '',
      affiliations: manuscript.affiliations ?? '',
      correspondingAuthor: manuscript.correspondingAuthor ?? '',
    },
  );
  const [extraLines, setExtraLines] = useState(() =>
    parseManuscriptTitlePageExtraLines(manuscript.titlePageExtraLines),
  );
  const [keywords, setKeywords] = useState(keywordsSection?.content ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const { enqueueSuccessSnackBar, enqueueErrorSnackBar } = useSnackBar();

  // Cross-tab writes (an import, the submission checklist) land on the record
  // while this form holds local state. Re-sync from the record whenever it
  // changes underneath us — unless the user has unsaved local edits, which
  // would silently clobber their typing either way.
  const [isDirty, setIsDirty] = useState(false);
  const recordSignature = JSON.stringify([
    manuscript.name,
    manuscript.authorLine,
    manuscript.affiliations,
    manuscript.correspondingAuthor,
    manuscript.titlePageExtraLines,
    keywordsSection?.content,
  ]);
  const [lastSyncedSignature, setLastSyncedSignature] =
    useState(recordSignature);
  useEffect(() => {
    if (recordSignature === lastSyncedSignature) return;
    setLastSyncedSignature(recordSignature);
    if (isDirty) return;
    setName(manuscript.name ?? '');
    setContributors({
      authorLine: manuscript.authorLine ?? '',
      affiliations: manuscript.affiliations ?? '',
      correspondingAuthor: manuscript.correspondingAuthor ?? '',
    });
    setExtraLines(
      parseManuscriptTitlePageExtraLines(manuscript.titlePageExtraLines),
    );
    setKeywords(keywordsSection?.content ?? '');
  }, [
    isDirty,
    keywordsSection?.content,
    lastSyncedSignature,
    manuscript,
    recordSignature,
  ]);

  const currentValues = (
    nextExtraLines = extraLines,
  ): ManuscriptTitlePageDetails => ({
    name,
    ...contributors,
    titlePageExtraLines: nextExtraLines,
    keywords,
    ...(keywordsSection !== undefined
      ? { keywordsSectionId: keywordsSection.id }
      : {}),
  });

  const save = async (values = currentValues()): Promise<boolean> => {
    if (isSaving) return false;
    setIsSaving(true);
    try {
      await onSave(values);
      setIsDirty(false);
      enqueueSuccessSnackBar({ message: 'Front matter saved' });
      return true;
    } catch {
      enqueueErrorSnackBar({ message: 'Could not save front matter' });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const markDirty =
    <T,>(setter: (value: T) => void) =>
    (value: T) => {
      setIsDirty(true);
      setter(value);
    };

  return (
    <StyledTab>
      <H2Title title="Front matter" />
      <StyledTitlePageColumns>
        <ManuscriptTitlePageFields
          contributors={contributors}
          extraLines={extraLines}
          hasKeywordsSection={keywordsSection !== undefined}
          isSaving={isSaving}
          keywords={keywords}
          name={name}
          onAddKeywordsSection={onAddKeywordsSection}
          onChangeContributors={markDirty(setContributors)}
          onChangeExtraLines={markDirty(setExtraLines)}
          onChangeKeywords={markDirty(setKeywords)}
          onChangeName={markDirty(setName)}
          onSave={() => void save()}
        />
        <ManuscriptTitlePagePreview
          title={name}
          authorLine={contributors.authorLine}
          affiliations={contributors.affiliations}
          correspondingAuthor={contributors.correspondingAuthor}
          extraLines={extraLines}
          keywords={keywords}
          style={style}
        />
      </StyledTitlePageColumns>
      <ManuscriptFrontMatterSections
        figures={figures}
        onChangeIncludeInExport={onChangeSectionIncludeInExport}
        onChangePlacement={onChangeSectionPlacement}
        onPersistSection={onPersistSection}
        references={references}
        sections={sections}
        selectedSectionId={selectedSectionId}
        style={style}
      />
      <ManuscriptTitlePageFragments
        sections={fragments}
        onAbsorb={async (section, text) => {
          const nextLines = [...extraLines, text];
          const didSave = await save(currentValues(nextLines));
          if (!didSave) return;
          setExtraLines(nextLines);
          await onDeleteSection(section.id).catch(() =>
            enqueueErrorSnackBar({
              message:
                'The line was saved, but the fragment could not be deleted',
            }),
          );
        }}
        onDelete={(sectionId) =>
          onDeleteSection(sectionId).catch(() => {
            enqueueErrorSnackBar({
              message: 'Could not delete title-page fragment',
            });
          })
        }
      />
    </StyledTab>
  );
};
