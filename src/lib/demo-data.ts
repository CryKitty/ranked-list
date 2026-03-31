import { CardEntry, ColumnDefinition } from "@/lib/types";

export const demoColumns: ColumnDefinition[] = [
  {
    id: "new-column",
    title: "New Column",
    description: "",
    type: "ranked",
    accent: "from-amber-300 via-orange-400 to-rose-500",
  },
];

export const demoCardsByColumn: Record<string, CardEntry[]> = {
  "new-column": [],
};
