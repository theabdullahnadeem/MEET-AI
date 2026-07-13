import { nanoid } from "nanoid";
import { pgTable, text, timestamp, boolean, index, uniqueIndex, pgEnum } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  // C.7: managed by the better-auth twoFactor plugin.
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
});

// C.7: better-auth twoFactor plugin storage — TOTP secret + hashed backup
// codes per user.
export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
  },
  (table) => [index("two_factor_userId_idx").on(table.userId)],
);

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);


export const meetingStatus = pgEnum("meeting_status",
  [
    "upcoming",
    "active",
    "completed",
    "processing",
    "cancelled"
  ]
)

export const agents = pgTable("agents",{
  id:text("id").primaryKey().$default(()=>nanoid()),
  name:text("name").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  instructions: text("instructions").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull().defaultNow(),
})


export const meetings = pgTable("meetings",{
  id:text("id").primaryKey().$default(()=>nanoid()),
  name:text("name").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  agentId: text("agent_id").notNull().references(() => agents.id, { onDelete: "cascade" }),
  status: meetingStatus("status").notNull().default("upcoming"),
  startedAt: timestamp("started_at"),
  endedAt: timestamp("ended_at"),
  transcriptUrl:text("transcript_url"),
  recordingUrl:text("recording_url"),
  summary:text("summary"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull().defaultNow(),
})

// F-07: webhook idempotency — one row per processed provider event id, so a
// replayed/retried webhook is a no-op. Ids are namespaced "<provider>:<eventId>".
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// S-6: append-only audit trail of security-relevant actions (sign-ins, host
// controls, deletions). Append-only by construction: the app exposes no
// update/delete path for this table. Deliberately NO foreign keys — an audit
// entry must survive the deletion of the user/meeting it describes.
export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().$default(() => nanoid()),
    /** User id of who performed the action. */
    actorId: text("actor_id").notNull(),
    /** Namespaced action, e.g. "meeting.kick", "auth.sign_in". */
    action: text("action").notNull(),
    /** What it was done to: a user id, participant identity, or request id. */
    targetId: text("target_id"),
    meetingId: text("meeting_id"),
    /** JSON string with action-specific extras (ip, names, …). */
    metadata: text("metadata"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("audit_log_actor_idx").on(table.actorId),
    index("audit_log_meeting_idx").on(table.meetingId),
  ],
);

export const joinRequestStatus = pgEnum("join_request_status",
  [
    "pending",
    "approved",
    "denied"
  ]
)

// MU-3: knock-to-join. A non-owner opening a meeting link creates a `pending`
// request; the host admits (→ approved, unlocks the token endpoint) or denies.
export const meetingJoinRequests = pgTable("meeting_join_requests", {
  id: text("id").primaryKey().$default(() => nanoid()),
  meetingId: text("meeting_id").notNull().references(() => meetings.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  status: joinRequestStatus("status").notNull().default("pending"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  // At most ONE live (pending/approved) request per user per meeting — the
  // DB-level backstop against duplicate knocks; denied rows don't block a re-ask.
  uniqueIndex("meeting_join_requests_active_uq")
    .on(table.meetingId, table.userId)
    .where(sql`${table.status} <> 'denied'`),
  index("meeting_join_requests_meeting_status_idx").on(table.meetingId, table.status),
]);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));