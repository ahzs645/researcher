import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { countWords, type ManuscriptBundle } from './manuscriptAssembly';

export type SubmissionMaterials = {
  coverLetter?: string | null;
  highlights?: string | null;
  competingInterests?: string | null;
  suggestedReviewers?: string | null;
};

export type SubmissionCheckSeverity = 'ERROR' | 'WARNING' | 'READY';

export type SubmissionCheck = {
  id: string;
  label: string;
  detail: string;
  severity: SubmissionCheckSeverity;
};

export type SubmissionReadiness = {
  checks: SubmissionCheck[];
  errorCount: number;
  warningCount: number;
  readyCount: number;
  ready: boolean;
};

const materialByArtifact = (
  materials: SubmissionMaterials,
  artifact: string,
): string | null | undefined => {
  switch (artifact) {
    case 'COVER_LETTER':
      return materials.coverLetter;
    case 'HIGHLIGHTS':
      return materials.highlights;
    case 'COMPETING_INTERESTS':
      return materials.competingInterests;
    case 'SUGGESTED_REVIEWERS':
      return materials.suggestedReviewers;
    default:
      return undefined;
  }
};

const artifactLabel = (artifact: string): string => {
  switch (artifact) {
    case 'COVER_LETTER':
      return 'Cover letter';
    case 'HIGHLIGHTS':
      return 'Highlights';
    case 'COMPETING_INTERESTS':
      return 'Competing-interests declaration';
    case 'SUGGESTED_REVIEWERS':
      return 'Suggested reviewers';
    case 'SEPARATE_FIGURES':
      return 'Separate figure files';
    default:
      return artifact;
  }
};

const checkRange = ({
  id,
  label,
  value,
  minimum,
  maximum,
  unit,
}: {
  id: string;
  label: string;
  value: number;
  minimum?: number | null;
  maximum?: number | null;
  unit: string;
}): SubmissionCheck => {
  if (isDefined(minimum) && minimum > 0 && value < minimum) {
    return {
      id,
      label,
      detail: `${value} ${unit}; minimum ${minimum}`,
      severity: 'ERROR',
    };
  }
  if (isDefined(maximum) && maximum > 0 && value > maximum) {
    return {
      id,
      label,
      detail: `${value} ${unit}; maximum ${maximum}`,
      severity: 'ERROR',
    };
  }
  const expected = [
    isDefined(minimum) && minimum > 0 ? `min ${minimum}` : '',
    isDefined(maximum) && maximum > 0 ? `max ${maximum}` : '',
  ]
    .filter((part) => part.length > 0)
    .join(', ');
  return {
    id,
    label,
    detail: `${value} ${unit}${expected.length > 0 ? ` · ${expected}` : ''}`,
    severity: 'READY',
  };
};

const headingNames = (bundle: ManuscriptBundle): Set<string> =>
  new Set(
    bundle.nodes
      .filter((node) => node.kind === 'heading')
      .map((node) => node.text.toLowerCase()),
  );

