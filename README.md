# MEET-AI

A modern SaaS platform that enables users to host video meetings with integrated, context-aware AI agents. Combines video conferencing with real-time generative voice AI, automated meeting summarization, and post-meeting interactive chat with full transcript context.

**Live Demo:** [meet-ai-self.vercel.app](https://meet-ai-self.vercel.app)

## Problem Statement

Video conferencing is a cornerstone of modern work, but traditional meetings lack intelligent assistance. Organizations struggle with:
- Manual meeting documentation and summarization
- Lack of contextual AI support during meetings
- Inability to quickly review and discuss meeting content afterward
- Meeting insights that require manual aggregation

MEET-AI solves this by embedding intelligent AI agents directly into video calls that listen, transcribe, and speak in real-time—then automatically process transcripts into structured summaries and provide post-meeting analysis.

## Who It's For

- **Remote teams** needing AI-powered meeting assistance and documentation
- **Organizations** requiring automated meeting summaries and insights
- **Businesses** building AI-native communication workflows
- **Teams** working across time zones who benefit from async meeting context

## Tech Stack

### Frontend
- **Next.js 16** (App Router) - Full-stack React framework
- **React 19** - UI library
- **Tailwind CSS 4** - Utility-first styling
- **Radix UI** - Accessible component primitives
- **TanStack React Query** - Server state management
- **React Hook Form + Zod** - Form handling and validation
- **Lucide React** - Icon library
- **Sonner** - Toast notifications

### Backend
- **Next.js App Router** - API routes and edge functions
- **tRPC** - End-to-end typed RPC framework
- **Drizzle ORM** - Database toolkit with migrations
- **Neon** (Serverless Postgres) - Primary database
- **Better Auth** - Authentication with OAuth integration

### Real-Time & Communication
- **Stream Video SDK** - Video conferencing and webhooks
- **Stream Chat SDK** - Post-meeting messaging
- **OpenAI Realtime API** - Voice AI agents in calls
- **OpenAI GPT-4o** - Meeting summarization and post-call chat

### Infrastructure & Services
- **Inngest** - Background job queue for async processing
- **Polar** - Subscription and payment processing
- **Vercel** - Hosting and deployment

### Development
- **TypeScript** - Type-safe development
- **ESLint** - Code linting
- **Tailwind CSS** - Styling framework

## Key Features

### 1. Video Meetings with AI Agents
- Create custom AI agents with specific instructions and behaviors
- Launch video calls where agents join as participants in real-time
- Agents listen, transcribe, and respond using OpenAI Realtime API
- Voice Activity Detection (VAD) for natural conversation flow

### 2. Automatic Meeting Summarization
- Post-meeting transcript processing powered by Inngest
- GPT-4o generates structured markdown summaries with:
  - Overview of key topics and takeaways
  - Timestamped sections with bullet-point breakdowns
  - Participant attribution from speaker mapping
- Async processing prevents blocking external APIs

### 3. Post-Meeting Interactive Chat
- Continue conversations with AI agents in meeting context
- Agent maintains awareness of original meeting instructions
- Context-aware responses grounded in meeting summary
- Full conversation history for coherent interactions

### 4. Custom AI Agent Creation
- Users define agent personality through custom instructions
- Persisted in database for consistent behavior across meetings
- Reusable across multiple meetings
- Agent-specific voice and turn detection configuration

### 5. Authentication & User Management
- Email/password and OAuth integration (GitHub, Google)
- Session management via HTTP-only cookies
- better-auth handles OAuth flow and account linking
- User profiles with avatar generation

### 6. Premium & Monetization
- Subscription tier management via Polar
- Integrated checkout and customer portal
- Premium features gating

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── webhook/route.ts          # Stream webhooks (calls, chat, recordings)
│   │   └── inngest/route.ts          # Inngest background job polling
│   └── (ui routes)
├── components/
│   ├── ui/                           # Shadcn/Radix UI components
│   ├── data-table.tsx                # Reusable table component
│   └── (feature components)
├── db/
│   └── schema.ts                     # Drizzle tables and relations
├── inngest/
│   ├── client.ts                     # Inngest client config
│   └── function.ts                   # Transcript summarization function
├── lib/
│   ├── auth.ts                       # Better Auth configuration
│   ├── stream-video.ts               # Stream Video SDK client
│   ├── stream-chat.ts                # Stream Chat SDK client
│   └── polar.ts                      # Polar payment client
├── modules/
│   ├── agents/                       # AI agent creation/management
│   ├── meetings/                     # Meeting history and viewing
│   ├── call/                         # Active call interface
│   └── premium/                      # Subscription management
├── trpc/
│   ├── routers/                      # Feature-specific tRPC routers
│   └── _app.ts                       # Root router
└── types/                            # Shared TypeScript types
```

## Setup & Installation

### Prerequisites
- Node.js 18+ and npm
- Neon PostgreSQL database
- Stream API credentials (Video & Chat)
- OpenAI API key
- GitHub/Google OAuth credentials (optional)
- Polar account (optional, for payments)
- Inngest account (optional, for background jobs)

### 1. Clone Repository
```bash
git clone https://github.com/theabdullahnadeem/MEET-AI.git
cd MEET-AI
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Create a `.env.local` file in the project root:
```bash
cp .env.example .env.local
```

### 4. Set Up Database
Initialize the database schema using Drizzle migrations:
```bash
npm run db:push
```

To view and manage the database in a visual studio:
```bash
npm run db:studio
```

### 5. Start Development Server
```bash
npm run dev
```

The application will be available at `http://localhost:3000`.

## Environment Variables

All required environment variables must be set in `.env.local`:

### Database
```env
DATABASE_URL=postgresql://user:password@host/dbname
```

### Authentication (Better Auth)
```env
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
GOOGLE_CLIENT_ID=your_google_oauth_app_id
GOOGLE_CLIENT_SECRET=your_google_oauth_app_secret
```

### Video & Chat (Stream)
```env
NEXT_PUBLIC_STREAM_API_KEY=your_stream_api_key
STREAM_VIDEO_SECRET=your_stream_video_secret
NEXT_PUBLIC_STREAM_CHAT_API_KEY=your_stream_chat_api_key
STREAM_CHAT_SECRET=your_stream_chat_secret
```

### AI & Language Models (OpenAI)
```env
OPENAI_API_KEY=your_openai_api_key
```

### Background Jobs (Inngest)
```env
INNGEST_SIGNING_KEY=your_inngest_signing_key
INNGEST_EVENT_KEY=your_inngest_event_key
```

### Monetization (Polar)
```env
POLAR_ACCESS_TOKEN=your_polar_access_token
```

### Application (Next.js)
```env
NODE_ENV=development|production
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Architecture & Data Flow

### Real-Time Call Flow
1. User creates a meeting linked to a specific AI agent
2. User joins the Stream video call
3. Stream fires `call.session_started` webhook
4. Backend identifies the agent from database
5. OpenAI Realtime model connects directly to Stream call with agent instructions
6. AI listens and speaks naturally in the call
7. User ends the call; Stream fires `call.session_ended`

### Asynchronous Summarization Flow
1. Stream completes transcription and fires `call.transcription_ready` webhook
2. Webhook triggers Inngest background event (`meetings/processing`)
3. Inngest function downloads JSONL transcript file
4. Speaker IDs are mapped to database user/agent records for attribution
5. GPT-4o summarizes transcript into structured markdown
6. Summary is saved to database; meeting status marked "completed"

### Post-Meeting Chat Flow
1. Stream fires `message.new` webhook for chat messages
2. Backend fetches meeting summary and agent instructions
3. OpenAI composes response with meeting context
4. Response sent back through Stream Chat channel
5. User sees real-time reply from agent

### Data Flow Diagram
```
Client (React) ←→ tRPC ←→ Server (Next.js)
                            ↓
                    Drizzle ORM
                            ↓
                  Neon (PostgreSQL)

Stream SDK ←→ Server Webhooks
              ↓
            Inngest ←→ OpenAI
              ↓
         Database Updates
```

## Key Architectural Decisions

### 1. Webhook-Driven Architecture
Stream webhooks trigger all real-time events rather than polling. This enables:
- Immediate response to user actions (joining, leaving, recording ready)
- Clean separation of concerns between frontend and backend
- Scalable event handling without tight coupling

### 2. Background Job Queue (Inngest)
Transcript summarization is decoupled from the webhook response via Inngest:
- Prevents blocking external API calls
- Retries with exponential backoff on failure
- Allows heavy LLM processing without timeout constraints
- Provides observability and error tracking

### 3. End-to-End Type Safety (tRPC)
All client-server communication uses tRPC:
- Automatic TypeScript inference on client side
- Runtime validation with Zod
- Automatic code generation for API routes
- Type-safe mutations and queries

### 4. Feature-Sliced Architecture
Each major capability (agents, meetings, calls, premium) is organized as a module:
- UI components isolated within modules
- tRPC routers scoped to feature domains
- Clear boundaries and reduced coupling
- Easier to test and maintain

### 5. Serverless Database (Neon)
Neon's serverless Postgres provides:
- Auto-scaling without connection pool management
- HTTP/WebSocket APIs for edge function compatibility
- Built-in automatic backups and point-in-time restore
- Reduced operational overhead

## Deployment

The project is configured for Vercel deployment:

1. Push code to GitHub
2. Connect repository to Vercel
3. Set environment variables in Vercel dashboard
4. Vercel automatically deploys on push

**Alternative deployment**: Any Node.js runtime supporting Next.js (Docker, self-hosted, etc.)

## Development Commands

```bash
# Development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linter
npm run lint

# Database migrations
npm run db:push

# Database studio (visual interface)
npm run db:studio

# Webhook tunneling (local development)
npm run dev:webhook
```

## API Documentation

### tRPC Routers

All endpoints are type-safe RPC procedures. Access via client:

```typescript
// Example usage
const query = trpc.agents.list.useQuery();
const mutation = trpc.meetings.create.useMutation();
```

Key routers:
- **agents** - Create, list, update AI agent definitions
- **meetings** - List, fetch, and cancel meetings
- **auth** - User registration and session management

### Stream Webhooks

The application handles:
- `call.session_started` - User joins meeting
- `call.session_ended` - Meeting ends
- `call.session_participant_joined` - New participant
- `call.session_participant_left` - Participant leaves
- `call.transcription_ready` - Transcript available
- `call.recording_ready` - Recording ready
- `message.new` - New chat message

See `src/app/api/webhook/route.ts` for implementation.

## Known Limitations

### 1. Transcription Dependency
Summarization relies on Stream's default JSONL transcription format. Speaker ID mapping can fail if speaker IDs don't match database records, resulting in "Unknown" attributions.

### 2. Background Processing Latency
Meeting summarization is entirely asynchronous. Users may need to refresh to see newly completed summaries; no real-time UI updates are provided during processing.

### 3. Clock Skew Patch
A monkey-patch exists in the webhook route (`iat: Math.floor(Date.now() / 1000) - 60`) to handle JWT clock synchronization issues with Stream's infrastructure. This may indicate ongoing clock drift problems.

## Future Enhancements

| Feature | Description |
|---------|-------------|
| **Personal AI Memory** | Each user gets a persistent AI assistant that remembers schedules, prior meetings, and context across calls |
| **Role-Aware Agents** | AI understands participant roles (PM, Developer, Designer) and tailors responses accordingly |
| **Real-Time Fact-Checking** | AI queries company wikis, Jira, or past transcripts during calls to verify claims |
| **Sentiment Analytics** | Post-meeting dashboard showing tone, engagement levels, and talk-time distribution |
| **Action Item Automation** | AI extracts action items, assigns by detected role, follows up via Slack/Email |
| **Cross-Language Translation** | Real-time translation allowing global participants to speak native languages |
| **Meeting Search** | Full-text search across meeting summaries and transcripts with embeddings |
| **Integrations** | Native Slack, Google Calendar, Notion, Linear connectors |

## Contributing

Contributions are welcome. Please submit pull requests with:
- Clear commit messages
- Tests for new features
- Updated documentation
- TypeScript types for all new code

## License

This project is licensed under the MIT License. See LICENSE file for details.

## Support

For issues, questions, or feature requests, please open a GitHub issue or contact the maintainers.

---

**Built with**: Next.js 16 • React 19 • TypeScript • Tailwind CSS • Drizzle • Stream • OpenAI • Inngest
