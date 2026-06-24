import { GraphQLScalarType, Kind, type ValueNode } from 'graphql';

// Permissive scalars: pass through string/number values that come over the
// wire as-is, and accept the matching literal AST forms when used inline.
// This is intentionally loose — Twenty's UI is the upstream type-checker.

const stringScalar = (name: string, description: string) =>
  new GraphQLScalarType<unknown, unknown>({
    name,
    description,
    serialize: (value) => value as unknown,
    parseValue: (value) => value,
    parseLiteral: (ast: ValueNode) => {
      if (ast.kind === Kind.STRING) return ast.value;
      if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) return ast.value;
      if (ast.kind === Kind.BOOLEAN) return ast.value;
      return null;
    },
  });

export const UUIDScalar = stringScalar('UUID', 'A v4 UUID string');
export const DateTimeScalar = stringScalar(
  'DateTime',
  'ISO 8601 date-time string',
);
export const DateScalar = stringScalar('Date', 'ISO 8601 date string');
export const BigIntScalar = stringScalar('BigInt', 'BigInt encoded as string');
export const PositionScalar = new GraphQLScalarType<unknown, unknown>({
  name: 'Position',
  description: 'Twenty record position number or placement sentinel',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast: ValueNode) => {
    if (ast.kind === Kind.INT || ast.kind === Kind.FLOAT) {
      return parseFloat(ast.value);
    }
    if (ast.kind === Kind.STRING) return ast.value;
    return null;
  },
});

export const JSONScalar = new GraphQLScalarType<unknown, unknown>({
  name: 'JSON',
  description: 'Arbitrary JSON value',
  serialize: (value) => value,
  parseValue: (value) => value,
  parseLiteral: (ast: ValueNode) => {
    const fromAst = (node: ValueNode): unknown => {
      switch (node.kind) {
        case Kind.STRING:
        case Kind.ENUM:
          return node.value;
        case Kind.INT:
          return parseInt(node.value, 10);
        case Kind.FLOAT:
          return parseFloat(node.value);
        case Kind.BOOLEAN:
          return node.value;
        case Kind.NULL:
          return null;
        case Kind.LIST:
          return node.values.map(fromAst);
        case Kind.OBJECT:
          return Object.fromEntries(
            node.fields.map((field) => [
              field.name.value,
              fromAst(field.value),
            ]),
          );
        default:
          return null;
      }
    };
    return fromAst(ast);
  },
});

export const customScalarResolvers = {
  UUID: UUIDScalar,
  DateTime: DateTimeScalar,
  Date: DateScalar,
  BigInt: BigIntScalar,
  Position: PositionScalar,
  JSON: JSONScalar,
};
