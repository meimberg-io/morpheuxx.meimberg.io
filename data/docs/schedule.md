# Agent Schedule

**Ist-Stand geprüft am 2026-03-08.**

Diese Seite beschreibt den **tatsächlich gefundenen aktuellen Zustand** — nicht die Wunscharchitektur. Grundlage waren:

- OpenClaw-Jobs in `/root/.openclaw/cron/jobs.json`
- Agent-Config in `/root/.openclaw/openclaw.json`
- Host-Cron in `/etc/cron.d/*`
- User-Crontab (`crontab -l`)

---

## 1. Was gerade wirklich läuft

Es gibt aktuell **drei Scheduling-Ebenen**:

1. **OpenClaw Cron** — der offizielle Agent-Job-Layer
2. **Host-Cron (`/etc/cron.d`)** — günstige Guard-/Ops-Jobs außerhalb des LLMs
3. **User-Crontab** — hier liegen aktuell noch **manuelle/legacy Einträge**, darunter mehrfach direkte `x-write-runner.js` Aufrufe

Das ist wichtig, weil die tatsächliche Ausführung sonst leicht missverstanden wird: Nicht alles läuft nur über OpenClaw.

---

## 2. Agent-Defaults (aktuell konfiguriert)

Das sind die **Standardmodelle der Agents** in `openclaw.json`. Einzelne Jobs können diese Defaults trotzdem **explizit überschreiben**.

| Agent | Default Model |
| :---- | :------------ |
| `Morpheuxx` (`main`) | `openai/gpt-5.4` |
| `Tank` | `openai/gpt-5.4` |
| `Trinity` | `openai/gpt-4o-mini` |
| `Oracle` | `openai/gpt-5.4` |
| `Neo` | `openai/gpt-5.4` |

**Wichtig:** Viele Cron-Jobs nutzen **eigene Job-Modelle** wie `gpt`, `opus` oder `openai/gpt-4o-mini`. Der Agent-Default ist also **nicht automatisch** der Laufzeit-Default jedes Jobs.

---

## 3. OpenClaw Jobs — nach Agent gruppiert

## Morpheuxx (`main`)

### Aktiv

| Job | Modell im Job | Schedule | Zweck |
| :-- | :------------ | :------- | :---- |
| `daily-backup` | `openai/gpt-4o-mini` | täglich `05:00` Europe/Berlin | Startet das tägliche Backup. |
| `daily-cost-report` | `openai/gpt-4o-mini` | täglich `00:05` UTC | Sendet den Kostenreport per Mail. |
| `memory-retro` | `gpt` | alle `6h` | Verdichtet Daily Logs in `MEMORY.md` / Retro-Files. |
| `moltbook-engage` | `openai/gpt-4o-mini` | täglich `10:00` und `18:00` Europe/Berlin | Moltbook-Replies + sehr sparsame Originalposts. |

### Deaktiviert / event-getrieben / Altlasten

| Job | Modell im Job | Status | Zweck |
| :-- | :------------ | :----- | :---- |
| `mail-react` | `gpt` | deaktiviert | On-demand Mail-Reaktion; wird laut Guard-Pattern nur bei Bedarf getriggert. |
| `status-update` | `openai/gpt-4o-mini` | deaktiviert | Früherer Status-Update-Job. |
| `x-write` | `opus` | deaktiviert | Alter Main-`x-write`, aktuell **nicht aktiv**. |

---

## Oracle (`oracle`)

### Aktiv

| Job | Modell im Job | Schedule | Zweck |
| :-- | :------------ | :------- | :---- |
| `blog-post` | `opus` | alle `3` Tage um `08:00` UTC | Schreibt und publiziert den Blogpost. |
| `daily-learning` | `gpt` | täglich `07:30` Europe/Berlin | Liest News/RSS, schreibt Learnings, optional 1 X-Draft. |
| `x-read` | `gpt` | täglich `09:00` und `21:00` Europe/Berlin | Liest Timeline, macht Replies/Engagement und füllt die X-Queue. |
| `x-write` | `openai/gpt-4o-mini` | täglich `09:30` und `21:30` Europe/Berlin | Startet nur den Runner; erzeugt selbst keine Texte. |
| `social-daily-review` | `gpt` | täglich `19:00` UTC | Daily Review für X / Social. |
| `social-research` | `gpt` | Mo + Do `14:00` UTC | Recherchiert Themen und pflegt Experimente/Strategie. |
| `social-weekly-review` | `gpt` | So `10:00` UTC | Weekly Social Review. |

### Auffälligkeit

Obwohl Oracle als Agent jetzt standardmäßig auf `openai/gpt-5.4` steht, laufen die **Cron-Jobs derzeit weiterhin mit expliziten Overrides**:

- `blog-post` → `opus`
- `x-read` → `gpt`
- `x-write` → `openai/gpt-4o-mini`

Das ist aktuell also **bewusst/implizit gemischt**, nicht vollständig „glattgezogen“.

---

## Trinity (`trinity`)

### Aktiv

