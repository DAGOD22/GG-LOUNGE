import type { Metadata } from "next";
import { CHATVERSE_COOKIE_NAME, isChatverseMember } from "@/lib/chatverse-auth";
import { ChatverseGate } from "@/components/chatverse/ChatverseGate";
import { ChatverseApp } from "@/components/chatverse/ChatverseApp";

export const dynamic = "force-dynamic";

/**
 * CHATVERSE.
 *
 * A page you have to reach on purpose and unlock with a password. It is
 * `noindex, nofollow` and absent from the sitemap, the command palette and the
 * link map: the door is the URL you were told plus the password, not a link
 * somebody stumbles onto.
 *
 * The session check happens on the server, so an unlocked browser gets the chat
 * bundle and a locked one gets the password field — the chat code never ships to
 * someone who has not typed the password.
 */
export const metadata: Metadata = {
  title: "CHATVERSE",
  description: "Private lounge chat.",
  robots: { index: false, follow: false, nocache: true },
};

export default async function ChatversePage() {
  const member = await isChatverseMember();
  const cookieName = CHATVERSE_COOKIE_NAME;
  return (
    <main id="main-content" className="cv-shell">
      {member ? <ChatverseApp /> : <ChatverseGate cookieName={cookieName} />}
    </main>
  );
}
