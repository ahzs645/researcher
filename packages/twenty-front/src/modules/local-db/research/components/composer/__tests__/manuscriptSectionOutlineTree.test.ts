import {
  buildManuscriptSectionOutlineTree,
  sectionAncestorIds,
} from '@/local-db/research/components/composer/manuscriptSectionOutlineTree';
import { type SectionLike } from '@/local-db/research/manuscript/manuscriptTypes';

const section = (id: string, level: number): SectionLike => ({
  id,
  name: id,
  level,
});

describe('buildManuscriptSectionOutlineTree', () => {
  it('nests subsections under the preceding lower-level section', () => {
    const tree = buildManuscriptSectionOutlineTree([
      section('methods', 1),
      section('sampling', 2),
      section('participants', 3),
      section('analysis', 2),
      section('results', 1),
    ]);

    expect(tree.map((node) => node.section.id)).toEqual(['methods', 'results']);
    expect(tree[0].children.map((node) => node.section.id)).toEqual([
      'sampling',
      'analysis',
    ]);
    expect(tree[0].children[0].children[0].section.id).toBe('participants');
    expect(sectionAncestorIds(tree, 'participants')).toEqual([
      'methods',
      'sampling',
    ]);
  });

  it('clamps a level jump to one level below the preceding ancestor', () => {
    const tree = buildManuscriptSectionOutlineTree([
      section('methods', 1),
      section('participants', 3),
      section('details', 3),
    ]);

    expect(tree[0].children[0].section.id).toBe('participants');
    expect(tree[0].children[0].children[0].section.id).toBe('details');
  });
});
