export const apps = [
  { id: 'youtube', title: 'YouTube', genre: 'Video', mark: '▶', color: 'youtube', url: 'https://www.youtube.com/', description: 'The YouTube website through Scramjet. No random Piped server selector.' },
  { id: 'bing', title: 'Bing', genre: 'Search', mark: 'B', color: 'stack', url: 'https://www.bing.com/', description: 'Search the web through the shared proxy connection.' },
  { id: 'roblox', title: 'Roblox', genre: 'Gaming', mark: 'RB', color: 'devil', url: 'https://www.roblox.com/', description: 'Browse Roblox. Playing experiences requires its app or a supported cloud service.' },
  { id: 'nowgg', title: 'now.gg', genre: 'Gaming', mark: 'NG', color: 'stack', url: 'https://now.gg/', description: 'Cloud gaming provider. Availability and streaming support are provider-dependent.' },
  { id: 'tiktok', title: 'TikTok', genre: 'Social', mark: '♪', color: 'twenty', url: 'https://www.tiktok.com/', description: 'Watch and browse TikTok through the same launcher.' },
  { id: 'discord', title: 'Discord', genre: 'Social', mark: 'DC', color: 'drive', url: 'https://discord.com/app', description: 'Discord web client. Realtime chat needs Wisp; calls may need direct WebRTC.' },
  { id: 'twitch', title: 'Twitch', genre: 'Video', mark: 'TW', color: 'hextris', url: 'https://www.twitch.tv/', description: 'Livestreams and channels. Wisp recommended for playback.' },
  { id: 'spotify', title: 'Spotify', genre: 'Music', mark: 'SP', color: 'mining', url: 'https://open.spotify.com/', description: 'Spotify web player. Account and DRM/browser requirements still apply.' },
  { id: 'github', title: 'GitHub', genre: 'Tool', mark: 'GH', color: 'stack', url: 'https://github.com/', description: 'Repositories, issues and code in the browser.' },
  { id: 'reddit', title: 'Reddit', genre: 'Social', mark: 'RE', color: 'devil', url: 'https://www.reddit.com/', description: 'Read communities and discussions.' },
];
export const appLaunchUrl = (url: string) => `/proxy?url=${encodeURIComponent(url)}`;
