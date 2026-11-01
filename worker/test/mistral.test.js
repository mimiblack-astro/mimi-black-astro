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
    MISTRAL_API_KEY: "test-key",
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

function installFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const target = String(url);
    calls.push({ url: target, init });
    if (target.includes("challenges.cloudflare.com")) {
      return Response.json({ success: true });
    }
    return handler(target, init, calls);
  };
  return calls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("chat completion sends a system message and bearer auth to Mistral", async () => {
  const calls = installFetch(async (target) => {
    assert.equal(target, "https://api.mistral.ai/v1/chat/completions");
    return Response.json({
      choices: [{ finish_reason: "stop", message: { role: "assistant", content: "Hallo von Mistral" } }]
    });
  });

  const response = await worker.fetch(chatRequest("Wie ist die Stimmung heute?", [
    { role: "user", text: "Guten Tag" },
    { role: "model", text: "Schön, dass du da bist." }
  ]), env({ MISTRAL_MODEL: "mistral-small-latest" }));
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.reply, "Hallo von Mistral");
  assert.equal(body.mock, false);
  const mistralCall = calls.find((call) => call.url.includes("api.mistral.ai"));
  assert.equal(mistralCall.init.method, "POST");
  assert.equal(mistralCall.init.headers.authorization, "Bearer test-key");
  const payload = JSON.parse(mistralCall.init.body);
  assert.equal(payload.model, "mistral-small-latest");
  assert.equal(payload.temperature, 0.7);
  assert.equal(payload.max_tokens, 700);
  assert.equal(payload.messages[0].role, "system");
  assert.match(payload.messages[0].content, /Du bist Mimi/);
  assert.deepEqual(payload.messages.slice(1).map((item) => item.role), ["user", "assistant", "user"]);
  assert.equal(payload.messages[1].content, "Guten Tag");
  assert.equal(payload.messages[2].content, "Schön, dass du da bist.");
  assert.match(payload.messages[3].content, /Wie ist die Stimmung heute\?/);
  assert.equal(payload.messages.some((item) => item.role === "model"), false);
  assert.doesNotMatch(JSON.stringify(body), /test-key/);
});

test("an unknown model var falls back to mistral-small-latest", async () => {
  let model = "";
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    model = JSON.parse(init.body).model;
    return Response.json({
      choices: [{ message: { content: [{ type: "text", text: "In Teilen geantwortet" }] } }]
    });
  };

  const response = await worker.fetch(chatRequest("Nur ein Satz."), env({ MISTRAL_MODEL: "nicht erlaubt" }));
  const body = await response.json();
  assert.equal(model, "mistral-small-latest");
  assert.equal(body.reply, "In Teilen geantwortet");
});

test("a custom MISTRAL_MODEL is sent as given", async () => {
  let model = "";
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    model = JSON.parse(init.body).model;
    return Response.json({ choices: [{ message: { content: "ok" } }] });
  };
  const response = await worker.fetch(chatRequest("Kurz."), env({ MISTRAL_MODEL: "mistral-large-latest" }));
  assert.equal(response.status, 200);
  assert.equal(model, "mistral-large-latest");
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

test("an empty model reply becomes the safe fallback", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("challenges.cloudflare.com")) return Response.json({ success: true });
    return Response.json({ choices: [{ finish_reason: "content_filter", message: { content: "weg" } }] });
  };
  const response = await worker.fetch(chatRequest("Hallo."), env());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.reply, /Dazu kann ich nichts sagen/);
});

test("a crisis message never calls Mistral", async () => {
  let called = false;
  globalThis.fetch = async (url) => {
    if (String(url).includes("api.mistral.ai")) called = true;
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

test("the local mock does not call Mistral", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    throw new Error("fetch should not run");
  };
  const response = await worker.fetch(chatRequest("Hallo lokal.", [], "local-dev"), env({
    MOCK_MISTRAL: "1",
    MOCK_TURNSTILE: "1",
    MISTRAL_API_KEY: undefined,
    TURNSTILE_SECRET: undefined
  }));
  const body = await response.json();
  assert.equal(called, false);
  assert.equal(body.mock, true);
  assert.match(body.reply, /virtuelle Figur/);
});
