import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDeck, decideSpread, drawCards } from "../src/deck.js";
import { applyQuota } from "../src/quota.js";
import { isCrisis } from "../src/safety.js";
import { isAllowedOrigin, sanitizeHistory } from "../src/validate.js";

test("deck has 78 unique German cards", () => {
  const deck = buildDeck();
  assert.equal(deck.length, 78);
  assert.equal(new Set(deck.map((card) => card.id)).size, 78);
  assert.equal(deck.filter((card) => card.arcana === "Große Arkana").length, 22);
  assert.ok(deck.some((card) => card.name === "Der Stern"));
  assert.ok(deck.some((card) => card.name === "Ass der Münzen"));
  assert.ok(deck.some((card) => card.name === "Königin der Kelche"));
});

test("draw uses only the deck and marks orientation", () => {
  const names = new Set(buildDeck().map((card) => card.name));
  const cards = drawCards(3);
  assert.equal(cards.length, 3);
  assert.equal(new Set(cards.map((card) => card.id)).size, 3);
  for (const card of cards) {
    assert.ok(names.has(card.name));
    assert.equal(typeof card.reversed, "boolean");
    assert.ok(card.orientationLabel === "aufrecht" || card.orientationLabel === "umgekehrt");
  }
  assert.deepEqual(cards.map((card) => card.position), ["Erste Karte", "Zweite Karte", "Dritte Karte"]);
  assert.equal(drawCards(1)[0].position, "Gezogene Karte");
});

test("spread follows the button and otherwise looks for card words", () => {
  assert.equal(decideSpread("Wie wird mein Tag?", "one"), 1);
  assert.equal(decideSpread("irgendwas", "three"), 3);
  assert.equal(decideSpread("Zieh mir bitte eine Karte", "none"), 0);
  assert.equal(decideSpread("Zieh mir bitte eine Karte"), 1);
  assert.equal(decideSpread("Leg mir drei Karten"), 3);
  assert.equal(decideSpread("Erzähl mir vom Mond"), 0);
});

test("quota resets with the UTC day and enforces both caps", () => {
  const limits = { userDaily: 2, globalDaily: 3, minIntervalMs: 1000 };
  const t0 = new Date("2026-11-01T10:00:00.000Z");
  let state = null;
  let first = applyQuota(state, "aaaa", t0, limits);
  state = first.state;
  assert.equal(first.ok, true);
  assert.equal(first.remaining, 1);
  const tooFast = applyQuota(state, "aaaa", new Date(t0.getTime() + 100), limits);
  assert.equal(tooFast.ok, false);
  assert.equal(tooFast.reason, "slow");
  const second = applyQuota(state, "aaaa", new Date(t0.getTime() + 1000), limits);
  state = second.state;
  const third = applyQuota(state, "aaaa", new Date(t0.getTime() + 2000), limits);
  assert.equal(third.reason, "user");
  const other = applyQuota(state, "bbbb", new Date(t0.getTime() + 2000), limits);
  state = other.state;
  const blocked = applyQuota(state, "cccc", new Date(t0.getTime() + 3000), limits);
  assert.equal(blocked.reason, "global");
  const nextDay = applyQuota(state, "aaaa", new Date("2026-11-02T00:00:00.000Z"), limits);
  assert.equal(nextDay.ok, true);
  assert.equal(nextDay.state.global, 1);
  assert.equal(nextDay.state.users.bbbb, undefined);
});

test("history stays short and alternating", () => {
  const history = sanitizeHistory([
    { role: "model", text: "zu früh" },
    { role: "user", text: "Hallo" },
    { role: "user", text: "nochmal" },
    { role: "assistant", text: "x".repeat(50) },
    { role: "user", text: "aktuelle Nachricht darf nicht in der Historie enden" }
  ], 8, 20);
  assert.deepEqual(history.map((item) => item.role), ["user", "model"]);
  assert.equal(history[1].text.length, 20);
});

test("crisis hints refer to help and do not treat the tarot Death card as a crisis", () => {
  assert.equal(isCrisis("Was bedeutet der Tod als Karte?"), false);
  assert.equal(isCrisis("Ich habe Suizidgedanken"), true);
});

test("cors allows only the live site and local testing", () => {
  assert.equal(isAllowedOrigin("https://mimiblack.de"), true);
  assert.equal(isAllowedOrigin("http://localhost:8080"), true);
  assert.equal(isAllowedOrigin("http://127.0.0.1:5500"), true);
  assert.equal(isAllowedOrigin("https://www.mimiblack.de"), false);
  assert.equal(isAllowedOrigin("https://mimiblack.de.evil.example"), false);
  assert.equal(isAllowedOrigin("https://evilmimiblack.de"), false);
  assert.equal(isAllowedOrigin(null), false);
});

test("source keeps the model name and does not embed a key", () => {
  const source = [
    "src/index.js",
    "src/prompt.js",
    "src/deck.js",
    "wrangler.toml"
  ].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8")).join("\n");
  assert.match(source, /gemini-2\.5-flash-lite/);
  assert.doesNotMatch(source, /AIza[0-9A-Za-z\-_]{20,}/);
  assert.doesNotMatch(source, /GEMINI_API_KEY\s*=\s*["'][^"']+["']/);
  assert.doesNotMatch(source, /console\.log\(/);
});
