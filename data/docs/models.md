# Modelle & Pricing (OpenAI / Anthropic / Google)

Diese Seite ist ein **Spickzettel**: Welche Modelle sind „gängig", was kosten sie ungefähr, und wofür nimmt man sie.

> Preise: **USD pro 1M Tokens** (Input / Output). Stand: **2026‑03‑07**.

---

## OpenAI (Text)

| Modell | Key (OpenClaw) | Input | Output | Cached input | Typischer Zweck |
|---|---|---:|---:|---:|---|
| GPT‑5.4 | `openai/gpt-5.4` | 2.50 | 15.00 | 1.25 | Neues Flaggschiff, „Thinking"-Layer für Deep Reasoning |
| GPT‑5.4 Pro | `openai/gpt-5.4-pro` | 30.00 | 180.00 | — | Premium Deep-Reasoning, nur für spezielle Tasks |
| GPT‑5.2 | `openai/gpt-5.2` | 1.75 | 14.00 | 0.175 | Bewährter Default für agentic/coding + gute Texte |
| GPT‑5.1 | `openai/gpt-5.1` | 1.25 | 10.00 | 0.125 | Günstiger als 5.2, sehr solide Allround-Alternative |
| GPT‑5 mini | `openai/gpt-5-mini` | 0.25 | 2.00 | 0.025 | High‑volume Writer/Queue, schnelle Routine |
| GPT‑5 nano | `openai/gpt-5-nano` | 0.05 | 0.40 | 0.005 | Ultra‑cheap Klassifikation/Extraktion/Tagging |
| GPT‑4o | `openai/gpt-4o` | 2.50 | 10.00 | 1.25 | Starker Generalist, oft „einfach zuverlässig" |
| GPT‑4o mini | `openai/gpt-4o-mini` | 0.15 | 0.60 | 0.075 | Billig + schnell: Read‑Jobs, Extraktion, leichte Agent‑Steps |

> **Hinweis GPT-5.4:** Long-Context-Surcharge ab 272K Tokens — Input verdoppelt sich auf $5.00/MTok.

Quelle: OpenAI Pricing (Text Tokens) — https://developers.openai.com/api/docs/pricing

---

## Anthropic (Claude)

| Modell | Key (OpenClaw) | Input | Output | Typischer Zweck |
|---|---|---:|---:|---|
| Claude Opus 4.6 | `anthropic/claude-opus-4-6` | 5.00 | 25.00 | Neuestes Flaggschiff, maximale Qualität (gleicher Preis wie 4.5) |
| Claude Opus 4.5 | `anthropic/claude-opus-4-5` | 5.00 | 25.00 | Maximale Textqualität/Strategie/komplexe Refactors |
| Claude Sonnet 4.6 | `anthropic/claude-sonnet-4-6` | 3.00 | 15.00 | Neueste Sonnet-Version, starke Agent-Qualität |
| Claude Sonnet 4.5 | `anthropic/claude-sonnet-4-5` | 3.00 | 15.00 | „Sweet Spot": starke Coding/Agent‑Qualität bei besserer Wirtschaftlichkeit |
| Claude Haiku 4.5 | `anthropic/claude-haiku-4-5` | 1.00 | 5.00 | Schnelle/cheap Subtasks, viele parallele Steps |

Quellen: Anthropic API Pricing — https://platform.claude.com/docs/en/about-claude/pricing

---

## Google (Gemini API)

> Gemini unterscheidet teils Long‑Context‑Tarife: **≤200k** vs **>200k** Prompt‑Länge.

| Modell | Key (OpenClaw) | Input | Output | Notes |
|---|---|---:|---:|---|
| Gemini 2.5 Pro (≤200k) | `google/gemini-2.5-pro` | 1.25 | 10.00 | Standard Rate |
| Gemini 2.5 Pro (>200k) | `google/gemini-2.5-pro` | 2.50 | 15.00 | Long‑context Rate |
| Gemini 2.5 Flash | `google/gemini-2.5-flash` | 0.30 | 2.50 | Schnell + skaliert gut |
| Gemini 2.5 Flash‑Lite | `google/gemini-2.5-flash-lite` | 0.10 | 0.40 | Sehr günstig für High‑Volume |

Quelle: Gemini API Pricing — https://ai.google.dev/gemini-api/docs/pricing

---

## Faustregeln (für unseren Stack)

- **Default (Qualität/Allround):** GPT‑5.2 (oder GPT-5.4 für neueste Features)
- **Billig & schnell (Read‑Jobs / Extraktion):** GPT‑4o mini oder Gemini Flash‑Lite
- **„Das muss sprachlich/inhaltlich sitzen":** Claude Sonnet 4.6 (oder Opus 4.6, wenn's wirklich High‑End sein muss)
- **Riesige Inputs / zweite Meinung:** Gemini 2.5 Pro
- **Deep Reasoning (selten nötig):** GPT-5.4 Pro (teuer!)
