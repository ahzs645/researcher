// The MyST template registry, vendored.
//
// The app has no backend and must work offline, so the descriptors ship with
// it rather than being fetched. This is a slim copy — only the fields the
// mapper reads (`parts`, `doc`, `options`), not the jtex packages and file
// lists, which are three times the size and are the renderer's business.
//
// Refresh with `scripts/fetch-myst-templates.mjs`, which reads
// https://api.mystmd.org/templates and rewrites registry.json. It reports the
// counts it wrote, which is how the numbers quoted anywhere else stay honest.

import registry from './myst-templates/registry.json';

import {
  journalProfileFromMystTemplate,
  mystJournalNames,
  type MystTemplateDescriptor,
} from './manuscriptMystTemplate';
import { type PortableJournalProfile } from './manuscriptJournalProfile';

export const MYST_TEMPLATES = registry as MystTemplateDescriptor[];

export type MystTemplateSummary = {
  id: string;
  title: string;
  description: string;
  // The journals this one template covers. Empty when it is a single journal
  // or a generic preprint layout.
  journals: string[];
};

export const mystTemplateSummaries = (): MystTemplateSummary[] =>
  MYST_TEMPLATES.map((descriptor) => ({
    id: descriptor.id,
    title: descriptor.title ?? descriptor.id,
    description: descriptor.description ?? '',
    journals: mystJournalNames(descriptor),
  }));

export const findMystTemplate = (
  id: string,
): MystTemplateDescriptor | undefined =>
  MYST_TEMPLATES.find((descriptor) => descriptor.id === id);

export const mystTemplateProfile = (
  id: string,
  journal?: string,
): PortableJournalProfile => {
  const descriptor = findMystTemplate(id);
  if (descriptor === undefined) {
    throw new Error(`No MyST template with the id ${id}`);
  }
  return journalProfileFromMystTemplate(descriptor, journal);
};
