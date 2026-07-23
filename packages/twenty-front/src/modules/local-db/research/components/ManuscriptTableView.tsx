import { styled } from '@linaria/react';
import { themeCssVariables } from 'twenty-ui/theme-constants';

import { type ManuscriptTableStyle } from '@/local-db/research/manuscript/manuscriptDocxTable';
import { parseMarkdownTable } from '@/local-db/research/manuscript/manuscriptTables';

type ManuscriptTableViewProps = {
  markdown: string;
  tableStyle: ManuscriptTableStyle;
};

const StyledScrollContainer = styled.div`
  max-width: 100%;
  overflow-x: auto;
`;

const StyledTable = styled.table<{ tableStyle: ManuscriptTableStyle }>`
  border-bottom: ${({ tableStyle }) =>
    tableStyle === 'ACADEMIC'
      ? `2px solid ${themeCssVariables.border.color.strong}`
      : tableStyle === 'BORDERLESS'
        ? 'none'
        : `1px solid ${themeCssVariables.border.color.medium}`};
  border-collapse: collapse;
  border-left: ${({ tableStyle }) =>
    tableStyle === 'GRID' || tableStyle === 'SHADED_HEADER'
      ? `1px solid ${themeCssVariables.border.color.medium}`
      : 'none'};
  border-right: ${({ tableStyle }) =>
    tableStyle === 'GRID' || tableStyle === 'SHADED_HEADER'
      ? `1px solid ${themeCssVariables.border.color.medium}`
      : 'none'};
  border-top: ${({ tableStyle }) =>
    tableStyle === 'ACADEMIC'
      ? `2px solid ${themeCssVariables.border.color.strong}`
      : tableStyle === 'BORDERLESS'
        ? 'none'
        : `1px solid ${themeCssVariables.border.color.medium}`};
  color: ${themeCssVariables.font.color.primary};
  font-size: ${themeCssVariables.font.size.xs};
  min-width: 100%;

  th,
  td {
    border: ${({ tableStyle }) =>
      tableStyle === 'GRID' || tableStyle === 'SHADED_HEADER'
        ? `1px solid ${themeCssVariables.border.color.medium}`
        : 'none'};
    padding: ${themeCssVariables.spacing[2]};
    text-align: ${({ tableStyle }) =>
      tableStyle === 'GRID' ? 'left' : 'center'};
    vertical-align: middle;
  }

  th {
    background: ${({ tableStyle }) =>
      tableStyle === 'SHADED_HEADER'
        ? themeCssVariables.background.secondary
        : 'transparent'};
    border-bottom: ${({ tableStyle }) =>
      tableStyle === 'ACADEMIC'
        ? `1px solid ${themeCssVariables.border.color.light}`
        : 'none'};
    font-weight: ${themeCssVariables.font.weight.semiBold};
  }
`;

const StyledFallback = styled.pre`
  color: ${themeCssVariables.font.color.secondary};
  font-family: monospace;
  font-size: ${themeCssVariables.font.size.xs};
  margin: 0;
  overflow-x: auto;
  white-space: pre-wrap;
`;

export const ManuscriptTableView = ({
  markdown,
  tableStyle,
}: ManuscriptTableViewProps) => {
  const rows = parseMarkdownTable(markdown);
  const columnCount =
    rows.length === 0 ? 0 : Math.max(...rows.map((row) => row.length));

  if (rows.length === 0 || columnCount === 0) {
    return <StyledFallback>{markdown}</StyledFallback>;
  }

  const [header, ...body] = rows;

  return (
    <StyledScrollContainer>
      <StyledTable tableStyle={tableStyle}>
        <thead>
          <tr>
            {Array.from({ length: columnCount }, (_, columnIndex) => (
              <th key={`header-${columnIndex}`} scope="col">
                {header[columnIndex] ?? ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {Array.from({ length: columnCount }, (_, columnIndex) => (
                <td key={`cell-${rowIndex}-${columnIndex}`}>
                  {row[columnIndex] ?? ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </StyledTable>
    </StyledScrollContainer>
  );
};
