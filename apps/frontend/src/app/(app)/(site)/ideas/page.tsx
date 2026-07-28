import { Metadata } from 'next';
import { IdeasComponent } from '@gitroom/frontend/components/ideas/ideas.component';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Postiz Ideas',
  description: 'Develop and schedule draft ideas',
};

export default function IdeasPage() {
  return <IdeasComponent />;
}
