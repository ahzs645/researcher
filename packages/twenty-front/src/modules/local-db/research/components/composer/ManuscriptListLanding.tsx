import { styled } from '@linaria/react';
import { isDefined } from 'twenty-shared/utils';
import { themeCssVariables } from 'twenty-ui/theme-constants';
import { useMemo, useState } from 'react';

import {
  type ManuscriptRecord,
  type SectionRecord,
} from '@/local-db/research/components/composer/manuscriptComposerData';

type ManuscriptListLandingProps = {
  manuscripts: ManuscriptRecord[];
  sections: SectionRecord[];
  onOpen: (manuscriptId: string) => void;
};

const StyledTable = styled.table`
  border-collapse: collapse;
  font-size: ${themeCssVariables.font.size.md};
  width: 100%;
`;

const StyledControls = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: ${themeCssVariables.spacing[2]};
`;

const StyledControl = styled.input`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  min-width: min(280px, 100%);
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledSelect = styled.select`
  background: ${themeCssVariables.background.primary};
  border: 1px solid ${themeCssVariables.border.color.medium};
  border-radius: ${themeCssVariables.border.radius.sm};
  color: ${themeCssVariables.font.color.primary};
  font: inherit;
  padding: ${themeCssVariables.spacing[2]};
`;

const StyledHeaderCell = styled.th`
  border-bottom: 1px solid ${themeCssVariables.border.color.medium};
  color: ${themeCssVariables.font.color.tertiary};
  font-size: ${themeCssVariables.font.size.sm};
  font-weight: ${themeCssVariables.font.weight.medium};
  padding: ${themeCssVariables.spacing[2]};
  text-align: left;
  white-space: nowrap;
`;

const StyledRow = styled.tr`
  cursor: pointer;

  &:hover {
    background: ${themeCssVariables.background.transparent.light};
  }
`;

const StyledCell = styled.td`
  border-bottom: 1px solid ${themeCssVariables.border.color.light};
  padding: ${themeCssVariables.spacing[2]};
  vertical-align: top;
`;

const StyledTitle = styled.span`
  color: ${themeCssVariables.font.color.primary};
  font-weight: ${themeCssVariables.font.weight.medium};
`;

const StyledMuted = styled.span`
  color: ${themeCssVariables.font.color.tertiary};
`;

const StyledNumeric = styled(StyledCell)`
  text-align: right;
  white-space: nowrap;
`;

const humanize = (value: string | null | undefined): string =>
  isDefined(value) && value.length > 0
    ? value
        .toLowerCase()
        .split('_')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
    : '—';

export const ManuscriptListLanding = ({
  manuscripts,
  sections,
  onOpen,
}: ManuscriptListLandingProps) => {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'modified' | 'status' | 'title'>('modified');
  const statsByManuscript = new Map<
    string,
    { sections: number; words: number }
  >();
  for (const section of sections) {
    const owningId = section.manuscript?.id;
    if (!isDefined(owningId)) continue;
    const current = statsByManuscript.get(owningId) ?? {
      sections: 0,
      words: 0,
    };
    statsByManuscript.set(owningId, {
      sections: current.sections + 1,
      words: current.words + (section.wordCount ?? 0),
    });
  }
  const visibleManuscripts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return manuscripts
      .filter(
        (manuscript) =>
          query.length === 0 ||
          [manuscript.name, manuscript.targetVenue, manuscript.status]
            .filter((value): value is string => typeof value === 'string')
            .some((value) => value.toLocaleLowerCase().includes(query)),
      )
      .sort((first, second) => {
        if (sort === 'title') {
          return (first.name ?? '').localeCompare(second.name ?? '');
        }
        if (sort === 'status') {
          return (first.status ?? '').localeCompare(second.status ?? '');
        }
        const firstModified = Date.parse(first.updatedAt ?? '');
        const secondModified = Date.parse(second.updatedAt ?? '');
        return (
          (Number.isFinite(secondModified) ? secondModified : 0) -
          (Number.isFinite(firstModified) ? firstModified : 0)
        );
      });
  }, [manuscripts, search, sort]);

  return (
    <>
      <StyledControls>
        <StyledControl
          aria-label="Search manuscripts"
          placeholder="Search title, venue, or status…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <StyledSelect
          aria-label="Sort manuscripts"
          value={sort}
          onChange={(event) =>
            setSort(event.target.value as 'modified' | 'status' | 'title')
          }
        >
          <option value="modified">Recently modified</option>
          <option value="title">Title</option>
          <option value="status">Status</option>
        </StyledSelect>
      </StyledControls>
      <StyledTable>
        <thead>
          <tr>
            <StyledHeaderCell scope="col">Title</StyledHeaderCell>
            <StyledHeaderCell scope="col">Type</StyledHeaderCell>
            <StyledHeaderCell scope="col">Status</StyledHeaderCell>
            <StyledHeaderCell scope="col">Target venue</StyledHeaderCell>
            <StyledHeaderCell scope="col">Modified</StyledHeaderCell>
            <StyledHeaderCell scope="col">Sections</StyledHeaderCell>
            <StyledHeaderCell scope="col">Words</StyledHeaderCell>
          </tr>
        </thead>
        <tbody>
          {visibleManuscripts.map((manuscript) => {
            const stats = statsByManuscript.get(manuscript.id) ?? {
              sections: 0,
              words: 0,
            };
            return (
              <StyledRow
                key={manuscript.id}
                tabIndex={0}
                role="button"
                onClick={() => onOpen(manuscript.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onOpen(manuscript.id);
                  }
                }}
              >
                <StyledCell>
                  <StyledTitle>
                    {manuscript.name ?? 'Untitled manuscript'}
                  </StyledTitle>
                </StyledCell>
                <StyledCell>
                  <StyledMuted>
                    {humanize(manuscript.manuscriptType)}
                  </StyledMuted>
                </StyledCell>
                <StyledCell>
                  <StyledMuted>{humanize(manuscript.status)}</StyledMuted>
                </StyledCell>
                <StyledCell>
                  <StyledMuted>{manuscript.targetVenue ?? '—'}</StyledMuted>
                </StyledCell>
                <StyledCell>
                  <StyledMuted>
                    {isDefined(manuscript.updatedAt) &&
                    Number.isFinite(Date.parse(manuscript.updatedAt))
                      ? new Date(manuscript.updatedAt).toLocaleDateString()
                      : '—'}
                  </StyledMuted>
                </StyledCell>
                <StyledNumeric>
                  <StyledMuted>{stats.sections}</StyledMuted>
                </StyledNumeric>
                <StyledNumeric>
                  <StyledMuted>{stats.words.toLocaleString()}</StyledMuted>
                </StyledNumeric>
              </StyledRow>
            );
          })}
        </tbody>
      </StyledTable>
    </>
  );
};
