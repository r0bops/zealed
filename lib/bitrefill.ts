import { createHash } from "node:crypto";
// Bitrefill REST v2 client. Only fulfill.ts may call the purchase/order methods.
// Never log response bodies from createInvoice/getInvoice/getOrder: they can contain redemption codes.
import { kvGet, kvSet } from "./orders";

const BASE = "https://api.bitrefill.com/v2";

export type ProductKind = "giftcard" | "topup" | "esim";

export class BitrefillError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly errorCode: string | null,
    /** true when we know no purchase happened (a 4xx rejection), false when the outcome is unknown */
    readonly definite: boolean,
  ) {
    super(message);
    this.name = "BitrefillError";
  }
}

export interface CatalogPackage {
  value: string; // exactly what buy expects; copy, never retype
  packageId?: string; // e.g. "airtel-bundles-india<&>199: ul calls + 2gb data"
  faceAmount: number | null; // face value in the product's currency (e.g. 199 INR)
  priceCents: number | null; // our cost in USD cents, null when it can't be priced safely
}
export interface CatalogProduct {
  id: string;
  name: string;
  kind: ProductKind;
  country: string | null;
  currency: string; // the product's face-value currency (INR, USD, …)
  inStock: boolean;
  packages: CatalogPackage[];
  range?: { min: number; max: number; step: number; priceRate: number | null };
  accountCurrency: string; // currency Bitrefill prices are expressed in (our balance currency)
}

export interface RedemptionInfo {
  code?: string;
  link?: string;
  pin?: string;
  instructions?: string;
  barcode_format?: string;
  barcode_value?: string;
}
export type InvoiceStatus =
  | "unpaid"
  | "payment_detected"
  | "payment_confirmed"
  | "pending"
  | "complete"
  | "blocked"
  | "denied"
  | "payment_error"
  | string;
export interface BitrefillInvoice {
  id: string;
  status: InvoiceStatus;
  orders?: { id: string; status: string }[];
}
export interface BitrefillOrder {
  id: string;
  status: string;
  error?: string;
  redemption_info?: string | RedemptionInfo;
}

export const FINAL_INVOICE_STATUSES = ["complete", "blocked", "denied", "payment_error", "not_delivered"];

/** Catalog source: simulated when there's no API key (or BITREFILL_MODE=fake). */
export function isSimulated(): boolean {
  return process.env.BITREFILL_MODE === "fake" || !process.env.BITREFILL_API_KEY;
}

export type PurchaseMode = "simulate" | "test" | "live";

/**
 * How fulfill.ts buys. Defaults to "simulate"; real money needs BITREFILL_PURCHASES=live explicitly.
 * "test" sends Bitrefill's free test products instead of the real ones.
 * A simulated payment can never trigger a real purchase: callers pass paymentSimulated.
 */
export function purchaseMode(paymentSimulated: boolean): PurchaseMode {
  const wanted = (process.env.BITREFILL_PURCHASES ?? "simulate") as PurchaseMode;
  if (paymentSimulated || isSimulated()) return "simulate";
  return wanted === "live" || wanted === "test" ? wanted : "simulate";
}

/** Bitrefill's free test product standing in for a real one in "test" mode (none exists for eSIMs). */
export function testProductFor(kind: ProductKind): { productId: string; value: string } | null {
  if (kind === "giftcard") return { productId: "test-gift-card-code", value: "10" };
  if (kind === "topup") return { productId: "test-phone-refill", value: "10" };
  return null;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = process.env.BITREFILL_API_KEY;
  if (!key) throw new BitrefillError("BITREFILL_API_KEY not set", null, null, true);
  let res: Response;
  try {
    res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(25_000),
      cache: "no-store",
    });
  } catch {
    // Network failure / timeout: we cannot know whether a POST was processed.
    throw new BitrefillError("Bitrefill request failed", null, null, false);
  }
  let text: string;
  try { text = await res.text(); } catch { throw new BitrefillError("Bitrefill response interrupted", res.status, null, false); }
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const b = (body ?? {}) as { message?: string; error_code?: string; error?: string };
    const definite = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    const known = new Set(["missing_param", "invalid_param", "not_found", "out_of_stock", "balance_too_low", "too_many_items", "invalid_phone_number", "unsupported_operator", "invalid_value", "invalid_package_id"]);
    const code = typeof b.error_code === "string" && known.has(b.error_code) ? b.error_code : null;
    throw new BitrefillError(`Bitrefill request rejected (${res.status})`, res.status, code, definite);
  }
  if (!body || typeof body !== "object") throw new BitrefillError("Invalid Bitrefill response", res.status, null, false);
  const wrapped = body as { data?: T };
  return (wrapped && typeof wrapped === "object" && "data" in wrapped ? wrapped.data : body) as T;
}

