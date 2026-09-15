// Offline regression tests for the YouTube InnerTube parsers.
//
//   node scripts/yt-parsers.test.mjs
//
// "Does YouTube work at school?" is really "can we still read whatever JSON
// Google hands us this month?" — legacy *Renderer cards, the new lockupViewModel
// cards, shorts cards, live badges, playability rejections, continuation
// tokens. We cannot call the live API from a blocked network or from CI, so we
// feed the parsers fixed fixtures and assert on the normalised JSON the game
// client consumes. Run this after touching app/api/yt/innertube.ts.
//
// Requires Node >= 22.6 (built-in TypeScript type stripping). Zero deps.

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(repoRoot, "app", "api", "yt");

// The app uses extensionless imports (Turbopack resolves them); Node's type
// stripping does not, so stage copies with explicit .ts specifiers.
const workDir = mkdtempSync(join(tmpdir(), "gg-yt-parsers-"));
for (const file of ["lib.ts", "innertube.ts", "upstream.ts"]) {
  const src = join(sourceDir, file);
  try {
    cpSync(src, join(workDir, file));
  } catch {
    console.error(`missing ${src} — run this from inside the GG-LOUNGE repo`);
    process.exit(1);
  }
}
for (const file of ["innertube.ts", "upstream.ts"]) {
  const p = join(workDir, file);
  writeFileSync(
    p,
    readFileSync(p, "utf8").replace(/(from\s+")(\.\/lib)(")/g, "$1$2.ts$3"),
  );
}

const yt = await import(pathToFileURL(join(workDir, "innertube.ts")).href);

