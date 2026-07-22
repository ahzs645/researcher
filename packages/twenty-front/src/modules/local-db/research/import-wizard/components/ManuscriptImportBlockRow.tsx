import { styled } from '@linaria/react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'twenty-ui/input';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { ManuscriptTableView } from '@/local-db/research/components/ManuscriptTableView';
import { ManuscriptTableEditor } from '@/local-db/research/components/ManuscriptTableEditor';
import { ManuscriptEquationEditor } from '@/local-db/research/import-wizard/components/ManuscriptEquationEditor';
import {
  type ImportBlock,
  type ImportBlockOverride,
  type ImportBlockRole,
} from '@/local-db/research/manuscript/manuscriptImportBlocks';
import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';

type ManuscriptImportBlockRowProps = {
  block: ImportBlock;
  override: ImportBlockOverride | undefined;
  effectiveRole: ImportBlockRole;
  isActive: boolean;
  isSelected: boolean;
  isLinkSource: boolean;
  linkedTargetLabel?: string;
  tableStyle: ManuscriptTableStyle;
  onSelect: (shiftKey: boolean) => void;
  onRoleChange: (role: ImportBlockRole) => void;
  onBeginLink: () => void;
  onMarkdownChange: (markdown: string) => void;
};

const ROLE_OPTIONS: ImportBlockRole[] = [
  'heading',
  'body',
  'caption',
  'image',
  'table',
  'equation',
];

const roleColor = (role: ImportBlockRole): string => {
  if (role === 'heading') return themeCssVariables.color.blue;
  if (role === 'caption') return themeCssVariables.color.orange;
  if (role === 'image') return themeCssVariables.color.turquoise;
  if (role === 'table') return themeCssVariables.color.green;
  if (role === 'equation') return themeCssVariables.color.purple;
  return themeCssVariables.font.color.tertiary;
};

const StyledRow = styled.div<{
  isActive: boolean;
  isSelected: boolean;
  isInferred: boolean;
  isExcluded: boolean;
  headingLevel: number;
}>`
  background: ${({ isActive, isSelected }) =>
    isActive
      ? themeCssVariables.accent.tertiary
      : isSelected
        ? themeCssVariables.accent.quaternary
        : themeCssVariables.background.primary};
  border-color: ${({ isActive }) =>
    isActive
      ? themeCssVariables.color.blue
      : themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  border-style: ${({ isInferred }) => (isInferred ? 'dashed' : 'solid')};
  border-width: 1px;
  cursor: pointer;
  display: grid;
  gap: ${themeCssVariables.spacing[2]};
  grid-template-columns: 92px minmax(0, 1fr) 116px;
  margin-left: ${({ headingLevel }) =>
    `${Math.max(headingLevel - 1, 0) * 16}px`};
  opacity: ${({ isExcluded }) => (isExcluded ? 0.58 : 1)};
  padding: ${themeCssVariables.spacing[2]};
  text-decoration: ${({ isExcluded }) =>
    isExcluded ? 'line-through' : 'none'};

  &:hover {
    border-color: ${themeCssVariables.color.blue};
  }
`;

const StyledRoleBadge = styled.span<{ role: ImportBlockRole }>`
  align-self: start;
  border: 1px solid ${({ role }) => roleColor(role)};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${({ role }) => roleColor(role)};
  font-size: ${themeCssVariables.font.size.xs};
  font-weight: ${themeCssVariables.font.weight.semiBold};
  overflow: hidden;
  padding: 2px ${themeCssVariables.spacing[1]};
  text-align: center;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
`;

const StyledContent = styled.div`
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.sm};
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
`;

const StyledBodyText = styled.div`
  white-space: pre-wrap;
`;

const StyledImage = styled.img`
  border-radius: ${themeCssVariables.border.radius.sm};
  display: block;
  max-height: 150px;
  max-width: 240px;
  object-fit: contain;
`;

const StyledTiffPlaceholder = styled.div`
  align-items: center;
  background: ${themeCssVariables.background.secondary};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.tertiary};
  display: flex;
  font-size: ${themeCssVariables.font.size.xs};
  height: 96px;
  justify-content: center;
  width: 180px;
`;

const StyledEquation = styled.div`
  overflow-x: auto;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledEquationFallback = styled.pre`
  font-family: monospace;
  margin: 0;
  white-space: pre-wrap;
`;

const StyledControls = styled.div`
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.secondary};
  font-size: ${themeCssVariables.font.size.xs};
  max-width: 112px;
  padding: ${themeCssVariables.spacing[1]};
`;

const StyledLinkIndicator = styled.div`
  color: ${themeCssVariables.color.blue};
  font-size: ${themeCssVariables.font.size.xs};
  grid-column: 2 / -1;