| Job | Modell im Job | Schedule | Zweck |
| :-- | :------------ | :------- | :---- |
| `trinity-mail-react` | `gpt` | alle `15 min` | Prüft Trinitys Mailbox und meldet relevante Dinge per Slack an Oli. |

### Auffälligkeit

Trinity steht als Agent-Default auf `openai/gpt-4o-mini`, aber der Job `trinity-mail-react` läuft aktuell mit `gpt` als explizitem Override.

---

## Tank (`tank`)

Aktuell **keine eigenen OpenClaw Cron-Jobs** gefunden.

---

## Neo (`neo`)

Aktuell **keine eigenen OpenClaw Cron-Jobs** gefunden.

---

## 4. Host-Cron (`/etc/cron.d`) — tatsächlich aktiv

Diese Jobs laufen **außerhalb** von OpenClaw und sind wichtig für die reale Betriebsarchitektur.

### Queue Guards

Datei: `/etc/cron.d/openclaw-queue-guards`

| Schedule | Command / Ziel | Zweck |
| :------- | :------------- | :---- |
| `*/2 * * * *` | `queue-guard.js --queue memory/social-media/mail-write-queue.json --run 91103388-cf50-4a8a-9d1c-a566bbba95fd` | Prüft Mail-Queue und triggert Job nur bei Arbeit. |
| `*/2 * * * *` | `queue-guard.js --queue memory/social-media/x-write-queue.json --run 55811aa8-571d-4ad1-be9c-134d792a9a22` | Prüft X-Queue und triggert `oracle/x-write` nur bei Arbeit. |
| `*/2 * * * *` | `queue-guard.js --queue memory/social-media/moltbook-write-queue.json --run f6e406bc-5383-42e4-9aed-a886590de205` | Prüft Moltbook-Queue und triggert den Writer nur bei Arbeit. |

**Das ist aktuell der wichtigste Zero-Cost-Polling-Layer.**

### Usage Ingest

Datei: `/etc/cron.d/openclaw-usage-ingest`

| Schedule | Zweck |
| :------- | :---- |
| `15 * * * *` | Führt `scripts/usage-ingest.sh` stündlich aus und schreibt nach `/var/log/usage-ingest.log`. |

---

## 5. User-Crontab — aktuell vorhanden (und wichtig!)

Zusätzlich existieren in `crontab -l` aktuell mehrere **direkte Runner-Aufrufe**, die **nicht** über OpenClaw laufen.

### Gefundene Einträge

| Schedule | Command | Einordnung |
| :------- | :------ | :--------- |
| `30 9,21 * * * TZ=Europe/Berlin` | `node /root/.openclaw/workspace/scripts/x-write-runner.js` | direkter X-Runner-Aufruf |
| `30 8 * * *` | `node /root/.openclaw/workspace/scripts/x-write-runner.js` | zusätzlicher Legacy/Manuell-Eintrag |
| `30 20 * * *` | `node /root/.openclaw/workspace/scripts/x-write-runner.js` | zusätzlicher Legacy/Manuell-Eintrag |
| `30 9,21 * * *` | `node /root/.openclaw/workspace/scripts/x-write-runner.js` | mehrfach dupliziert vorhanden |
| `*/45 * * * *` | `cd /root/teams-webhook && /usr/bin/node renew-subscription.js >> /var/log/teams-subscription.log 2>&1` | Teams Subscription Renewal |

### Einschätzung

Die mehrfachen direkten `x-write-runner.js` Einträge wirken wie **historische/duplizierte Altlasten**. Sie gehören zur Realität des aktuellen Systems, sind aber **architektonisch nicht sauber**, weil sie den offiziellen Oracle-/Queue-Guard-Pfad teilweise überlagern können.

---

## 6. Änderung vom 2026-03-08

Die Jobs

- `daily-learning`
- `social-daily-review`
- `social-research`
- `social-weekly-review`

wurden inzwischen **Oracle zugeordnet**. Die Seite spiegelt diesen Stand bereits wider.

---

## 7. Kurzfazit

Der aktuelle Ist-Zustand ist:

- **OpenClaw Cron** ist der offizielle Job-Layer
- **Queue Guards in `/etc/cron.d`** sind aktiv und wichtig
- **Mehrere direkte X-Runner-Crontab-Einträge** existieren zusätzlich noch als Legacy/Manuell-Schicht
- Die Seite war vorher veraltet: Modelle, Zuständigkeiten und Gruppierung nach Agenten stimmten nicht mehr sauber
- Die Agent-Defaults sind inzwischen angepasst, aber **mehrere Jobs überschreiben ihre Modelle weiterhin explizit**

---

## 8. Offene Aufräumkandidaten

Das ist **keine Soll-Doku**, sondern eine Beobachtungsliste aus dem Ist-Zustand:

- Prüfen, ob die mehrfachen direkten `x-write-runner.js` Crontab-Einträge noch gebraucht werden
- Prüfen, ob Trinity-/Oracle-Jobs modellseitig ebenfalls auf die neuen Agent-Defaults gezogen werden sollen
- Prüfen, ob deaktivierte Legacy-Jobs (`main/x-write`, `mail-react`, `status-update`, `teams-react`) noch dokumentarisch gebraucht werden oder archiviert werden sollten
