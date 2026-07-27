'use client';

import { FC } from 'react';
import {
  PostComment,
  withProvider,
} from '@gitroom/frontend/components/new-launch/providers/high.order.provider';
import { Input } from '@gitroom/react/form/input';
import { Select } from '@gitroom/react/form/select';
import { useSettings } from '@gitroom/frontend/components/launches/helpers/use.values';
import { MediaComponent } from '@gitroom/frontend/components/media/media.component';
import { SanityDto } from '@gitroom/nestjs-libraries/dtos/posts/providers-settings/sanity.dto';

const SanitySettings: FC = () => {
  const form = useSettings();
  return (
    <>
      <Input label="Title" {...form.register('title')} />
      <Input label="Excerpt" {...form.register('excerpt')} />
      <Input
        label="Author"
        {...form.register('author', { value: 'Blume Team' })}
      />
      <Select label="Status" {...form.register('status', { value: 'publish' })}>
        <option value="publish">Publish</option>
        <option value="draft">Draft</option>
      </Select>
      <MediaComponent
        label="Cover picture"
        description="Add a cover picture"
        {...form.register('main_image')}
      />
    </>
  );
};

export default withProvider({
  postComment: PostComment.COMMENT,
  minimumCharacters: [],
  SettingsComponent: SanitySettings,
  CustomPreviewComponent: undefined,
  dto: SanityDto,
  maximumCharacters: 100000,
});
