import {
  CARD_TYPES,
  cardTypeLabels,
  cardTypeOrder,
  parentTypeByCardType,
  STATUSES,
  statusLabels,
  statusOrder,
} from "./constants.js";
import { addDays, formatDateInput, parseLocalDate } from "./dates.js";

export function emptyCard(projectId) {
  return {
    project_id: projectId,
    card_type: "epic",
    title: "",
    description: "",
    comments: "",
    status: "backlog",
    start_date: "",
    due_date: "",
    parent_id: "",
    dependency_ids: [],
    deliverables: [""],
  };
}

export function cardPayload(card, overrides = {}) {
  return {
    card_type: overrides.card_type ?? card.card_type,
    title: overrides.title ?? card.title,
    description: overrides.description ?? card.description ?? null,
    comments: overrides.comments ?? card.comments ?? null,
    status: overrides.status ?? card.status,
    start_date: overrides.start_date !== undefined ? overrides.start_date : card.start_date ?? null,
    due_date: overrides.due_date !== undefined ? overrides.due_date : card.due_date ?? null,
    parent_id: overrides.parent_id ?? card.parent_id ?? null,
    dependency_ids: overrides.dependency_ids ?? card.dependency_ids ?? [],
    deliverables: overrides.deliverables ?? card.deliverables ?? [],
  };
}

export function formatActivityValue(fieldName, value, cards) {
  if (!value) return "None";
  if (fieldName === "status") return statusLabels[value] || value;
  if (fieldName === "parent_id") {
    const parent = cards.find((card) => card.id === value);
    return parent ? `${cardTypeLabels[parent.card_type]}: ${parent.title}` : value;
  }
  if (fieldName === "comments") {
    const compact = value.replace(/\s+/g, " ").trim();
    if (!compact) return "None";
    return compact.length > 80 ? `${compact.slice(0, 77)}...` : compact;
  }
  return value;
}

export function cardStart(card) {
  return card.start_date || card.due_date || "";
}

export function cardEnd(card) {
  return card.due_date || card.start_date || "";
}

export function collectDescendants(parentId, cards) {
  const directChildren = cards.filter((card) => card.parent_id === parentId);
  return directChildren.flatMap((child) => [child, ...collectDescendants(child.id, cards)]);
}

export function descendantScheduleBounds(card, cards) {
  const datedDescendants = collectDescendants(card.id, cards).filter(
    (descendant) => descendant.start_date || descendant.due_date,
  );
  if (!datedDescendants.length) return null;

  const starts = datedDescendants
    .filter((descendant) => cardStart(descendant))
    .sort((first, second) => cardStart(first).localeCompare(cardStart(second)) || first.title.localeCompare(second.title));
  const ends = datedDescendants
    .filter((descendant) => cardEnd(descendant))
    .sort((first, second) => cardEnd(first).localeCompare(cardEnd(second)) || first.title.localeCompare(second.title));
  return {
    start: cardStart(starts[0]),
    end: cardEnd(ends[ends.length - 1]),
    startCard: starts[0],
    endCard: ends[ends.length - 1],
  };
}

export function ganttScheduleForCard(card, cards) {
  const descendantBounds = descendantScheduleBounds(card, cards);
  const resolvedStart = card.start_date || descendantBounds?.start || card.due_date || "";
  const resolvedEnd = card.due_date || descendantBounds?.end || card.start_date || "";
  const isReversed = Boolean(resolvedStart && resolvedEnd && resolvedEnd < resolvedStart);
  return {
    start: isReversed ? resolvedEnd : resolvedStart,
    end: isReversed ? resolvedStart : resolvedEnd,
    startCard: descendantBounds?.startCard,
    endCard: descendantBounds?.endCard,
    isDerived: Boolean(descendantBounds && (!card.start_date || !card.due_date)),
  };
}

export function getScheduledCards(cards) {
  return cards.filter((card) => card.start_date || card.due_date);
}

export function getScheduleBounds(cards) {
  const scheduled = getScheduledCards(cards);
  if (!scheduled.length) {
    const today = formatDateInput(new Date());
    return { start: today, end: addDays(today, 30) };
  }

  const starts = scheduled.map(cardStart).filter(Boolean).sort();
  const ends = scheduled.map(cardEnd).filter(Boolean).sort();
  const start = starts[0];
  const end = ends[ends.length - 1];
  return { start, end: end < start ? start : end };
}

export function getTimelinePoints(cards) {
  return getScheduledCards(cards)
    .flatMap((card) => [
      card.start_date ? { date: card.start_date, kind: "Start", card } : null,
      card.due_date ? { date: card.due_date, kind: "Due", card } : null,
    ])
    .filter(Boolean)
    .sort((first, second) => first.date.localeCompare(second.date) || first.card.title.localeCompare(second.card.title));
}

