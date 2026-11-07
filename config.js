/* Same Firebase project as 75 Hard, so the same two Google sign-ins work and
 * nothing new had to be set up. This app keeps everything under /shamrock in
 * the database and never touches the 75 Hard branches.
 *
 * The Firebase web config is public by design. The security rules are what
 * keep anyone else out, and the email addresses live only there (built from
 * the gitignored emails.local.json by tools/build-rules.mjs). */

export const FIREBASE = {
  apiKey: "AIzaSyCUXgLZkxoNUZpjtx-jyPnEMw232r9hY3U",
  authDomain: "hard-1599c.firebaseapp.com",
  databaseURL: "https://hard-1599c-default-rtdb.firebaseio.com",
  projectId: "hard-1599c",
  storageBucket: "hard-1599c.firebasestorage.app",
  messagingSenderId: "132417017058",
  appId: "1:132417017058:web:e2bb6a905b5b77f8ccbabb"
};

/* Starting values only. Threshold HR is editable from the Us tab.
 * minDays: under this many workout days in a week (alt cardio counts) the
 * week shows "Below plan" (Mary, 7 Nov). */
export const PEOPLE = [
  { id: "mary", name: "Mary", tz: "America/New_York", place: "Virginia", lt: 167, minDays: 4 },
  { id: "jon",  name: "Jon",  tz: "America/Denver",   place: "Utah",     lt: 167, minDays: 3 }
];
