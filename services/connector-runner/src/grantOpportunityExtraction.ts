import type { Page } from 'playwright';

const MAX_EXTRACTED_ROWS = 250;
const MAX_FIELD_LENGTH = 10_000;

export type GrantSourceExtractionProfile = {
  profileKind: string;
  itemSelector?: string;
  fieldMappings: Record<string, string>;
};

export type GrantOpportunityRow = {
  title: string;
  funder?: string;
  program?: string;
  opportunityUrl?: string;
  applicationDueDate?: string;
  registrationDueDate?: string;
  amountText?: string;
  eligibility?: string;
  description?: string;
};

export type GrantSourceSelectorItem = {
  linkText: string;
  href?: string;
  itemText?: string;
  highlightText?: string;
  contextHeadingText?: string;
  nearestRowText: string;
  pageHeadingText?: string;
  pageDescription?: string;
  pageUrl: string;
  tableValues?: Record<string, string>;
};

const nonEmpty = (value: string | undefined): string | undefined => {
  const trimmed = value?.replace(/\s+/g, ' ').trim();
  return trimmed ? trimmed.slice(0, MAX_FIELD_LENGTH) : undefined;
};

const textFollowingLabel = (
  text: string,
  label: string,
): string | undefined => {
  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  const normalizedLabel = label.toLowerCase();

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const labelIndex = line.toLowerCase().indexOf(normalizedLabel);
    if (labelIndex === -1) {
      continue;
    }

    const sameLineValue = nonEmpty(
      line.slice(labelIndex + label.length).replace(/^[:\s–—-]+/, ''),
    );
    if (sameLineValue) {
      return sameLineValue;
    }

    return nonEmpty(lines[index + 1]);
  }

  return undefined;
};

const resolveMapping = (
  mapping: string | undefined,
  item: GrantSourceSelectorItem,
): string | undefined => {
  if (!mapping) {
    return undefined;
  }
  if (mapping.startsWith('constant:')) {
    return nonEmpty(mapping.slice('constant:'.length));
  }
  if (mapping === 'linkText') {
    return nonEmpty(item.linkText);
  }
  if (mapping === 'href') {
    return nonEmpty(item.href);
  }
  if (mapping === 'itemText') {
    return nonEmpty(item.itemText);
  }
  if (mapping === 'highlightText') {
    return nonEmpty(item.highlightText);
  }
  if (mapping === 'contextHeadingText') {
    return nonEmpty(item.contextHeadingText);
  }
  if (mapping === 'linkTextPrefixBeforeColon') {
    return nonEmpty(item.linkText.split(':', 1)[0]);
  }
  if (mapping === 'nearestRowText' || mapping === 'contextText') {
    return nonEmpty(item.nearestRowText);
  }
  if (mapping === 'pageHeadingText') {
    return nonEmpty(item.pageHeadingText);
  }
  if (mapping === 'pageDescription') {
    return nonEmpty(item.pageDescription);
  }
  if (mapping === 'pageUrl') {
    return nonEmpty(item.pageUrl);
  }
  if (mapping.startsWith('followingText:')) {
    return textFollowingLabel(
      item.nearestRowText,
      mapping.slice('followingText:'.length),
    );
  }
  if (mapping.startsWith('tableCell:')) {
    return nonEmpty(item.tableValues?.[mapping.slice('tableCell:'.length)]);
  }

  return undefined;
};

export const mapGrantSourceSelectorItem = (
  item: GrantSourceSelectorItem,
  fieldMappings: Record<string, string>,
): GrantOpportunityRow | null => {
  const title = resolveMapping(fieldMappings.title, item);
  if (!title) {
    return null;
  }

  return {
    title,
    funder: resolveMapping(fieldMappings.funder, item),
    program: resolveMapping(fieldMappings.program, item),
    opportunityUrl: resolveMapping(fieldMappings.applicationUrl, item),
    applicationDueDate: resolveMapping(fieldMappings.applicationDeadline, item),
    registrationDueDate: resolveMapping(
      fieldMappings.registrationDeadline,
      item,
    ),
    amountText: resolveMapping(fieldMappings.amount, item),
    eligibility: resolveMapping(fieldMappings.eligibility, item),
    description: resolveMapping(fieldMappings.description, item),
  };
};

export const extractGrantOpportunityRows = async (
  page: Page,
  profile: GrantSourceExtractionProfile,
): Promise<GrantOpportunityRow[]> => {
  if (
    !['html_selectors', 'single_page'].includes(profile.profileKind) ||
    !profile.itemSelector
  ) {
    throw new Error(
      `Grant source profile "${profile.profileKind}" does not have an automated extractor yet.`,
    );
  }

  const locator = page.locator(profile.itemSelector);
  const count = Math.min(await locator.count(), MAX_EXTRACTED_ROWS);
  const rows: GrantOpportunityRow[] = [];
  const seen = new Set<string>();

  for (let index = 0; index < count; index += 1) {
    const item = await locator.nth(index).evaluate((element) => {
      const link =
        element instanceof HTMLAnchorElement
          ? element
          : element.querySelector('a');
      const nearestContainer =
        element.closest('tr, li, article, section, .card, div') ?? element;
      let contextHeadingText: string | undefined;
      let context: Element | null = element;
      const tableValues: Record<string, string> = {};
      const tableRow = element.closest('tr');
      const table = tableRow?.closest('table');

      if (table && tableRow) {
        const headers = [...table.querySelectorAll('thead th, thead td')].map(
          (header) => (header.textContent ?? '').replace(/\s+/g, ' ').trim(),
        );
        const cells = [
          ...tableRow.querySelectorAll(':scope > th, :scope > td'),
        ];
        for (
          let cellIndex = 0;
          cellIndex < Math.min(headers.length, cells.length);
          cellIndex += 1
        ) {
          if (headers[cellIndex]) {
            tableValues[headers[cellIndex]] =
              cells[cellIndex].textContent?.replace(/\s+/g, ' ').trim() ?? '';
          }
        }
      }

      for (let depth = 0; context && depth < 7; depth += 1) {
        const heading = context.matches('h1, h2, h3, h4, h5, h6')
          ? context
          : context.querySelector(
              ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
            );
        const headingText =
          heading?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
        if (headingText) {
          contextHeadingText = headingText;
          break;
        }
        context = context.parentElement;
      }

      return {
        linkText: link?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        href: link?.href,
        itemText: element.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        highlightText:
          element
            .querySelector('.highlight')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? '',
        contextHeadingText,
        nearestRowText:
          nearestContainer.textContent?.replace(/\s+/g, ' ').trim() ?? '',
        pageHeadingText:
          document
            .querySelector('h1')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() ?? '',
        pageDescription:
          document
            .querySelector('meta[name="description"]')
            ?.getAttribute('content') ?? undefined,
        pageUrl: window.location.href,
        tableValues,
      };
    });
    const row = mapGrantSourceSelectorItem(item, profile.fieldMappings);
    if (!row) {
      continue;
    }

    const dedupeKey = row.opportunityUrl ?? row.title;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    rows.push(row);
  }

  return rows;
};
