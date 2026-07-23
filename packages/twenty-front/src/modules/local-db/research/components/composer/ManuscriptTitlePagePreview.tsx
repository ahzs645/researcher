import { styled } from '@linaria/react';
import { useLayoutEffect, useRef, useState } from 'react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import {
  formatManuscriptAuthorLine,
  parseManuscriptAffiliations,
} from '@/local-db/research/manuscript/manuscriptContributors';
import { type JournalStyle } from '@/local-db/research/manuscript/manuscriptTypes';

import { StyledTitlePageCard } from './manuscriptTitlePageStyles';

type ManuscriptTitlePagePreviewProps = {
  title: string;
  authorLine: string;
  affiliations: string;
  correspondingAuthor: string;
  extraLines: string[];
  keywords: string;
  style: JournalStyle;
};

// The sheet renders at a fixed design size and is scaled with a transform, so
// zoom never reflows the typography — it behaves like a document viewer.
const PAGE_WIDTH = 680;
const PAGE_HEIGHT = Math.round((PAGE_WIDTH * 11) / 8.5);
const ZOOM_STEP = 0.1;
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 1.5;

const StyledPreviewCard = styled(StyledTitlePageCard)`
  background: ${themeCssVariables.background.primary};
  position: sticky;
  top: 0;
`;

const StyledPreviewToolbar = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
  justify-content: space-between;
`;

const StyledPreviewLabel = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-transform: uppercase;
`;

const StyledZoomControls = styled.div`
  align-items: center;
  display: flex;
  gap: ${themeCssVariables.spacing[1]};
`;

const StyledZoomButton = styled.button`
  background: ${themeCssVariables.background.secondary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  cursor: pointer;
  font-size: ${themeCssVariables.font.size.xs};
  line-height: 1;
  min-width: 24px;
  padding: ${themeCssVariables.spacing[1]};

  &:disabled {
    cursor: default;
    opacity: 0.4;
  }
`;

const StyledZoomValue = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
  min-width: 34px;
  text-align: center;
`;

const StyledPreviewHint = styled.div`
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.xs};
`;

const StyledViewport = styled.div`
  max-height: 70vh;
  overflow: auto;
`;

const StyledScaledArea = styled.div`
  position: relative;
`;

// A literal white sheet at US-letter proportions — paper is white in the
// exported document regardless of app theme.
const StyledPaper = styled.div`
  background: #ffffff;
  border: 1px solid ${themeCssVariables.border.color.medium};
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
  box-sizing: border-box;
  color: #1a1a1a;
  display: flex;
  flex-direction: column;
  font-family: 'Times New Roman', serif;
  gap: ${themeCssVariables.spacing[3]};
  height: ${PAGE_HEIGHT}px;
  left: 0;
  overflow: hidden;
  padding: 64px 68px;
  position: absolute;
  top: 0;
  transform-origin: top left;
  width: ${PAGE_WIDTH}px;
`;

const StyledTitle = styled.div`
  font-weight: ${themeCssVariables.font.weight.semiBold};
  line-height: 1.25;
  text-align: center;
`;

const StyledAuthorLine = styled.div`
  font-weight: ${themeCssVariables.font.weight.semiBold};
  text-align: center;
`;

const StyledCorrespondence = styled.div`
  font-size: ${themeCssVariables.font.size.sm};
  text-align: center;
`;

const StyledKeywords = styled.div`
  font-size: ${themeCssVariables.font.size.sm};
  margin-top: ${themeCssVariables.spacing[4]};
`;

export const ManuscriptTitlePagePreview = ({
  title,
  authorLine,
  affiliations,
  correspondingAuthor,
  extraLines,
  keywords,
  style,
}: ManuscriptTitlePagePreviewProps) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const [zoom, setZoom] = useState<'fit' | number>('fit');

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (viewport === null) return;
    const measure = () => {
      setFitScale(
        Math.min(1, Math.max(0.2, viewport.clientWidth / PAGE_WIDTH)),
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const scale = zoom === 'fit' ? fitScale : zoom;
  const zoomBy = (delta: number) => {
    setZoom(
      Math.min(
        MAX_ZOOM,
        Math.max(MIN_ZOOM, Math.round((scale + delta) * 10) / 10),
      ),
    );
  };

  const affiliationAlignment =
    style.affiliationAlignment === 'CENTER'
      ? 'center'
      : style.affiliationAlignment === 'RIGHT'
        ? 'right'
        : 'left';

  return (
    <StyledPreviewCard>
      <StyledPreviewToolbar>
        <StyledPreviewLabel>Live preview</StyledPreviewLabel>
        <StyledZoomControls>
          <StyledZoomButton
            type="button"
            aria-label="Zoom out"
            disabled={scale <= MIN_ZOOM}
            onClick={() => zoomBy(-ZOOM_STEP)}
          >
            −
          </StyledZoomButton>
          <StyledZoomValue>{Math.round(scale * 100)}%</StyledZoomValue>
          <StyledZoomButton
            type="button"
            aria-label="Zoom in"
            disabled={scale >= MAX_ZOOM}
            onClick={() => zoomBy(ZOOM_STEP)}
          >
            +
          </StyledZoomButton>
          <StyledZoomButton
            type="button"
            aria-label="Fit page to panel"
            disabled={zoom === 'fit'}
            onClick={() => setZoom('fit')}
          >
            Fit
          </StyledZoomButton>
        </StyledZoomControls>
      </StyledPreviewToolbar>
      <StyledPreviewHint>
        Updates as you type. Word/PDF exports render the title page from these
        same fields and the journal&apos;s style.
      </StyledPreviewHint>
      <StyledViewport ref={viewportRef}>
        <StyledScaledArea
          style={{
            height: PAGE_HEIGHT * scale,
            width: PAGE_WIDTH * scale,
          }}
        >
          <StyledPaper style={{ transform: `scale(${scale})` }}>
            <StyledTitle style={{ fontSize: `${style.titleFontSize ?? 16}px` }}>
              {title.trim() || 'Untitled manuscript'}
            </StyledTitle>
            {authorLine.trim().length > 0 ? (
              <StyledAuthorLine>
                {formatManuscriptAuthorLine(authorLine, affiliations)}
              </StyledAuthorLine>
            ) : null}
            <div style={{ textAlign: affiliationAlignment }}>
              {parseManuscriptAffiliations(affiliations).map(
                (affiliation, index) => (
                  <div key={affiliation.id}>
                    <sup>{index + 1}</sup> <em>{affiliation.name}</em>
                  </div>
                ),
              )}
              {extraLines
                .map((line) => line.trim())
                .filter((line) => line.length > 0)
                .map((line, index) => (
                  <div key={`${index}-${line}`}>{line}</div>
                ))}
            </div>
            {correspondingAuthor.trim().length > 0 ? (
              <StyledCorrespondence>{correspondingAuthor}</StyledCorrespondence>
            ) : null}
            {keywords.trim().length > 0 ? (
              <StyledKeywords>
                <strong>Keywords:</strong>{' '}
                {keywords.replace(/^keywords?\s*:\s*/i, '')}
              </StyledKeywords>
            ) : null}
          </StyledPaper>
        </StyledScaledArea>
      </StyledViewport>
    </StyledPreviewCard>
  );
};
