import assert from 'node:assert/strict';
import test from 'node:test';
import { htmlToPortableText } from './sanity.portable-text.ts';

test('converts HTML headings to Portable Text headings', () => {
  const blocks = htmlToPortableText(
    '<h2>Suggestions show their work</h2><h3>Details</h3>'
  );

  assert.deepEqual(
    blocks.map(({ style, children }) => ({
      style,
      text: children.map((child) => child.text).join(''),
    })),
    [
      { style: 'h2', text: 'Suggestions show their work' },
      { style: 'h3', text: 'Details' },
    ]
  );
});

test('converts markdown headings left as editor paragraphs', () => {
  const blocks = htmlToPortableText(
    '<p>## Suggestions show their work</p><p>### Details</p>'
  );

  assert.deepEqual(
    blocks.map(({ style, children }) => ({
      style,
      text: children.map((child) => child.text).join(''),
    })),
    [
      { style: 'h2', text: 'Suggestions show their work' },
      { style: 'h3', text: 'Details' },
    ]
  );
});

test('does not treat hashes in ordinary paragraphs as headings', () => {
  const [block] = htmlToPortableText('<p>Version ## 1.0.58 is available</p>');

  assert.equal(block.style, 'normal');
  assert.equal(block.children[0].text, 'Version ## 1.0.58 is available');
});
