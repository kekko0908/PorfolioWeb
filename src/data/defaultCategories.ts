import type { CategoryType } from "../types";

export interface CategorySeed {
  type: CategoryType;
  name: string;
  children?: string[];
}

export const defaultCategories: CategorySeed[] = [
  {
    type: "income",
    name: "Reddito da Lavoro",
    children: [
      "Stipendio Netto",
      "Tredicesima / Quattordicesima",
      "Bonus & Premi Produzione",
      "Buoni Pasto"
    ]
  },
  {
    type: "income",
    name: "Extra & Side Hustle",
    children: [
      "Freelance / Prestazioni Occasionali",
      "Vendita Oggetti Usati (Vinted, eBay)",
      "Consulenze / Lezioni Private"
    ]
  },
  {
    type: "income",
    name: "Regali & Aiuti",
    children: ["Regali in denaro ricevuti", "Supporto familiare / Eredita"]
  },
  {
    type: "income",
    name: "Rimborsi & Tecnici",
    children: [
      "Rimborso 730 (Credito d'imposta)",
      "Resi (Storno spese)",
      "Giroconti (Trasferimenti interni)"
    ]
  },
  {
    type: "expense",
    name: "Casa & Utenze",
    children: [
      "Affitto / Mutuo",
      "Condominio",
      "Energia Elettrica & Gas",
      "Acqua & TARI",
      "Internet & Telefono",
      "Manutenzione & Pulizia"
    ]
  },
  {
    type: "expense",
    name: "Alimentazione",
    children: [
      "Spesa Supermercato",
      "Ristoranti & Delivery",
      "Bar, Caffe & Colazioni",
      "Pausa Pranzo Lavoro"
    ]
  },
  {
    type: "expense",
    name: "Trasporti",
    children: [
      "Carburante",
      "Assicurazione & Bollo (Rateizzato)",
      "Manutenzione & Tagliandi",
      "Mezzi Pubblici / Treni / Aerei",
      "Pedaggi & Parcheggi"
    ]
  },
  {
    type: "expense",
    name: "Salute & Cura Personale",
    children: [
      "Farmacia & Medicine",
      "Visite Mediche & Dentista",
      "Igiene Personale & Cosmetica",
      "Parrucchiere & Estetica"
    ]
  },
  {
    type: "expense",
    name: "Svago & Lifestyle",
    children: [
      "Abbonamenti (Streaming, Cloud, App)",
      "Shopping (Vestiti, Scarpe, Accessori)",
      "Elettronica & Gadget",
      "Hobby, Sport & Libri",
      "Uscite serali & Divertimento",
      "Viaggi & Weekend"
    ]
  },
  {
    type: "expense",
    name: "Finanza & Obblighi",
    children: [
      "Commissioni Bancarie",
      "Tasse & Bolli Statali",
      "Commercialista",
      "Interessi passivi su prestiti"
    ]
  },
  {
    type: "expense",
    name: "Famiglia & Altro",
    children: [
      "Spese per Figli (Scuola, Sport)",
      "Animali Domestici (Cibo, Vet)",
      "Regali fatti ad altri",
      "Beneficenza"
    ]
  },
  {
    type: "investment",
    name: "Versamenti (Input Capitale)",
    children: [
      "PAC (Piano Accumulo ETF/Fondi)",
      "Acquisto Azioni Singole / Bond",
      "Versamento Fondo Pensione",
      "Versamento Conto Deposito / Liquidita",
      "Acquisto Crypto / Oro"
    ]
  },
  {
    type: "investment",
    name: "Rendita Generata (Flusso Positivo)",
    children: [
      "Dividendi Azionari",
      "Cedole Obbligazionarie",
      "Interessi da Conto Deposito",
      "Affitti Percepiti"
    ]
  },
  {
    type: "investment",
    name: "Disinvestimenti (Output Capitale)",
    children: [
      "Vendita Titoli (Ritorno in liquidita)",
      "Scadenza Vincoli / Obbligazioni"
    ]
  }
];
