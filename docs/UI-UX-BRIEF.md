# UI/UX Brief — "Ban the AI Look"

Standing instructions for any agent building UI for Avary. Distilled 2026-11-23 from Griffin Wooldridge's video "UI Libraries for Claude Code (Ban the AI Look)" and Emil Kowalski's pick-ui-library skill.

Core rule: the generic "AI look" comes from hand-building every component from scratch. If a component type has a trusted library implementation, use the library. Check package.json first; if a listed library is already installed, use it; if a competitor is installed, flag it, don't churn it unasked. Recommend one library per need, not a menu.

Pick list — foundations: shadcn/ui (default for React+Tailwind), Base UI, Radix. Specialists, never hand-roll: toasts → Sonner; drawers/bottom sheets → Vaul; command menus (⌘K) → cmdk; OTP inputs → input-otp; animated numbers → NumberFlow; control panels → Leva. Motion: springs/layout/enter-exit → motion (Framer Motion); simple hovers/fades → plain CSS. Charts: live → Liveline, else recharts. Drag and drop → dnd kit; long lists → Virtuoso; syntax highlighting → shiki. State → zustand; conditional classes → clsx; typed variants → cva; dark mode → next-themes.

De-stock the foundation: default shadcn is its own AI look. Always customize theme tokens — typeface, border radius, palette, spacing rhythm.

One-Standout Rule: per view, ONE memorable component (sourced or inspired from Magic UI, Aceternity UI, 21st.dev, RareUI, Beautiful UI); everything else quiet and consistent.

Taste details: ease-out for enter animations (never ease-in); semi-transparent shadows instead of solid borders.
