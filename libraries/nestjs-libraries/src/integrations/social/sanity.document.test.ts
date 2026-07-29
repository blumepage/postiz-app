import assert from 'node:assert/strict';
import test from 'node:test';
import { sanityDocumentId } from './sanity.document.ts';

test('uses the Postiz post ID so articles cannot overwrite each other', () => {
  assert.equal(sanityDocumentId('post-one', false), 'drafts.postiz.post-one');
  assert.equal(sanityDocumentId('post-two', true), 'postiz.post-two');
  assert.notEqual(
    sanityDocumentId('post-one', false),
    sanityDocumentId('post-two', false)
  );
});

test('normalizes characters Sanity does not allow in document IDs', () => {
  assert.equal(
    sanityDocumentId('post/id with spaces', false),
    'drafts.postiz.post-id-with-spaces'
  );
});
