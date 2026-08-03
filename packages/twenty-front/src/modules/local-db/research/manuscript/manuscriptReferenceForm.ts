import { isNonEmptyString } from '@sniptt/guards';

import { referenceToCslItem } from './manuscriptCiteproc';
import { cslItemToReferenceDraft } from './manuscriptReferenceImport';
import { type ReferenceLike } from './manuscriptTypes';

export type ReferenceFormValues = {
  accessed: string;
  authors: string;
  citationKey: string;
  containerTitle: string;
  cslJson: string;
  cslType: string;
  doi: string;
  edition: string;
  isbn: string;
  issue: string;
  name: string;
  notes: string;
  pages: string;
  publisher: string;
  publisherPlace: string;
  url: string;
  volume: string;
  year: string;
};

export type ReferenceRecordUpdate = Pick<
  ReferenceLike,
  | 'authors'
  | 'citationKey'
  | 'containerTitle'
  | 'cslJson'
  | 'cslType'
  | 'doi'
  | 'issue'
  | 'name'
  | 'notes'
  | 'pages'
  | 'url'
  | 'volume'
  | 'year'
>;

export const EMPTY_REFERENCE_FORM_VALUES: ReferenceFormValues = {
  accessed: '',
  authors: '',
  citationKey: '',
  containerTitle: '',
  cslJson: '',
  cslType: 'ARTICLE_JOURNAL',
  doi: '',
  edition: '',
  isbn: '',
  issue: '',
  name: '',
  notes: '',
  pages: '',
  publisher: '',
  publisherPlace: '',
  url: '',
  volume: '',
  year: '',
};

const nullable = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseCslObject = (text: string): Record<string, unknown> | null => {
  if (text.trim().length === 0) return {};
  const parsed = JSON.parse(text) as unknown;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : null;
};

const parsedCslObject = (text?: string | null): Record<string, unknown> => {
  try {
    return parseCslObject(text ?? '') ?? {};
  } catch {
    return {};
  }
};

const cslString = (value: unknown): string =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : '';

const cslDateInput = (value: unknown): string => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return '';
  }
  const dateParts = (value as Record<string, unknown>)['date-parts'];
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return '';
  return dateParts[0]
    .slice(0, 3)
    .filter((part): part is number => typeof part === 'number')
    .map((part, index) =>
      index === 0 ? String(part) : String(part).padStart(2, '0'),
    )
    .join('-');
};

const cslDateParts = (value: string): number[] | undefined => {
  if (value.trim().length === 0) return undefined;
  const parts = value.trim().split('-').map(Number);
  return parts.length > 0 && parts.every(Number.isFinite) ? parts : undefined;
};

export const validateReferenceCslJson = (text: string): string | null => {
  try {
    return parseCslObject(text) === null
      ? 'CSL-JSON must be a single JSON object.'
      : null;
  } catch {
    return 'CSL-JSON is not valid JSON.';
  }
};

export const referenceToFormValues = (
  reference: ReferenceLike,
): ReferenceFormValues => {
  const csl = parsedCslObject(reference.cslJson);
  const draft = cslItemToReferenceDraft(csl);
  return {
    accessed: cslDateInput(csl.accessed),
    authors: reference.authors ?? '',
    citationKey: reference.citationKey ?? '',
    containerTitle: reference.containerTitle ?? '',
    cslJson: reference.cslJson ?? '',
    cslType: reference.cslType ?? draft.cslType ?? 'OTHER',
    doi: reference.doi ?? '',
    edition: cslString(csl.edition),
    isbn: cslString(csl.ISBN),
    issue: reference.issue ?? '',
    name: reference.name ?? '',
    notes: reference.notes ?? '',
    pages: reference.pages ?? '',
    publisher: cslString(csl.publisher),
    publisherPlace: cslString(csl['publisher-place']),
    url: reference.url ?? '',
    volume: reference.volume ?? '',
    year:
      reference.year === null || reference.year === undefined
        ? ''
        : String(reference.year),
  };
};

