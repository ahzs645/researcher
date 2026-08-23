import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { isManuscriptDocxStylesXml } from '@/local-db/research/manuscript/manuscriptDocxTemplate';
import { type ManuscriptBundle } from '@/local-db/research/manuscript/manuscriptAssembly';

type ManuscriptExportProfileSummaryProps = {
  bundle: ManuscriptBundle;
};

const StyledSummary = styled.div`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.light};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1.5;
  padding: ${themeCssVariables.spacing[2]} ${themeCssVariables.spacing[3]};
`;

const StyledStats = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  flex-wrap: wrap;
  font-size: ${themeCssVariables.font.size.xs};
  gap: ${themeCssVariables.spacing[2]};
`;

export const ManuscriptExportProfileSummary = ({
  bundle,
}: ManuscriptExportProfileSummaryProps) => {
  const style = bundle.style;
  const frontMatterLabel =
    style.frontMatterLayout === 'SEPARATE_TITLE_AND_ABSTRACT'
      ? 'Title page, abstract page, then body'
      : style.frontMatterLayout === 'SEPARATE_TITLE_PAGE'
        ? 'Separate title page'
        : style.frontMatterLayout === 'TITLE_WITH_ABSTRACT'
          ? 'Title + abstract on page 1'
          : 'Continuous front matter';

  return (
    <>
      <StyledSummary>
        <strong>Export styling:</strong> {frontMatterLabel} ·{' '}
        {style.fontFamily ?? 'Times New Roman'} {style.bodyFontSize ?? 12} pt ·{' '}
        {style.lineSpacing ?? 1.5}× body / {style.abstractLineSpacing ?? 1.15}×
        abstract ·{' '}
        {style.bodyAlignment === 'JUSTIFIED'
          ? 'justified text'
          : 'left-aligned text'}
        {` · ${(style.affiliationAlignment ?? 'LEFT').toLowerCase()} affiliations`}
        {` · ${(style.affiliationNumberStyle ?? 'SUPERSCRIPT').toLowerCase()} affiliation numbers`}
        {` · ${(style.tableStyle ?? 'ACADEMIC').toLowerCase()} tables`}
        {` · figure captions ${(style.figureCaptionPosition ?? 'BELOW').toLowerCase()} at ${style.figureCaptionFontSize ?? 10} pt`}
        {` · ${style.figureCaptionGap ?? 3} pt before / ${style.figureCaptionSpacingAfter ?? 6} pt after captions`}
        {style.figurePageLayout === 'ONE_PER_PAGE'
          ? ' · every figure on a separate page'
          : style.figurePageLayout === 'SUPPLEMENT_ONE_PER_PAGE'
            ? ' · supplemental figures one per page'
            : ' · figures flow with sections'}
        {['NEW_PAGE', 'NEW_COVER_PAGE'].includes(
          style.supplementStartLayout ?? '',
        )
          ? ' · supplement starts on a new page'
          : ' · continuous supplement'}
        {style.supplementCoverPage === true ||
        style.supplementStartLayout === 'NEW_COVER_PAGE'
          ? ' · supplement cover included'
          : ' · no supplement cover'}
        {style.lineNumbering === true ? ' · line numbers' : ''}
        {style.pageNumbering === true ? ' · page numbers' : ''}
        {style.sectionNumbering === true ? ' · numbered sections' : ''}
        {style.twoColumn === true ? ' · two columns' : ''}
        {style.titlePageTemplate === 'THESIS' ? ' · thesis cover page' : ''}
        {isManuscriptDocxStylesXml(style.referenceDocStyles)
          ? ` · Word styles from ${style.referenceDocUrl?.trim() || 'your template'}`
          : ''}
        {' · native Word equations'}
      </StyledSummary>
      <StyledStats>
        <span>{bundle.stats.wordCount} words</span>
        <span>{bundle.stats.sectionCount} sections</span>
        <span>{bundle.stats.figureCount} figures</span>
        <span>{bundle.stats.referenceCount} refs</span>
        {bundle.stats.supplementSectionCount > 0 ||
        bundle.stats.supplementFigureCount > 0 ? (
          <span>
            +{bundle.stats.supplementSectionCount} suppl. sections /{' '}
            {bundle.stats.supplementFigureCount} suppl. figures
          </span>
        ) : null}
      </StyledStats>
    </>
  );
};
