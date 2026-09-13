declare module 'citeproc' {
  export type CiteprocSys = {
    retrieveLocale: (language: string) => string;
    retrieveItem: (id: string) => Record<string, unknown>;
  };

  // citeproc-js reads locator/label/prefix/suffix/suppress-author off each
  // item, which is how a `[@key, p. 42]` token keeps its page in the output.
  export type CitationItem = {
    id: string;
    locator?: string;
    label?: string;
    prefix?: string;
    suffix?: string;
    'suppress-author'?: boolean;
  };

  export type Citation = {
    citationID: string;
    citationItems: CitationItem[];
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
    makeCitationCluster(citationItems: CitationItem[]): string;
    makeBibliography(): [BibliographyMetadata, string[]] | false;
  }

  const Citeproc: { Engine: typeof Engine };
  export default Citeproc;
}
