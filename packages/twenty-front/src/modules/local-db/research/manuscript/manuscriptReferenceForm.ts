import { isNonEmptyString } from '@sniptt/guards';

import { referenceToCslItem } from './manuscriptCiteproc';
import { type ReferenceLike } from './manuscriptTypes';

export type ReferenceFormValues = {
  authors: string;
  citationKey: string;
  containerTitle: string;
  cslJson: string;
  doi: string;
  issue: string;
  name: string;
  pages: string;
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
  | 'doi'
  | 'issue'
  | 'name'
  | 'pages'
  | 'url'
  | 'volume'
  | 'year'
>;

export const EMPTY_REFERENCE_FORM_VALUES: ReferenceFormValues = {
  authors: '',
  citationKey: '',
  containerTitle: '',
  cslJson: '',
  doi: '',
  issue: '',
  name: '',
  pages: '',
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
  return typeof parsed === 'object' &&
    parsed !== null &&
    !Array.isArray(parsed)
    ? parsed
    : null;
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
): ReferenceFormValues => ({
  authors: reference.authors ?? '',
  citationKey: reference.citationKey ?? '',
  containerTitle: reference.containerTitle ?? '',
  cslJson: reference.cslJson ?? '',
  doi: reference.doi ?? '',
  issue: reference.issue ?? '',
  name: reference.name ?? '',
  pages: reference.pages ?? '',
  url: reference.url ?? '',
  volume: reference.volume ?? '',
  year:
    reference.year === null || reference.year === undefined
      ? ''
      : String(reference.year),
});

const synchronizedCslJson = (
  values: ReferenceFormValues,
  reference?: ReferenceLike,
): string => {
  const advanced = parseCslObject(values.cslJson) ?? {};
  const advancedType = isNonEmptyString(advanced.type)
    ? advanced.type
    : undefined;
  const canonical = referenceToCslItem({
    ...reference,
    id: reference?.id ?? values.citationKey,
    authors: nullable(values.authors),
    citationKey: values.citationKey.trim(),
    containerTitle: nullable(values.containerTitle),
    cslJson: null,
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
    'issued',
    'page',
    'researcher:rawReference',
    'title',
    'type',
    'volume',
  ].forEach((key) => delete synchronized[key]);

  return JSON.stringify({
    ...synchronized,
    ...canonical,
    ...(advancedType === undefined ? {} : { type: advancedType }),
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
  doi: nullable(values.doi),
  issue: nullable(values.issue),
  name: nullable(values.name) ?? 'Untitled',
  pages: nullable(values.pages),
  url: nullable(values.url),
  volume: nullable(values.volume),
  year: values.year.trim().length > 0 ? Number(values.year) : null,
});