`;

const equationSource = (markdown: string): string =>
  markdown.trim().replace(/^\$\$/, '').replace(/\$\$$/, '').trim();

export const ManuscriptImportBlockRow = ({
  block,
  override,
  effectiveRole,
  isActive,
  isSelected,
  isLinkSource,
  linkedTargetLabel,
  tableStyle,
  onSelect,
  onRoleChange,
  onBeginLink,
  onMarkdownChange,
}: ManuscriptImportBlockRowProps) => {
  const rowRef = useRef<HTMLDivElement>(null);
  const [isEditing, setIsEditing] = useState(false);
  const markdown = override?.markdown ?? block.markdown;
  const source = equationSource(markdown);
  const renderedEquation = useMemo(() => {
    if (effectiveRole !== 'equation') return null;
    try {
      const rendered = katex.renderToString(source, {
        displayMode: true,
        throwOnError: false,
      });
      return rendered.includes('katex-error') ? null : rendered;
    } catch {
      return null;
    }
  }, [effectiveRole, source]);

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [isActive]);

  const isTiff = block.imageDataUrl?.startsWith('data:image/tiff') === true;
  const headingLevel =
    effectiveRole === 'heading'
      ? (override?.headingLevel ?? block.headingLevel ?? 2)
      : 1;
  const displayText = effectiveRole === block.role ? block.text : markdown;

  return (
    <StyledRow
      ref={rowRef}
      isActive={isActive}
      isSelected={isSelected}
      isInferred={block.roleConfidence === 'inferred' && override === undefined}
      isExcluded={override?.excluded === true}
      headingLevel={headingLevel}
      onClick={(event) => onSelect(event.shiftKey)}
    >
      <StyledRoleBadge role={effectiveRole}>
        {effectiveRole === 'heading'
          ? `Heading ${headingLevel}`
          : effectiveRole}
      </StyledRoleBadge>
      <StyledContent>
        {isEditing && effectiveRole === 'table' ? (
          <ManuscriptTableEditor
            markdown={markdown}
            tableStyle={tableStyle}
            onChange={onMarkdownChange}
          />
        ) : isEditing && effectiveRole === 'equation' ? (
          <ManuscriptEquationEditor
            markdown={markdown}
            onChange={onMarkdownChange}
          />
        ) : effectiveRole === 'image' && block.imageDataUrl !== undefined ? (
          isTiff ? (
            <StyledTiffPlaceholder>TIFF — no preview</StyledTiffPlaceholder>
          ) : (
            <StyledImage
              src={block.imageDataUrl}
              alt={block.text || `Imported image ${block.index + 1}`}
              loading="lazy"
            />
          )
        ) : effectiveRole === 'table' ? (
          <ManuscriptTableView markdown={markdown} tableStyle={tableStyle} />
        ) : effectiveRole === 'equation' ? (
          renderedEquation === null ? (
            <StyledEquationFallback>{source}</StyledEquationFallback>
          ) : (
            <StyledEquation
              // KaTeX returns escaped, presentation-only markup.
              dangerouslySetInnerHTML={{ __html: renderedEquation }}
            />
          )
        ) : (
          <StyledBodyText>{displayText}</StyledBodyText>
        )}
      </StyledContent>
      <StyledControls onClick={(event) => event.stopPropagation()}>
        <StyledSelect
          aria-label={`Role for block ${block.index + 1}`}
          value={effectiveRole}
          onChange={(event) =>
            onRoleChange(event.target.value as ImportBlockRole)
          }
        >
          {ROLE_OPTIONS.map((role) => (
            <option key={role} value={role}>
              {role === 'heading' ? 'Heading' : role}
            </option>
          ))}
        </StyledSelect>
        {effectiveRole === 'caption' ? (
          <Button
            title={isLinkSource ? 'Cancel link' : 'Link…'}
            variant="tertiary"
            size="small"
            onClick={onBeginLink}
          />
        ) : null}
        {effectiveRole === 'equation' || effectiveRole === 'table' ? (
          <Button
            title={isEditing ? 'Done' : 'Edit…'}
            variant="tertiary"
            size="small"
            onClick={() => setIsEditing((editing) => !editing)}
          />
        ) : null}
      </StyledControls>
      {effectiveRole === 'caption' ? (
        <StyledLinkIndicator>
          {linkedTargetLabel === undefined
            ? isLinkSource
              ? 'Choose an image or table block'
              : 'Not linked'
            : `Linked to ${linkedTargetLabel}`}
        </StyledLinkIndicator>
      ) : null}
    </StyledRow>
  );
};
