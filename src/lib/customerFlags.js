// One shared source of truth for customer flags across the entire app.
export const CUSTOMER_FLAGS = Object.freeze({
  green: Object.freeze({ label: "Green", emoji: "🟢", bg: "#E7F1EB", fg: "#1F4E36", dot: "#16A34A" }),
  amber: Object.freeze({ label: "Amber", emoji: "🟠", bg: "#FBF0DF", fg: "#9A5A12", dot: "#F59E0B" }),
  red: Object.freeze({ label: "Red", emoji: "🔴", bg: "#FBEAE5", fg: "#A5402C", dot: "#DC2626" }),
  gold: Object.freeze({ label: "Gold", emoji: "⭐", bg: "#FFF2C9", fg: "#80610B", dot: "#D4A017" }),
});

export const CUSTOMER_FLAG_VALUES = Object.freeze(Object.keys(CUSTOMER_FLAGS));
export const DEFAULT_CUSTOMER_FLAG = "green";

export function normalizeCustomerFlag(flag) {
  // `yellow` was the legacy database value. Treat it as Amber during rollout.
  if (flag === "yellow") return "amber";
  return Object.prototype.hasOwnProperty.call(CUSTOMER_FLAGS, flag) ? flag : DEFAULT_CUSTOMER_FLAG;
}

export function getCustomerFlagMeta(flag) {
  return CUSTOMER_FLAGS[normalizeCustomerFlag(flag)];
}

export function isCustomerFlag(flag) {
  return CUSTOMER_FLAG_VALUES.includes(flag);
}
