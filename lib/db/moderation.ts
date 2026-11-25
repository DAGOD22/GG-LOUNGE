/** Static checks on uploaded game HTML — used to flag risky bundles for review. */
export function scanHtmlForRisks(html: string): string[] {
  const risks: string[] = [];
  if (/<script[^>]*src=["']https?:\/\/[^"']+["']/i.test(html)) risks.push("external-script");
  if (/eval\s*\(|Function\s*\(|\bimport\s*\(/i.test(html)) risks.push("obfuscated-code");
  if (/fetch\s*\(\s*["']https?:/i.test(html)) risks.push("external-fetch");
  if (/<iframe[^>]*src=["']https?:/i.test(html)) risks.push("iframe-embed");
  if (/document\.write\s*\(/i.test(html)) risks.push("document-write");
  if (/(?:src|href)=["']\/\/(?![^"']*gg-lounge)/i.test(html)) risks.push("protocol-relative");
  return risks;
}
