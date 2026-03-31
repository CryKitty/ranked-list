import { CardEntry, ColumnDefinition } from "@/lib/types";

export const demoColumns: ColumnDefinition[] = [
  {
    id: "favorites",
    title: "Favorites Of All Time",
    description: "Your master ranking across everything you've played.",
    type: "ranked",
    accent: "from-amber-300 via-orange-400 to-rose-500",
  },
  {
    id: "wishlist",
    title: "Want To Play",
    description: "Backlog and future releases worth keeping in view.",
    type: "wishlist",
    accent: "from-sky-300 via-cyan-400 to-teal-500",
  },
  {
    id: "2026",
    title: "Played In 2026",
    description: "Anything added here is mirrored into Favorites automatically.",
    type: "ranked",
    accent: "from-fuchsia-300 via-pink-400 to-rose-500",
    autoMirrorToColumnId: "favorites",
  },
  {
    id: "2025",
    title: "Played In 2025",
    description: "Keep a yearly ranking without losing the all-time list.",
    type: "ranked",
    accent: "from-violet-300 via-indigo-400 to-blue-500",
    autoMirrorToColumnId: "favorites",
  },
];

export const demoCardsByColumn: Record<string, CardEntry[]> = {
  favorites: [
    {
      entryId: "entry-fav-1",
      itemId: "metaphor-refantazio",
      title: "Metaphor: ReFantazio",
      series: "Persona / Metaphor",
      imageUrl:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
      notes: "Huge world, stylish combat, and an easy game to evangelize.",
    },
    {
      entryId: "entry-fav-2",
      itemId: "nier-automata",
      title: "NieR: Automata",
      series: "NieR",
      imageUrl:
        "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
      notes: "Perfect for showing how series filters can surface a franchise.",
    },
    {
      entryId: "entry-fav-3",
      itemId: "persona-5-royal",
      title: "Persona 5 Royal",
      series: "Persona / Metaphor",
      imageUrl:
        "https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80",
    },
  ],
  wishlist: [
    {
      entryId: "entry-wish-1",
      itemId: "clair-obscur",
      title: "Clair Obscur: Expedition 33",
      series: "Expedition 33",
      imageUrl:
        "https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80",
    },
    {
      entryId: "entry-wish-2",
      itemId: "silksong",
      title: "Hollow Knight: Silksong",
      series: "Hollow Knight",
      imageUrl:
        "https://images.unsplash.com/photo-1579373903781-fd5c0c30c4cd?auto=format&fit=crop&w=1200&q=80",
    },
  ],
  "2026": [
    {
      entryId: "entry-2026-1",
      itemId: "metaphor-refantazio",
      title: "Metaphor: ReFantazio",
      series: "Persona / Metaphor",
      imageUrl:
        "https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=1200&q=80",
    },
  ],
  "2025": [
    {
      entryId: "entry-2025-1",
      itemId: "nier-automata",
      title: "NieR: Automata",
      series: "NieR",
      imageUrl:
        "https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=1200&q=80",
    },
  ],
};
