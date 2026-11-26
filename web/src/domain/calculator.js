export const numberBases = [
  { radix: 2, name: "Binary", prefix: "0b", digits: /^[01]+$/ },
  { radix: 8, name: "Octal", prefix: "0o", digits: /^[0-7]+$/ },
  { radix: 10, name: "Decimal", prefix: "", digits: /^\d+$/ },
  { radix: 16, name: "Hexadecimal", prefix: "0x", digits: /^[0-9a-f]+$/i },
];

export function parseInteger(source, radix) {
  const base = numberBases.find((option) => option.radix === radix);
  const input = source.trim().toLowerCase();
  const sign = input.startsWith("-") ? -1n : 1n;
  let digits = input.replace(/^[+-]/, "");
  if (base.prefix && digits.startsWith(base.prefix)) digits = digits.slice(2);
  if (digits.length > 4096 || !base.digits.test(digits)) {
    throw new Error(`Enter a valid ${base.name.toLowerCase()} integer with at most 4,096 digits.`);
  }
  return sign * BigInt(base.prefix + digits);
}

export function calculateIntegers(left, right, operation) {
  if ((operation === "divide" || operation === "remainder") && right === 0n) {
    throw new Error("The divisor must be nonzero.");
  }
  switch (operation) {
    case "add": return left + right;
    case "subtract": return left - right;
    case "multiply": return left * right;
    case "divide": return left / right;
    case "remainder": return left % right;
    case "and": return left & right;
    case "or": return left | right;
    case "xor": return left ^ right;
    default: throw new Error("Choose an operation.");
  }
}

export function convertBase64(source, direction, format, urlSafe) {
  if (source.length > 100_000) throw new Error("Use at most 100,000 input characters.");
  if (direction === "encode") {
    let bytes;
    if (format === "hex") {
      const digits = source.replace(/[\t\r\n ]/g, "");
      if (!/^(?:[0-9a-f]{2})*$/i.test(digits)) throw new Error("Enter complete hex bytes, such as FF 00.");
      bytes = Uint8Array.from(digits.match(/../g) ?? [], (byte) => parseInt(byte, 16));
    } else {
      bytes = new TextEncoder().encode(source);
    }
    const output = btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
    return urlSafe ? output.replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "") : output;
  }

  const input = source.replace(/[\t\r\n ]/g, "");
  const alphabet = urlSafe ? /^[A-Za-z0-9_-]*={0,2}$/ : /^[A-Za-z0-9+/]*={0,2}$/;
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  if (!alphabet.test(input) || (input.includes("=") && input.length % 4 !== 0)) {
    throw new Error("Invalid Base64 alphabet or padding.");
  }
  let binary;
  try {
    binary = atob(normalized);
  } catch {
    throw new Error("Invalid Base64 length or padding.");
  }
  if (btoa(binary).replace(/=+$/, "") !== normalized.replace(/=+$/, "")) {
    throw new Error("Invalid Base64 trailing bits.");
  }
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (format === "hex") return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  try {
    return new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw new Error("Decoded bytes are not UTF-8 text. Choose Hex bytes to inspect them.");
  }
}
