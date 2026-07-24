import assert from 'node:assert/strict';
import test from 'node:test';

import { mapGrantSourceSelectorItem } from './grantOpportunityExtraction.js';

test('maps the supported selector expressions into a normalized opportunity', () => {
  const row = mapGrantSourceSelectorItem(
    {
      linkText: 'Project Grant: Fall competition',
      href: 'https://example.test/opportunities/123',
      itemText: 'Project Grant: Fall competition',
      highlightText: 'Project Grant',
      contextHeadingText: 'Project Grant',
      nearestRowText: [
        'Project Grant: Fall competition',
        'Registration/LOI Deadline: 2026-09-01',
        'Application Deadline',
        '2026-10-01',
      ].join('\n'),
      pageHeadingText: 'Current opportunities',
      pageDescription: 'Current research funding opportunities.',
      pageUrl: 'https://example.test/opportunities',
      tableValues: {
        'Registration/LOI Deadline': '2026-09-01',
        'Application Deadline': '2026-10-01',
      },
    },
    {
      title: 'linkText',
      funder: 'constant:Canadian Institutes of Health Research',
      program: 'linkTextPrefixBeforeColon',
      registrationDeadline: 'tableCell:Registration/LOI Deadline',
      applicationDeadline: 'tableCell:Application Deadline',
      applicationUrl: 'href',
      description: 'nearestRowText',
    },
  );

  assert.deepEqual(row, {
    title: 'Project Grant: Fall competition',
    funder: 'Canadian Institutes of Health Research',
    program: 'Project Grant',
    opportunityUrl: 'https://example.test/opportunities/123',
    applicationDueDate: '2026-10-01',
    registrationDueDate: '2026-09-01',
    amountText: undefined,
    eligibility: undefined,
    description:
      'Project Grant: Fall competition Registration/LOI Deadline: 2026-09-01 Application Deadline 2026-10-01',
  });
});

test('drops selector items that do not produce a title', () => {
  const row = mapGrantSourceSelectorItem(
    {
      linkText: ' ',
      nearestRowText: 'Empty item',
      pageUrl: 'https://example.test/opportunities',
    },
    { title: 'linkText', applicationUrl: 'href' },
  );

  assert.equal(row, null);
});

test('maps context and page fields for catalog and single-page profiles', () => {
  const row = mapGrantSourceSelectorItem(
    {
      linkText: 'View details',
      href: 'https://example.test/programs/growth',
      itemText: 'View details',
      contextHeadingText: 'Growth Fund',
      nearestRowText: 'Growth Fund Up to $50,000 Continuous intake',
      pageHeadingText: 'Funding programs',
      pageDescription: 'Funding for growing organizations.',
      pageUrl: 'https://example.test/programs',
    },
    {
      title: 'contextHeadingText',
      applicationUrl: 'href',
      amount: 'contextText',
      description: 'pageDescription',
    },
  );

  assert.deepEqual(row, {
    title: 'Growth Fund',
    funder: undefined,
    program: undefined,
    opportunityUrl: 'https://example.test/programs/growth',
    applicationDueDate: undefined,
    registrationDueDate: undefined,
    amountText: 'Growth Fund Up to $50,000 Continuous intake',
    eligibility: undefined,
    description: 'Funding for growing organizations.',
  });
});
