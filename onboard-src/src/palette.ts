// Source colours. Uploaded files cycle through the same three, then two more.

export const SOURCE_COLOR: Record<string, string> = {
  crm: "var(--crm)",
  billing: "var(--billing)",
  support: "var(--support)",
};

const EXTRA = ["var(--crm)", "var(--billing)", "var(--support)", "var(--ext1)", "var(--ext2)"];

export function sourceColor(id: string, order: string[] = []): string {
  if (SOURCE_COLOR[id]) return SOURCE_COLOR[id];
  const i = order.indexOf(id);
  return EXTRA[(i < 0 ? 0 : i) % EXTRA.length];
}

/** Short label for a source id: CRM, Billing, Support, or the upload's own name. */
export function sourceShort(id: string, label?: string): string {
  if (id === "crm") return "CRM";
  if (id === "billing") return "Billing";
  if (id === "support") return "Support";
  return label ?? id;
}
