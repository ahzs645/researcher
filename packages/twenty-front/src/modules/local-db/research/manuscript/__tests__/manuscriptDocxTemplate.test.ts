import { strToU8, zipSync } from 'fflate';

import {
  describeManuscriptDocxTemplate,
  isManuscriptDocxStylesXml,
  MAX_TEMPLATE_STYLES_BYTES,
  manuscriptDocxTemplateRejection,
  readManuscriptDocxTemplate,
} from '@/local-db/research/manuscript/manuscriptDocxTemplate';

const STYLES_XML = [
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
  '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Times New Roman"/></w:rPr></w:rPrDefault></w:docDefaults>',
  '<w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style>',
  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>',
  '</w:styles>',
].join('');

const docxBytes = (files: Record<string, string>): Uint8Array =>
  zipSync(
    Object.fromEntries(
      Object.entries(files).map(([path, body]) => [path, strToU8(body)]),
    ),
  );

describe('readManuscriptDocxTemplate', () => {
  it('lifts word/styles.xml out of a .docx', () => {
    const result = readManuscriptDocxTemplate(
      docxBytes({
        '[Content_Types].xml': '<Types/>',
        'word/document.xml': '<w:document><w:body/></w:document>',
        'word/styles.xml': STYLES_XML,
      }),
    );

    expect(result).toEqual({
      ok: true,
      stylesXml: STYLES_XML,
      styleCount: 2,
    });
  });

  it('says a Word file has no styles to borrow', () => {
    const result = readManuscriptDocxTemplate(
      docxBytes({ 'word/document.xml': '<w:document/>' }),
    );

    expect(result).toEqual({ ok: false, reason: 'NO_STYLES' });
    expect(manuscriptDocxTemplateRejection(result as never)).toContain(
      'no style definitions',
    );
  });

  it('says a file that is not a Word document is not one', () => {
    const result = readManuscriptDocxTemplate(strToU8('this is not a docx'));

    expect(result).toEqual({ ok: false, reason: 'NOT_A_WORD_FILE' });
  });

  it('rejects a styles part too large to keep on the record', () => {
    const padded = STYLES_XML.replace(
      '</w:styles>',
      `<!--${'x'.repeat(MAX_TEMPLATE_STYLES_BYTES)}--></w:styles>`,
    );

    expect(
      readManuscriptDocxTemplate(docxBytes({ 'word/styles.xml': padded })),
    ).toEqual({ ok: false, reason: 'TOO_LARGE' });
  });

  it('rejects a styles part that is not a styles document', () => {
    expect(
      readManuscriptDocxTemplate(
        docxBytes({ 'word/styles.xml': '<html><body>nope</body></html>' }),
      ),
    ).toEqual({ ok: false, reason: 'NO_STYLES' });
  });
});

describe('isManuscriptDocxStylesXml', () => {
  it('accepts a styles document and rejects everything else', () => {
    expect(isManuscriptDocxStylesXml(STYLES_XML)).toBe(true);
    expect(isManuscriptDocxStylesXml('')).toBe(false);
    expect(isManuscriptDocxStylesXml(null)).toBe(false);
    expect(isManuscriptDocxStylesXml('<w:document/>')).toBe(false);
  });
});

describe('describeManuscriptDocxTemplate', () => {
  it('names the file and counts its styles', () => {
    expect(describeManuscriptDocxTemplate(STYLES_XML, 'Proposal.docx')).toBe(
      'Proposal.docx · 2 styles',
    );
  });

  it('says so when no template is stored', () => {
    expect(describeManuscriptDocxTemplate('', 'Proposal.docx')).toContain(
      'No template',
    );
  });
});
