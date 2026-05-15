import { type FieldMetadataType } from '../../types/FieldMetadataType';
import { type RelationType } from '../../types/RelationType';

export type DataSourceFieldRelation = {
  type: RelationType;
  targetObjectId: string;
  targetObjectNameSingular: string;
  targetObjectNamePlural: string;
  targetFieldName: string;
};

export type DataSourceFieldMorphRelation = DataSourceFieldRelation;

export type DataSourceFieldOption = {
  value: string;
  label: string;
  position?: number;
  color?: string;
};

// Compact field shape used by the SDL generator and DataSource adapters.
// Captures only what's needed to:
// - emit GraphQL output / input / filter / order-by types
// - drive resolver field selection (sorted alphabetically, like Twenty does)
// - implement filter and sort translation in each DataSource
export type DataSourceField = {
  id: string;
  name: string;
  label: string;
  description?: string | null;
  type: FieldMetadataType;
  isActive: boolean;
  isSystem: boolean;
  isNullable: boolean;
  isUnique: boolean;
  isUIReadOnly: boolean;
  isCustom: boolean;
  defaultValue?: unknown;
  options?: DataSourceFieldOption[] | null;
  settings?: Record<string, unknown> | null;
  relation?: DataSourceFieldRelation | null;
  morphRelations?: DataSourceFieldMorphRelation[] | null;
};
