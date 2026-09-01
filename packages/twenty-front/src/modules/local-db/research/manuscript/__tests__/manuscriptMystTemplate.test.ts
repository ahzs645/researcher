import { parseJournalSectionSkeleton } from '@/local-db/research/manuscript/manuscriptScaffold';
import {
  journalProfileFromMystTemplate,
  mystJournalChoices,
  mystTemplateProfileKey,
  parseMystTemplateDescriptor,
} from '@/local-db/research/manuscript/manuscriptMystTemplate';
import {
  findMystTemplate,
  MYST_TEMPLATES,
  mystTemplateProfile,
  mystTemplateSummaries,
} from '@/local-db/research/manuscript/mystTemplateRegistry';
import { parseJournalSubmissionRequirements } from '@/local-db/research/manuscript/manuscriptSubmissionRequirements';

const requirementsOf = (profile: { submissionRequirements?: string | null }) =>
  parseJournalSubmissionRequirements(profile.submissionRequirements);

describe('the vendored MyST registry', () => {
  it('carries every template, and the journals they cover', () => {
    const summaries = mystTemplateSummaries();

    expect(summaries).toHaveLength(MYST_TEMPLATES.length);
    expect(summaries.length).toBeGreaterThanOrEqual(25);
    // The registry is 25 templates, not one per journal: the count people
    // quote is the journals those templates reach through their own choice
    // of venue.
    const journals = summaries.reduce(
      (count, template) => count + Math.max(template.journals.length, 1),
      0,
    );
    expect(journals).toBeGreaterThan(440);
  });

  it('every template maps to a profile with a usable key and name', () => {
    for (const descriptor of MYST_TEMPLATES) {
      const profile = journalProfileFromMystTemplate(descriptor);
      expect(profile.name.length).toBeGreaterThan(0);
      expect(profile.profileKey).toBe(`myst:${descriptor.id}`);
      // Whatever a template does or does not describe, the profile must not
      // claim a requirement list it cannot back with the journal's own words.
      for (const requirement of requirementsOf(profile)) {
        expect(requirement.key).toMatch(/^[A-Z0-9_]+$/);
        expect(typeof requirement.required).toBe('boolean');
      }
    }
  });

  it('never writes a section skeleton that would delete the paper', () => {
    // Most of these templates describe only the back matter. A skeleton of
    // "Acknowledgements, Competing interests" and nothing else would scaffold
    // a manuscript with no argument in it.
    for (const descriptor of MYST_TEMPLATES) {
      const skeleton = parseJournalSectionSkeleton(
        journalProfileFromMystTemplate(descriptor).sectionSkeleton,
      );
      if (skeleton === null) continue;
      expect(
        skeleton.some((entry) =>
          ['INTRODUCTION', 'METHODS', 'RESULTS', 'DISCUSSION'].includes(
            entry.sectionType,
          ),
        ),
      ).toBe(true);
    }
  });
});

describe('EGU Copernicus, the family the AMT paper belongs to', () => {
  const descriptor = findMystTemplate('tex/myst/egu_copernicus');

  it('offers its journals, AMT among them', () => {
    const choices = mystJournalChoices(descriptor!);

    expect(choices).toHaveLength(1);
    expect(choices[0].optionId).toBe('journal_name');
    expect(choices[0].choices).toContain('amt');
    expect(choices[0].choices).toContain('acp');
    expect(choices[0].choices.length).toBeGreaterThan(40);
  });

  it('pins the profile to the journal actually being submitted to', () => {
    const profile = mystTemplateProfile('tex/myst/egu_copernicus', 'amt');

    expect(profile.name).toBe('EGU Copernicus (amt)');
    expect(profile.profileKey).toBe('myst:tex/myst/egu_copernicus:amt');
    expect(mystTemplateProfileKey('tex/myst/egu_copernicus')).toBe(
      'myst:tex/myst/egu_copernicus',
    );
  });

  it('brings across what the journal demands, in the journal’s own words', () => {
    const byKey = new Map(
      requirementsOf(mystTemplateProfile('tex/myst/egu_copernicus')).map(
        (requirement) => [requirement.key, requirement],
      ),
    );

    // Copernicus makes these mandatory, and says so itself.
    expect(byKey.get('AUTHOR_CONTRIBUTIONS')).toMatchObject({
      required: true,
    });
    expect(byKey.get('COMPETING_INTERESTS')?.required).toBe(true);
    expect(byKey.get('COMPETING_INTERESTS')?.notes).toContain(
      'mandatory even if you declare that no competing interests are present',
    );
    // Optional ones travel too, marked optional rather than dropped.
    expect(byKey.get('DATA_AVAILABILITY')?.required).toBe(false);
    // Front matter the template requires becomes a checklist item, and an id
    // with no catalog entry keeps its own name rather than vanishing.
    expect(byKey.get('FULL_TITLE')?.required).toBe(true);
    expect(byKey.get('KEYWORDS')?.required).toBe(true);
    expect(byKey.get('SHORT_TITLE')).toMatchObject({
      required: true,
      label: 'Running Title',
    });
    expect(byKey.get('RUNNING_AUTHOR')?.required).toBe(true);
  });

  it('says what it did not bring across', () => {
    const profile = mystTemplateProfile('tex/myst/egu_copernicus', 'amt');

    expect(profile.notes).toContain('MyST template registry');
    // The claim this profile must not make.
    expect(profile.notes).toContain('page layout does not');
  });
});

describe('journalProfileFromMystTemplate', () => {
  it('reads a two-column layout only where the template states it', () => {
    expect(
      journalProfileFromMystTemplate({
        id: 'tex/myst/arxiv_two_column',
        title: 'arXiv (Two Column)',
      }).twoColumn,
    ).toBe(true);
    expect(
      journalProfileFromMystTemplate({
        id: 'tex/myst/frontiers',
        title: 'Frontiers',
      }).twoColumn,
    ).toBeUndefined();
  });

  it('reads an abstract limit from words or characters', () => {
    expect(
      journalProfileFromMystTemplate({
        id: 't',
        parts: [{ id: 'abstract', max_words: 250 }],
      }).abstractWordLimit,
    ).toBe(250);
    // A character cap is the other way MyST states it; rounding down keeps
    // the limit honest rather than letting a paper run over.
    expect(
      journalProfileFromMystTemplate({
        id: 't',
        parts: [{ id: 'abstract', max_chars: 1500 }],
      }).abstractWordLimit,
    ).toBe(250);
    expect(
      journalProfileFromMystTemplate({ id: 't', parts: [{ id: 'abstract' }] })
        .abstractWordLimit,
    ).toBeUndefined();
  });

  it('does not repeat a requirement a template names twice', () => {
    const profile = journalProfileFromMystTemplate({
      id: 't',
      doc: [{ id: 'keywords', required: true }],
      parts: [{ id: 'keywords', required: false }],
    });

    expect(requirementsOf(profile)).toHaveLength(1);
    // The front matter is what the portal asks for, so it wins.
    expect(requirementsOf(profile)[0].required).toBe(true);
  });
});

describe('parseMystTemplateDescriptor', () => {
  it('refuses anything that is not a template descriptor', () => {
    expect(() => parseMystTemplateDescriptor('nope')).toThrow(
      /not valid JSON/i,
    );
    expect(() => parseMystTemplateDescriptor('{"title":"No id"}')).toThrow(
      /no template id/i,
    );
  });
});
