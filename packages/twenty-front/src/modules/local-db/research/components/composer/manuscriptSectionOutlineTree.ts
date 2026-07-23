import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

export type ManuscriptSectionOutlineNode = {
  section: SectionLike;
  children: ManuscriptSectionOutlineNode[];
};

const normalizedLevel = (level: number | null | undefined): number =>
  Math.min(3, Math.max(1, Math.round(level ?? 1)));

export const buildManuscriptSectionOutlineTree = (
  sections: SectionLike[],
): ManuscriptSectionOutlineNode[] => {
  const roots: ManuscriptSectionOutlineNode[] = [];
  const ancestors: ManuscriptSectionOutlineNode[] = [];

  for (const section of sections) {
    const requestedLevel = normalizedLevel(section.level);
    const effectiveLevel = Math.min(requestedLevel, ancestors.length + 1);
    const node = {
      section,
      children: [],
    } satisfies ManuscriptSectionOutlineNode;

    ancestors.length = Math.max(0, effectiveLevel - 1);
    const parent = ancestors[effectiveLevel - 2];
    if (parent === undefined) roots.push(node);
    else parent.children.push(node);
    ancestors[effectiveLevel - 1] = node;
  }

  return roots;
};

export const sectionAncestorIds = (
  nodes: ManuscriptSectionOutlineNode[],
  sectionId: string,
  ancestors: string[] = [],
): string[] | null => {
  for (const node of nodes) {
    if (node.section.id === sectionId) return ancestors;
    const found = sectionAncestorIds(node.children, sectionId, [
      ...ancestors,
      node.section.id,
    ]);
    if (found !== null) return found;
  }
  return null;
};
