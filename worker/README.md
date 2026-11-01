# Mimi-Chat: der kleine Dienst hinter der Chat-Seite

Die Chat-Seite liegt als normale HTML-Datei im Ordner `chat/`. Sie spricht mit diesem Dienst. Der Dienst fragt bei Mistral AI (La Plateforme, EU) nach einer Antwort. Kartenziehen passiert hier im Programm, nicht im KI-Modell.

Nichts davon ist live, solange du diesen Dienst nicht selbst bei Cloudflare veröffentlichst **und** die beiden Platzhalter in `chat/index.html` einsetzt **und** den Zweig `mimi-chat` erst nach deiner Prüfung nach `main` holst. `main` ist die live Website. Dieser Ordner allein ändert die live Website nicht.

## Was du vorher brauchst

1. Ein Konto bei Mistral AI (La Plateforme) mit einem **bezahlten** API-Schlüssel und einem **Ausgabenlimit** im Konto, soweit Mistral eines anbietet. Ein kostenloser Schlüssel darf nicht benutzt werden. In der Konsole unter Admin → Privacy den Schalter „Anonymous improvement data“ für die **API** ausschalten, damit Eingaben nicht zum Training verwendet werden. Der Schalter für Vibe gilt dafür nicht. Optional und getrennt davon: Zero Data Retention für die bezahlte API einschalten, sonst gelten die Aufbewahrungsfristen aus der Datenschutzerklärung. Kein Labs- oder Vorschau-Modell verwenden.
2. Ein Cloudflare-Konto (für den Worker und für Turnstile).
3. Node.js 20 oder neuer auf dem Rechner, mit dem du die Befehle ausführst.

Aktuelle Preise stehen bei Mistral, nicht in diesem Text: <https://mistral.ai/pricing>. Das Tageslimit im Dienst (unten) bremst die Menge, ersetzt aber kein Ausgabenlimit bei Mistral.

## Warum ein Durable Object und nicht das Rate-Limiting-Binding

Cloudflare hat ein Rate-Limiting-Binding. Das kann nur Fenster von **10 oder 60 Sekunden**, zählt **je Standort nur ungefähr** und fasst die Standorte nicht zu einem weltweiten Tageszähler zusammen. Der Chat braucht zwei feste Tagesgrenzen, die um Mitternacht (UTC) neu beginnen:

- etwa **20 Nachrichten pro Person und Tag** (Person = Hash der IP-Adresse, nicht der Name)
- ein **globales Tageslimit** (voreingestellt 400 Nachrichten für alle zusammen)

Dafür gibt es **ein** Durable Object namens `ChatQuota`. Es merkt sich für den laufenden UTC-Tag nur Zähler: einen Hash der IP, die Anzahl und den Zeitpunkt der letzten Nachricht. Der Chat-Text steht dort nicht. Am nächsten Tag wird der Eintrag ersetzt. Fällt der Speicher aus, wird **keine** Anfrage an Mistral geschickt (lieber kurz gesperrt als eine offene Rechnung).

Grenze: Zwei Menschen hinter derselben IP teilen sich die 20 Nachrichten. Das ist der Kompromiss, weil wir keine Konten anlegen.

Zwischen zwei Nachrichten derselben Person liegen mindestens 4 Sekunden (`MIN_INTERVAL_MS`), damit ein Doppelklick nicht das Kontingent und das Budget leert.

Die Zahlen stehen in `wrangler.toml` unter `[vars]`. Nach einer Änderung musst du den Dienst neu veröffentlichen (`npx wrangler deploy`).

## Geheimnisse

Diese drei Werte gehören **nur** in Cloudflare, nie in den Code, nie in Git, nie in die HTML-Seite:

| Geheimnis | Was es ist |
| --- | --- |
| `MISTRAL_API_KEY` | Bezahlter Schlüssel aus der Mistral-Konsole (La Plateforme) |
| `TURNSTILE_SECRET` | Geheimer Schlüssel des Turnstile-Widgets |
| `QUOTA_SALT` | Ein langer Zufallstext, damit aus der IP kein rückwärts lesbarer Speicherwert wird |

