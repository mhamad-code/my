# AI Platform

**Your AI. Your Tools. One Platform.**

A local-first AI workspace: bring your own API keys for 20 providers, discover their real
models, chat against them with streaming, and keep every conversation, file, project, image
and setting on your own device.

The chat interface is **not** a lookalike. It is installed byte-for-byte from the
[miskibin/chat-components](https://github.com/miskibin/chat-components) shadcn registry
(`npx shadcn add miskibin/chat-components/chat`) and only wired through its public props,
callbacks and slots.

---

## Stack

- Vite + React 19 + TypeScript (strict)
- Tailwind CSS v4 + shadcn/ui (Radix primitives) for all platform chrome
- chat-components registry for the entire chat surface (ChatInput, MessageList, Message,
  MessageParts, MessageMarkdown/Streamdown + Shiki + Mermaid + KaTeX, ChatSidebar,
  ChatNavbar, ModelPicker, ModePicker, ContextMeter, AskQuestion, PromptSuggestions,
  FilePreview, FileIcon, DiffView, FileTree, Resizable, ThemeToggle)
- Zustand for session/settings/model state
- Dexie (IndexedDB) + OPFS for local data
- Firebase Authentication (optional) for accounts only
- React Router

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck  # tsc -b
npm run lint       # oxlint
npm test           # node --test (platform logic)
npm run build
```

## Firebase Authentication (optional)

Without configuration the app runs on a **local profile** and says so — it does not fake a
login. To enable accounts, create a Firebase project with Email/Password and Google enabled,
copy `.env.example` to `.env.local` and fill in:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_APP_ID
```

Firebase is used exclusively for sign-in, email verification and password reset. No
Firestore, no Storage, no Realtime Database: conversations, messages, projects, library
files, images, model settings and API keys are never written to Firebase.

## What is real

- **Provider adapters** with SSE streaming, abort, retry and error mapping:
  OpenAI-compatible (OpenRouter, OpenAI, DeepSeek, Mistral, xAI, Groq, Together, Fireworks,
  Perplexity, Hugging Face router, Cerebras, SambaNova, NVIDIA NIM, GitHub Models),
  Anthropic Messages, Google Gemini, Cohere v2, Azure OpenAI deployments.
- **Model discovery** from each provider's own list endpoint. OpenRouter metadata maps
  modalities and `supported_parameters` to capability states; other providers return ids
  only, so their capabilities stay `Unknown` instead of being guessed from names.
- **Capability states** are `Supported` / `Unsupported` / `Unknown`; unknown is never
  upgraded to supported.
- **API keys** live in IndexedDB for the current profile, are sent only to the provider they
  belong to, and are never logged. They are not encrypted at rest — the UI says so.
- **Chat**: streaming, stop, retry, regenerate, edit a user message, copy, delete, switch
  model mid-conversation, attachments, modes, generation status, session management.
- **Tool calling**: real provider-native function calling for `web_search`, `search_images`
  and structured `ask_question`; tool calls render with the registry's tool UI.
- **Image search**: Wikipedia + Wikimedia Commons MediaWiki APIs, with real source pages,
  licences and authors. No generated images, no invented URLs.
- **Web search**: Wikipedia/Wikimedia out of the box; Tavily / Brave / Serper with the user's
  own key. Deep research runs several searches, then asks the selected model to compare and
  cite them.
- **Image Studio**: only models whose provider metadata reports image output; OpenAI-style
  images endpoints and OpenRouter image modalities; local history, download and delete.
- **Library**: IndexedDB records + OPFS blobs for large files, previews, folders, rename,
  download, delete, attach an existing file to the next chat message.
- **Projects**: instructions, default model, attached chats and files.
- **Backup**: full JSON export/import (keys optional, files optional), per-profile isolation,
  and a destructive local wipe with confirmation.
- **Temporary chats** that stay out of history until saved, with an explicit note that the
  provider still processes the messages.
- **TTS** through the browser's Web Speech API (no paid service, never autoplays).
- **AR/EN with full RTL**, light/dark/system themes, responsive layout.

## Honest limitations

- **AWS Bedrock** needs SigV4 signing with an IAM secret; signing in a browser would expose
  the secret, so it is disabled with an explanation. **Replicate** likewise needs a
  server-side secret. Both are shown as requiring a secure backend, not as connected.
- Some providers block browser requests with CORS. The exact provider error is surfaced;
  no results are fabricated.
- **Integrations** that require an OAuth client secret or signed webhook are listed with an
  explanation. GitHub is genuinely verifiable from the browser with a personal access token
  (`api.github.com/user`) and only then shows as connected.
- DOCX/XLSX/PDF are stored and previewed/downloaded locally, but text extraction for chat is
  limited to text-like files and images/PDFs are sent only as provider-supported parts.
- Email verification delivery requires a configured Firebase project.

## Layout

```
src/platform/     provider catalog, adapters, capability mapping, tools, chat engine, search
src/lib/          Dexie schema + repositories, backup, files/OPFS, Firebase auth, TTS
src/store/        Zustand session + platform (settings, keys, models)
src/components/ui chat-components registry + shadcn primitives
src/components/layout, platform   app shell, headers, provider marks
src/pages/        Home, Chat, Models, Providers, Image Studio, Projects, Library,
                  Search, Integrations, Settings, Account, Auth
tests/            node:test coverage for platform logic
```

Provider keys are never committed: `.env*` and dev logs are ignored.
