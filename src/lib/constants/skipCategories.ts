import { SkipCategory } from "@/lib/types/models";

export const SKIP_CATEGORIES: SkipCategory[] = [
  {
    id: "coffee",
    label: "Coffee",
    emoji: "☕",
    defaultAmount: 5.5,
    color: "#92400E",
  },
  {
    id: "food",
    label: "Food",
    emoji: "🍔",
    defaultAmount: 15,
    color: "#D97706",
  },
  {
    id: "drinks",
    label: "Drinks",
    emoji: "🍺",
    defaultAmount: 8,
    color: "#7C3AED",
  },
  {
    id: "streaming",
    label: "Streaming",
    emoji: "📺",
    defaultAmount: 14.99,
    color: "#DC2626",
  },
  {
    id: "shopping",
    label: "Shopping",
    emoji: "🛍️",
    defaultAmount: 25,
    color: "#059669",
  },
  {
    id: "uber",
    label: "Uber/Taxi",
    emoji: "🚗",
    defaultAmount: 12,
    color: "#1D4ED8",
  },
  {
    id: "entertainment",
    label: "Entertainment",
    emoji: "🎬",
    defaultAmount: 20,
    color: "#DB2777",
  },
  {
    id: "custom",
    label: "Custom",
    emoji: "✏️",
    defaultAmount: 10,
    color: "#6B7280",
  },
];