export const validateSubmission = (
  bundle: ManuscriptBundle,
  materials: SubmissionMaterials,
): SubmissionReadiness => {
  const checks: SubmissionCheck[] = [];
  const abstractWords = countWords(bundle.metadata.abstract);
  const style = bundle.style;
  const hasTitle =
    isNonEmptyString(bundle.metadata.title) &&
    !/^untitled manuscript$/i.test(bundle.metadata.title.trim());

  checks.push({
    id: 'title',
    label: 'Title',
    detail: hasTitle ? bundle.metadata.title : 'Add a manuscript title',
    severity: hasTitle ? 'READY' : 'ERROR',
  });
  checks.push({
    id: 'authors',
    label: 'Authors',
    detail: isNonEmptyString(bundle.metadata.authors)
      ? bundle.metadata.authors
      : 'Add the ordered author line in Submission details',
    severity: isNonEmptyString(bundle.metadata.authors) ? 'READY' : 'ERROR',
  });
  checks.push(
    checkRange({
      id: 'abstract',
      label: 'Abstract',
      value: abstractWords,
      minimum: style.abstractWordMinimum ?? 1,
      maximum: style.abstractWordLimit,
      unit: 'words',
    }),
  );
  checks.push(
    checkRange({
      id: 'keywords',
      label: 'Keywords',
      value: bundle.metadata.keywords.length,
      minimum: style.keywordMinimum,
      maximum: style.keywordMaximum,
      unit: 'keywords',
    }),
  );
  checks.push({
    id: 'references',
    label: 'Linked references',
    detail:
      bundle.stats.referenceCount > 0
        ? `${bundle.stats.referenceCount} reference records`
        : 'No structured references are connected',
    severity: bundle.stats.referenceCount > 0 ? 'READY' : 'WARNING',
  });

  const headings = headingNames(bundle);
  for (const declaration of [
    { id: 'funding', patterns: ['funding'] },
    {
      id: 'competing-section',
      patterns: ['competing interests', 'conflicts of interest'],
    },
    {
      id: 'data-availability',
      patterns: ['data availability', 'availability of data'],
    },
  ]) {
    const present = declaration.patterns.some((pattern) =>
      [...headings].some((heading) => heading.includes(pattern)),
    );
    checks.push({
      id: declaration.id,
      label: declaration.patterns[0]
        .split(' ')
        .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
        .join(' '),
      detail: present ? 'Section included' : 'Add this declaration section',
      severity: present ? 'READY' : 'WARNING',
    });
  }

  for (const artifact of style.requiredArtifacts ?? []) {
    if (artifact === 'SEPARATE_FIGURES') {
      checks.push({
        id: `artifact-${artifact}`,
        label: artifactLabel(artifact),
        detail:
          bundle.stats.figureCount > 0
            ? `${bundle.stats.figureCount} assets will be included in the package`
            : 'No main-text figures are connected',
        severity: bundle.stats.figureCount > 0 ? 'READY' : 'WARNING',
      });
      continue;
    }
    const material = materialByArtifact(materials, artifact);
    checks.push({
      id: `artifact-${artifact}`,
      label: artifactLabel(artifact),
      detail: isNonEmptyString(material) ? 'Ready' : 'Required by this profile',
      severity: isNonEmptyString(material) ? 'READY' : 'ERROR',
    });
  }

  if (style.profileKey === 'elsevier-atmospheric-environment') {
    const highlights = (materials.highlights ?? '')
      .split('\n')
      .map((highlight) => highlight.replace(/^[-•]\s*/, '').trim())
      .filter((highlight) => highlight.length > 0);
    const lengthValid = highlights.every((highlight) => highlight.length <= 85);
    const countValid = highlights.length >= 3 && highlights.length <= 5;
    checks.push({
      id: 'atmenv-highlights-format',
      label: 'Highlight format',
      detail: `${highlights.length} lines · ${lengthValid ? 'all ≤85 characters' : 'one or more exceed 85 characters'}`,
      severity: countValid && lengthValid ? 'READY' : 'ERROR',
    });
  }

  const errorCount = checks.filter(
    (check) => check.severity === 'ERROR',
  ).length;
  const warningCount = checks.filter(
    (check) => check.severity === 'WARNING',
  ).length;
  const readyCount = checks.filter(
    (check) => check.severity === 'READY',
  ).length;

  return {
    checks,
    errorCount,
    warningCount,
    readyCount,
    ready: errorCount === 0,
  };
};

export const buildSubmissionManifest = (
  bundle: ManuscriptBundle,
  readiness: SubmissionReadiness,
): string =>
  [
    bundle.metadata.title,
    `Target format: ${bundle.metadata.journal || 'Unspecified'}`,
    `Generated: ${new Date().toISOString()}`,
    '',
    'Readiness checks',
    ...readiness.checks.map(
      (check) => `[${check.severity}] ${check.label}: ${check.detail}`,
    ),
    '',
    'Package contents are editable working files. Review every item in the journal submission portal before final submission.',
  ].join('\n');
