# Runekeeper

A chat-style weekly planner that turns natural conversation into time-blocked calendar events and trackable tasks. Built with a "Living Manuscript" design aesthetic — sepia tones, editorial typography, and the personality of an enchanted archivist.

## What it does

Talk to the planner like a personal assistant:

> "I need to finish my lab report by Thursday (3 hours), study for my midterm (8 hours), and hit the gym 3 times this week."

Runekeeper builds a realistic week schedule, checks for conflicts against your Google Calendar, and writes time blocks directly to your calendar on confirmation. Tasks are tracked, reschedulable, and undoable.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript |
| Auth | NextAuth v5 + Google OAuth |
| Database | PostgreSQL (Neon) + Drizzle ORM |
| Chat Intelligence | Google Gemini 2.5 Flash |
| Styling | Tailwind CSS v4 |
| Animations | Framer Motion |
| Calendar | Google Calendar API |
| Tasks | Google Tasks API |
| Deployment | Vercel |

## Getting started

### Prerequisites

- Node.js 18+
- PostgreSQL database (local or [Neon](https://neon.tech))
- Google Gemini API key (from [Google AI Studio](https://aistudio.google.com/apikey))
- Google Cloud project with Calendar and Tasks APIs enabled

### 1. Clone and install

```sh
git clone <repo-url>
cd runekeeper
npm install
```

### 2. Set up environment variables

```sh
cp .env.example .env
```

Fill in your `.env`:

```sh
# Database
DATABASE_URL=postgresql://user:pass@host:5432/runekeeper

# Auth secrets (generate these)
TOKEN_ENCRYPTION_KEY=   # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
AUTH_SECRET=            # openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Google OAuth (from Google Cloud Console)
AUTH_GOOGLE_ID=your-client-id
AUTH_GOOGLE_SECRET=your-client-secret

# Gemini
GEMINI_API_KEY=your-gemini-api-key
```

### 3. Set up Google OAuth

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or select existing)
3. Enable **Google Calendar API** and **Google Tasks API**
4. Configure the **OAuth consent screen** (External, add test users)
5. Create **OAuth 2.0 Client ID** (Web application)
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
6. Copy Client ID and Client Secret into your `.env`

### 4. Set up the database

```sh
npm run db:push
```

Or if you prefer migrations:

```sh
npm run db:generate
npm run db:migrate
```

### 5. Run the dev server

```sh
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
src/
  app/
    api/              # API routes (auth, tasks, blocks, messages, sessions, preferences)
    planner/          # Main planner layout and page
    page.tsx          # Landing page
  components/
    ui/               # Design system primitives (button, input, card, badge, etc.)
    layout/           # App shell (sidebar, header, schedule drawer)
    chat/             # Chat interface (messages, input, diff preview, quick actions)
    schedule/         # Week grid, day columns, time blocks
    inventory/        # Task list (items, groups, add input)
    auth/             # Google sign-in button
  context/            # Shared planner state (React Context)
  db/                 # Drizzle schema and connection
  hooks/              # Custom hooks (chat, schedule, tasks)
  lib/                # Types, utilities, auth config, crypto, mock data
specs/                # PRD, design system doc, feature roadmap
```

## Design system

The "Enchanted Archivist" — a manuscript-inspired aesthetic:

- **Fonts:** Newsreader (serif, display/body) + Work Sans (sans-serif, labels)
- **Palette:** Sepia tones — warm parchment surfaces, faded charcoal, dried-blood red accents, vintage gold CTAs
- **Rules:** No rounded corners (0px, except avatars). No 1px borders (tonal shifts only). No pure black. Paper-grain texture on surfaces. Ambient ink-wash shadows.

See `specs/design.md` for the full specification.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | Run ESLint |
| `npm run db:push` | Push schema to database |
| `npm run db:generate` | Generate migration files |
| `npm run db:migrate` | Run migrations |
| `npm run db:studio` | Open Drizzle Studio (DB browser) |

## License

Private.
