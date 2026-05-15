import { type DataSourceField } from './DataSourceField';

// Compact, build-time description of a Twenty object as far as the GraphQL
// surface and a DataSource backend need to know about it. Built from the
// runtime `ObjectMetadataItemsQuery` payload (or any equivalent source).
export type DataSourceObject = {
  id: string;
  nameSingular: string;
  namePlural: string;
  labelSingular: string;
  labelPlural: string;
  description?: string | null;
  icon?: string | null;
  isCustom: boolean;
  isActive: boolean;
  isSystem: boolean;
  isSearchable: boolean;
  labelIdentifierFieldName?: string | null;
  imageIdentifierFieldName?: string | null;
  // Array of criteria; each criterion is a list of field names that must all
  // match for two records to be considered duplicates. Twenty's backend uses
  // this to power `findDuplicates`.
  duplicateCriteria?: string[][] | null;
  fields: DataSourceField[];
};
