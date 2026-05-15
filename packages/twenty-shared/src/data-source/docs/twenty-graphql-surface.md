# Twenty GraphQL Surface (record operations)

Audit of every operation Twenty's frontend builds dynamically against a per-object
GraphQL surface. Used as the contract for the `DataSource` interface and the
metadata-driven executable schema. Validated against `Company` but the pattern is
identical for all 33 standard objects (and any custom object).

In all examples below, replace `Company` / `company` / `companies` with the target
object's `nameSingular` (capitalized) / `nameSingular` / `namePlural`.

## Query endpoints

| Apollo client | Endpoint                                  | Operations                     |
|---------------|-------------------------------------------|--------------------------------|
| `ApolloProvider` (`apolloClient`)       | `${REACT_APP_SERVER_BASE_URL}/metadata` | Workspace metadata (objects, fields, views, navigation, command menu items, system queries like `IntrospectionQuery`, `GetCurrentUser`) |
| `ApolloCoreProvider` (`apolloCoreClient`) | `${REACT_APP_SERVER_BASE_URL}/graphql`  | All per-object record operations below, plus `search`, billing, workflow, settings |

## Per-object operations (templated)

For an object with `nameSingular = "company"` and `namePlural = "companies"`,
the frontend builds:

### Queries

| Operation name | Resolver field | Variables | Response |
|----------------|----------------|-----------|----------|
| `FindManyCompanies` | `companies` | `filter: CompanyFilterInput, orderBy: [CompanyOrderByInput], lastCursor: String, limit: Int, offset: Int` (uses `first/after` for forward, `last/before` for backward) | `CompanyConnection { edges: [{ node: Company, cursor }], pageInfo: { hasNextPage, hasPreviousPage, startCursor, endCursor }, totalCount }` |
| `FindOneCompany` | `company` | `objectRecordId: UUID!` (passed inline as `filter: { id: { eq: $objectRecordId } }`; with `withSoftDeleted=true` also accepts deleted records via `or: [{ deletedAt: { is: NULL } }, { deletedAt: { is: NOT_NULL } }]`) | `Company` |
| `AggregateCompanies` | `companies` | `filter: CompanyFilterInput` | Object with the aggregate fields selected — see "Aggregate fields" |
| `FindDuplicateCompany` | `companyDuplicates` | `ids: [UUID!]!` | `CompanyConnection { edges, pageInfo }` |
| `GroupByCompanies` | `companiesGroupBy` | `groupBy: [CompanyGroupByInput!]!, filter, orderBy: [CompanyOrderByWithGroupByInput!], orderByForRecords: [CompanyOrderByInput], viewId: UUID` | `CompanyGroupByConnection { edges, pageInfo, totalCount, groupByDimensionValues }` |
| `GroupByAggregateCompanies` | `companiesGroupByAggregate` (named in `getGroupByAggregateQueryName`) | `groupBy, filter, orderBy, viewId, limit` | `{ groupByDimensionValues, ...aggregateFields }` |

### Mutations

| Operation name | Resolver field | Variables | Response |
|----------------|----------------|-----------|----------|
| `CreateOneCompany` | `createCompany` | `input: CompanyCreateInput!` (renamed `data: $input` in the mutation) | `Company` |
| `UpdateOneCompany` | `updateCompany` | `idToUpdate: UUID!, input: CompanyUpdateInput!` (renamed `id, data` in the mutation) | `Company` |
| `DeleteOneCompany` | `deleteCompany` | `idToDelete: UUID!` | `Company` with `deletedAt` set + the soft-delete metadata fields |
| `DestroyOneCompany` | `destroyCompany` | `idToDestroy: UUID!` | `{ id }` |
| `RestoreManyCompanies` | `restoreCompanies` | `filter: CompanyFilterInput!` | `[{ id }]` |

Many-record variants (`CreateMany`, `UpdateMany`, `DeleteMany`, `DestroyMany`)
follow the same pattern with `[CompanyCreateInput!]!` / filter inputs.

