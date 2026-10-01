/**
 * What `check-version-bump` treats as a contract change: a doc-only edit to an API report or the
 * schema needs no bump; a changed declaration or schema rule does.
 */
import { describe, expect, it } from 'vitest';
import { compareContract, normaliseApiReport, normaliseSchema } from '../scripts/contract.mjs';

const report = (body: string) => `## API Report File\n\n\`\`\`ts\n${body}\n\`\`\`\n`;

describe('compareContract', () => {
  const api = report(
    ['// @public', 'export interface Social {', '    // (undocumented)', "    label: 'x' | 'yelp';", '}'].join('\n'),
  );
  const schema = JSON.stringify({ definitions: { Social: { type: 'object', description: 'A link.' } } }, null, 2);

  it('ignores a doc comment added, changed or removed in an API report', () => {
    const documented = api.replace('    // (undocumented)', '    /**\n     * Which network.\n     */');
    expect(compareContract({ 'etc/a.api.md': api }, { 'etc/a.api.md': documented })).toStrictEqual({
      changed: [],
      docOnly: ['etc/a.api.md'],
      removesOrAlters: false,
    });
  });

  it('ignores a reworded schema description', () => {
    const reworded = schema.replace('A link.', 'A social profile link.');
    expect(compareContract({ 's.json': schema }, { 's.json': reworded })).toStrictEqual({
      changed: [],
      docOnly: ['s.json'],
      removesOrAlters: false,
    });
  });

  it('reports a widened union as an alteration, not documentation', () => {
    const widened = api.replace("'x' | 'yelp'", "'x' | 'yelp' | 'tiktok'");
    expect(compareContract({ 'etc/a.api.md': api }, { 'etc/a.api.md': widened })).toStrictEqual({
      changed: ['etc/a.api.md'],
      docOnly: [],
      removesOrAlters: true,
    });
  });

  it('reports a purely added declaration as a change that removes nothing', () => {
    const added = api.replace('}', "}\n\nexport type Extra = 'a';");
    expect(compareContract({ 'etc/a.api.md': api }, { 'etc/a.api.md': added })).toMatchObject({
      changed: ['etc/a.api.md'],
      removesOrAlters: false,
    });
  });

  it('reports a schema rule change, and a new or deleted file', () => {
    const stricter = schema.replace('"type": "object"', '"type": "string"');
    expect(compareContract({ 's.json': schema }, { 's.json': stricter }).changed).toStrictEqual(['s.json']);
    expect(compareContract({}, { 'etc/new.api.md': api })).toMatchObject({ changed: ['etc/new.api.md'], removesOrAlters: false });
    expect(compareContract({ 'etc/old.api.md': api }, {})).toMatchObject({ changed: ['etc/old.api.md'], removesOrAlters: true });
  });
});

describe('normalisers', () => {
  it('drop comment lines from a report and descriptions at any depth from a schema', () => {
    expect(normaliseApiReport('a\n  // x\n  /** y */\n   * z\n\nb')).toBe('a\nb');
    expect(JSON.parse(normaliseSchema('{"description":"d","p":{"description":"e","t":1},"l":[{"description":"f"}]}'))).toStrictEqual(
      { p: { t: 1 }, l: [{}] },
    );
  });
});
