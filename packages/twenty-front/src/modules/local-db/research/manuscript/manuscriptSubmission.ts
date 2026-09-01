import { isNonEmptyString } from '@sniptt/guards';
import { isDefined } from 'twenty-shared/utils';

import { countWords, type ManuscriptBundle } from './manuscriptAssembly';
import { isImageDataUrl } from './manuscriptImages';
import { resolveSubmissionRequirementItems } from './manuscriptSubmissionRequirements';

export type SubmissionMaterials = {
  coverLetter?: string | null;
  highlights?: string | null;
  competingInterests?: string | null;
  suggestedReviewers?: string | null;
  submissionExtras?: string | null;
  // The response-to-reviewers document as Markdown, built from the review
  // round the author has been answering. Absent until a round has answers.
  responseToReviewers?: string | null;
};

export type SubmissionCheckSeverity = 'ERROR' | 'WARNING' | 'READY';

export type SubmissionCheckTarget =
  | 'write'
  | 'titlePage'
  | 'figures'
  | 'references'
  | 'submission'
  | 'export';

export type SubmissionCheck = {
  id: string;
  label: string;
  detail: string;
  severity: SubmissionCheckSeverity;
  target?: SubmissionCheckTarget;
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

const bundleWarningCheck = (
  warning: string,
  index: number,
): SubmissionCheck => {
  const isCitation = warning.startsWith('Citation [@');
  const isUnknownCrossReference = warning.includes(
    'references unknown asset [#',
  );
  const isUnknownPlacement = warning.includes(
    'has an unknown asset placement [[asset:',
  );
  const isMissingEquation = warning.includes('has no equation body yet');
  const isMissingImage = warning.includes('has no image yet');
  const isDuplicatePlacement = warning.includes(
    'has more than one placement marker',
  );
  const isHardError =
    isCitation ||
    isUnknownCrossReference ||
    isUnknownPlacement ||
    isMissingEquation ||
    isMissingImage;
  const target: SubmissionCheckTarget = isCitation
    ? 'references'
    : isUnknownCrossReference || isUnknownPlacement
      ? 'write'
      : isMissingEquation || isMissingImage || isDuplicatePlacement
        ? 'figures'
        : 'export';

  return {
    id: `bundle-warning-${index}`,
    label: isCitation
      ? 'Unresolved citation'
      : isUnknownCrossReference
        ? 'Broken cross-reference'
        : isUnknownPlacement
          ? 'Broken asset placement'
          : isMissingEquation
            ? 'Empty equation'
            : isMissingImage
              ? 'Missing figure image'
              : isDuplicatePlacement
                ? 'Duplicate asset placement'
                : 'Formatting issue',
    detail: warning,
    severity: isHardError ? 'ERROR' : 'WARNING',
    target,
  };
};

export const validateSubmission = (
  bundle: ManuscriptBundle,
  materials: SubmissionMaterials,
  extraChecks: SubmissionCheck[] = [],
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
    target: 'titlePage',
  });
  checks.push({
    id: 'authors',
    label: 'Authors',
    detail: isNonEmptyString(bundle.metadata.authors)
      ? bundle.metadata.authors
      : 'Add the ordered author line in Submission details',
    severity: isNonEmptyString(bundle.metadata.authors) ? 'READY' : 'ERROR',
    target: 'titlePage',
  });
  checks.push({
    ...checkRange({
      id: 'abstract',
      label: 'Abstract',
      value: abstractWords,
      minimum: style.abstractWordMinimum ?? 1,
      maximum: style.abstractWordLimit,
      unit: 'words',
    }),
    target: 'titlePage',
  });
  checks.push({
    ...checkRange({
      id: 'keywords',
      label: 'Keywords',
      value: bundle.metadata.keywords.length,
      minimum: style.keywordMinimum,
      maximum: style.keywordMaximum,
      unit: 'keywords',
    }),
    target: 'titlePage',
  });
  checks.push({
    id: 'references',
    label: 'Linked references',
    detail:
      bundle.stats.referenceCount > 0
        ? `${bundle.stats.referenceCount} reference records`
        : 'No structured references are connected',
    severity: bundle.stats.referenceCount > 0 ? 'READY' : 'WARNING',
    target: 'references',
  });

  checks.push(
    ...bundle.warnings.map((warning, index) =>
      bundleWarningCheck(warning, index),
    ),
  );

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
      target: 'write',
    });
  }

  // What the package actually ships: uploaded data-URL images only — tables,
  // equations and caption-only placeholders never become figure files.
  const packagedImageCount = bundle.numberedFigures.filter(
    (figure) => figure.assetKind !== 'TABLE' && isImageDataUrl(figure.imageUrl),
  ).length;

  for (const artifact of style.requiredArtifacts ?? []) {
    if (artifact === 'SEPARATE_FIGURES') {
      checks.push({
        id: `artifact-${artifact}`,
        label: artifactLabel(artifact),
        detail:
          packagedImageCount > 0
            ? `${packagedImageCount} image file(s) will be included in the package`
            : 'No uploaded figure images are connected',
        severity: packagedImageCount > 0 ? 'READY' : 'WARNING',
        target: 'figures',
      });
      continue;
    }
    const material = materialByArtifact(materials, artifact);
    checks.push({
      id: `artifact-${artifact}`,
      label: artifactLabel(artifact),
      detail: isNonEmptyString(material) ? 'Ready' : 'Required by this profile',
      severity: isNonEmptyString(material) ? 'READY' : 'ERROR',
      target: 'submission',
    });
  }

  if ((style.submissionRequirements ?? '').trim().length > 0) {
    const journalName =
      style.name?.trim() || bundle.metadata.journal || 'journal';
    const requirementItems = resolveSubmissionRequirementItems(
      {
        id: style.id?.trim() || style.profileKey?.trim() || journalName,
        profileKey: style.profileKey,
        submissionRequirements: style.submissionRequirements,
      },
      materials,
    );
    // Artifact keys already carry their own ERROR check when the profile
    // lists them as requiredArtifacts — reporting a second WARNING for the
    // same missing material reads as two different problems.
    const artifactCheckedKeys = new Set(style.requiredArtifacts ?? []);
    for (const item of requirementItems) {
      if (!item.required || item.filled) continue;
      if (artifactCheckedKeys.has(item.definition.key)) continue;
      // Satisfied by the package contents rather than a free-text field.
      if (
        item.definition.key === 'SEPARATE_FIGURES' &&
        packagedImageCount > 0
      ) {
        continue;
      }
      checks.push({
        id: `journal-requirement-${item.definition.key}`,
        label: item.definition.label,
        detail: `Required by ${journalName}: ${item.definition.label}`,
        severity: 'WARNING',
        target: 'submission',
      });
    }
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
      target: 'submission',
    });
  }

  // Checks the caller had to compute for us, appended before the counts so a
  // supplied ERROR gates the export exactly like one raised here. They arrive
  // as an argument because this function is pure and synchronous and they are
  // neither: the retraction verdicts are session state from a Crossref scan,
  // and screening reads manuscript sections the bundle does not carry.
  checks.push(...extraChecks);

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
  submissionExtraFiles: string[] = [],
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
    ...(submissionExtraFiles.length > 0
      ? ['', 'Submission extras', ...submissionExtraFiles]
      : []),
    '',
    'Package contents are editable working files. Review every item in the journal submission portal before final submission.',
  ].join('\n');