### Subscription

Cross-cutting (single subscription channel for the whole workspace):

```graphql
subscription OnEventSubscription($eventStreamId: String!) {
  onEventSubscription(eventStreamId: $eventStreamId) {
    eventStreamId
    objectRecordEventsWithQueryIds {
      objectRecordEvent {
        action            # CREATED, UPDATED, DELETED, RESTORED, DESTROYED
        objectNameSingular
        recordId
        userId
        workspaceMemberId
        properties { updatedFields, before, after, diff }
      }
      queryIds
    }
    metadataEvents { type, metadataName, recordId, updatedCollectionHash, properties { ... } }
  }
}
```

## Shared (non-templated) record operations

| Operation | Resolver field | Variables | Notes |
|-----------|----------------|-----------|-------|
| `Search` | `search` | `searchInput: String!, limit: Int!, after: String, excludedObjectNameSingulars: [String!], includedObjectNameSingulars: [String!], filter: ObjectRecordFilterInput` | Returns `SearchRecordConnection { edges: [{ node: SearchRecordDTO, cursor }], pageInfo }` |

## Filter input shape

`CompanyFilterInput` (per object) and the shared `ObjectRecordFilterInput` are
the same recursive AND/OR/NOT structure of leaf filters per field type. The
canonical TypeScript shape is `RecordGqlOperationFilter` in
`twenty-shared/src/types/RecordGqlOperationFilter.ts`:

```ts
type RecordGqlOperationFilter =
  | { and: RecordGqlOperationFilter[] }
  | { or: RecordGqlOperationFilter[] | RecordGqlOperationFilter }
  | { not: RecordGqlOperationFilter }
  | { [fieldName: string]: LeafFilter };

// LeafFilter is one of, keyed by field type:
//   UUIDFilter:        { eq, in, neq, is: 'NULL'|'NOT_NULL' }
//   StringFilter:      { eq, in, neq, startsWith, like, ilike, regex, iregex, is }
//   FloatFilter:       { eq, gt, gte, in, lt, lte, neq, is }
//   DateFilter:        same as FloatFilter but values are ISO strings
//   DateTimeFilter:    same as DateFilter
//   BooleanFilter:     { eq, is }
//   SelectFilter:      { is, in, eq, neq }
//   MultiSelectFilter: { is, isEmptyArray, containsAny }
//   ArrayFilter:       { is, isEmptyArray, containsIlike }
//   RawJsonFilter:     { like, is }
//   FilesFilter:       { like, is }
//   RichTextFilter:    { blocknote: { ilike }, markdown: { ilike } }
//   TSVectorFilter:    { search: string }
//   RelationFilter:    { is, in }   // for many-to-one relation join columns
//   CurrencyFilter:    { amountMicros: FloatFilter, currencyCode: SelectFilter }
//   URLFilter, FullNameFilter, AddressFilter, LinksFilter, ActorFilter,
//   EmailsFilter, PhonesFilter:  records of StringFilter / sub-filters
```

Operators map from `ViewFilterOperand` (see `twenty-shared/src/types/ViewFilterOperand.ts`):

```
IS, IS_NOT, IS_NOT_NULL, IS_EMPTY, IS_NOT_EMPTY,
LESS_THAN_OR_EQUAL, GREATER_THAN_OR_EQUAL,
IS_BEFORE, IS_AFTER, IS_RELATIVE, IS_IN_PAST, IS_IN_FUTURE, IS_TODAY,
CONTAINS, DOES_NOT_CONTAIN, VECTOR_SEARCH
```

## OrderBy input shape

`Array<{ [fieldName: string]: OrderBy | { [subField: string]: OrderBy } }>` where
`OrderBy = 'AscNullsLast' | 'DescNullsLast' | 'AscNullsFirst' | 'DescNullsFirst'`.

