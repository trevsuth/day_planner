function ipv4Parts(input) {
  const parts = input.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)) {
    throw new Error("Enter a valid IPv4 address.");
  }
  return parts.map(Number);
}

function parseAddress(input) {
  if (!input.includes(":")) {
    return { bits: 32, value: ipv4Parts(input).reduce((value, part) => (value << 8n) | BigInt(part), 0n) };
  }

  let address = input.toLowerCase();
  if (address.includes(".")) {
    const split = address.lastIndexOf(":");
    const [a, b, c, d] = ipv4Parts(address.slice(split + 1));
    address = address.slice(0, split + 1) + [(a << 8) | b, (c << 8) | d].map((part) => part.toString(16)).join(":");
  }

  const halves = address.split("::");
  const words = (part) => part ? part.split(":") : [];
  const left = words(halves[0]);
  const right = words(halves[1]);
  const count = left.length + right.length;
  if (halves.length > 2 || (halves.length === 1 ? count !== 8 : count >= 8) ||
      [...left, ...right].some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    throw new Error("Enter a valid IPv6 address without a zone identifier.");
  }
  const expanded = [...left, ...Array(8 - count).fill("0"), ...right];
  return { bits: 128, value: expanded.reduce((value, part) => (value << 16n) | BigInt(`0x${part}`), 0n) };
}

function formatAddress(value, bits) {
  if (bits === 32) return [24n, 16n, 8n, 0n].map((shift) => (value >> shift) & 255n).join(".");
  const words = Array.from({ length: 8 }, (_, index) =>
    ((value >> BigInt(16 * (7 - index))) & 65535n).toString(16));
  let bestStart = 0;
  let bestLength = 1;
  for (let index = 0; index < words.length;) {
    if (words[index] !== "0") { index++; continue; }
    const start = index;
    while (words[index] === "0") index++;
    if (index - start > bestLength) {
      bestStart = start;
      bestLength = index - start;
    }
  }
  if (bestLength === 1) return words.join(":");
  return `${words.slice(0, bestStart).join(":")}::${words.slice(bestStart + bestLength).join(":")}`;
}

function parseSubnet(cidr) {
  const parts = cidr.trim().split("/");
  if (parts.length !== 2 || !/^\d{1,3}$/.test(parts[1])) {
    throw new Error("Enter an address with a CIDR prefix, such as 192.168.1.35/24 or 2001:db8::1/64.");
  }
  const { bits, value } = parseAddress(parts[0]);
  const prefix = Number(parts[1]);
  if (prefix > bits) throw new Error(`Use a prefix from /0 through /${bits}.`);

  const size = 1n << BigInt(bits - prefix);
  const mask = ((1n << BigInt(bits)) - 1n) ^ (size - 1n);
  const first = value & mask;
  return { bits, prefix, size, mask, first };
}

export function splitSubnet(cidr, childPrefix, page = "1") {
  const { bits, prefix, first } = parseSubnet(cidr);
  const depth = childPrefix.trim().replace(/^\//, "");
  const target = Number(depth);
  if (!/^\d{1,3}$/.test(depth) || target <= prefix || target > bits) {
    throw new Error(prefix === bits ? "This subnet contains a single address and cannot be split." :
      `Use a child prefix from /${prefix + 1} through /${bits}.`);
  }
  const total = 1n << BigInt(target - prefix);
  const pageSize = 128n;
  const pages = (total + pageSize - 1n) / pageSize;
  const requested = page.trim();
  if (!/^[1-9]\d{0,38}$/.test(requested) || BigInt(requested) > pages) {
    throw new Error(`Use a page number from 1 through ${pages}.`);
  }
  const start = (BigInt(requested) - 1n) * pageSize;
  const length = total - start < pageSize ? total - start : pageSize;
  const childSize = 1n << BigInt(bits - target);
  const cidrs = Array.from({ length: Number(length) }, (_, index) =>
    `${formatAddress(first + (start + BigInt(index)) * childSize, bits)}/${target}`);
  return { cidrs, total, pages, page: BigInt(requested), childSize };
}

export function analyzeSubnet(cidr, candidate) {
  const { bits, prefix, size, mask, first } = parseSubnet(cidr);
  const last = first + size - 1n;
  const reservesEndpoints = bits === 32 && prefix < 31;
  const format = (address) => formatAddress(address, bits);
  const output = [
    ["Network", `${format(first)}/${prefix}`],
    ["First address", format(first)],
    ["Last address", format(last)],
    ["Total addresses", size.toString()],
  ];
  if (bits === 32) {
    output.push(["Netmask", format(mask)], ["Wildcard mask", format(size - 1n)]);
    if (reservesEndpoints) output.push(["Broadcast", format(last)]);
    output.push(
      ["Usable hosts", (reservesEndpoints ? size - 2n : size).toString()],
      ["Usable range", `${format(first + (reservesEndpoints ? 1n : 0n))} – ${format(last - (reservesEndpoints ? 1n : 0n))}`],
    );
  }
  if (candidate.trim()) {
    const address = parseAddress(candidate.trim());
    const inside = address.bits === bits && address.value >= first && address.value <= last;
    output.push(["Membership", `${formatAddress(address.value, address.bits)} is ${inside ? "inside" : "outside"} the subnet`]);
  }
  return output;
}
