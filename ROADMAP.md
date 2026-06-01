# MeetAI — Brutal Honest Roadmap to Making This Work

> No fluff. No startup motivational content. Just what actually has to happen, in order, for this to become a real business.

---

## The Honest Starting Point

You have a working prototype with a genuine technical differentiator. You do not have a product yet. The difference matters because a prototype impresses people in demos. A product retains users after the demo ends. Everything below is about closing that gap and then building on top of it.

You also have no brand, no users, no revenue from MeetAI, no distribution, and you're building from Pakistan targeting the US market — which adds a trust barrier that most startup advice ignores. This roadmap accounts for all of that.

---

## Stage 0 — Fix The Product (Weeks 1–2)

**This is not optional. Do not show this to anyone until these are done.**

Nothing below matters if the core product breaks during a demo or in a design partner's first real meeting.

### Fix 1 — Clock Skew Patch
- Remove `Math.floor(Date.now() / 1000) - 60` from the webhook route entirely
- Sync server time via NTP in Vercel/Railway deployment config
- Add ±30 second tolerance window for webhook timestamp validation
- Test on production — not local

### Fix 2 — Summarisation Feedback
- Add `status` field to meetings table: `processing → completed → failed`
- Update Inngest to set status at each stage
- Frontend polls via tRPC every 10 seconds when status is `processing`
- Show a visible loading state on the meeting detail page
- Send a Stream Chat notification when summary is ready

### Fix 3 — Speaker ID Failures
- Add fallback labels: Participant 1, Participant 2 instead of silent failure
- Log unmapped speaker IDs to a debug table
- Flag summary as `low_confidence` in UI if >30% of lines are unmapped
- Let users manually correct speaker names post-meeting

**Gate:** Do not move to Stage 1 until all 3 are fixed and tested on production with a real meeting.

---

## Stage 1 — Make It a Real Product (Weeks 3–6)

Right now anyone can use MeetAI without paying and you'd have no idea. That's not a product, it's a demo.

### 1.1 Real-Time Frontend Updates
- Replace tRPC polling with WebSocket-driven updates via Stream SDK
- Meeting state changes reflect instantly without page refresh

### 1.2 Error Handling Layer
- Structured try/catch on every Inngest function, webhook handler, OpenAI call
- Exponential backoff retry logic on all external API calls
- Failed jobs logged to a `failures` table with full error context
- Simple admin view so you can see what's breaking in production

### 1.3 Usage Tracking
- `usage` table: user_id, minutes_consumed, billing_period_start, overage_minutes
- Update on call end webhook in real time
- User-facing dashboard showing minutes remaining
- In-app alert at 80% of plan limit

### 1.4 Subscription Enforcement
- Gate meeting creation behind active Polar subscription check
- Enforce limits server-side in tRPC — not just frontend UI
- Block new meetings when balance is exhausted, show upgrade prompt
- Preserve data on lapse, block new meetings

**Gate:** Do not show this to design partners until billing is enforced and the error layer is in place.

---

## Stage 2 — Get 10 Design Partners (Weeks 6–10)

This is the most important stage in the entire roadmap. Not the most exciting. The most important.

**Why 10 specifically:** 10 gives you enough signal to know if retention is real. 3 is confirmation bias. 50 is premature scale. 10 paying or actively committed teams, used weekly, is PMF signal you can take to investors.

### Who to Target
- Engineering leads and CTOs at 20–100 person Series A–C startups
- Remote-first teams — they have the highest meeting load and lowest switching cost from Zoom
- AI-forward companies — they'll tolerate rough edges in exchange for the capability
- **Avoid:** Agencies, consultants, enterprise (too slow), solo founders (too small)

### How to Find Them
- LinkedIn Sales Navigator: filter by "CTO" or "VP Engineering", company size 20–100, funded in last 18 months, US/Canada
- ProductHunt — comment genuinely on relevant launches, DM founders directly
- Twitter/X — search people complaining about Zoom, Fireflies, meeting overhead
- YC company directory — every batch is public, cold email is acceptable
- Indie Hackers, Hacker News "Who's Hiring" threads

