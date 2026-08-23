import { strToU8, zipSync } from 'fflate';

import {
  describeManuscriptDocxTemplate,
  extractManuscriptDocxStyles,
  isManuscriptDocxStylesXml,
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

describe('extractManuscriptDocxStyles', () => {
  it('lifts word/styles.xml out of a .docx', () => {
    const bytes = docxBytes({
      '[Content_Types].xml': '<Types/>',
      'word/document.xml': '<w:document><w:body/></w:document>',
      'word/styles.xml': STYLES_XML,
    });

    expect(extractManuscriptDocxStyles(bytes)).toBe(STYLES_XML);
  });

  it('returns null for a Word file with no styles part', () => {
    expect(
      extractManuscriptDocxStyles(
        docxBytes({ 'word/document.xml': '<w:document/>' }),
      ),
    ).toBeNull();
  });

  it('returns null for something that is not a ZIP at all', () => {
    expect(
      extractManuscriptDocxStyles(strToU8('this is not a docx')),
    ).toBeNull();
  });

  it('returns null when the styles part is not a styles document', () => {
    expect(
      extractManuscriptDocxStyles(
        docxBytes({ 'word/styles.xml': '<html><body>nope</body></html>' }),
      ),
    ).toBeNull();
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
