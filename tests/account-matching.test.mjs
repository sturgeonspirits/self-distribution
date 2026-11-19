// App version: 2026.11.19.83-APP
// Karl, 2026-11-19: approving the 1890 Pub's application ("1890 Pub and Bistro", 1890pubandbistro@gmail.com) made a
// second Directory row instead of using "THE 1890 PUB & BISTRO".
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backend = await readFile(new URL("../apps-script/Code.gs", import.meta.url), "utf8");
const pick = name => { const start = backend.indexOf(`function ${name}(`); return backend.slice(start, backend.indexOf("\n}\n", start) + 2); };
const lib = new Function(`${pick("normalizeBusinessKey_")}\n${pick("findIdentityMatch_")}\nreturn { normalizeBusinessKey_, findIdentityMatch_ };`)();

function identityOf(records){
  const identity = { by_id:new Map(), by_email:new Map(), by_business_city:new Map() };
  records.forEach(record => {
    identity.by_id.set(record.account_id, record);
    if (record.email) identity.by_email.set(record.email, [...(identity.by_email.get(record.email) || []), record]);
    const key = `${lib.normalizeBusinessKey_(record.business)}::${lib.normalizeBusinessKey_(record.city)}`;
    identity.by_business_city.set(key, [...(identity.by_business_city.get(key) || []), record]);
  });
  return identity;
}

test("business names read & as and and ignore a leading The", () => {
  assert.equal(lib.normalizeBusinessKey_("THE 1890 PUB & BISTRO"), "1890 pub and bistro");
  assert.equal(lib.normalizeBusinessKey_("1890 Pub and Bistro"), "1890 pub and bistro");
  assert.equal(lib.normalizeBusinessKey_("Theodore's Tap"), "theodore s tap", "only a separate leading word The is dropped");
});

test("the 1890's application finds the existing Directory row", () => {
  const pub = { account_id:"ACC-1890", business:"THE 1890 PUB & BISTRO", email:"1890pubandbistro@gmail.com", city:"Oshkosh" };
  const identity = identityOf([pub, { account_id:"ACC-OTHER", business:"Mr Brews Taphouse", email:"oshkosh@mrbrewstaphouse.com", city:"Oshkosh" }]);
  assert.equal(lib.findIdentityMatch_(identity, "", "1890 Pub and Bistro", "1890pubandbistro@gmail.com", "Oshkosh").record, pub);
  assert.equal(lib.findIdentityMatch_(identity, "", "1890 Pub and Bistro", "", "Oshkosh").record, pub, "by name and city");
  assert.equal(lib.findIdentityMatch_(identity, "", "Some Other Name", "1890pubandbistro@gmail.com", "").record, pub, "an email only one business uses");
});

test("an email shared by several businesses still needs the name to match", () => {
  const a = { account_id:"ACC-A", business:"Festival Foods Oshkosh", email:"orders@chain.com", city:"Oshkosh" };
  const b = { account_id:"ACC-B", business:"Festival Foods Neenah", email:"orders@chain.com", city:"Neenah" };
  const identity = identityOf([a, b]);
  assert.equal(lib.findIdentityMatch_(identity, "", "Festival Foods Neenah", "orders@chain.com", "Neenah").record, b);
  assert.equal(lib.findIdentityMatch_(identity, "", "Festival Foods Appleton", "orders@chain.com", "Appleton").record, null);
});
