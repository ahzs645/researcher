// The manuscript composer route. It is no longer reachable from a nav LINK —
// the Manuscripts object list is the single door — but the route stays public
// so deep links (and the composer's own manuscript switcher) keep resolving.
export const RESEARCH_COMPOSE_PATH = '/compose';

export const MANUSCRIPT_OBJECT_NAME_SINGULAR = 'manuscript';
export const MANUSCRIPT_OBJECT_NAME_PLURAL = 'manuscripts';

export const buildManuscriptComposerPath = (manuscriptId: string): string =>
  `${RESEARCH_COMPOSE_PATH}?manuscript=${encodeURIComponent(manuscriptId)}`;

// Opening a manuscript record means opening the editor, not the CRM record
// page. Returns null for every other object so the generic "Open" action is
// only re-routed for manuscripts.
export const getManuscriptComposerPathForRecord = ({
  objectNameSingular,
  recordId,
}: {
  objectNameSingular: string;
  recordId: string;
}): string | null =>
  objectNameSingular === MANUSCRIPT_OBJECT_NAME_SINGULAR
    ? buildManuscriptComposerPath(recordId)
    : null;