// ---------------------------------------------------------------- catalog (safe for the agent)

/**
 * Product kind from Bitrefill's `categories` and `recipient_type`.
 * Returns null for products checkout can't serve (e.g. DTH, which needs an account number).
 */
export function kindOf(p: Record<string, unknown>): ProductKind | null {
  const cats = (Array.isArray(p.categories) ? p.categories : []).map((c) => String(c).toLowerCase());
  const recipient = String(p.recipient_type ?? "").toLowerCase();
  const id = String(p.id ?? "").toLowerCase();
  if (cats.includes("esim") || id.includes("esim")) return "esim";
  if (recipient === "account" || cats.includes("dth")) return null;
  if (recipient === "phone_number" || id === "test-phone-refill") return "topup";
  return "giftcard";
}

/**
 * Bitrefill quotes `price` in the account's balance currency. For a BTC account that's satoshis,
 * converted at a fixed BTC_USD_RATE (stated in the README, like ZEC_USD_RATE).
 * Any other currency we don't know how to price returns null, so the product can't be bought.
 */
export function priceToCents(price: unknown, accountCurrency: string): number | null {
  if (typeof price !== "number" || !Number.isFinite(price) || price <= 0) return null;
  const cur = accountCurrency.toUpperCase();
  if (cur === "USD") return Math.round(price * 100);
  if (cur === "BTC") {
    const rate = Number(process.env.BTC_USD_RATE || 70_000);
    if (!Number.isFinite(rate) || !(rate > 0)) return null;
    const sats = price; // REST BTC account prices are satoshis; never guess units from magnitude.
    return Math.max(1, Math.round((sats * rate) / 1_000_000)); // sats / 1e8 * rate * 100
  }
  return null;
}

export function normalize(p: Record<string, unknown>, accountCurrency: string): CatalogProduct | null {
  const kind = kindOf(p);
  if (!kind) return null;
  const pkgs = (Array.isArray(p.packages) ? p.packages : []) as Record<string, unknown>[];
  const range = p.range as { min: number; max: number; step: number; price_rate?: number } | undefined;
  return {
    id: String(p.id),
    name: String(p.name ?? p.id),
    kind,
    country: (p.country_code as string) ?? (p.country as string) ?? null,
    currency: String(p.currency ?? "USD"),
    inStock: p.in_stock !== false,
    packages: pkgs.slice(0, 12).map((k) => ({
      value: String(k.value),
      packageId: (k.package_id as string) ?? (k.id as string) ?? undefined,
      faceAmount: typeof k.amount === "number" ? k.amount : Number.isFinite(Number(k.value)) ? Number(k.value) : null,
      priceCents: priceToCents(k.price, accountCurrency),
    })),
    range:
      range && typeof range.min === "number"
        ? { min: range.min, max: range.max, step: range.step, priceRate: typeof range.price_rate === "number" ? range.price_rate : null }
        : undefined,
    accountCurrency,
  };
}

const CATALOG_TTL_MS = 10 * 60_000;
const CACHE_V = "v2"; // bump when the normalized shape or pricing changes

function cacheScope(): string {
  const account = createHash("sha256").update(process.env.BITREFILL_API_KEY ?? "").digest("hex");
  return `${CACHE_V}:${isSimulated() ? "fake" : "live"}:${account}:${process.env.BITREFILL_USE_TEST_PRODUCTS === "true"}:${process.env.BTC_USD_RATE ?? "70000"}`;
}