export function getHierarchyRows(cards, expandedIds) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));

  function childCards(parentId) {
    return sortCardsForRoadmap(cards.filter((card) => card.parent_id === parentId));
  }

  function appendRows(parentId, level) {
    return childCards(parentId).flatMap((card) => {
      const children = childCards(card.id);
      const row = { card, childrenCount: children.length, isExpanded: expandedIds.has(card.id), level };
      if (!children.length || !expandedIds.has(card.id)) return [row];
      return [row, ...appendRows(card.id, level + 1)];
    });
  }

  const roots = sortCardsForRoadmap(cards.filter((card) => !card.parent_id || !cardsById.has(card.parent_id)));
  return roots.flatMap((card) => {
    const children = childCards(card.id);
    const row = { card, childrenCount: children.length, isExpanded: expandedIds.has(card.id), level: 0 };
    if (!children.length || !expandedIds.has(card.id)) return [row];
    return [row, ...appendRows(card.id, 1)];
  });
}

export function cardRelationshipLabel(card, cards) {
  const parent = cards.find((candidate) => candidate.id === card.parent_id);
  if (!parent) return "No parent";
  return `${cardTypeLabels[parent.card_type]}: ${parent.title}`;
}

export function isOverdue(card) {
  return Boolean(card.due_date && card.status !== "done" && card.due_date < formatDateInput(new Date()));
}

export function isDueSoon(card) {
  const today = formatDateInput(new Date());
  const soon = addDays(today, 14);
  return Boolean(card.due_date && card.status !== "done" && card.due_date >= today && card.due_date <= soon);
}

