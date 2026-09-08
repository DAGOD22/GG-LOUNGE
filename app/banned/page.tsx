import { Ban } from "lucide-react";

export default function BannedPage() {
  return (
    <main className="admin-shell">
      <section className="admin-login">
        <div className="admin-lock">
          <Ban />
        </div>
        <p className="eyebrow">GG-LOUNGE™ / MODERATION</p>
        <h1>You’re banned.</h1>
        <p>
          This visitor was blocked by a lounge admin. If you think this is a mistake, talk to the
          admin who runs this lounge.
        </p>
        <a className="admin-back" href="/">
          Back to lounge
        </a>
      </section>
    </main>
  );
}
