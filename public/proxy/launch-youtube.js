// Preserve old watch links while moving every launch onto the same proxy.
const params = new URLSearchParams(location.search);
const legacy = location.hash.match(/(?:watch[/?]|[?&]v=)([A-Za-z0-9_-]{11})(?:[&#/]|$)/);
const id = params.get('v') || (legacy && legacy[1]);
const target = id && /^[A-Za-z0-9_-]{11}$/.test(id) ? 'https://www.youtube.com/watch?v=' + id : 'https://www.youtube.com/';
location.replace('/proxy?url=' + encodeURIComponent(target));
