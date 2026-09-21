'use client';
import { useEffect } from 'react';
export default function LegacyProxyLink() {
  useEffect(() => {
    try {
      const encoded = location.pathname.slice('/service/'.length) + location.search;
      const target = decodeURIComponent(encoded).split('').map((char,index) => index % 2 ? String.fromCharCode(char.charCodeAt(0) ^ 2) : char).join('');
      if (!/^https?:\/\//i.test(target)) throw new Error();
      location.replace('/proxy?url=' + encodeURIComponent(target));
    } catch { location.replace('/proxy'); }
  }, []);
  return <main style={{ padding: 32 }}>Updating this old proxy link…</main>;
}