export function cardMatchesFilters(card, filters) {
  if (filters.cardTypes.length && !filters.cardTypes.includes(card.card_type)) return false;
  if (filters.statuses.length && !filters.statuses.includes(card.status)) return false;

  if (filters.schedule === "blocked" && card.status !== "blocked") return false;
  if (filters.schedule === "overdue" && !isOverdue(card)) return false;
  if (filters.schedule === "due_soon" && !isDueSoon(card)) return false;
  if (filters.schedule === "undated" && (card.start_date || card.due_date)) return false;

  const query = filters.query.trim().toLowerCase();
  if (!query) return true;

  const searchable = [
    card.title,
    card.description,
    card.comments,
    ...(card.deliverables || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return searchable.includes(query);
}

export function dependencyCardsFor(card, cards) {
  const dependencyIds = card.dependency_ids || [];
  return dependencyIds.map((dependencyId) => cards.find((candidate) => candidate.id === dependencyId)).filter(Boolean);
}

export function cardDependencyIssues(card, cards) {
  const issues = [];
  const dependencies = dependencyCardsFor(card, cards);

  dependencies.forEach((dependency) => {
    if (dependency.status === "blocked" && card.status !== "done") {
      issues.push({
        type: "blocked_dependency",
        severity: "warning",
        dependency,
        message: `Depends on blocked card "${dependency.title}".`,
      });
    }

    if (dependency.due_date && card.start_date && card.start_date < dependency.due_date) {
      issues.push({
        type: "date_conflict",
        severity: "warning",
        dependency,
        message: `Starts ${card.start_date} before dependency "${dependency.title}" is due ${dependency.due_date}.`,
      });
    } else if (dependency.due_date && card.due_date && card.due_date < dependency.due_date) {
      issues.push({
        type: "date_conflict",
        severity: "warning",
        dependency,
        message: `Due ${card.due_date} before dependency "${dependency.title}" is due ${dependency.due_date}.`,
      });
    }
  });

  return issues;
}

export function projectIssuesForCards(cards) {
  return cards
    .map((card) => ({
      card,
      issues: [...cardDependencyIssues(card, cards), ...cardHierarchyDateIssues(card, cards)],
    }))
    .filter((item) => item.issues.length);
}

export function issueGroupsFromIssueRecords(cards, issueRecords) {
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const grouped = new Map();

  for (const record of issueRecords || []) {
    const card = cardsById.get(record.card_id);
    if (!card) continue;
    const dependency = record.dependency_id ? cardsById.get(record.dependency_id) : null;
    const issue = {
      type: record.type,
      severity: record.severity || "warning",
      dependency,
      boundary: record.boundary || "",
      message: record.message,
    };
    const current = grouped.get(card.id) || { card, issues: [] };
    current.issues.push(issue);
    grouped.set(card.id, current);
  }

  return [...grouped.values()];
}

export function cardHierarchyDateIssues(card, cards) {
  if (!card.start_date && !card.due_date) return [];
  const descendantBounds = descendantScheduleBounds(card, cards);
  if (!descendantBounds) return [];

  const issues = [];
  if (card.start_date && descendantBounds.start < card.start_date) {
    issues.push({
      type: "hierarchy_date_conflict",
      boundary: "start",
      severity: "warning",
      dependency: descendantBounds.startCard,
      message: `"${descendantBounds.startCard.title}" begins ${descendantBounds.start} before this card starts ${card.start_date}.`,
    });
  }
  if (card.due_date && descendantBounds.end > card.due_date) {
    issues.push({
      type: "hierarchy_date_conflict",
      boundary: "end",
      severity: "warning",
      dependency: descendantBounds.endCard,
      message: `"${descendantBounds.endCard.title}" ends ${descendantBounds.end} after this card is due ${card.due_date}.`,
    });
  }
  return issues;
}

export function allCardIssues(card, cards) {
  return [...cardDependencyIssues(card, cards), ...cardHierarchyDateIssues(card, cards)];
}

export function dependencyDependentsFor(cardId, cards) {
  return cards.filter((card) => (card.dependency_ids || []).includes(cardId));
}

export function cardCanChangeType(card, nextType, cards) {
  if (card.card_type === nextType) return true;
  if (cards.some((candidate) => candidate.parent_id === card.id)) return false;

  const expectedParentType = parentTypeByCardType[nextType];
  if (!expectedParentType) return !card.parent_id;

  const parent = cards.find((candidate) => candidate.id === card.parent_id);
  return parent?.card_type === expectedParentType;
}

export function hierarchyShiftForCard(card, nextType, cards) {
  const storedCard = cards.find((candidate) => candidate.id === card.id);
  if (!storedCard || storedCard.card_type === nextType) return null;

  const offset = cardTypeOrder[nextType] - cardTypeOrder[storedCard.card_type];
  const descendants = collectDescendants(card.id, cards);
  return {
    descendants,
    direction: offset > 0 ? "down" : "up",
    levels: Math.abs(offset),
    isBlocked: descendants.some(
      (descendant) => cardTypeOrder[descendant.card_type] + offset > cardTypeOrder.subtask,
    ),
  };
}

export function dependencyEdgesForCards(cards) {
  return cards.flatMap((card) =>
    (card.dependency_ids || [])
      .map((dependencyId) => {
        const dependency = cards.find((candidate) => candidate.id === dependencyId);
        if (!dependency) return null;
        const issues = cardDependencyIssues(card, cards).filter((issue) => issue.dependency.id === dependency.id);
        return { dependency, dependent: card, issues };
      })
      .filter(Boolean),
  );
}

export function summarizeCards(cards) {
  const byStatus = Object.fromEntries(STATUSES.map((status) => [status, 0]));
  const byType = Object.fromEntries(CARD_TYPES.map((type) => [type, 0]));
  let overdue = 0;
  let dueSoon = 0;
  let nextDueDate = "";
  const today = formatDateInput(new Date());
  const soon = addDays(today, 14);

  for (const card of cards) {
    byStatus[card.status] += 1;
    byType[card.card_type] += 1;
    if (isOverdue(card)) overdue += 1;
    if (card.due_date && card.status !== "done" && card.due_date >= today && card.due_date <= soon) dueSoon += 1;
    if (card.due_date && card.status !== "done" && (!nextDueDate || card.due_date < nextDueDate)) {
      nextDueDate = card.due_date;
    }
  }

  return {
    total: cards.length,
    byStatus,
    byType,
    blocked: byStatus.blocked,
    done: byStatus.done,
    overdue,
    dueSoon,
    nextDueDate,
    completion: cards.length ? Math.round((byStatus.done / cards.length) * 100) : 0,
  };
}

export function sortCardsForRoadmap(cards) {
  return [...cards].sort((first, second) => {
    const firstDue = first.due_date || "9999-12-31";
    const secondDue = second.due_date || "9999-12-31";
    if (firstDue !== secondDue) return firstDue.localeCompare(secondDue);
    return statusOrder[first.status] - statusOrder[second.status] || first.title.localeCompare(second.title);
  });
}

export function getMonthCalendarDays(monthStart) {
  const startDate = parseLocalDate(monthStart);
  const gridStart = new Date(startDate);
  gridStart.setDate(1 - gridStart.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const next = new Date(gridStart);
    next.setDate(gridStart.getDate() + index);
    return formatDateInput(next);
  });
}
