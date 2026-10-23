export const CUSTOMER_FLAGS = Object.freeze(["green", "yellow", "red"]);

// Keep every flag write aligned with the database CHECK constraint in 001_init.sql.
export function normalizeCustomerFlag(flag) {
  if (flag === "amber") return "yellow"; // legacy UI alias
  return CUSTOMER_FLAGS.includes(flag) ? flag : "green";
}
