import type { CardStatus, CardType } from "./types";

export const TASK_COUNT: number;
export const PRIORITY_COUNT: number;
export const STATUSES: CardStatus[];
export const CARD_TYPES: CardType[];
export const statusLabels: Record<CardStatus, string>;
export const cardTypeLabels: Record<CardType, string>;
export const activityFieldLabels: Record<string, string>;
export const parentTypeByCardType: Record<CardType, CardType | null>;
export const childTypeByCardType: Record<CardType, CardType | null>;
export const statusOrder: Record<CardStatus, number>;
export const cardTypeOrder: Record<CardType, number>;
export const PROJECT_VIEWS: string[];
export const projectCardCsvHeaders: string[];
export const defaultProjectFilters: {
  query: string;
  cardTypes: CardType[];
  statuses: CardStatus[];
  schedule: string;
};