In `chat/index.html` stehen nur zwei **öffentliche** Platzhalter: die Adresse dieses Dienstes und der öffentliche Turnstile-Site-Key. Der geheime Turnstile-Schlüssel bleibt hier.

## Lokal ausprobieren, ohne Mistral-Schlüssel

Im Ordner `worker/`:

```bash
npm install
cp .dev.vars.example .dev.vars
npm run dev
```

`npm run dev` startet `wrangler dev`, normalerweise unter <http://127.0.0.1:8787>. `.dev.vars` schaltet zwei Attrappen ein: Antworten werden lokal gebaut, und die Mensch-Prüfung akzeptet nur das Test-Kennwort der Chat-Seite. Diese Datei wird nicht mitveröffentlicht.

In einem zweiten Fenster, im Hauptordner der Website:

```bash
python3 -m http.server 8080
```

Dann im Browser <http://127.0.0.1:8080/chat/> öffnen. Die Chat-Seite spricht auf dem eigenen Rechner automatisch mit `http://127.0.0.1:8787`. Auf der echten Domain tut sie das nicht.

Automatische Prüfung der Karten und Zähler:

```bash
npm test
```

## Live schalten, Schritt für Schritt

Mach das erst, wenn du den Pull Request gelesen hast. Die Website auf `main` zeigt den Chat sonst mit dem Hinweis, dass er noch nicht verbunden ist, solange die Platzhalter in `chat/index.html` stehen.

### 1. Mistral, bezahlt, mit Ausgabenlimit

1. Öffne <https://console.mistral.ai/> und melde dich an (La Plateforme, Mistral AI SAS, Paris).
2. Schalte einen **bezahlten** Tarif frei (Pay-as-you-go oder ein Plan mit Abrechnung). Ein kostenloser Schlüssel ist für diesen Chat nicht vorgesehen.
3. Erzeuge einen API-Schlüssel. Kopiere ihn in einen Passwortspeicher, nicht in eine Datei im Projekt.
4. Setze in der Konsole ein Ausgabenlimit, soweit dein Konto das anbietet. Ohne diese Grenze kann eine Schleife Kosten erzeugen. Das globale Tageslimit von 400 ist nur die Bremse in diesem Dienst.
5. Unter Admin → Privacy den Schalter „Anonymous improvement data“ für die **API** ausschalten. Zusätzlich prüfen, ob Zero Data Retention für dieses Konto eingeschaltet werden soll. Die Stellen mit `OWNER-CHECK` in der Datenschutzerklärung und der Hinweis im Pull Request sagen, was du an den aktuellen Mistral-Texten gegenzulesen hast.
6. Das Modell steht in `wrangler.toml` unter `MISTRAL_MODEL` und ist voreingestellt `mistral-small-latest`. Ein anderes Modell nur eintragen, wenn es kein Labs- oder Vorschau-Modell ist. Danach den Dienst neu veröffentlichen.

### 2. Turnstile

1. Cloudflare-Dashboard öffnen → **Turnstile** → Widget hinzufügen.
2. Hostnamen: `mimiblack.de` und zum Testen `localhost`.
3. Modus: Managed.
4. Den **Site Key** (öffentlich) gleich für Schritt 4 bereithalten.
5. Den **Secret Key** nicht in die Website schreiben.

### 3. Dienst veröffentlichen

Im Ordner `worker/`, auf dem Rechner, einmalig `npx wrangler login` ausführen und dem Konto zustimmen.

```bash
cd worker
npm install
npx wrangler secret put MISTRAL_API_KEY
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put QUOTA_SALT
npx wrangler deploy
```

Bei jeder Zeile mit `secret put` fragt das Programm nach dem Wert. `QUOTA_SALT` kann ein langer Zufallssatz sein, den du dir nicht merken musst. Am Ende zeigt Wrangler eine Adresse wie `https://mimi-chat.<dein-name>.workers.dev`. Die brauchst du im nächsten Schritt.