### The Outreach Message (Do Not Deviate From This Structure)
```
Subject: AI that actually speaks in your meetings — 10 min?

Hey [Name],

Built something I think your team would find useful — an AI agent that 
joins your calls as a participant, speaks when relevant, and builds 
searchable memory across every meeting you've ever had.

Not a notetaker. Not a bot that summarises after. It's in the call.

Looking for 10 teams to use it free for 60 days in exchange for honest 
feedback. No sales pitch. If it doesn't work for you, tell me why.

Worth 10 minutes?

Abdullah
meetai.app
```

- Send 20 of these per week minimum
- Follow up once after 5 days, once more after 10. Then move on.
- Target: 10 active teams within 4 weeks of outreach starting

### What "Active" Means
- At least 3 meetings per week run through MeetAI
- They are using summaries and the chat interface post-meeting
- They respond when you ask for feedback

### What to Do With Them
- Weekly 20-minute check-in call. Not to sell. To listen.
- Document every complaint, confusion, and compliment
- Fix the top 3 complaints each week
- Ask every partner: "Would you pay $79/month for this?" — if fewer than 7 of 10 say yes, you have a pricing or value problem, not a distribution problem

---

## Stage 3 — Free Tier + Public Launch (Weeks 10–14)

You cannot launch without a free tier. Fathom has unlimited free recording. Fireflies has a free plan. If you're paid-only from day one, you have no top of funnel. The free tier is your acquisition engine, not a charity.

### Free Tier Structure
- Unlimited meetings
- AI summaries + post-meeting chat
- 7-day transcript retention
- 1 AI persona
- MeetAI branding on the meeting interface (this is your distribution)

### Paid Tiers
| Plan | Price | What Unlocks |
|------|-------|-------------|
| Starter | $29/mo | 10hrs/month, 7-day retention, 1 persona |
| Pro | $79/mo | 50hrs/month, 5 personas, 90-day retention, Slack/email integrations |
| Enterprise | Custom | Unlimited, SSO, RBAC, Jira, custom retention, SLA |

### Where to Launch
Do these in this order, one week apart so each drives traffic to the next:

1. **Hacker News Show HN** — "Show HN: I built an AI that actually speaks in your meetings" — write it yourself, be technical, be honest about what's broken, HN respects builders not marketers
2. **Product Hunt** — prepare a proper launch, get 5 design partners to upvote and leave honest reviews on launch day, schedule for a Tuesday
3. **Twitter/X thread** — document the build story, what the stack is, what problem you're solving, why existing tools fail — technical founders share this
4. **LinkedIn post** — same story but business framing, tag a few people who engaged with your outreach

### What You Need Ready for Launch Day
- Landing page that loads in under 2 seconds
- Demo video under 90 seconds showing the AI speaking in a real meeting
- 5 real testimonials from design partners
- Pricing page live
- Onboarding that gets a user to their first meeting in under 5 minutes

---

## Stage 4 — Content Engine (Ongoing from Week 8)

This runs in parallel with everything else. It is how you build distribution without a sales team.

### Pick One Channel and Commit to It for 90 Days
Do not do all of these. Pick one, be consistent, measure results after 90 days.

