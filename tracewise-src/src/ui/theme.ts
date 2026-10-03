// Colours the canvas and SVG drawings share with the stylesheet.

export const C = {
  bg: "#0a0c0d",
  panel: "#111517",
  panel2: "#161b1e",
  line: "#232b2f",
  line2: "#313b40",
  text: "#e6ece8",
  soft: "#b4bfb9",
  muted: "#7f8b85",
  dim: "#56615c",
  accent: "#c5f467",
  warn: "#f4b44a",
  bad: "#ff6b57",
  flow: "#9fb4ff",
};

export const HEALTH = [C.line2, C.warn, C.bad] as const;
export const HEALTH_NAME = ["healthy", "degraded", "failing"] as const;

/** A muted categorical colour per service, for waterfalls and legends. */
const SERVICE_HUES: Record<string, number> = {
  gateway: 200,
  auth: 265,
  orders: 165,
  cart: 30,
  payments: 320,
  notifications: 55,
  inventory: 135,
  pricing: 185,
  "payment-provider": 345,
  postgres: 220,
  redis: 5,
};

export function serviceColor(id: string): string {
  let h = SERVICE_HUES[id];
  if (h === undefined) {
    h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
  }
  return `hsl(${h} 38% 62%)`;
}

export const FLOW_LABEL: Record<string, string> = {
  browse: "Browse",
  "cart-add": "Add to cart",
  checkout: "Checkout",
  "order-email": "Order e-mail",
};