export async function accountCurrency(): Promise<string> {
  const key = `bitrefill:${cacheScope()}:account-currency`;
  const cached = kvGet<{ at: number; currency: string }>(key);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.currency;
  const bal = await api<{ balance: number; currency: string }>("/accounts/balance");
  if (typeof bal.currency !== "string") throw new BitrefillError("Missing account currency", null, null, true);
  const currency = bal.currency.toUpperCase();
  kvSet(key, { at: Date.now(), currency });
  return currency;
}

export async function searchProducts(query: string, country = "IN"): Promise<CatalogProduct[]> {
  const q = query.trim().slice(0, 80);
  const cacheKey = `catalog:${cacheScope()}:${country}:${createHash("sha256").update(q.toLowerCase()).digest("hex")}`;
  const cached = kvGet<{ at: number; items: CatalogProduct[] }>(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.items;

  let items: CatalogProduct[];
  if (isSimulated()) {
    items = SIMULATED_CATALOG.filter((p) => `${p.name} ${p.id} ${p.kind}`.toLowerCase().includes(q.toLowerCase().split(" ")[0] ?? ""));
    if (!items.length) items = SIMULATED_CATALOG;
  } else {
    const params = new URLSearchParams({ q, limit: "20" });
    if (process.env.BITREFILL_USE_TEST_PRODUCTS === "true") params.set("include_test_products", "true");
    const [raw, cur] = await Promise.all([api<Record<string, unknown>[]>(`/products/search?${params}`), accountCurrency()]);
    items = (Array.isArray(raw) ? raw : [])
      .map((p) => normalize(p, cur))
      .filter((p): p is CatalogProduct => p !== null)
      .filter((p) => !country || !p.country || p.country.toUpperCase() === country || p.id.startsWith("test-"));
  }
  kvSet(cacheKey, { at: Date.now(), items });
  return items;
}

export async function getProduct(id: string, fresh = false): Promise<CatalogProduct | null> {
  if (isSimulated()) return SIMULATED_CATALOG.find((p) => p.id === id) ?? null;
  const cacheKey = `product:${cacheScope()}:${id}`;
  const cached = kvGet<{ at: number; item: CatalogProduct }>(cacheKey);
  if (!fresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.item;
  try {
    const [raw, cur] = await Promise.all([api<Record<string, unknown>>(`/products/${encodeURIComponent(id)}`), accountCurrency()]);
    const item = normalize(raw, cur);
    if (!item) return null; // a product kind checkout can't serve
    kvSet(cacheKey, { at: Date.now(), item });
    return item;
  } catch (e) {
    if (e instanceof BitrefillError && e.status === 404) return null;
    throw e;
  }
}

/** USD cents for a product + package value, or null if it can't be priced safely. */
export function priceFor(p: CatalogProduct, value: string): number | null {
  if (!p.inStock) return null;
  const pkg = p.packages.find((k) => k.value === value);
  if (pkg) return Number.isSafeInteger(pkg.priceCents) && pkg.priceCents! > 0 ? pkg.priceCents : null;
  const range = p.range;
  if (!range || !/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(range.step) || range.step <= 0) return null;
  const v = Number(value);
  const steps = (v - range.min) / range.step;
  if (!Number.isFinite(v) || v < range.min || v > range.max || Math.abs(steps - Math.round(steps)) > 1e-8) return null;
  if (!range.priceRate || !Number.isFinite(range.priceRate) || range.priceRate <= 0) return null;
  const raw = v * range.priceRate;
  const cents = priceToCents(p.accountCurrency === "BTC" ? Math.ceil(raw) : raw, p.accountCurrency);
  return Number.isSafeInteger(cents) && cents! > 0 ? cents : null;
}

export async function getBalance(): Promise<{ balance: number; currency: string } | null> {
  if (isSimulated()) return null;
  return api<{ balance: number; currency: string }>(`/accounts/balance`);
}

// ---------------------------------------------------------------- purchase (fulfill.ts only)

export interface CreateInvoiceInput {
  kind: ProductKind;
  productId: string;
  value: string;
  packageId?: string;
  phoneNumber?: string; // E.164
}

export async function createInvoice(input: CreateInvoiceInput, opts: { simulate: boolean }): Promise<BitrefillInvoice> {
  if (opts.simulate) return simulatedInvoice(input);
  const item: Record<string, unknown> = { product_id: input.productId, quantity: 1 };
  if (input.packageId) item.package_id = input.packageId;
  else item.value = /^\d+(\.\d+)?$/.test(input.value) ? Number(input.value) : input.value;
  if (input.phoneNumber) item.phone_number = input.phoneNumber;
  const body = JSON.stringify({ products: [item], payment_method: "balance", auto_pay: true });
  return api<BitrefillInvoice>(input.kind === "esim" ? "/esims" : "/invoices", { method: "POST", body });
}

export async function getInvoice(id: string, kind: ProductKind): Promise<BitrefillInvoice> {
  if (id.startsWith("SIM-")) return { id, status: "complete", orders: [{ id: `SIMORD-${id.slice(4)}`, status: "delivered" }] };
  return api<BitrefillInvoice>(kind === "esim" ? `/esims/invoice/${encodeURIComponent(id)}` : `/invoices/${encodeURIComponent(id)}`);
}

export async function getOrder(id: string): Promise<BitrefillOrder> {
  if (id.startsWith("SIMORD-")) return simulatedOrder(id);
  return api<BitrefillOrder>(`/orders/${encodeURIComponent(id)}`);
}

// ---------------------------------------------------------------- simulated mode (labelled, dev only)

const SIMULATED_CATALOG: CatalogProduct[] = [
  {
    id: "airtel-bundles-india",
    name: "Airtel Bundles India (SIMULATED)",
    kind: "topup",
    country: "IN",
    currency: "INR",
    inStock: true,
    packages: [
      { value: "199: ul calls + 2gb data", faceAmount: 199, priceCents: 195 },
      { value: "379:ul calls+2gb/day", faceAmount: 379, priceCents: 372 },
    ],
    accountCurrency: "USD",
  },
  {
    id: "bitrefill-esim-india",
    name: "Bitrefill eSIM India (SIMULATED)",
    kind: "esim",
    country: "IN",
    currency: "USD",
    inStock: true,
    packages: [{ value: "1GB, 7 Days", faceAmount: 2.59, priceCents: 348 }],
    accountCurrency: "USD",
  },
  {
    id: "flipkart-india",
    name: "Flipkart gift card (SIMULATED)",
    kind: "giftcard",
    country: "IN",
    currency: "INR",
    inStock: true,
    packages: [
      { value: "500", faceAmount: 500, priceCents: 501 },
      { value: "1000", faceAmount: 1000, priceCents: 1002 },
    ],
    accountCurrency: "USD",
  },
];

// Simulated ids carry the product kind so no in-memory state is needed: SIM-<kind>-<rand>.
function simulatedInvoice(input: CreateInvoiceInput): BitrefillInvoice {
  const rand = crypto.randomUUID().slice(0, 8);
  return { id: `SIM-${input.kind}-${rand}`, status: "complete", orders: [{ id: `SIMORD-${input.kind}-${rand}`, status: "delivered" }] };
}

function simulatedOrder(id: string): BitrefillOrder {
  const kind = (id.split("-")[1] as ProductKind) ?? "giftcard";
  const rand = () => crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  if (kind === "topup") return { id, status: "delivered" };
  if (kind === "esim")
    return {
      id,
      status: "delivered",
      redemption_info: {
        barcode_format: "QRCODE",
        barcode_value: `LPA:1$simulated.smdp.example$SIM-${rand()}-${rand()}`,
        instructions: "SIMULATED eSIM: not installable.",
      },
    };
  return {
    id,
    status: "delivered",
    redemption_info: { code: `SIM-${rand()}-${rand()}-${rand()}`, pin: rand(), instructions: "SIMULATED code: not redeemable." },
  };
}
