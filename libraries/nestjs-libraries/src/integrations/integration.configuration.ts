const providerEnvironmentRequirements: Record<string, string[]> = {
  x: ['X_API_KEY', 'X_API_SECRET'],
  linkedin: ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  'linkedin-page': ['LINKEDIN_CLIENT_ID', 'LINKEDIN_CLIENT_SECRET'],
  reddit: ['REDDIT_CLIENT_ID', 'REDDIT_CLIENT_SECRET'],
  instagram: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  'instagram-standalone': ['INSTAGRAM_APP_ID', 'INSTAGRAM_APP_SECRET'],
  facebook: ['FACEBOOK_APP_ID', 'FACEBOOK_APP_SECRET'],
  threads: ['THREADS_APP_ID', 'THREADS_APP_SECRET'],
  youtube: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
  gmb: ['GOOGLE_GMB_CLIENT_ID', 'GOOGLE_GMB_CLIENT_SECRET'],
  tiktok: ['TIKTOK_CLIENT_ID', 'TIKTOK_CLIENT_SECRET'],
  pinterest: ['PINTEREST_CLIENT_ID', 'PINTEREST_CLIENT_SECRET'],
  dribbble: ['DRIBBBLE_CLIENT_ID', 'DRIBBBLE_CLIENT_SECRET'],
  discord: [
    'DISCORD_CLIENT_ID',
    'DISCORD_CLIENT_SECRET',
    'DISCORD_BOT_TOKEN_ID',
  ],
  slack: ['SLACK_ID', 'SLACK_SECRET'],
  kick: ['KICK_CLIENT_ID', 'KICK_SECRET'],
  twitch: ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET'],
  mastodon: ['MASTODON_CLIENT_ID', 'MASTODON_CLIENT_SECRET'],
  wrapcast: ['NEYNAR_CLIENT_ID', 'NEYNAR_SECRET_KEY'],
  telegram: ['TELEGRAM_TOKEN'],
  vk: ['VK_ID'],
  whop: ['WHOP_CLIENT_ID'],
  mewe: ['MEWE_APP_ID', 'MEWE_API_KEY'],
  tumblr: ['TUMBLR_CLIENT_ID', 'TUMBLR_CLIENT_SECRET'],
};

const postizCloudOAuthProviders = new Set([
  'x',
  'linkedin',
  'linkedin-page',
  'reddit',
  'instagram',
  'instagram-standalone',
  'facebook',
  'threads',
  'youtube',
  'gmb',
  'tiktok',
  'pinterest',
  'dribbble',
  'discord',
  'slack',
  'kick',
  'twitch',
  'wrapcast',
  'telegram',
  'vk',
  'whop',
  'mewe',
  'tumblr',
]);

export const isPostizCloudOAuthProvider = (identifier: string) =>
  postizCloudOAuthProviders.has(identifier);

export const isIntegrationConfigured = (
  identifier: string,
  environment: NodeJS.ProcessEnv = process.env
) => {
  if (
    environment.POSTIZ_CLOUD_API_KEY?.trim() &&
    isPostizCloudOAuthProvider(identifier)
  ) {
    return true;
  }
  const requiredVariables = providerEnvironmentRequirements[identifier] || [];
  return requiredVariables.every((variable) => !!environment[variable]?.trim());
};
