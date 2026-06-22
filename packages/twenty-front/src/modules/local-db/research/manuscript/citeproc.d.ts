// Minimal ambient types for citeproc-js (the `citeproc` package ships none).
// Only the surface we use: an Engine that takes a sys object + a CSL style XML,
// is told which item ids are cited, and emits a formatted bibliography.
declare module 'citeproc' {
  export type CiteprocSys = {
    retrieveLocale: (lang: string) => string;
    retrieveItem: (id: string) => Record<string, unknown>;
  };

  export type BibliographyMeta = {
    entry_ids: string[][];
  };

  export class Engine {
    constructor(
      sys: CiteprocSys,
      style: string,
      lang?: string,
      forceLang?: boolean,
    );
    updateItems(ids: string[]): void;
    makeBibliography(): [BibliographyMeta, string[]] | false;
  }

  const CSL: { Engine: typeof Engine };
  export default CSL;
}
