import { useEffect, useState } from 'react';

import { renderMermaidToSvg } from '@/local-db/research/manuscript/manuscriptDiagram';

export type ManuscriptDiagramSvgStatus = 'idle' | 'drawing' | 'error';

export type ManuscriptDiagramSvg = {
  svg: string | null;
  status: ManuscriptDiagramSvgStatus;
};

// Draw a Mermaid source for the UI. Debounced because the editor calls this on
// every keystroke and a half-typed diagram is always a parse error; shared with
// the asset list so a diagram figure shows its picture before export.
export const useManuscriptDiagramSvg = (
  source: string | null | undefined,
  debounceMs = 350,
): ManuscriptDiagramSvg => {
  const [svg, setSvg] = useState<string | null>(null);
  const [status, setStatus] = useState<ManuscriptDiagramSvgStatus>('idle');
  const body = (source ?? '').trim();

  useEffect(() => {
    if (body.length === 0) {
      setSvg(null);
      setStatus('idle');
      return;
    }
    setStatus('drawing');
    let cancelled = false;
    const timer = setTimeout(() => {
      void renderMermaidToSvg(body).then((rendered) => {
        if (cancelled) return;
        setSvg(rendered);
        setStatus(rendered === null ? 'error' : 'idle');
      });
    }, debounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [body, debounceMs]);

  return { svg, status };
};
