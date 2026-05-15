import { parse } from 'graphql';

import { FieldMetadataType } from '../../types/FieldMetadataType';
import { RelationType } from '../../types/RelationType';
import { buildDataSourceBundle } from '../utils/buildDataSourceBundle';
import { generateSdl } from '../utils/generateSdl';

// Build a minimal Company + Person fixture in the shape `ObjectMetadataItemsQuery`
// produces. Tests are intentionally tiny — they validate the SDL is parseable
// and contains the expected templated operations.
const fixture = () => ({
  objects: {
    edges: [
      {
        node: {
          id: 'object-company',
          nameSingular: 'company',
          namePlural: 'companies',
          labelSingular: 'Company',
          labelPlural: 'Companies',
          description: 'Company',
          icon: 'IconBuilding',
          isCustom: false,
          isActive: true,
          isSystem: false,
          isSearchable: true,
          labelIdentifierFieldMetadataId: 'field-company-name',
          imageIdentifierFieldMetadataId: null,
          fieldsList: [
            {
              id: 'field-company-id',
              type: FieldMetadataType.UUID,
              name: 'id',
              label: 'Id',
              isActive: true,
              isSystem: true,
              isNullable: false,
              isUIReadOnly: true,
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-company-name',
              type: FieldMetadataType.TEXT,
              name: 'name',
              label: 'Name',
              isActive: true,
              isSystem: false,
              isNullable: false,
              isUIReadOnly: false,
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-company-employees',
              type: FieldMetadataType.NUMBER,
              name: 'employees',
              label: 'Employees',
              isActive: true,
              isSystem: false,
              isNullable: true,
              isUIReadOnly: false,
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-company-status',
              type: FieldMetadataType.SELECT,
              name: 'status',
              label: 'Status',
              isActive: true,
              isSystem: false,
              isNullable: true,
              isUIReadOnly: false,
              options: [
                { value: 'ACTIVE', label: 'Active' },
                { value: 'ARCHIVED', label: 'Archived' },
              ],
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-company-address',
              type: FieldMetadataType.ADDRESS,
              name: 'address',
              label: 'Address',
              isActive: true,
              isSystem: false,
              isNullable: true,
              isUIReadOnly: false,
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-company-account-owner',
              type: FieldMetadataType.RELATION,
              name: 'accountOwner',
              label: 'Account owner',
              isActive: true,
              isSystem: false,
              isNullable: true,
              isUIReadOnly: false,
              relation: {
                type: RelationType.MANY_TO_ONE,
                targetObjectMetadata: {
                  id: 'object-person',
                  nameSingular: 'person',
                  namePlural: 'people',
                },
                targetFieldMetadata: { name: 'accountOwnerForCompanies' },
              },
              morphRelations: null,
            },
          ],
        },
      },
      {
        node: {
          id: 'object-person',
          nameSingular: 'person',
          namePlural: 'people',
          labelSingular: 'Person',
          labelPlural: 'People',
          description: 'Person',
          icon: 'IconUser',
          isCustom: false,
          isActive: true,
          isSystem: false,
          isSearchable: true,
          labelIdentifierFieldMetadataId: null,
          imageIdentifierFieldMetadataId: null,
          fieldsList: [
            {
              id: 'field-person-id',
              type: FieldMetadataType.UUID,
              name: 'id',
              label: 'Id',
              isActive: true,
              isSystem: true,
              isNullable: false,
              isUIReadOnly: true,
              relation: null,
              morphRelations: null,
            },
            {
              id: 'field-person-name',
              type: FieldMetadataType.FULL_NAME,
              name: 'name',
              label: 'Name',
              isActive: true,
              isSystem: false,
              isNullable: true,
              isUIReadOnly: false,
              relation: null,
              morphRelations: null,
            },
          ],
        },
      },
    ],
  },
});

describe('generateSdl', () => {
  it('emits a parseable schema for the templated operations', () => {
    const bundle = buildDataSourceBundle(fixture() as any);
    const sdl = generateSdl(bundle);

    expect(() => parse(sdl)).not.toThrow();
  });

  it('emits Company / Person types, connections, filter/order/create/update inputs', () => {
    const bundle = buildDataSourceBundle(fixture() as any);
    const sdl = generateSdl(bundle);

    for (const declaration of [
      'type Company',
      'type CompanyEdge',
      'type CompanyConnection',
      'input CompanyFilterInput',
      'input CompanyOrderByInput',
      'input CompanyCreateInput',
      'input CompanyUpdateInput',
      'type Person',
      'type PersonConnection',
      'input PersonFilterInput',
    ]) {
      expect(sdl).toContain(declaration);
    }
  });

  it('renders MANY_TO_ONE relation as object reference + join column', () => {
    const bundle = buildDataSourceBundle(fixture() as any);
    const sdl = generateSdl(bundle);

    expect(sdl).toContain('accountOwner: Person');
    expect(sdl).toContain('accountOwnerId: UUID');
    // Join columns expose full UUID filters (eq/in/neq/is) — Twenty's real
    // backend treats them as plain UUIDs, not relation handles.
    expect(sdl).toMatch(/accountOwnerId: UUIDFilter/);
  });

  it('renders SELECT options as a named enum', () => {
    const bundle = buildDataSourceBundle(fixture() as any);
    const sdl = generateSdl(bundle);

    expect(sdl).toContain('enum CompanyStatusEnum');
    expect(sdl).toContain('ACTIVE');
    expect(sdl).toContain('ARCHIVED');
    expect(sdl).toContain('status: CompanyStatusEnum');
  });

  it('renders templated Query + Mutation entries', () => {
    const bundle = buildDataSourceBundle(fixture() as any);
    const sdl = generateSdl(bundle);

    for (const line of [
      'company(filter: CompanyFilterInput): Company',
      'companies(filter: CompanyFilterInput',
      'companyDuplicates(ids: [UUID!]!): CompanyConnection!',
      'createCompany(data: CompanyCreateInput!): Company!',
      'updateCompany(id: UUID!, data: CompanyUpdateInput!): Company!',
      'deleteCompany(id: UUID!): Company!',
      'destroyCompany(id: UUID!): IdResult!',
      'restoreCompanies(filter: CompanyFilterInput!): [IdResult!]!',
    ]) {
      expect(sdl).toContain(line);
    }
  });
});
