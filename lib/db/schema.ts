import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Nothing in these tables is a readable secret: codes and phone numbers only ever appear sealed.
export const listings = sqliteTable("listings", {
  id: text("id").primaryKey(),
  type: text("type", { enum: ["giftcard", "esim", "topup"] }).notNull(),
  brand: text("brand").notNull(),
  faceValueCents: integer("face_value_cents").notNull(),
  priceUsdCents: integer("price_usd_cents").notNull(),
  source: text("source", { enum: ["user", "bitrefill"] }).notNull(),
  sellerAttested: integer("seller_attested", { mode: "boolean" }).notNull().default(false),
  codeFingerprint: text("code_fingerprint"),
  sellerTokenHash: text("seller_token_hash"),
  status: text("status", { enum: ["active", "sold", "rejected"] }).notNull().default("active"),
  createdAt: integer("created_at").notNull(),
});

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  listingId: text("listing_id"),
  type: text("type", { enum: ["giftcard", "esim", "topup"] }).notNull(),
  source: text("source", { enum: ["agent", "web"] }).notNull().default("web"),
  agentSessionId: text("agent_session_id"),
  productId: text("product_id"),
  productName: text("product_name").notNull(),
  packageValue: text("package_value"),
  buyerPubKey: text("buyer_pub_key").notNull(),
  priceUsdCents: integer("price_usd_cents").notNull(),
  amountZat: integer("amount_zat").notNull(),
  payAddr: text("pay_addr").notNull(),
  memoTag: text("memo_tag").notNull().unique(),
  status: text("status").notNull(),
  guardrail: text("guardrail").notNull(),
  guardrailReason: text("guardrail_reason"),
  approvedAt: integer("approved_at"),
  sealedPayload: text("sealed_payload"),
  sealedPhone: text("sealed_phone"),
  bitrefillInvoiceId: text("bitrefill_invoice_id"),
  bitrefillOrderId: text("bitrefill_order_id"),
  txid: text("txid"),
  minedHeight: integer("mined_height"),
  receivedZat: integer("received_zat"),
  paidAt: integer("paid_at"),
  releasedAt: integer("released_at"),
  wipedAt: integer("wiped_at"),
  failure: text("failure"),
  expiresAt: integer("expires_at").notNull(),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const agentEvents = sqliteTable("agent_events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sessionId: text("session_id").notNull(),
  kind: text("kind", { enum: ["user", "assistant", "tool_call", "tool_result"] }).notNull(),
  name: text("name"),
  payload: text("payload").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const kv = sqliteTable("kv", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export type Listing = typeof listings.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type AgentEvent = typeof agentEvents.$inferSelect;

// Bootstrap DDL kept next to the schema so a fresh volume works without a migration step.
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS listings (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  brand TEXT NOT NULL,
  face_value_cents INTEGER NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  source TEXT NOT NULL,
  seller_attested INTEGER NOT NULL DEFAULT 0,
  code_fingerprint TEXT,
  seller_token_hash TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS listings_active_fingerprint
  ON listings(code_fingerprint) WHERE code_fingerprint IS NOT NULL AND status = 'active';
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  listing_id TEXT,
  type TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'web',
  agent_session_id TEXT,
  product_id TEXT,
  product_name TEXT NOT NULL,
  package_value TEXT,
  buyer_pub_key TEXT NOT NULL,
  price_usd_cents INTEGER NOT NULL,
  amount_zat INTEGER NOT NULL,
  pay_addr TEXT NOT NULL,
  memo_tag TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL,
  guardrail TEXT NOT NULL,
  guardrail_reason TEXT,
  approved_at INTEGER,
  sealed_payload TEXT,
  sealed_phone TEXT,
  bitrefill_invoice_id TEXT,
  bitrefill_order_id TEXT,
  txid TEXT,
  mined_height INTEGER,
  received_zat INTEGER,
  paid_at INTEGER,
  released_at INTEGER,
  wiped_at INTEGER,
  failure TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS orders_txid ON orders(txid) WHERE txid IS NOT NULL;
CREATE INDEX IF NOT EXISTS orders_status ON orders(status);
CREATE TABLE IF NOT EXISTS agent_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS agent_events_session ON agent_events(session_id);
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
`;
