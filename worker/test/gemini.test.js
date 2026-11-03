import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/index.js";

const originalFetch = globalThis.fetch;

function quotaBinding(outcome = { ok: true, remaining: 19 }) {
  return {
    idFromName() {
      return "id";
    },
    get() {
      return {
        fetch: async () => Response.json(outcome)
      };
    }
  };
}

function env(overrides = {}) {
  return {
    GEMINI_API_KEY: "test-key",
    QUOTA_SALT: "salt",
    TURNSTILE_SECRET: "turnstile-secret-value",
    CHAT_QUOTA: quotaBinding(),
    ...overrides
  };
}

function chatRequest(message, history = [], token = "turnstile-token-ok") {
  return new Request("https://mimi-chat.example/api/chat", {
    method: "POST",
    headers: {
      origin: "https://mimiblack.de",
      "content-type": "application/json",
      "CF-Connecting-IP": "203.0.113.8"
    },
    body: JSON.stringify({
      consent: true,
      message,
      history,
      spread: "none",
      turnstileToken: token
    })
  });
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("generateContent sends systemInstruction and the API key to Gemini", async () => {
  let captured;
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    if (target.includes("challenges.cloudflare.com")) return Response.json({ success: true });
    captured = { url: target, init };
    return Response.json({
      candidates: [{
        content: { parts: [{ text: "Hallo " }, { text: "von Gemini" }] }
      }]
    });
  };

  const response = await worker.fetch(chatRequest("Wie ist die Stimmung heute?", [
    { role: "user", text: "Guten Tag" },
    { role: "model", text: "Schön, dass du da bist." }
  ]), env({ GEMINI_MODEL: "gemini-2.5-flash-lite" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reply, "Hallo von Gemini");
  assert.equal(body.mock, false);
  assert.equal(
    captured.url,
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent"
  );
  assert.equal(captured.init.method, "POST");
  assert.equal(captured.init.headers["x-goog-api-key"], "test-key");
  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.systemInstruction.parts[0].text.includes("Du bist Mimi"), true);
  assert.equal(payload.generationConfig.temperature, 0.8);
  assert.equal(payload.generationConfig.maxOutputTokens, 700);
  assert.deepEqual(payload.contents.map((item) => item.role), ["user", "model", "user"]);
  assert.equal(payload.contents[0].parts[0].text, "Guten Tag");
  assert.equal(payload.contents[1].parts[0].text, "Schön, dass du da bist.");
  assert.match(payload.contents[2].parts[0].text, /Wie ist die Stimmung heute\?/);
  assert.equal(payload.messages, undefined);
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("an unknown model var falls back to gemini-2.5-flash-lite", async () => {
  let called = "";
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("challenges.cloudflare.com")) return Response.json({ success: true });
    called = target;
    return Response.json({
      candidates: [{ content: { parts: [{ text: "Fallback-Modell" }] } }]
    });
  };
  const response = await worker.fetch(chatRequest("Nur ein Satz."), env({ GEMINI_MODEL: "nicht erlaubt" }));
  const body = await response.json();
  assert.equal(body.reply, "Fallback-Modell");
  assert.match(called, /\/models\/gemini-2\.5-flash-lite:generateContent$/);
});

test("a custom GEMINI_MODEL is used in the generateContent URL", async () => {
  let called = "";
  globalThis.fetch = async (url) => {
    const target = String(url);
    if (target.includes("challenges.cloudflare.com")) return Response.json({ success: true });
    called = target;
    return Response.json({ candidates: [{ content: { parts: [{ text: "ok" }] } }] });
  };
  const response = await worker.fetch(chatRequest("Kurz."), env({ GEMINI_MODEL: "gemini-2.5-flash" }));
  assert.equal(response.status, 200);
  assert.match(called, /\/models\/gemini-2\.5-flash:generateContent$/);
});

test("an upstream error stays a generic 502 and does not echo the key", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    return new Response("upstream leaked test-key", { status: 401 });
  };
  const response = await worker.fetch(chatRequest("Hallo."), env());
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error, "model");
  assert.doesNotMatch(JSON.stringify(body), /test-key|upstream leaked/);
});

test("a blocked model reply becomes the safe fallback", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    return Response.json({
      promptFeedback: { blockReason: "SAFETY" },
      candidates: [{ content: { parts: [{ text: "weg" }] } }]
    });
  };
  const response = await worker.fetch(chatRequest("Hallo."), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.reply, /Dazu kann ich nichts sagen/);
});

test("a crisis message never calls Gemini", async () => {
  let called = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("generativelanguage.googleapis.com")) called = true;
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    throw new Error(`unexpected ${url}`);
  };
  const response = await worker.fetch(chatRequest("Ich habe Suizidgedanken"), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(called, false);
  assert.match(body.reply, /0800 111 0 111/);
  assert.deepEqual(body.cards, []);
});

test("the local mock does not call Gemini", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not run");
  };
  const response = await worker.fetch(chatRequest("Hallo lokal.", [], "local-dev"), env({
    MOCK_GEMINI: "1",
    MOCK_TURNSTILE: "1",
    GEMINI_API_KEY: undefined,
    TURNSTILE_SECRET: undefined
  }));
  const body = await response.json();
  assert.equal(called, false);
  assert.equal(body.mock, true);
  assert.match(body.reply, /virtuelle Figur/);
});
