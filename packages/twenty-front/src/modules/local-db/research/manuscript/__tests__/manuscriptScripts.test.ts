import {
  manuscriptScriptSegments,
  stripManuscriptScriptMarkers,
  wrapManuscriptScript,
} from '@/local-db/research/manuscript/manuscriptScripts';

describe('manuscript inline scripts', () => {
  it('keeps invisible source markers while exposing semantic Word runs', () => {
    const value = `PM${wrapManuscriptScript('2.5', 'SUBSCRIPT')} uses m${wrapManuscriptScript('3', 'SUPERSCRIPT')}`;

    expect(stripManuscriptScriptMarkers(value)).toBe('PM2.5 uses m3');
    expect(manuscriptScriptSegments(value)).toEqual([
      { text: 'PM', position: 'BASELINE' },
      { text: '2.5', position: 'SUBSCRIPT' },
      { text: ' uses m', position: 'BASELINE' },
      { text: '3', position: 'SUPERSCRIPT' },
    ]);
    expect(value).not.toMatch(/[\u2061-\u2064]/);
  });
});
