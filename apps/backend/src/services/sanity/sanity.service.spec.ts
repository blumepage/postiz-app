import {
  normalizeSanityArticles,
  type SanityArticle,
} from '@gitroom/backend/services/sanity/sanity.service';

describe('SanityService', () => {
  it('merges draft and published versions without duplicating an article', () => {
    const articles = normalizeSanityArticles([
      {
        _id: 'article-1',
        _updatedAt: '2026-01-01T10:00:00.000Z',
        title: 'Published title',
        publishedAt: '2026-01-01T09:00:00.000Z',
        socialPromotion: { enabled: true, status: 'published', postCount: 2 },
      },
      {
        _id: 'drafts.article-1',
        _updatedAt: '2026-01-02T10:00:00.000Z',
        title: 'Draft title',
        socialPromotion: { enabled: true, postCount: 0 },
      },
    ]);

    expect(articles).toEqual<SanityArticle[]>([
      {
        id: 'article-1',
        title: 'Draft title',
        publishedAt: '2026-01-01T09:00:00.000Z',
        updatedAt: '2026-01-02T10:00:00.000Z',
        hasDraft: true,
        isPublished: true,
        socialPromotion: { enabled: true, postCount: 0 },
      },
    ]);
  });

  it('sorts by the active version and tolerates incomplete documents', () => {
    const articles = normalizeSanityArticles([
      {
        _id: 'article-old',
        _updatedAt: '2026-01-01T10:00:00.000Z',
      },
      {
        _id: 'drafts.article-new',
        _updatedAt: '2026-01-03T10:00:00.000Z',
        title: 'Newest',
      },
      {
        _id: '',
        _updatedAt: '2026-01-04T10:00:00.000Z',
      },
    ]);

    expect(articles.map((article) => article.id)).toEqual([
      'article-new',
      'article-old',
    ]);
    expect(articles[1].title).toBe('Untitled article');
  });
});