**Option A — LinkedIn (Recommended for your situation)**
- Post 3x per week
- Content mix: 1 build update (what you shipped), 1 opinion (what's wrong with existing meeting tools), 1 story (design partner feedback, user quote, real outcome)
- Tag the companies and people you mention
- Engage with every comment within 2 hours for the first 6 months
- Target: 5,000 relevant followers within 6 months

**Option B — YouTube**
- Weekly video showing MeetAI in a real meeting scenario
- Not a tutorial. A demonstration of the differentiator.
- "Watch an AI agent handle a product planning meeting" gets clicks
- Target: 50 videos before you judge the channel

**What not to do:**
- Don't post on all platforms at once and burn out in week 3
- Don't post generic "AI is changing the future of work" content — nobody shares that
- Don't buy followers or engagement

---

## Stage 5 — Marketplace Distribution (Weeks 12–16)

Fathom became the most-installed AI app on the Zoom and HubSpot marketplaces. That's not an accident — it's a distribution strategy.

### Targets
- **Zoom App Marketplace** — apply as soon as billing and error handling are solid
- **HubSpot App Marketplace** — requires CRM integration (Phase 4 of roadmap), but worth building for
- **Slack App Directory** — action item integration gets you here
- **ProductHunt** — already covered above but keep your profile active

### Why This Matters
Marketplace listings put you in front of buyers who are already in a buying mindset. You're not interrupting them — they're searching for tools. This is the highest-intent traffic you can get without paying for ads.

---

## Stage 6 — Build Phases 2–4 (Weeks 14–24)

Only start this after you have 10 active design partners and measurable weekly retention.

**If you start building Phase 2 before Stage 2 is complete, you are wasting time and money building features for users you don't have yet.**

### Build Order (Strict)
1. **Phase 2 — Multi-Agent Memory Sync** — this is the feature that creates lock-in. Once a user's AI has 3 months of meeting memory, they will never leave.
2. **Phase 3 — Role Awareness** — deepens the value of summaries, drives Pro upsell
3. **Phase 4 — Action Item Delegation** — this is the feature that gets MeetAI into Slack and email, expanding surface area

### What Each Phase Unlocks Commercially
| Phase | Commercial Unlock |
|-------|------------------|
| Phase 2 | Retention — users can't leave without losing memory |
| Phase 3 | Pro upsell — role-specific summaries justify $79/mo |
| Phase 4 | Enterprise motion — Slack/Jira integrations open B2B sales |
| Phase 5 | Enterprise deals — knowledge base is an IT/ops purchase |
| Phase 6 | Analytics sell — engagement data is a management tool |
| Phase 7 | Global market — translation opens non-English markets |

---

## Stage 7 — The Pakistan Problem (Address This Head-On)

You're building a US-market SaaS from Pakistan. Here's what that actually means and how to handle it:

### What Works Against You
- US buyers are skeptical of support quality from overseas teams — they've been burned
- "Where are you based?" will come up in every enterprise conversation
- Payment processing, legal structure, and tax treatment are more complex
- Visa limitations affect your ability to meet investors and customers in person

### What Works For You
- 40–60% lower operational costs than a US-based team
- Pakistani dev talent is genuinely strong and underpriced
- Stripe Atlas or Delaware C-Corp registration costs ~$500 and makes you legally a US company
- Zoom, email, and async communication mean geography matters less than it did 10 years ago

### What You Must Do
1. **Register a Delaware C-Corp immediately** — use Stripe Atlas or Clerky, costs ~$500. Every US investor and enterprise customer expects this. "Pakistan-based company" kills deals. "Delaware C-Corp, team in Lahore" does not.
2. **US phone number and address** — Virtualpostmail.com for address, Google Voice or Aircall for number. $30/month total. Non-negotiable for enterprise trust.
3. **US bank account** — Mercury Bank accepts Delaware C-Corps from international founders. Free. Apply as soon as the C-Corp is registered.
4. **Don't hide where you're from** — be upfront that the team is in Lahore. Frame it as a strength: lean team, lower burn, focused execution. Investors who won't fund a Pakistani founder aren't the right investors anyway.

---

## Stage 8 — Fundraising (Only When These Are True)

Do not raise money before these metrics exist. Every meeting you take before this wastes your time and burns credibility you'll need later.

### Minimum Metrics Before Talking to Investors
- 100+ weekly active teams (not signups — active)
- $5,000+ MRR (real paying users, not design partners on free access)
- Week-over-week retention above 60% at the 8-week mark
- At least 3 unsolicited inbound requests from users asking for Enterprise pricing
- Delaware C-Corp registered
- Clean cap table — if you've already given equity away informally, sort this before any investor conversation

### Where to Raise From (In Order of Realistic Access)
1. **Pakistani angel investors and early-stage funds** — LUMS alumni network, Invest2Innovate, Sarmayacar, Indus Valley Capital. Easier to access, understand your context, can move faster.
2. **South Asian diaspora angels in the US** — LinkedIn search "angel investor" + "Pakistani" or "South Asian" in the US. Many actively look for founders from the region.
3. **YC application** — Apply every batch regardless of stage. The application process forces clarity. Getting in changes everything. Not getting in costs nothing.
4. **US pre-seed funds** — Precursor Ventures, Hustle Fund, Backstage Capital all fund pre-traction. Target after $5K MRR.

### What Your Pitch Needs
- The problem: existing tools are passive, MeetAI is active
- The traction: X active teams, $Y MRR, Z% retention
- The moat: OpenAI Realtime API integration is genuinely hard, most teams can't do it
- The market: $3.24B in 2025, growing at 25%+ CAGR
- The team: you built the hard technical thing already, you understand the stack deeply
- The ask: specific amount, specific use (3 devs for 6 months, targeting 500 active teams)

---

## The Numbers That Actually Matter

Stop tracking vanity metrics. These are the only numbers that tell you if MeetAI is working:

| Metric | What It Tells You | Target |
|--------|------------------|--------|
| Weekly Active Teams | Whether people actually use it | 10 → 100 → 1000 |
| 8-Week Retention | Whether it creates habit | >60% |
| Meetings per team per week | Depth of usage | >3 |
| Free → Paid conversion | Whether the value is clear | >8% |
| MRR growth month-over-month | Business health | >20% MoM |
| NPS score | Whether users will refer others | >40 |
| Time to first meeting | Onboarding quality | <5 minutes |

---

## What Will Kill This (Be Honest With Yourself)

These are the most likely failure modes in order of probability:

1. **You build Phase 2–7 without validating Phase 0–1 retention** — most likely failure. Building features nobody uses.
2. **Zoom ships a "real-time AI participant" feature** — possible within 12–18 months given their AI Companion 3.0 trajectory. Your moat has a time limit.
3. **You can't get users to switch conferencing platforms** — the behaviour change ask is large. If design partners consistently say "I love it but we use Zoom" — you need to build a bot that joins Zoom calls instead.
4. **OpenAI Realtime API pricing increases 3–5x** — your unit economics break. Abstract the AI provider layer from day one so you can swap to Gemini Live or ElevenLabs.
5. **You run out of runway before PMF** — keep your agency running. Do not go full-time on MeetAI until you have $3K+ MRR. That's the signal, not a date on a calendar.
6. **Co-founder or partner equity mistakes** — do not give anyone equity over WhatsApp. Do not give a "connections" person more than 5% advisory equity with a 2-year vest. Get a lawyer for any cap table changes.

---

## The Actual Timeline

| Timeframe | What Has to Happen |
|-----------|-------------------|
| Weeks 1–2 | Phase 0 bugs fixed, tested on production |
| Weeks 3–6 | Phase 1 infrastructure complete, billing enforced |
| Weeks 6–10 | 10 active design partners, weekly retention data |
| Weeks 10–14 | Free tier live, Product Hunt + HN launch |
| Weeks 12–16 | Marketplace listings submitted |
| Weeks 14–24 | Phases 2–4 built, only after retention confirmed |
| Month 6 | 100 active teams, $5K MRR target |
| Month 8–10 | First fundraising conversations if metrics are real |

---

## The Single Most Important Thing

Everything above is useless if you don't do this one thing:

**Get 10 real teams using MeetAI for real meetings within the next 8 weeks.**

Not signups. Not demo calls. Not survey responses. Teams running actual meetings through MeetAI every week and coming back the following week without you asking them to.

That retention signal is the only thing that separates a product from a prototype. Everything else — the fundraising, the feature buildout, the marketing, the GTM — flows from that. Without it, you're spending time and money building a more sophisticated demo.

Start the outreach this week. Today if possible.

---

*This document is brutally honest because that's more useful than encouraging. The product has a real shot. Most of what determines whether it succeeds is execution discipline, not technical capability — and you've already proven you can build the hard part.*