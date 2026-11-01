import { decideSpread, drawCards } from "./deck.js";
import { applyQuota } from "./quota.js";
import { cardInstruction, mockReply, systemPrompt } from "./prompt.js";
import { CRISIS_REPLY, isCrisis } from "./safety.js";
import { clip, intEnv, isAllowedOrigin, sanitizeHistory } from "./validate.js";

const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";
const DEFAULT_MISTRAL_MODEL = "mistral-small-latest";
const MISTRAL_TEMPERATURE = 0.7;
const MISTRAL_MAX_TOKENS = 700;

export class ChatQuota {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
  }

  async fetch(request) {
    const body = await request.json();
    const limits = {
      userDaily: intEnv(this.env.USER_DAILY_LIMIT, 20),
      globalDaily: intEnv(this.env.GLOBAL_DAILY_CAP, 400),
      minIntervalMs: intEnv(this.env.MIN_INTERVAL_MS, 4000)
    };
    const outcome = await this.ctx.storage.transaction(async (txn) => {
      const prev = await txn.get("quota");
      const applied = applyQuota(prev, body.userKey, new Date(), limits);
      if (applied.changed) await txn.put("quota", applied.state);
      return {
        ok: applied.ok,
        reason: applied.reason || null,
        remaining: applied.remaining
      };
    });
    return Response.json(outcome);
  }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");
    const allowed = isAllowedOrigin(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: allowed ? 204 : 403, headers: corsHeaders(origin, allowed) });
    }

    const url = new URL(request.url);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/health")) {
      return json({ ok: true }, 200, origin, allowed);
    }

    if (request.method !== "POST" || (url.pathname !== "/" && url.pathname !== "/api/chat")) {
      return json({ error: "method", message: "Diese Anfrage kann ich nicht annehmen." }, 405, origin, allowed);
    }
    if (!allowed) {
      return json({ error: "origin", message: "Dieser Chat ist nur über mimiblack.de erreichbar." }, 403, origin, allowed);
    }

    const raw = await request.text();
    if (raw.length > 20000) {
      return json({ error: "size", message: "Die Nachricht ist zu groß." }, 400, origin, allowed);
    }
    let payload;
    try {
      payload = JSON.parse(raw);
    } catch {
      return json({ error: "json", message: "Die Nachricht konnte nicht gelesen werden." }, 400, origin, allowed);
    }
    if (!payload || payload.consent !== true) {
      return json({ error: "consent", message: "Ohne Einwilligung startet der Chat nicht." }, 400, origin, allowed);
    }

    const maxInput = intEnv(env.MAX_INPUT_CHARS, 800) || 800;
    const message = clip(payload.message, maxInput);
    if (!message) {
      return json({ error: "empty", message: "Schreib mir zuerst ein paar Worte." }, 400, origin, allowed);
    }
    if (String(payload.message || "").trim().length > maxInput) {
      return json({ error: "length", message: `Bitte fass dich kürzer als ${maxInput} Zeichen.` }, 400, origin, allowed);
    }

    const spread = payload.spread;
    if (spread != null && spread !== "none" && spread !== "one" && spread !== "three") {
      return json({ error: "spread", message: "Diese Legung kenne ich nicht." }, 400, origin, allowed);
    }

    const history = sanitizeHistory(
      payload.history,
      intEnv(env.MAX_HISTORY, 8) || 8,
      intEnv(env.MAX_HISTORY_CHARS, 1200) || 1200
    );

    const turnstileOk = await verifyTurnstile(request, env, payload.turnstileToken);
    if (!turnstileOk) {
      return json({ error: "turnstile", message: "Die Prüfung hat nicht geklappt. Bitte lade die Seite neu und versuch es noch einmal." }, 403, origin, allowed);
    }
    if (env.MOCK_MISTRAL !== "1" && (!env.MISTRAL_API_KEY || !env.QUOTA_SALT)) {
      return json({ error: "config", message: "Der Chat ist noch nicht eingerichtet." }, 503, origin, allowed);
    }
    if (isCrisis(message)) {
      return json({ reply: CRISIS_REPLY, cards: [], remaining: null }, 200, origin, allowed);
    }

    let quota;
    try {
      quota = await consumeQuota(request, env);
    } catch {
      return json({ error: "quota", message: "Der Chat ist gerade nicht erreichbar. Bitte versuch es später noch einmal." }, 503, origin, allowed);
    }
    if (!quota.ok) {
      const messageByReason = {
        user: "Für heute sind deine 20 Nachrichten aufgebraucht. Morgen ist wieder Platz.",
        global: "Heute haben schon sehr viele Menschen mit Mimi gesprochen. Morgen geht es weiter.",
        slow: "Einen kleinen Moment noch, dann kannst du wieder schreiben."
      };
      return json({
        error: "rate",
        reason: quota.reason,
        message: messageByReason[quota.reason] || "Bitte warte einen Moment."
      }, 429, origin, allowed);
    }

    const cards = drawCards(decideSpread(message, spread));
    const safeHistory = sanitizeHistory(
      history.filter((item) => !isCrisis(item.text)),
      intEnv(env.MAX_HISTORY, 8) || 8,
      intEnv(env.MAX_HISTORY_CHARS, 1200) || 1200
    );
    let reply;
    let mock = false;
    try {
      if (env.MOCK_MISTRAL === "1") {
        reply = mockReply(message, cards);
        mock = true;
      } else {
        reply = await callMistral(env, safeHistory, message, cards);
      }
    } catch {
      return json({ error: "model", message: "Mimi ist gerade nicht erreichbar. Bitte versuch es gleich noch einmal." }, 502, origin, allowed);
    }

    return json({ reply, cards, remaining: quota.remaining, mock }, 200, origin, allowed);
  }
};

