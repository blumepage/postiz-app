export function sanityDocumentId(postId: string, published: boolean): string {
  const stableId = `postiz.${postId.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  return published ? stableId : `drafts.${stableId}`;
}
