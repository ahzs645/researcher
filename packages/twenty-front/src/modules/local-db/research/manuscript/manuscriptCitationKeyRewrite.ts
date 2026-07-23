const CITATION_CLUSTER_RE = /\[([^\]]*@[^\]]*)\]/g;
const CITATION_KEY_RE = /@([^\s;,\]]+)/g;

export const rewriteCitationKeys = (
  text: string,
  replacements: ReadonlyMap<string, string>,
): string =>
  text.replace(CITATION_CLUSTER_RE, (cluster) =>
    cluster.replace(CITATION_KEY_RE, (token, key: string) => {
      const replacement = replacements.get(key);
      return replacement === undefined ? token : `@${replacement}`;
    }),
  );

export const rewriteCitationKey = (
  text: string,
  removedKey: string,
  keptKey: string,
): string => rewriteCitationKeys(text, new Map([[removedKey, keptKey]]));