async function consumeQuota(request, env) {
  const userKey = await hashUser(request, env);
  const id = env.CHAT_QUOTA.idFromName("global");
  const stub = env.CHAT_QUOTA.get(id);
  const response = await stub.fetch("https://quota.internal/check", {
    method: "POST",
    body: JSON.stringify({ userKey })
  });
  if (!response.ok) throw new Error("quota");
  return response.json();
}

async function hashUser(request, env) {
  const ip = request.headers.get("CF-Connecting-IP") || "local";
  const day = new Date().toISOString().slice(0, 10);
  const salt = env.QUOTA_SALT || "mimi-chat";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${salt}|${day}|${ip}`));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
}

async function verifyTurnstile(request, env, token) {
  if (env.MOCK_TURNSTILE === "1") return token === "local-dev";
  if (!env.TURNSTILE_SECRET || typeof token !== "string" || token.length < 10 || token.length > 2048) return false;
  const body = new URLSearchParams();
  body.set("secret", env.TURNSTILE_SECRET);
  body.set("response", token);
  const ip = request.headers.get("CF-Connecting-IP");
  if (ip) body.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
  if (!response.ok) return false;
  const data = await response.json();
  return data.success === true;
}

function mistralModel(env) {
  const raw = typeof env.MISTRAL_MODEL === "string" ? env.MISTRAL_MODEL.trim() : "";
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(raw) ? raw : DEFAULT_MISTRAL_MODEL;
}

function mistralRole(role) {
  return role === "model" || role === "assistant" ? "assistant" : "user";
}

function mistralText(data) {
  const choice = data?.choices?.[0];
  if (choice?.finish_reason === "content_filter") return "";
  const content = choice?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part && typeof part.text === "string") return part.text;
    return "";
  }).join("").trim();
}

async function callMistral(env, history, message, cards) {
  const messages = [
    { role: "system", content: systemPrompt() },
    ...history.map((item) => ({ role: mistralRole(item.role), content: item.text })),
    { role: "user", content: `${cardInstruction(cards)}\n\nNachricht:\n${message}` }
  ];
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: mistralModel(env),
      messages,
      temperature: MISTRAL_TEMPERATURE,
      max_tokens: MISTRAL_MAX_TOKENS
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) {
    console.error("mistral_http_error", response.status);
    throw new Error("mistral");
  }
  const data = await response.json();
  const text = mistralText(data);
  if (!text) {
    return "Dazu kann ich nichts sagen. Ich bin eine virtuelle Figur und bleibe bei der Unterhaltung, ohne Rat zu Gesundheit, Psyche, Recht oder Geld. Magst du eine andere Frage oder eine Karte?";
  }
  return text.slice(0, 4000);
}

function corsHeaders(origin, allowed) {
  const headers = new Headers({
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer"
  });
  if (allowed && origin) headers.set("access-control-allow-origin", origin);
  return headers;
}

function json(body, status, origin, allowed) {
  const headers = corsHeaders(origin, allowed);
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}
