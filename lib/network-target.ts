import { BlockList, isIP } from 'node:net';
import { lookup } from 'node:dns';
const blocked = new BlockList();
for (const [ip, bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(ip,bits,'ipv4');
for (const [ip, bits] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]] as const) blocked.addSubnet(ip,bits,'ipv6');
export function isPublicAddress(ip: string): boolean {
  const family = isIP(ip);
  return Boolean(family) && !blocked.check(ip, family === 4 ? 'ipv4' : 'ipv6');
}
export function assertPublicTarget(url: Readonly<URL>): void {
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) || url.username || url.password || (url.port && !['80','443'].includes(url.port)) || /(^|\.)(localhost|local|internal)$/.test(host) || (isIP(host) && !isPublicAddress(host))) throw new Error('Only public HTTP(S) destinations on ports 80/443 are allowed.');
}
// Node 22 may request an array for autoSelectFamily even through a legacy
// LookupOne callback. Preserve that contract instead of returning undefined IPs.
export const publicLookup: typeof lookup = ((hostname: string, options: { all?: boolean; family?: number }, callback: (...args: any[]) => void) => {
  lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);
    if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(Object.assign(new Error('Private network destinations are blocked.'), { code: 'EACCES' }));
    if (options.all) callback(null, addresses);
    else callback(null, addresses[0].address, addresses[0].family);
  });
}) as typeof lookup;
