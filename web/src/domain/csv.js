import { CARD_TYPES, cardTypeLabels, STATUSES, statusLabels } from "./constants.js";

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function downloadCsv(filename, rows) {
  const csv = `${rows.map((row) => row.map(csvEscape).join(",")).join("\n")}\n`;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function csvHeaderMap(headers) {
  return Object.fromEntries(headers.map((header, index) => [header.trim().toLowerCase(), index]));
}

export function csvValue(row, headers, name) {
  const index = headers[name.toLowerCase()];
  return index === undefined ? "" : (row[index] || "").trim();
}

export function splitCsvList(value) {
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeCardType(value) {
  const normalized = value.trim().toLowerCase();
  return CARD_TYPES.find((type) => type === normalized || cardTypeLabels[type].toLowerCase() === normalized) || "";
}

export function normalizeCardStatus(value) {
  const normalized = value.trim().toLowerCase();
  return STATUSES.find((status) => status === normalized || statusLabels[status].toLowerCase() === normalized) || "backlog";
}

export function safeFilePart(value) {
  return (value || "project")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "project";
}