Es gibt absichtlich **keine** Route auf `mimiblack.de`. Die Chat-Seite ruft die workers.dev-Adresse auf. So bleibt die normale Website unabhängig von diesem Dienst.

### 4. Die zwei Platzhalter in der Chat-Seite

Datei `chat/index.html`, im Skript ganz unten die beiden Konstanten:

- `WORKER_URL`: die Adresse aus `wrangler deploy` einsetzen, mit `https://`, ohne Schrägstrich am Ende.
- `TURNSTILE_SITE_KEY`: den öffentlichen Site Key aus Turnstile einsetzen.

Diese Änderung gehört in Git und wird erst mit dem Merge auf `main` für alle sichtbar. Solange dort noch `YOUR-SUBDOMAIN` oder `TURNSTILE_SITE_KEY_HIER_EINSETZEN` steht, schickt die live Seite keine Nachrichten los.

### 5. Kurz prüfen

1. `https://mimiblack.de/chat/` öffnen (erst nach dem Merge).
2. Ohne Häkchen darf kein Gespräch starten.
3. Mit Häkchen eine kurze Frage senden. Eine Karte muss als gezeichnete Textkarte erscheinen, nicht als generiertes Bild.
4. In Cloudflare unter dem Worker keine Protokollierung von Anfrage-Inhalten einschalten. Der Code schreibt den Nachrichtentext nicht ins Log. `npx wrangler tail` zeigt deshalb keine Chat-Inhalte, kann aber weiterhin technische Fehlercodes zeigen.

## Was der Dienst bewusst nicht tut

- Er speichert keine Chatverläufe, keine Namen und keine Geburtsdaten.
- Er schreibt den Nachrichtentext nicht in Logs.
- Er schickt nur die kurze Historie mit, die der Browser für dieses Tab im Arbeitsspeicher hält (höchstens 8 Wechsel, vom Browser geschickt, hier nicht abgelegt).
- Er ruft nur die Chat-Completions von Mistral auf. Keine Agents, keine Datei-API, keine Conversations und kein Batch. Die Systemanweisung geht als Nachricht mit der Rolle `system` mit.
- Er erlaubt im Browser nur `https://mimiblack.de` sowie `http://localhost` und `http://127.0.0.1` mit beliebigem Port. `www.mimiblack.de` ist nicht freigegeben. Wenn die Website auch unter `www` läuft, muss das vor dem Livegang ergänzt werden.
- Karten: 78 Blatt, deutsche Namen, aufrecht oder umgekehrt, Zufall über `crypto.getRandomValues`. Das Modell bekommt die schon gezogenen Karten nur zum Deuten.

## CORS und Limits noch einmal in einem Satz

Fremde Websites können den Dienst nicht aus dem Browser aufrufen. Jede Person kommt auf etwa 20 Nachrichten am UTC-Tag, alle zusammen auf 400, jede einzelne Nachricht auf 800 Zeichen. Die Zahlen kannst du in `wrangler.toml` ändern und danach neu veröffentlichen.

## Wenn etwas schiefgeht

- „Der Chat ist noch nicht eingerichtet.“ Der bezahlte Mistral-Schlüssel fehlt in den Geheimnissen, oder es wurde aus Versehen die lokale Attrappe erwartet.
- „Die Prüfung hat nicht geklappt.“ Site Key und Secret Key gehören nicht zusammen, oder der Hostname in Turnstile ist nicht `mimiblack.de`.
- „Für heute sind deine 20 Nachrichten aufgebraucht.“ Das Tageslimit. Es setzt sich um 00:00 UTC zurück, also nachts nach deutscher Zeit.
- Antwort bleibt aus und im Cloudflare-Konto taucht ein Fehler auf: Das Modell kommt aus der Variablen `MISTRAL_MODEL` (voreingestellt `mistral-small-latest`). Wenn Mistral einen Namen einmal nicht mehr annimmt, trägst du den neuen Namen in `wrangler.toml` ein und veröffentlichst den Dienst neu. Der Aufruf geht an `https://api.mistral.ai/v1/chat/completions`.
