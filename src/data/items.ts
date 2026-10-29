import type { Slot } from '../core/model';

export type Tier = 'commun' | 'rare' | 'epique' | 'legendaire';

export interface Item {
  id: string;
  name: string;
  slot: Slot;
  tier: Tier;
  price: number;
}

/** The 50 cosmetic items. Prices follow the tiers of docs/specs/2026-10-29-v1.5-shop-design.md. */
export const CATALOG: Item[] = [
  { id: 'tshirt', name: 'T-shirt tout simple', slot: 'haut', tier: 'commun', price: 60 },
  { id: 'sweat', name: 'Sweat à capuche', slot: 'haut', tier: 'commun', price: 120 },
  { id: 'mariniere', name: 'Marinière', slot: 'haut', tier: 'commun', price: 140 },
  { id: 'chemise-lin', name: 'Chemise en lin', slot: 'haut', tier: 'rare', price: 350 },
  { id: 'pull-torsade', name: 'Pull torsadé', slot: 'haut', tier: 'rare', price: 480 },
  { id: 'veste-coach', name: 'Veste de coach', slot: 'haut', tier: 'epique', price: 1200 },
  { id: 'blazer-velours', name: 'Blazer en velours', slot: 'haut', tier: 'epique', price: 1600 },
  { id: 'costume-maitre', name: 'Costume de maître coach', slot: 'haut', tier: 'legendaire', price: 4500 },

  { id: 'jean', name: 'Jean délavé', slot: 'bas', tier: 'commun', price: 80 },
  { id: 'short', name: 'Short d’été', slot: 'bas', tier: 'commun', price: 70 },
  { id: 'jogging', name: 'Jogging confortable', slot: 'bas', tier: 'commun', price: 110 },
  { id: 'chino', name: 'Chino beige', slot: 'bas', tier: 'rare', price: 320 },
  { id: 'tailleur', name: 'Pantalon de tailleur', slot: 'bas', tier: 'rare', price: 550 },
  { id: 'kilt', name: 'Kilt écossais', slot: 'bas', tier: 'epique', price: 1100 },

  { id: 'bonnet', name: 'Bonnet de laine', slot: 'chapeau', tier: 'commun', price: 60 },
  { id: 'bandeau', name: 'Bandeau de sport', slot: 'chapeau', tier: 'commun', price: 75 },
  { id: 'casquette', name: 'Casquette', slot: 'chapeau', tier: 'commun', price: 90 },
  { id: 'bob', name: 'Bob de pêcheur', slot: 'chapeau', tier: 'commun', price: 100 },
  { id: 'beret', name: 'Béret', slot: 'chapeau', tier: 'rare', price: 300 },
  { id: 'paille', name: 'Chapeau de paille', slot: 'chapeau', tier: 'rare', price: 420 },
  { id: 'haut-de-forme', name: 'Haut-de-forme', slot: 'chapeau', tier: 'epique', price: 1400 },
  { id: 'laurier', name: 'Couronne de laurier', slot: 'chapeau', tier: 'epique', price: 1800 },
  { id: 'couronne', name: 'Couronne dorée', slot: 'chapeau', tier: 'legendaire', price: 6000 },

  { id: 'lunettes-rondes', name: 'Lunettes rondes', slot: 'lunettes', tier: 'commun', price: 80 },
  { id: 'lunettes-soleil', name: 'Lunettes de soleil', slot: 'lunettes', tier: 'commun', price: 130 },
  { id: 'lunettes-coeur', name: 'Lunettes cœur', slot: 'lunettes', tier: 'rare', price: 360 },
  { id: 'monocle', name: 'Monocle', slot: 'lunettes', tier: 'rare', price: 400 },
  { id: 'lunettes-or', name: 'Lunettes en or', slot: 'lunettes', tier: 'epique', price: 1300 },

  { id: 'echarpe', name: 'Écharpe rayée', slot: 'cou', tier: 'commun', price: 70 },
  { id: 'noeud', name: 'Nœud papillon', slot: 'cou', tier: 'commun', price: 150 },
  { id: 'cravate', name: 'Cravate', slot: 'cou', tier: 'rare', price: 310 },
  { id: 'foulard', name: 'Foulard en soie', slot: 'cou', tier: 'rare', price: 450 },
  { id: 'perles', name: 'Collier de perles', slot: 'cou', tier: 'epique', price: 1000 },
  { id: 'medaille', name: 'Médaille d’excellence', slot: 'cou', tier: 'legendaire', price: 3000 },

  { id: 'tasse', name: 'Tasse de thé', slot: 'objet', tier: 'commun', price: 65 },
  { id: 'carnet', name: 'Carnet de notes', slot: 'objet', tier: 'commun', price: 100 },
  { id: 'plume', name: 'Plume d’écrivain', slot: 'objet', tier: 'rare', price: 330 },
  { id: 'livre', name: 'Livre ancien', slot: 'objet', tier: 'rare', price: 380 },
  { id: 'micro', name: 'Micro de conférencier', slot: 'objet', tier: 'rare', price: 500 },
  { id: 'boussole', name: 'Boussole', slot: 'objet', tier: 'epique', price: 1500 },
  { id: 'lanterne', name: 'Lanterne magique', slot: 'objet', tier: 'legendaire', price: 3500 },

  { id: 'escargot', name: 'Escargot', slot: 'compagnon', tier: 'rare', price: 300 },
  { id: 'chaton', name: 'Chaton', slot: 'compagnon', tier: 'rare', price: 600 },
  { id: 'hibou', name: 'Petit hibou', slot: 'compagnon', tier: 'epique', price: 1700 },
  { id: 'dragon', name: 'Bébé dragon', slot: 'compagnon', tier: 'legendaire', price: 5000 },

  { id: 'parc', name: 'Parc fleuri', slot: 'decor', tier: 'rare', price: 300 },
  { id: 'plage', name: 'Plage', slot: 'decor', tier: 'epique', price: 1000 },
  { id: 'bibliotheque', name: 'Salle de lecture', slot: 'decor', tier: 'epique', price: 1200 },
  { id: 'nuit', name: 'Nuit étoilée', slot: 'decor', tier: 'epique', price: 1650 },
  { id: 'sommet', name: 'Sommet enneigé', slot: 'decor', tier: 'legendaire', price: 4000 },
];
