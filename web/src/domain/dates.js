export function formatDateInput(date) {
  return date.toISOString().slice(0, 10);
}

export function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function addDays(value, amount) {
  const next = parseLocalDate(value);
  next.setDate(next.getDate() + amount);
  return formatDateInput(next);
}

export function displayDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(parseLocalDate(value));
}

export function daysBetween(start, end) {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  return Math.round((endDate - startDate) / 86400000);
}

export function formatDateTime(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
