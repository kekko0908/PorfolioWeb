import type { Category } from "../types";

const iconByName: Record<string, string> = {
  "Reddito da Lavoro": "\u{1F4BC}",
  "Extra & Side Hustle": "\u{1F6E0}",
  "Regali & Aiuti": "\u{1F381}",
  Regali: "\u{1F381}",
  "Rimborsi & Tecnici": "\u{1F9FE}",
  "Casa & Utenze": "\u{1F3E0}",
  Alimentazione: "\u{1F37D}",
  Trasporti: "\u{1F697}",
  "Salute & Cura Personale": "\u{1FA7A}",
  "Svago & Lifestyle": "\u{1F389}",
  "Finanza & Obblighi": "\u{1F4D1}",
  "Famiglia & Altro": "\u{1F46A}",
  "Versamenti (Input Capitale)": "\u{1F4C8}",
  "Rendita Generata (Flusso Positivo)": "\u{1F4B8}",
  "Disinvestimenti (Output Capitale)": "\u{1F4C9}"
};

export const buildCategoryIcons = (categories: Category[]) => {
  const byId = new Map<string, string>();
  const lookup = new Map(categories.map((category) => [category.id, category]));
  categories.forEach((category) => {
    const parent = category.parent_id ? lookup.get(category.parent_id) : null;
    const icon =
      iconByName[category.name] ??
      (parent ? iconByName[parent.name] : undefined) ??
      "\u{1F4CC}";
    byId.set(category.id, icon);
  });
  return byId;
};
