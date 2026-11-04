// Bitrefill REST v2 client. See docs/BITREFILL.md. Only fulfill.ts may call the purchase/order methods.
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
  packageId?: string;
  priceCents: number | null;
}
export interface CatalogProduct {
  id: string;
  name: string;
  kind: ProductKind;
  country: string | null;
  currency: string;
  inStock: boolean;
  packages: CatalogPackage[];
  range?: { min: number; max: number; step: number };
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

export function isSimulated(): boolean {
  return process.env.BITREFILL_MODE === "fake" || !process.env.BITREFILL_API_KEY;
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
  } catch (e) {
    // Network failure / timeout: we cannot know whether a POST was processed.
    throw new BitrefillError(`network: ${(e as Error).name}`, null, null, false);
  }
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const b = (body ?? {}) as { message?: string; error_code?: string; error?: string };
    const definite = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
    // Only the error code and status are kept; message is truncated and never contains redemption data on errors.
    throw new BitrefillError(
      `bitrefill ${res.status} ${b.error_code ?? ""}`.trim() + (b.message ? `: ${String(b.message).slice(0, 120)}` : ""),
      res.status,
      b.error_code ?? null,
      definite,
    );
  }
  const wrapped = body as { data?: T };
  return (wrapped && typeof wrapped === "object" && "data" in wrapped ? wrapped.data : body) as T;
}

// ---------------------------------------------------------------- catalog (safe for the agent)

function kindOf(p: Record<string, unknown>): ProductKind {
  const t = String(p.type ?? p.category ?? "").toLowerCase();
  const id = String(p.id ?? "").toLowerCase();
  if (t.includes("esim") || id.includes("esim")) return "esim";
  if (t.includes("refill") || t.includes("phone") || id.includes("refill") || id.includes("topup")) return "topup";
  return "giftcard";
}

function normalize(p: Record<string, unknown>): CatalogProduct {
  const pkgs = (Array.isArray(p.packages) ? p.packages : []) as Record<string, unknown>[];
  const range = p.range as { min: number; max: number; step: number } | undefined;
  return {
    id: String(p.id),
    name: String(p.name ?? p.id),
    kind: kindOf(p),
    country: (p.country_code as string) ?? (p.country as string) ?? null,
    currency: String(p.currency ?? "USD"),
    inStock: p.in_stock !== false,
    packages: pkgs.slice(0, 12).map((k) => ({
      value: String(k.value),
      packageId: (k.package_id as string) ?? (k.id as string) ?? undefined,
      priceCents: typeof k.price === "number" ? Math.round(k.price * 100) : null,
    })),
    range: range && typeof range.min === "number" ? { min: range.min, max: range.max, step: range.step } : undefined,
  };
}

const CATALOG_TTL_MS = 10 * 60_000;

export async function searchProducts(query: string, country = "IN"): Promise<CatalogProduct[]> {
  const q = query.trim().slice(0, 80);
  const cacheKey = `catalog:${country}:${q.toLowerCase()}`;
  const cached = kvGet<{ at: number; items: CatalogProduct[] }>(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.items;

  let items: CatalogProduct[];
  if (isSimulated()) {
    items = SIMULATED_CATALOG.filter((p) => `${p.name} ${p.id} ${p.kind}`.toLowerCase().includes(q.toLowerCase().split(" ")[0] ?? ""));
    if (!items.length) items = SIMULATED_CATALOG;
  } else {
    const params = new URLSearchParams({ q, limit: "20" });
    if (process.env.BITREFILL_USE_TEST_PRODUCTS === "true") params.set("include_test_products", "true");
    const raw = await api<Record<string, unknown>[]>(`/products/search?${params}`);
    items = (Array.isArray(raw) ? raw : [])
      .map(normalize)
      .filter((p) => !country || !p.country || p.country.toUpperCase() === country || p.id.startsWith("test-"));
  }
  kvSet(cacheKey, { at: Date.now(), items });
  return items;
}

export async function getProduct(id: string): Promise<CatalogProduct | null> {
  if (isSimulated()) return SIMULATED_CATALOG.find((p) => p.id === id) ?? null;
  const cacheKey = `product:${id}`;
  const cached = kvGet<{ at: number; item: CatalogProduct }>(cacheKey);
  if (cached && Date.now() - cached.at < CATALOG_TTL_MS) return cached.item;
  try {
    const item = normalize(await api<Record<string, unknown>>(`/products/${encodeURIComponent(id)}`));
    kvSet(cacheKey, { at: Date.now(), item });
    return item;
  } catch (e) {
    if (e instanceof BitrefillError && e.status === 404) return null;
    throw e;
  }
}

/** USD cents for a product + package value, or null if it can't be priced safely. */
export function priceFor(p: CatalogProduct, value: string): number | null {
  const pkg = p.packages.find((k) => k.value === value);
  if (pkg?.priceCents) return pkg.priceCents;
  if (p.id.startsWith("test-")) return 1; // test products: priced at 1 cent for the demo checkout
  if (p.range && p.currency === "USD") {
    const v = Number(value);
    if (Number.isFinite(v) && v >= p.range.min && v <= p.range.max) return Math.round(v * 100);
  }
  return null;
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

export async function createInvoice(input: CreateInvoiceInput): Promise<BitrefillInvoice> {
  if (isSimulated()) return simulatedInvoice(input);
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
    id: "airtel-india",
    name: "Airtel India talktime (SIMULATED)",
    kind: "topup",
    country: "IN",
    currency: "USD",
    inStock: true,
    packages: [
      { value: "10", priceCents: 12 },
      { value: "50", priceCents: 60 },
    ],
  },
  {
    id: "bitrefill-esim-india",
    name: "Bitrefill eSIM India (SIMULATED)",
    kind: "esim",
    country: "IN",
    currency: "USD",
    inStock: true,
    packages: [{ value: "1GB, 7 Days", priceCents: 388 }],
  },
  {
    id: "flipkart-india",
    name: "Flipkart gift card (SIMULATED)",
    kind: "giftcard",
    country: "IN",
    currency: "USD",
    inStock: true,
    packages: [
      { value: "50", priceCents: 60 },
      { value: "100", priceCents: 120 },
    ],
  },
];

const simKinds = new Map<string, ProductKind>();

function simulatedInvoice(input: CreateInvoiceInput): BitrefillInvoice {
  const id = `SIM-${crypto.randomUUID().slice(0, 8)}`;
  simKinds.set(`SIMORD-${id.slice(4)}`, input.kind);
  return { id, status: "complete", orders: [{ id: `SIMORD-${id.slice(4)}`, status: "delivered" }] };
}

function simulatedOrder(id: string): BitrefillOrder {
  const kind = simKinds.get(id) ?? "giftcard";
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
