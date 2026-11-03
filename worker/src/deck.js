const MAJOR = [
  [0, "Der Narr"],
  [1, "Der Magier"],
  [2, "Die Hohepriesterin"],
  [3, "Die Herrscherin"],
  [4, "Der Herrscher"],
  [5, "Der Hierophant"],
  [6, "Die Liebenden"],
  [7, "Der Wagen"],
  [8, "Die Kraft"],
  [9, "Der Eremit"],
  [10, "Das Rad des Schicksals"],
  [11, "Die Gerechtigkeit"],
  [12, "Der Gehängte"],
  [13, "Der Tod"],
  [14, "Die Mäßigkeit"],
  [15, "Der Teufel"],
  [16, "Der Turm"],
  [17, "Der Stern"],
  [18, "Der Mond"],
  [19, "Die Sonne"],
  [20, "Das Gericht"],
  [21, "Die Welt"]
];

const SUITS = [
  ["staebe", "Stäbe"],
  ["kelche", "Kelche"],
  ["schwerter", "Schwerter"],
  ["muenzen", "Münzen"]
];

const RANKS = [
  ["ass", "Ass"],
  ["zwei", "Zwei"],
  ["drei", "Drei"],
  ["vier", "Vier"],
  ["fuenf", "Fünf"],
  ["sechs", "Sechs"],
  ["sieben", "Sieben"],
  ["acht", "Acht"],
  ["neun", "Neun"],
  ["zehn", "Zehn"],
  ["bube", "Bube"],
  ["ritter", "Ritter"],
  ["koenigin", "Königin"],
  ["koenig", "König"]
];

export function buildDeck() {
  const deck = MAJOR.map(([n, name]) => ({
    id: `grosse-arkana-${n}`,
    name,
    arcana: "Große Arkana",
    suit: null,
    glyph: String(n)
  }));
  for (const [suitId, suit] of SUITS) {
    for (const [rankId, rank] of RANKS) {
      deck.push({
        id: `${suitId}-${rankId}`,
        name: `${rank} der ${suit}`,
        arcana: "Kleine Arkana",
        suit,
        glyph: suitGlyph(suit)
      });
    }
  }
  return deck;
}

function suitGlyph(suit) {
  if (suit === "Stäbe") return "❘";
  if (suit === "Kelche") return "∪";
  if (suit === "Schwerter") return "†";
  return "●";
}

function randomInt(max) {
  const range = 0x100000000;
  const limit = range - (range % max);
  const buf = new Uint32Array(1);
  let value = 0;
  do {
    crypto.getRandomValues(buf);
    value = buf[0];
  } while (value >= limit);
  return value % max;
}

export function drawCards(count) {
  const n = Math.max(0, Math.min(3, count | 0));
  const pool = buildDeck();
  const drawn = [];
  for (let i = 0; i < n; i += 1) {
    const index = randomInt(pool.length);
    const card = pool.splice(index, 1)[0];
    const reversed = randomInt(2) === 1;
    drawn.push({
      id: card.id,
      name: card.name,
      arcana: card.arcana,
      suit: card.suit,
      glyph: card.glyph,
      reversed,
      orientationLabel: reversed ? "umgekehrt" : "aufrecht"
    });
  }
  const positions = drawn.length === 1
    ? ["Gezogene Karte"]
    : ["Erste Karte", "Zweite Karte", "Dritte Karte"];
  return drawn.map((card, index) => ({ ...card, position: positions[index] }));
}

export function decideSpread(message, requested) {
  if (requested === "one") return 1;
  if (requested === "three") return 3;
  if (requested === "none") return 0;
  const text = String(message || "").toLowerCase();
  if (/ohne karte/.test(text)) return 0;
  const wants = /(karte|karten|tarot|legung|orakel)/.test(text);
  if (!wants) return 0;
  if (/(drei|3)\s*karten|drei-karten|dreierlegung/.test(text)) return 3;
  return 1;
}
