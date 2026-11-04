// Organizer: import the approved guests from a Luma guest export (CSV) as one-way hashes.
// Raw emails are read locally and never stored, logged or sent anywhere.
// Run: npx tsx --env-file=.env.local scripts/attendees-import.ts <guests.csv> [--event evt-…] [--all]
//   --all  import every row (default: only rows whose approval_status is "approved", when that column exists)
import { readFileSync } from "node:fs";
import { looksLikeEmail } from "../lib/attendee-hash";
import { attendeeCount, attendeeEventId, attendeeHash, importAttendeeHashes } from "../lib/attendees";

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}

function main() {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const eventFlag = args.find((a) => a.startsWith("--event="))?.split("=")[1];
  const all = args.includes("--all");
  const eventId = eventFlag ?? attendeeEventId();
  if (!file) throw new Error("usage: attendees-import.ts <guests.csv> [--event=evt-…] [--all]");
  if (!eventId) throw new Error("set LUMA_EVENT_ID or pass --event=evt-…");

  const [header, ...rows] = parseCsv(readFileSync(file, "utf8"));
  const col = (names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));
  const emailCol = col(["email", "email address", "e-mail"]);
  const statusCol = col(["approval_status", "approval status", "status"]);
  if (emailCol < 0) throw new Error(`no email column in the header (${header.length} columns)`);

  let skipped = 0;
  const hashes: string[] = [];
  for (const r of rows) {
    const email = r[emailCol] ?? "";
    const approved = all || statusCol < 0 || (r[statusCol] ?? "").trim().toLowerCase() === "approved";
    if (!approved || !looksLikeEmail(email)) { skipped++; continue; }
    hashes.push(attendeeHash(eventId, email));
  }
  const added = importAttendeeHashes(eventId, hashes);
  console.log(`event ${eventId}: ${hashes.length} approved guests hashed, ${added} new, ${skipped} rows skipped; ${attendeeCount(eventId)} hashes on the list. No emails were stored.`);
}

try { main(); } catch (e) { console.error(`import failed: ${(e as Error).message}`); process.exit(1); }
