declare module 'citeproc' {
  export type CiteprocSys = {
    retrieveLocale: (language: string) => string;
    retrieveItem: (id: string) => Record<string, unknown>;
  };

  export type Citation = {
    citationID: string;
    citationItems: { id: string }[];
    properties: { noteIndex: number };
  };

  export type BibliographyMetadata = {
    entry_ids: string[][];
  };

  export class Engine {
    constructor(
      sys: CiteprocSys,
      style: string,
      language?: string,
      forceLanguage?: boolean,
    );
    updateItems(ids: string[]): void;
    processCitationCluster(
      citation: Citation,
      citationsPre: [string, number][],
      citationsPost: [string, number][],
    ): [{ bibchange: boolean }, [number, string, string?][]];
    makeCitationCluster(citationItems: { id: string }[]): string;
    makeBibliography(): [BibliographyMetadata, string[]] | false;
  }

  const Citeproc: { Engine: typeof Engine };
  export default Citeproc;
}
