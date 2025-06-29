# BV-BRC Copilot API

A production–ready Node.js/Express service that exposes Large-Language-Model (LLM) functionality and Retrieval-Augmented-Generation (RAG) utilities to **BV-BRC** applications.

The service acts as a wrapper around multiple back-end model providers, MongoDB persistence, and optional Chroma/FAISS vector stores.  All requests are protected by BV-BRC single-sign-on tokens and can be horizontally scaled with **PM2**.

---

## ✨ Key Features

• **Multi-provider chat** – route prompts to any model registered in the `modelList` MongoDB collection 

• **Retrieval-Augmented Generation (RAG)** – Attach document context retrieved from vector databases that are listed in the `ragList` collection.

• **Image chat** – Send Base-64 screenshots or figures together with a textual prompt (`/chat-image`).

• **Session management** – Start, list, update, and delete chat sessions.  Messages are streamed to `chat_sessions` with embeddings for later search.

• **Rating endpoints** – Capture 👍 / 👎 feedback on conversations and individual messages.

• **Token counting, summarisation, and path-state helpers** – Utility calls that keep prompts short and relevant.

---

## 📦 Requirements

• Node.js ≥ 18  
• MongoDB ≥ 5  
• (optional) Chroma / FAISS instance for RAG  
• An OpenAI (or compatible) account **or** internal model endpoints

---

## 🚀 Quick-start

```bash
# 1) clone & install
$ git clone https://github.com/cucinellclark/bvbrc-copilot-api.git
$ cd bvbrc-copilot-api && npm install

# 2) configuration – copy & edit as needed
$ cp config.json config.local.json
$ $EDITOR config.local.json  # edit secrets, URLs, port

# 3) run
$ node bin/launch-copilot         # listens on 7032 by default
# OR
$ pm2 start utilities_pm2.config.js   # recommended for production
```

The server now responds on `http://localhost:7032/copilot-api/*`.

---

## ⚙️ Configuration (`config.json`)

```json
{
  "mongoDBUrl": "mongodb://<user>:<pass>@host:27017/copilot?authSource=copilot",
  "signingSubjectURL": "https://user.patricbrc.org/public_key",
  "http_port": 7032,
  "embedding_url": "http://vector-host:9998/v1/embeddings",
  "embedding_model": "Salesforce/SFR-Embedding-Mistral",
  "embedding_apiKey": "<key>"
}
```

Additional per-provider credentials (API keys, endpoints, …) live in the `modelList` collection so they can be rotated without redeploying the service.

---

## 🔐 Authentication

Every endpoint **requires** a BV-BRC JWT supplied via the `Authorization: Bearer <token>` header.  Tokens are verified against `signingSubjectURL` by the lightweight middleware in `middleware/auth.js`.

---

## 📑 REST API

`/copilot-api/chatbrc/*` routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/copilot` | High-level Copilot entry that supports RAG + history. |
| POST | `/chat` | Plain LLM chat (stores history). |
| POST | `/chat-only` | One-off chat (no DB interaction). |
| POST | `/rag` | Retrieval-augmented query using standard vector database. |
| POST | `/rag-distllm` | RAG through **distllm** distributed embeddings. |
| POST | `/chat-image` | Image + text prompt. |
| GET  | `/start-chat` | Generate a UUID session id. |
| GET  | `/get-session-messages` | Messages for a session. |
| GET  | `/get-session-title` | Retrieve session title. |
| GET  | `/get-all-sessions` | List sessions for a user. |
| POST | `/generate-title-from-messages` | Auto-title a conversation. |
| POST | `/update-session-title` | Rename a session. |
| POST | `/delete-session` | Delete a session. |
| GET  | `/get-user-prompts` | Saved prompt templates. |
| POST | `/save-prompt` | Save/update a template. |
| POST | `/rate-conversation` | 1-5 star rating. |
| POST | `/rate-message` | −1 / 0 / 1 per-message rating. |
| POST | `/get-path-state` | Helper to inspect remote path status. |

`/copilot-api/db/*` routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/get-model-list` | Fetch active chat models and RAG databases. |

**Test endpoint:** `GET /copilot-api/test` → `"Welcome to my API"`.

---

## 🛠 Development

```bash
# run with automatic restarts
$ npx nodemon bin/launch-copilot

# run tests (jest / mocha TBD)
$ npm test
```

The codebase follows a classic MVC-ish layout:

```
|-- routes/        # Express routers (chat, db)
|-- services/      # LLM integrations, Mongo helpers
|-- middleware/    # Auth & other HTTP middlewares
|-- utilities/     # Stand-alone scripts & python helpers (distllm, tfidf, …)
|-- bin/launch-…   # Entrypoints for PM2 / docker
```

Pull requests are welcome!  Make sure `npm run lint` passes and add unit tests where appropriate.

---

## License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.
