export function isAllowedOrigin(origin) {
  if (!origin || typeof origin !== "string") return false;
  return origin === "https://mimiblack.de"
    || /^http:\/\/localhost(?::\d+)?$/.test(origin)
    || /^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(origin);
}

export function sanitizeHistory(input, maxMessages, maxChars) {
  if (!Array.isArray(input)) return [];
  const cleaned = [];
  const rows = input.slice(-Math.max(maxMessages * 2, maxMessages));
  for (const item of rows) {
    if (!item || typeof item !== "object") continue;
    const role = item.role === "model" || item.role === "assistant"
      ? "model"
      : item.role === "user"
        ? "user"
        : null;
    if (!role) continue;
    const source = typeof item.text === "string"
      ? item.text
      : typeof item.content === "string"
        ? item.content
        : "";
    const text = clip(source, maxChars);
    if (!text) continue;
    const prev = cleaned[cleaned.length - 1];
    if (prev && prev.role === role) {
      prev.text = clip(`${prev.text}\n${text}`, maxChars);
      continue;
    }
    cleaned.push({ role, text });
  }
  while (cleaned.length && cleaned[0].role !== "user") cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].role === "user") cleaned.pop();
  return cleaned.slice(-maxMessages);
}

export function clip(value, maxChars) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxChars);
}

export function intEnv(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}
