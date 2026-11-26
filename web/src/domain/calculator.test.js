import assert from "node:assert/strict";
import test from "node:test";
import { calculateIntegers, convertBase64, parseInteger } from "./calculator.js";
import { analyzeSubnet, splitSubnet } from "./subnet.js";

test("converts exact signed integers in all four bases and validates digits", () => {
  for (const [input, radix] of [["-0b1111", 2], ["-0o17", 8], ["-15", 10], ["-0xF", 16]]) {
    assert.equal(parseInteger(input, radix), -15n);
  }
  assert.equal(parseInteger("9007199254740993", 10).toString(16), "20000000000001");
  assert.throws(() => parseInteger("812", 8), /octal/);
  assert.throws(() => parseInteger("3.14", 10), /decimal/);
  assert.throws(() => parseInteger("0x", 16), /hexadecimal/);
});

test("calculates integer arithmetic and bitwise operations", () => {
  assert.equal(calculateIntegers(-7n, 2n, "divide"), -3n);
  assert.equal(calculateIntegers(-7n, 2n, "remainder"), -1n);
  assert.equal(calculateIntegers(0b1010n, 0b0110n, "xor"), 0b1100n);
  assert.throws(() => calculateIntegers(1n, 0n, "divide"), /nonzero/);
});

test("round-trips Unicode text and raw bytes in Base64", () => {
  const text = "\uFEFFLab 🧪";
  const encoded = convertBase64(text, "encode", "text", false);
  assert.equal(convertBase64(encoded, "decode", "text", false), text);
  assert.equal(convertBase64("FF 00", "encode", "hex", true), "_wA");
  assert.equal(convertBase64("_wA", "decode", "hex", true), "FF 00");
  assert.throws(() => convertBase64("_wA", "decode", "text", true), /not UTF-8/);
  assert.throws(() => convertBase64("Zh==", "decode", "text", false), /trailing bits/);
  assert.throws(() => convertBase64("Zg=", "decode", "text", false), /padding/);
  assert.throws(() => convertBase64("F", "encode", "hex", false), /complete hex bytes/);
});

test("computes IPv4 network, masks, address range, and point-to-point cases", () => {
  const result = Object.fromEntries(analyzeSubnet("192.168.1.35/24", "192.168.2.2"));
  assert.equal(result.Network, "192.168.1.0/24");
  assert.equal(result.Netmask, "255.255.255.0");
  assert.equal(result["Wildcard mask"], "0.0.0.255");
  assert.equal(result.Broadcast, "192.168.1.255");
  assert.equal(result["Usable hosts"], "254");
  assert.equal(result["Usable range"], "192.168.1.1 – 192.168.1.254");
  assert.match(result.Membership, /outside/);

  const link = Object.fromEntries(analyzeSubnet("10.0.0.1/31", "10.0.0.0"));
  assert.equal(link["Usable hosts"], "2");
  assert.equal(link.Broadcast, undefined);
  assert.match(link.Membership, /inside/);
  assert.equal(Object.fromEntries(analyzeSubnet("10.0.0.1/32", ""))["Usable hosts"], "1");
});

test("handles IPv6 compression, embedded IPv4, and 128-bit addresses", () => {
  const result = Object.fromEntries(analyzeSubnet("2001:db8::1/64", "2001:db8::ffff"));
  assert.equal(result.Network, "2001:db8::/64");
  assert.equal(result["Last address"], "2001:db8::ffff:ffff:ffff:ffff");
  assert.equal(result["Total addresses"], "18446744073709551616");
  assert.match(result.Membership, /inside/);
  const mapped = Object.fromEntries(analyzeSubnet("::ffff:192.0.2.1/120", "192.0.2.3"));
  assert.equal(mapped.Network, "::ffff:c000:200/120");
  assert.match(mapped.Membership, /outside/);
  const whole = Object.fromEntries(analyzeSubnet("::/0", ""));
  assert.equal(whole["Total addresses"], (2n ** 128n).toString());
});

test("rejects invalid IP addresses and prefix lengths", () => {
  for (const cidr of ["192.168.1.256/24", "192.168.1.5/33", "2001::db8::1/64", "::1/129", "1:2:3:4:5:6:7:8::/64"]) {
    assert.throws(() => analyzeSubnet(cidr, ""));
  }
  assert.throws(() => analyzeSubnet("192.168.1.35", ""), /CIDR/);
});

test("splits an IPv4 network into equal child networks and validates prefixes", () => {
  const result = splitSubnet("192.168.1.35/24", "/26");
  assert.deepEqual(result.cidrs, ["192.168.1.0/26", "192.168.1.64/26", "192.168.1.128/26", "192.168.1.192/26"]);
  assert.equal(result.total, 4n);
  assert.equal(result.childSize, 64n);
  assert.throws(() => splitSubnet("192.168.1.0/24", "24"), /child prefix/);
  assert.throws(() => splitSubnet("192.168.1.0/24", "33"), /child prefix/);
  assert.throws(() => splitSubnet("192.168.1.0/24", "26", "2"), /page number/);
});

test("pages an IPv6 split without rounding network addresses or totals", () => {
  const lastPage = 2n ** 121n;
  const result = splitSubnet("::/0", "128", lastPage.toString());
  assert.equal(result.total, 2n ** 128n);
  assert.equal(result.pages, lastPage);
  assert.equal(result.cidrs.length, 128);
  assert.equal(result.cidrs[0], "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ff80/128");
  assert.equal(result.cidrs.at(-1), "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff/128");
});