For composite fields (e.g. `address`) the value is a record of sub-field → OrderBy.
For relations, the value is `{ relationName: { subField: OrderBy } }`.

## Pagination

Relay-style cursors plus optional offset:

- Forward: `first: $limit, after: $lastCursor`
- Backward: `last: $limit, before: $lastCursor`
- Offset is additive: `offset: $offset` shifts the page window.
- `pageInfo` always returns `hasNextPage, hasPreviousPage, startCursor, endCursor`.
- `totalCount` is on the connection itself (Twenty does not gate it like Relay does).

## Response field selection

`mapObjectMetadataToGraphQLQuery` walks the object's `readableFields`, sorts
fields alphabetically, and emits a selection set wrapped in `{ __typename, ... }`.

- Scalar fields → emitted by name.
- Many-to-one relations → emitted as their join-column id (computed by
  `computeRelationGqlFieldJoinColumnName`) AND as the nested relation selection.
- Morph relations → expanded per target object (`computeMorphRelationGqlFieldName`).
- Optional `recordGqlFields` tree narrows the selection (used to keep payloads small).
- `computeReferences: true` (used in optimistic responses) replaces nested
  relations with `{ __ref }` placeholders that Apollo's cache normalization
  expands.

## Aggregate field naming

`AggregateCompanies` selection emits one or more of:

| Operation | Field name template |
|-----------|---------------------|
| `COUNT` | `totalCount` (always available) |
| `COUNT_UNIQUE_VALUES` | `countUniqueValues<FieldName>` |
| `COUNT_EMPTY` | `countEmpty<FieldName>` |
| `COUNT_NOT_EMPTY` | `countNotEmpty<FieldName>` |
| `PERCENTAGE_EMPTY` | `percentageEmpty<FieldName>` |
| `PERCENTAGE_NOT_EMPTY` | `percentageNotEmpty<FieldName>` |
| `MIN/MAX/AVG/SUM` (number) | `min<FieldName>` etc. |
| `MIN/MAX/AVG/SUM` (currency) | `min<FieldName>AmountMicros` etc. |
| `COUNT_TRUE/COUNT_FALSE` (boolean) | `countTrue<FieldName>` / `countFalse<FieldName>` |
| `EARLIEST/LATEST` (date kinds) | `min<FieldName>` / `max<FieldName>` |
| Relation field `COUNT` | `totalCount` (on the relation join) |

## Cross-cutting / non-record operations not in scope here

These also hit `/graphql` but are not templated per object — they need bespoke
resolvers in the executable schema (or static handlers):

- `Search` (above)
- Workflow operations (`FindManyWorkflows`, `FindOneWorkflow`, `FindOneWorkflowRun`, etc.)
- Settings / billing (`GetRoles`, `ListPlans`, `GetResourceCreditUsage`, …)
- API keys & webhooks (metadata endpoint)
- Public workspace data, current user, captcha, telemetry

## Notes for implementing `DataSource`

A minimal `DataSource` only needs to satisfy the **templated** operations above.
Six methods + a handful of types cover ~200 GraphQL operations:

```ts
interface DataSource {
  findMany(objectName, { filter, orderBy, first?, last?, before?, after?, offset? })
  findOne(objectName, { filter })
  createOne(objectName, input)
  updateOne(objectName, id, input)
  deleteOne(objectName, id)        // soft delete
  destroyOne(objectName, id)       // hard delete
  restoreMany(objectName, { filter })
  aggregate(objectName, { filter, fields })   // fields = aggregate field names
  search({ searchInput, limit, after, includedObjectNameSingulars, excludedObjectNameSingulars, filter })
  findDuplicates(objectName, ids)             // optional; resolver falls back to []
  groupBy(objectName, ...)                    // optional in MVP
}
```

Everything above the `DataSource` line (SDL generation, filter translation,
cursor encoding, connection wrapping, `__typename` injection, field-selection
trimming) lives in the shared executable-schema layer. Adapters never touch it.