// The dispatcher also exposes a pure rewriter; extract just that function so the
// test does not need next/server at runtime.
const dispatcher = readFileSync(join(sourceDir, "[...path]", "route.ts"), "utf8");
const fnStart = dispatcher.indexOf("export function proxyMediaUrls");
if (fnStart < 0) throw new Error("proxyMediaUrls not found in the dispatcher");
let depth = 0;
let i = dispatcher.indexOf("{", fnStart);
let end = -1;
for (; i < dispatcher.length; i++) {
  if (dispatcher[i] === "{") depth++;
  else if (dispatcher[i] === "}") {
    depth--;
    if (depth === 0) { end = i + 1; break; }
  }
}
const shim =
  `import * as lib from "./lib.ts";\n` +
  dispatcher
    .slice(fnStart, end)
    .replace("export function", "function")
    .replace(/sameOriginMediaUrl\(/g, "lib.sameOriginMediaUrl(")
    .replace(/sameOriginImageUrl\(/g, "lib.sameOriginImageUrl(") +
  `\nexport { proxyMediaUrls };\n`;
const lib = await import(pathToFileURL(join(workDir, "lib.ts")).href);
// Stage the extracted function as a real .ts file (type stripping only applies
// to files, not data: URLs) and import the dispatcher's rewriter that way.
writeFileSync(join(workDir, "dispatcher-shim.ts"), shim);
const route = await import(pathToFileURL(join(workDir, "dispatcher-shim.ts")).href);

let passed = 0;
let failed = 0;
async function check(name, fn) {
  try {
    const detail = await fn();
    passed += 1;
    console.log(`  \u001b[32mok\u001b[0m   ${name}${detail ? `  (${detail})` : ""}`);
  } catch (err) {
    failed += 1;
    console.log(`  \u001b[31mFAIL\u001b[0m ${name}\n         ${err?.message || err}`);
  }
}
function eq(actual, expected, what = "value") {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what}: got ${a}, want ${b}`);
  return `${what}=${a}`;
}
function ok(value, what) {
  if (!value) throw new Error(what ? `expected truthy: ${what}` : "expected truthy");
  return "";
}
/** InnerTube nests every card under a single key; wrap it the way the wire does. */
const wire = (key, value) => ({ [key]: value });

console.log("\nGG-LOUNGE · YouTube InnerTube parser fixtures\n");

// ------------------------------------------------------------------- helpers --

await check("text() reads runs, simpleText, content, plain strings", () => {
  eq(yt.text({ runs: [{ text: "Big " }, { text: "Buck" }] }), "Big Buck", "runs");
  eq(yt.text({ simpleText: "hi" }), "hi", "simpleText");
  eq(yt.text({ content: "vm" }), "vm", "viewmodel");
  eq(yt.text("raw"), "raw", "plain");
  eq(yt.text(null), "", "null");
});

await check("parseCount() handles K/M/B, commas, and unknown sentinels", () => {
  eq(yt.parseCount("1.2M views"), 1200000, "1.2M");
  eq(yt.parseCount("24K"), 24000, "24K");
  eq(yt.parseCount("3,904,112"), 3904112, "commas");
  eq(yt.parseCount({ simpleText: "2" }), 2, "renderer");
  eq(yt.parseCount(undefined), -1, "unknown -> -1");
});

await check("parseDuration() reads mm:ss and h:mm:ss, rejects junk", () => {
  eq(yt.parseDuration("4:05"), 245, "mm:ss");
  eq(yt.parseDuration("1:02:03"), 3723, "hh:mm:ss");
  eq(yt.parseDuration({ simpleText: "LIVE" }), -1, "LIVE -> -1");
});

// -------------------------------------------------------------- video cards --

const legacyVideo = {
  videoId: "aaaaaaaaaaa",
  title: { runs: [{ text: "Legacy Title" }] },
  ownerText: {
    runs: [{ text: "Some Channel", navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@somechannel" } } }],
  },
  lengthText: { simpleText: "10:00" },
  viewCountText: { simpleText: "1.2M views" },
  publishedTimeText: { simpleText: "3 days ago" },
  thumbnail: {
    thumbnails: [
      { url: "https://i.ytimg.com/vi/aaaaaaaaaaa/default.jpg", width: 120, height: 90 },
      { url: "https://i.ytimg.com/vi/aaaaaaaaaaa/hq720.jpg", width: 480, height: 270 },
    ],
  },
};

await check("extractVideos reads legacy videoRenderer cards (search + trending)", () => {
  const data = {
    contents: {
      twoColumnSearchResultsRenderer: {
        primaryContents: [
          { sectionListRenderer: { contents: [{ itemSectionRenderer: { contents: [wire("videoRenderer", legacyVideo)] } }] } },
          {
            sectionListRenderer: {
              contents: [
                {
                  itemSectionRenderer: {
                    contents: [
                      wire("gridVideoRenderer", {
                        videoId: "gridgridgri",
                        title: { simpleText: "Grid Card" },
                        viewCountText: { runs: [{ text: "99 views" }] },
                        lengthText: { simpleText: "0:31" },
                      }),
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    },
  };
  const out = yt.extractVideos(data);
  eq(out.length, 2, "count");
  const a = out.find((v) => v.url === "/watch?v=aaaaaaaaaaa") || out[0];
  eq(a.title, "Legacy Title", "title");
  eq(a.uploaderName, "Some Channel", "channel");
  eq(a.uploaderUrl, "/@somechannel", "channel link");
  eq(a.views, 1200000, "views");
  eq(a.duration, 600, "duration");
  eq(a.isLive, false, "not live");
  ok(/ytimg\.com/.test(a.thumbnail), "thumbnail host");
  ok(out.some((v) => v.url === "/watch?v=gridgridgri" && v.duration === 31), "grid card parsed");
  return `${out.length} cards`;
});

const lockup = {
  contentId: "bbbbbbbbbbb",
  contentType: "LOCKUP_CONTENT_TYPE_VIDEO",
  contentImage: {
    thumbnailViewModel: {
      image: { sources: [{ url: "https://i.ytimg.com/vi/bbbbbbbbbbb/oar2.jpg", width: 406, height: 724 }] },
      overlays: [
        { thumbnailBadgeViewModel: { text: "1:02:03", badgeStyle: "THUMBNAIL_BADGE_STYLE_TEXT" } },
      ],
    },
  },
  metadata: {
    lockupMetadataViewModel: {
      title: { content: "New Lockup Title" },
      metadata: {
        contentMetadataViewModel: {
          metadataRows: [
            { metadataParts: [{ text: { content: "Cool Channel" } }] },
            { metadataParts: [{ text: { content: "42K views" } }, { text: { content: "2 weeks ago" } }] },
          ],
        },
      },
      rendererContext: {
        commandContext: {
          onTap: [{ innertubeCommand: { watchEndpoint: { videoId: "bbbbbbbbbbb" } } }],
        },
      },
    },
  },
};

const liveLockup = {
  contentId: "livelifeliv",
  contentImage: {
    thumbnailViewModel: {
      image: { sources: [{ url: "https://i.ytimg.com/vi/livelifeliv/hqdefault_live.jpg" }] },
      overlays: [{ thumbnailBadgeViewModel: { text: "LIVE", badgeType: "BADGE_TYPE_LIVE", overrideColor: { color: 4278208831 } } }],
    },
  },
  metadata: {
    lockupMetadataViewModel: {
      title: { content: "Live 24/7" },
      metadata: {
        contentMetadataViewModel: {
          metadataRows: [{ metadataParts: [{ text: { content: "1,024 watching" } }] }],
        },
      },
    },
  },
};

const shortsCard = {
  entityId: "shortsLockupViewModel-Ccccccccccc",
  accessibilityText: "Short With Title, YouTube video",
  onTap: { innertubeCommand: { reelWatchEndpoint: { videoId: "ccccccccccc" } } },
  thumbnail: { sources: [{ url: "https://i.ytimg.com/some/path/vi/ccccccccccc/oar2.jpg" }] },
  overlayMetadata: {
    primaryText: { content: "Short With Title" },
    secondaryText: { content: "3.4M views" },
  },
};

await check("extractVideos reads lockupViewModel, live badges, and shorts cards", () => {
  const data = {
    onResponseReceivedActions: [
      { appendContinuationItemsAction: { continuationItems: [wire("lockupViewModel", lockup), wire("lockupViewModel", liveLockup), wire("shortsLockupViewModel", shortsCard)] } },
    ],
  };
  const out = yt.extractVideos(data);
  eq(out.length, 3, "count");
  const big = out.find((v) => v.url === "/watch?v=bbbbbbbbbbb");
  ok(big, "lockup id from contentId");
  eq(big.title, "New Lockup Title", "title");
  eq(big.views, 42000, "views");
  eq(big.duration, 3723, "duration from badge");
  eq(big.uploaderName, "Cool Channel", "channel (row order independent)");
  eq(big.isLive, false, "not live");
  ok(/hq720|oar2|ytimg/.test(big.thumbnail), "thumbnail: " + big.thumbnail);
  const live = out.find((v) => v.url === "/watch?v=livelifeliv");
  eq(live.isLive, true, "live flag from badge");
  eq(live.duration, -1, "live has no duration");
  const short = out.find((v) => v.title === "Short With Title");
  ok(short && short.url === "/watch?v=ccccccccccc", "shorts id from reelWatchEndpoint/onTap");
  eq(short.views, 3400000, "shorts views");
  return `${out.length} cards`;
});

// -------------------------------------------------------------------- player --

const player = {
  videoDetails: {
    videoId: "ddddddddddd",
    title: "Bunny",
    shortDescription: "a rabbit",
    author: "Blender",
    channelId: "UCblender0000000000000",
    lengthSeconds: "600",
    viewCount: "1000",
    isLiveContent: false,
    thumbnail: { thumbnails: [{ url: "https://i.ytimg.com/vi/ddddddddddd/hqdefault.jpg", width: 480, height: 360 }] },
    status: "OK",
  },
  microformat: {
    playerMicroformatRenderer: {
      title: { simpleText: "Bunny" },
      category: "Film",
      uploadDate: "2024-01-02",
      lengthSeconds: "600",
    },
  },
  streamingData: {
    expiresInSeconds: 21600,
    formats: [
      {
        itag: 18,
        url: "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=18&sig=x",
        mimeType: 'video/mp4; codecs="avc1.42001E, mp4a.40.2"',
        qualityLabel: "360p",
        height: 360,
        width: 640,
        contentLength: "12345",
        bitrate: 500000,
      },
    ],
    adaptiveFormats: [
      {
        itag: 137,
        url: "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=137&sig=x",
        mimeType: 'video/mp4; codecs="avc1.640028"',
        qualityLabel: "1080p",
        height: 1080,
        width: 1920,
        contentLength: "999999",
        bitrate: 4000000,
      },
      {
        itag: 251,
        url: "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=251&sig=x",
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 129000,
        contentLength: "8000",
      },
      { itag: 133, mimeType: "video/mp4", bitrate: 1 },
    ],
    hlsManifestUrl: "https://manifest.googlevideo.com/api/manifest/hls_playlist/foo.m3u8",
  },
  captions: {
    playerCaptionsTracklistRenderer: {
      captionTracks: [
        { baseUrl: "https://www.youtube.com/api/timedtext?lang=en", name: { simpleText: "English" }, languageCode: "en" },
        { baseUrl: "https://www.youtube.com/api/timedtext?lang=es", name: { runs: [{ text: "Español" }] }, languageCode: "es", kind: "asr" },
      ],
    },
  },
  playerAnnotations: {
    chapterMarkers: [
      { chapterRenderer: { title: { simpleText: "Intro" }, time: { simpleText: "0:00" } } },
      { chapterRenderer: { title: { simpleText: "Chase" }, time: { simpleText: "2:30" } } },
    ],
  },
  playabilityStatus: { status: "OK" },
};

await check("normalisePlayer maps formats to the Piped stream shape the client reads", () => {
  const res = yt.normalisePlayer(player, "ddddddddddd");
  eq(res.ok, true, "ok");
  const s = res.data;
  eq(s.videoStreams.length, 2, "videoStreams");
  ok(s.videoStreams.some((v) => v.quality === "360p" && v.videoOnly === false), "muxed 360p is audio+video");
  ok(s.videoStreams.some((v) => v.quality === "1080p" && v.videoOnly === true), "adaptive 1080p is video-only");
  eq(s.videoStreams[0].height, 1080, "sorted by height desc");
  eq(s.audioStreams.length, 1, "adaptive-only urls without a url are dropped");
  eq(s.audioStreams[0].format, "webm", "audio container read off mimeType");
  ok(s.videoStreams.every((v) => /^https:\/\//.test(v.url)), "stream urls kept verbatim");
  eq(s.subtitles.length, 2, "subtitle tracks");
  eq(s.subtitles[1].autoGenerated, true, "asr track flagged auto-generated");
  eq(s.subtitles[0].name, "English", "track name");
  ok(typeof s.hls === "string" && s.hls.includes(".m3u8"), "hls manifest kept");
  eq(s.chapters.length, 2, "chapters");
  eq(s.chapters[1].start, 150, "chapter start seconds");
  eq(s.duration, 600, "duration");
  eq(s.views, 1000, "views");
  eq(s.likes, -1, "likes unknown from player alone");
  eq(s.category, "Film", "category");
  eq(s.uploadDate, "2024-01-02", "upload date");
  eq(s.livestream, false, "not a livestream");
  return `${s.videoStreams.length}v/${s.audioStreams.length}a/${s.subtitles.length}cc`;
});

await check("normalisePlayer keeps HLS-only/live videos playable and surfaces blocks", () => {
  const live = yt.normalisePlayer(
    {
      videoDetails: { videoId: "eeeeeeeeeee", title: "Live", lengthSeconds: "0", isLiveContent: true },
      streamingData: { hlsManifestUrl: "https://manifest.googlevideo.com/live/manifest.m3u8", formats: [], adaptiveFormats: [] },
      playabilityStatus: { status: "LIVE_STREAM_OFFLINE", reason: "Stream is offline." },
    },
    "eeeeeeeeeee",
  );
  ok(live.ok, "hls-only counts as playable");
  eq(live.data.livestream, true, "livestream flag");
  eq(live.data.videoStreams.length, 0, "no progressive streams");
  ok(live.data.hls.endsWith(".m3u8"), "hls preserved");

  const age = yt.normalisePlayer(
    {
      videoDetails: { videoId: "ffffffffff1", title: "Age" },
      playabilityStatus: { status: "AGE_CHECK_REQUIRED", reason: "Sign in to confirm your age" },
    },
    "ffffffffff1",
  );
  eq(age.ok, false, "blocked video is not ok");
  ok(/Sign in to confirm your age/.test(age.error), "reason surfaced: " + age.error);
});

// ---------------------------------------------------------------------- next --

await check("normaliseNext pulls likes, owner, up-next, and the comments token", () => {
  const next = {
    contents: {
      twoColumnWatchNextResults: {
        results: {
          results: {
            contents: [
              {
                videoPrimaryInfoRenderer: {
                  likeButtonViewModel: {
                    likeButtonViewModel: {
                      defaultButton: { lockupButtonViewModel: { text: { content: "1,234" } } },
                      accessibilityText: "like this video along with 1,234 other people",
                    },
                  },
                  viewCount: { videoViewCountRenderer: { viewCount: { simpleText: "20,000 views" } } },
                },
              },
              {
                videoSecondaryInfoRenderer: {
                  owner: {
                    videoOwnerRenderer: {
                      title: { runs: [{ text: "Cool Channel", navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@coolchannel" } } }] },
                      subscriberCountText: { simpleText: "2.1M subscribers" },
                      thumbnail: { thumbnails: [{ url: "https://yt3.ggpht.com/a/channel-M.jpg", width: 48, height: 48 }] },
                      navigationEndpoint: { browseEndpoint: { canonicalBaseUrl: "/@coolchannel" } },
                    },
                  },
                },
              },
            ],
          },
        },
        secondaryResults: {
          secondaryResults: {
            contents: [
              {
                itemSectionRenderer: {
                  contents: [
                    wire("videoRenderer", { ...legacyVideo, videoId: "ggggggggggg", title: { runs: [{ text: "Related One" }] } }),
                    { richItemRenderer: wire("richItemRenderer", { content: { lockupViewModel: lockup } }) },
                  ],
                },
              },
            ],
          },
        },
      },
    },
    onResponseReceivedEndpoints: [
      {
        updateEngagementPanelAction: {
          content: {
            engagementPanelSectionListRenderer: {
              panelIdentifier: "comment-item-section",
              header: { engagementPanelTitleHeaderRenderer: { contextualInfo: { runs: [{ text: "1,024 Comments" }] } } },
              content: {
                sectionListRenderer: {
                  contents: [
                    { itemSectionRenderer: { sectionIdentifier: "comment-item-section", continuationItemRenderer: { continuationEndpoint: { continuationCommand: { token: "COMMENTS-TOKEN-1" } } } } },
                  ],
                },
              },
            },
          },
        },
      },
    ],
  };
  const out = yt.normaliseNext(next, "ddddddddddd");
  eq(out.likes, 1234, "likes");
  eq(out.uploaderName, "Cool Channel", "uploader name");
  eq(out.uploaderUrl, "/@coolchannel", "uploader link");
  eq(out.uploaderSubscriberCount, 2100000, "subscriber count");
  ok(/^https:\/\/yt3\.ggpht\.com/.test(out.uploaderAvatar), "avatar: " + out.uploaderAvatar);
  eq(out.commentCount, 1024, "comment count");
  eq(out.commentsToken, "COMMENTS-TOKEN-1", "comments continuation token");
  eq(out.relatedStreams.length, 2, "related count");
  ok(out.relatedStreams.every((r) => !r.url.includes("ddddddddddd")), "current video excluded from up-next");
  return `likes=${out.likes} related=${out.relatedStreams.length}`;
});

await check("findCommentsToken stays null when comments are disabled", () => {
  const data = { contents: { twoColumnWatchNextResults: { results: { results: { contents: [wire("videoRenderer", legacyVideo)] } } } } };
  eq(yt.findCommentsToken(data), null, "no token");
});

// ------------------------------------------------------------------ comments --

await check("normaliseComments reads legacy commentRenderer pages", () => {
  const legacy = {
    onResponseReceivedActions: [
      {
        appendContinuationItemsAction: {
          continuationItems: [
            {
              commentThreadRenderer: {
                comment: {
                  commentRenderer: {
                    commentId: "Ugw.1",
                    contentText: { runs: [{ text: "First! " }, { text: "😀" }] },
                    authorText: {
                      simpleText: "Alice",
                      runs: [{ text: "Alice", navigationEndpoint: { browseEndpoint: { browseId: "UCalice00000000000000" } } }],
                    },
                    authorThumbnail: { thumbnails: [{ url: "https://yt3.ggpht.com/alice-M.jpg", width: 48, height: 48 }] },
                    publishedTimeText: { simpleText: "2 hours ago" },
                    voteCount: { simpleText: "12" },
                    authorCommentBadge: { metadataBadgeRenderer: { label: "Creator" } },
                    replies: {
                      commentsEntryPointHeaderRenderer: {
                        commentCount: { simpleText: "3 replies" },
                        continuationItem: { continuationEndpoint: { continuationCommand: { token: "REPLIES-1" } } },
                      },
                    },
                  },
                },
              },
            },
            { continuationItemRenderer: { button: { buttonRenderer: { command: { continuationCommand: { token: "COMMENTS-PAGE-2" } } } } } },
          ],
        },
      },
    ],
  };
  const a = yt.normaliseComments(legacy);
  eq(a.comments.length, 1, "count");
  eq(a.comments[0].author, "Alice", "author");
  eq(a.comments[0].authorId, "UCalice00000000000000", "channel id");
  eq(a.comments[0].commentText, "First! 😀", "body joined from runs");
  eq(a.comments[0].likeCount, 12, "likes");
  eq(a.comments[0].replyCount, 3, "reply count");
  eq(a.comments[0].pinned, true, "creator badge -> pinned");
  eq(a.comments[0].continuation, "REPLIES-1", "reply token kept");
  eq(a.nextpage, "COMMENTS-PAGE-2", "page token");
  return `${a.comments.length} comment(s)`;
});

await check("normaliseComments reads the newer commentEntityPayload shape", () => {
  const payload = {
    frameworkUpdates: {
      entityBatchUpdate: {
        mutations: [
          {
            payload: {
              commentEntityPayload: {
                properties: {
                  commentId: "Ugw.2",
                  content: "Great video 😂",
                  publishedTime: { text: "3 days ago" },
                  author: { displayName: "Bob", channelId: "UCbob000000000000000000", avatar: { sources: [{ url: "https://yt3.ggpht.com/bob-M.jpg" }] } },
                  score: { simpleText: { textContent: "4" } },
                },
                toolbar: { replyCount: "2", likeCountNotaglyph: { text: "4" }, isPinned: false },
              },
            },
          },
          { payload: { commentRepliesChapter: { header: {} } } },
        ],
      },
    },
    onResponseReceivedActions: [
      { appendContinuationItemsAction: { continuationItems: [{ continuationItemRenderer: { button: { buttonRenderer: { command: { continuationCommand: { token: "PAGE-2" } } } } } }] } },
    ],
  };
  const b = yt.normaliseComments(payload);
  eq(b.comments.length, 1, "count (junk mutations ignored)");
  eq(b.comments[0].author, "Bob", "author");
  eq(b.comments[0].authorId, "UCbob000000000000000000", "channel id");
  eq(b.comments[0].commentText, "Great video 😂", "body from properties.content");
  eq(b.comments[0].commentTime, "3 days ago", "relative time");
  eq(b.comments[0].likeCount, 4, "likes");
  eq(b.comments[0].replyCount, 2, "replies");
  ok(/^https:\/\/yt3\.ggpht\.com/.test(b.comments[0].thumbnail), "avatar: " + b.comments[0].thumbnail);
  eq(b.comments[0].pinned, false, "not pinned");
  eq(b.nextpage, "PAGE-2", "page token");
  return `${b.comments.length} comment(s)`;
});

// ------------------------------------------------------------------ captions --

await check("json3ToVtt converts timedtext JSON3 into safe WebVTT", () => {
  const json3 = {
    events: [
      { tStartMs: 0, dDurationMs: 2000, segs: [{ utf8: "Hello" }, { utf8: " world" }] },
      { tStartMs: 2000, dDurationMs: 1500, segs: [{ utf8: "<c>styled</c> " }, { utf8: "\u00a0line" }] },
      { tStartMs: 4000, segs: [{ utf8: "no duration" }] },
      { tStartMs: 5000, dDurationMs: 100, segs: [{ utf8: "   " }] },
      { tStartMs: 6000, dDurationMs: 900, segs: [{ utf8: "a\nb" }] },
    ],
  };
  const vtt = yt.json3ToVtt(json3);
  ok(vtt.startsWith("WEBVTT\n\n"), "WebVTT header");
  ok(vtt.includes("00:00:00.000 --> 00:00:02.000"), "first cue timing");
  ok(vtt.includes("Hello world"), "segments joined");
  ok(!vtt.includes("<c>"), "caption markup stripped");
  ok(vtt.includes("styled line"), "text survives markup removal");
  ok(vtt.includes("00:00:04.000 --> 00:00:05.200"), "missing duration defaults to 1.2s");
  eq(vtt.split("\n\n").filter((c) => /^\d+\n/.test(c)).length, 4, "blank cue dropped");
  return "4 cues";
});

// -------------------------------------------------------------- same-origin --

await check("media + image URLs are rewritten through same-origin proxies", () => {
  const m = lib.sameOriginMediaUrl("https://rr1---sn-x.googlevideo.com/videoplayback?itag=18&s=x");
  ok(m.startsWith("/api/yt/media?url="), "media path: " + m.slice(0, 24));
  const i = lib.sameOriginImageUrl("https://i.ytimg.com/vi/x/hqdefault.jpg");
  ok(i.startsWith("/api/yt/img?url="), "image path");
  const sig = new URL(i, "http://x").searchParams.get("s");
  ok(!!sig, "signature present");
  eq(lib.verifyMediaSignature("https://i.ytimg.com/vi/x/hqdefault.jpg", sig), true, "verifies");
  eq(lib.verifyMediaSignature("https://evil.example/x.jpg", sig), false, "bound to the url");
  ok(lib.isAllowedMediaUrl("https://yt3.ggpht.com/a/b.jpg"), "ggpht allowed");
  eq(lib.isAllowedMediaUrl("https://example.com/x.mp4"), null, "random host not allowed");
  eq(lib.isAllowedMediaUrl("http://i.ytimg.com/vi/x/hqdefault.jpg"), null, "http not allowed");
  eq(lib.isBlockedHost("127.0.0.1"), true, "loopback blocked");
  eq(lib.isBlockedHost("192.168.1.1"), true, "LAN blocked");
  eq(lib.isBlockedHost("[::1]"), true, "ipv6 loopback blocked");
  eq(lib.isBlockedHost("169.254.1.1"), true, "link-local blocked");
  eq(lib.isBlockedHost("metadata.google.internal"), true, "cloud metadata blocked");
  return "SSRF guards intact";
});

// --------------------------------------------------------- relay rewriting --

await check("stream URLs are rewritten to the same-origin relay (school playback)", () => {
  const raw = {
    ggClient: "ANDROID",
    videoStreams: [
      { url: "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=18&sig=x", quality: "360p", mimeType: "video/mp4" },
    ],
    audioStreams: [{ url: "https://rr1---sn-abc.googlevideo.com/videoplayback?itag=140", mimeType: "audio/mp4" }],
    hls: "https://manifest.googlevideo.com/api/manifest/hls_playlist/x.m3u8",
    subtitles: [{ code: "en", url: "https://www.youtube.com/api/timedtext?lang=en" }],
    thumbnailUrl: "https://i.ytimg.com/vi/ddddddddddd/maxresdefault.jpg",
    relatedStreams: [{ title: "R", thumbnail: "https://i.ytimg.com/vi/ggggggggggg/default.jpg" }],
  };
  const out = route.proxyMediaUrls(raw);
  ok(out.videoStreams[0].url.startsWith("/api/yt/media?url="), "video proxied");
  eq(new URL(out.videoStreams[0].url, "http://x").searchParams.get("url"), raw.videoStreams[0].url, "original url round-trips intact");
  eq(out.videoStreams[0].url.includes("&c=ANDROID"), true, "client hint rides along");
  eq(out.videoStreams[0].urlDirect, raw.videoStreams[0].url, "direct copy kept");
  ok(out.audioStreams[0].url.startsWith("/api/yt/media?url="), "audio proxied");
  ok(out.hls.startsWith("/api/yt/media?url="), "hls proxied");
  eq(out.hlsDirect, raw.hls, "hls direct kept");
  ok(out.subtitles[0].url.startsWith("/api/yt/media?url="), "captions proxied");
  ok(out.thumbnailUrl.startsWith("/api/yt/img?url="), "thumbnail proxied");
  ok(out.relatedStreams[0].thumbnail.startsWith("/api/yt/img?url="), "related thumbnail proxied");
  ok(!("ggClient" in out), "internal client tag stripped");
  const twice = route.proxyMediaUrls(out);
  eq(twice.videoStreams[0].url, out.videoStreams[0].url, "idempotent (never double-wrapped)");
  return "relay + client hint + urlDirect";
});

// --------------------------------------------------------------------- done --

rmSync(workDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed ? 1 : 0);
