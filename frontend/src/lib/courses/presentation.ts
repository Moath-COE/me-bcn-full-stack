import { z } from "zod";

const toneSchema = z.enum(["lilac", "base", "deep", "amber", "walnut", "olive", "oliveDark"]);
const iconSchema = z.enum(["coins", "bars", "blocks", "torus", "flask", "atom", "donut", "cube", "bolt"]);
export type Tone = z.infer<typeof toneSchema>;
export type IconKey = z.infer<typeof iconSchema>;

/* An unknown value from the API falls back to a safe tone and icon instead of failing the parse. */
export const safeTone = (value: unknown): Tone => {
  const parsed = toneSchema.safeParse(value);
  return parsed.success ? parsed.data : "lilac";
};
export const safeIcon = (value: unknown): IconKey => {
  const parsed = iconSchema.safeParse(value);
  return parsed.success ? parsed.data : "blocks";
};

export const TONES: Record<
  Tone,
  {
    card: string;
    title: string;
    meta: string;
    icon: string;
    chip: string;
    arrow: string;
  }
> = {
  lilac: {
    card: "bg-tint-aubergine border-aubergine-mid",
    title: "text-ink",
    meta: "text-ink-2",
    icon: "text-aubergine-base",
    chip: "border-aubergine-mid text-aubergine-base",
    arrow: "border-aubergine-mid text-aubergine-base",
  },
  amber: {
    card: "bg-tint-amber border-warmth",
    title: "text-ink",
    meta: "text-ink-2",
    icon: "text-aubergine-base",
    chip: "border-warmth text-ink",
    arrow: "border-warmth text-ink",
  },
  walnut: {
    card: "bg-tint-walnut border-warmth",
    title: "text-ink",
    meta: "text-ink-2",
    icon: "text-aubergine-base",
    chip: "border-warmth text-ink",
    arrow: "border-warmth text-ink",
  },
  olive: {
    card: "bg-olive-tint border-olive",
    title: "text-ink",
    meta: "text-ink-2",
    icon: "text-olive-deep",
    chip: "border-olive text-olive-deep",
    arrow: "border-olive text-olive-deep",
  },
  base: {
    card: "bg-aubergine-base border-aubergine-soft",
    title: "text-on-dominant",
    meta: "text-aubergine-tint",
    icon: "text-aubergine-tint",
    chip: "border-aubergine-soft text-aubergine-tint",
    arrow: "border-aubergine-soft text-on-dominant",
  },
  deep: {
    card: "bg-aubergine-deep border-aubergine-mid",
    title: "text-on-dominant",
    meta: "text-aubergine-tint",
    icon: "text-amber-bright",
    chip: "border-aubergine-soft text-aubergine-tint",
    arrow: "border-aubergine-soft text-on-dominant",
  },
  oliveDark: {
    card: "bg-olive-dark border-olive-soft",
    title: "text-on-dominant",
    meta: "text-olive-soft",
    icon: "text-olive-soft",
    chip: "border-olive-soft text-olive-soft",
    arrow: "border-olive-soft text-on-dominant",
  },
};

