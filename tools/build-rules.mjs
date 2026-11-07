/* Builds the /shamrock branch of the Firebase rules: node tools/build-rules.mjs
 *
 * This app shares a Firebase project with 75 Hard and the NAVS 302 form, and
 * publishing rules replaces the whole ruleset. So this writes ONLY the
 * "shamrock" key to rules.shamrock.json. Add or replace that one key inside
 * the live rules in the console; never paste it over the whole thing.
 *
 * Addresses come from the gitignored emails.local.json.
 *
 * What it enforces:
 *  - Only the two of you can read anything.
 *  - Each person writes only their own people, weeks, log and manual rows.
 *  - Each person writes their own /garmin side; Mary can also write Jon's
 *    (her laptop pulls his runs as a fallback).
 *  - A locked week's lock time, days and swap can't be rewritten, the week
 *    can't be deleted, and the swap can only be set once. */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const emails = JSON.parse(readFileSync(join(repo, "emails.local.json"), "utf8"));
const ids = ["mary", "jon"];
for (const id of ids) if (!String(emails[id] || "").includes("@")) { console.error(`No address for ${id}`); process.exit(1); }

const verified = "auth !== null && auth.token.email_verified === true";
const owner = (id) => `${verified} && auth.token.email === '${emails[id].toLowerCase()}'`;
const either = `${verified} && (${ids.map((id) => `auth.token.email === '${emails[id].toLowerCase()}'`).join(" || ")})`;
const per = (fn) => Object.fromEntries(ids.map((id) => [id, fn(id)]));

// Dates are YYYY-MM-DD, checked by shape rather than regex to keep escaping out of it.
const isDate = (x) => `${x}.length === 10 && ${x}.beginsWith('20')`;
const unlockedOrSame = "(!data.parent().parent().parent().child('lockedAt').exists() || newData.val() === data.val())";

const shamrock = {
  ".read": either,
  "people": per((id) => ({
    ".write": owner(id),
    "email": { ".validate": `newData.val() === '${emails[id].toLowerCase()}'` },
    "lt": { ".validate": "newData.isNumber() && newData.val() >= 140 && newData.val() <= 200" },
    "start": { ".validate": `newData.isString() && ${isDate("newData.val()")}` }
  })),
  "weeks": per((id) => ({
    "$wk": {
      ".write": `${owner(id)} && (!data.child('lockedAt').exists() || newData.child('lockedAt').val() === data.child('lockedAt').val())`,
      ".validate": `${isDate("$wk")} && newData.hasChildren(['days','lockedAt'])`,
      "lockedAt": { ".validate": "newData.isNumber()" },
      "auto": { ".validate": "newData.isBoolean()" },
      "count": { ".validate": "newData.isNumber()" },
      "days": {
        "$d": {
          "k": { ".validate": `newData.isString() && ${unlockedOrSame}` },
          "src": { ".validate": `newData.isString() && ${unlockedOrSame}` },
          "$other": { ".validate": false }
        }
      },
      "swap": {
        ".validate": "!data.exists() && newData.hasChildren(['a','b','at']) && data.parent().child('lockedAt').exists()"
      },
      "$other": { ".validate": false }
    }
  })),
  "log": per((id) => ({
    ".write": owner(id),
    "$d": { ".validate": `${isDate("$d")} && newData.hasChildren(['done','at'])` }
  })),
  "manual": per((id) => ({ ".write": owner(id) })),
  // Each person's own Garmin task writes their side. Mary's laptop also
  // pulls Jon's runs through her account as a fallback, so she can write his.
  "garmin": {
    "mary": { ".write": owner("mary") },
    "jon": { ".write": `${owner("mary")} || ${owner("jon")}` },
    "meta": { ".write": owner("mary") }
  }
};

writeFileSync(join(repo, "rules.shamrock.json"), JSON.stringify({ shamrock }, null, 2) + "\n");
console.log("wrote rules.shamrock.json (the shamrock key only)");
