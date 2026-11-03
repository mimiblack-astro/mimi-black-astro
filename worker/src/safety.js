const CRISIS_RE = /(suizid|selbstmord|selbsttöt|selbstverletz|\britz(en|e)?\b|ich will (nicht mehr leben|sterben)|ich möchte sterben|ich moechte sterben|lebensmüde|lebensmuede|umbringen)/i;

export function isCrisis(text) {
  return CRISIS_RE.test(String(text || ""));
}

export const CRISIS_REPLY = "Es tut mir leid, dass es dir gerade so schwer ist. Ich bin nur eine virtuelle Figur und kann in einer Krise nicht helfen. Bitte wende dich an die Telefonseelsorge: 0800 111 0 111 oder 116 123. Beides ist kostenlos und rund um die Uhr erreichbar. Wenn du in akuter Gefahr bist, ruf den Notruf 112 an.";
