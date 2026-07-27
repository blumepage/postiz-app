import { Metadata } from 'next';
import { SanityContentLibrary } from '@gitroom/frontend/components/sanity/sanity.content.library';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Sanity Content',
  description: 'Review and schedule Sanity articles from Postiz.',
};

export default function ContentPage() {
  return <SanityContentLibrary />;
}
