// The Inventory API source as one text, joined in load order (filePushOrder in apps-script/.clasp.json).
// Since 2026.11.19.86-APP the old apps-script/Code.gs is split into numbered parts; tests read them joined.
import { readFileSync } from "node:fs";

const dir = new URL("../../apps-script/", import.meta.url);

export function backendParts() {
  return JSON.parse(readFileSync(new URL(".clasp.json", dir), "utf8")).filePushOrder;
}

export async function readBackend() {
  return backendParts().map(name => readFileSync(new URL(name, dir), "utf8")).join("");
}