export const referenceFormValuesWithEditedCsl = (
  values: ReferenceFormValues,
  initialCslJson: string,
  preserveCitationKey = false,
): ReferenceFormValues => {
  if (values.cslJson.trim() === initialCslJson.trim()) return values;
  if (values.cslJson.trim().length === 0) return values;
  const item = parseCslObject(values.cslJson);
  if (item === null) return values;
  const draft = cslItemToReferenceDraft(item);
  return {
    ...values,
    accessed: cslDateInput(item.accessed),
    authors: draft.authors ?? '',
    citationKey:
      preserveCitationKey || !isNonEmptyString(draft.citationKey)
        ? values.citationKey
        : draft.citationKey,
    containerTitle: draft.containerTitle ?? '',
    cslType: draft.cslType ?? 'OTHER',
    doi: draft.doi ?? '',
    edition: cslString(item.edition),
    isbn: cslString(item.ISBN),
    issue: draft.issue ?? '',
    name: draft.name ?? '',
    pages: draft.pages ?? '',
    publisher: cslString(item.publisher),
    publisherPlace: cslString(item['publisher-place']),
    url: draft.url ?? '',
    volume: draft.volume ?? '',
    year:
      draft.year === null || draft.year === undefined ? '' : String(draft.year),
  };
};

const synchronizedCslJson = (
  values: ReferenceFormValues,
  reference?: ReferenceLike,
): string => {
  const advanced = parseCslObject(values.cslJson) ?? {};
  const canonical = referenceToCslItem({
    ...reference,
    id: reference?.id ?? values.citationKey,
    authors: nullable(values.authors),
    citationKey: values.citationKey.trim(),
    containerTitle: nullable(values.containerTitle),
    cslJson: null,
    cslType: values.cslType,
    doi: nullable(values.doi),
    issue: nullable(values.issue),
    name: nullable(values.name),
    pages: nullable(values.pages),
    url: nullable(values.url),
    volume: nullable(values.volume),
    year: values.year.trim().length > 0 ? Number(values.year) : null,
  });
  const synchronized = { ...advanced };
  [
    'DOI',
    'URL',
    'author',
    'container-title',
    'id',
    'issue',
    'accessed',
    'edition',
    'ISBN',
    'issued',
    'page',
    'publisher',
    'publisher-place',
    'researcher:rawReference',
    'title',
    'type',
    'volume',
  ].forEach((key) => delete synchronized[key]);

  return JSON.stringify({
    ...synchronized,
    ...canonical,
    ...(cslDateParts(values.accessed) === undefined
      ? {}
      : { accessed: { 'date-parts': [cslDateParts(values.accessed)] } }),
    ...(nullable(values.edition) === null
      ? {}
      : { edition: nullable(values.edition) }),
    ...(nullable(values.isbn) === null ? {} : { ISBN: nullable(values.isbn) }),
    ...(nullable(values.publisher) === null
      ? {}
      : { publisher: nullable(values.publisher) }),
    ...(nullable(values.publisherPlace) === null
      ? {}
      : { 'publisher-place': nullable(values.publisherPlace) }),
  });
};

export const referenceFormValuesToRecordUpdate = (
  values: ReferenceFormValues,
  reference?: ReferenceLike,
): ReferenceRecordUpdate => ({
  authors: nullable(values.authors),
  citationKey: values.citationKey.trim(),
  containerTitle: nullable(values.containerTitle),
  cslJson: synchronizedCslJson(values, reference),
  cslType: values.cslType,
  doi: nullable(values.doi),
  issue: nullable(values.issue),
  name: nullable(values.name) ?? 'Untitled',
  notes: nullable(values.notes),
  pages: nullable(values.pages),
  url: nullable(values.url),
  volume: nullable(values.volume),
  year: values.year.trim().length > 0 ? Number(values.year) : null,
});
