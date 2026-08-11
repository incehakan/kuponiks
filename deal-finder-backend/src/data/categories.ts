/**
 * Hierarchical Turkish marketplace category tree (Sahibinden-style).
 */

export interface CategoryNode {
  id: string;
  name: string;
  children?: CategoryNode[];
}

export const CATEGORY_TREE: CategoryNode[] = [
  {
    id: "vasita",
    name: "Vasıta",
    children: [
      { id: "vasita-otomobil", name: "Otomobil" },
      { id: "vasita-arazi-suv-pickup", name: "Arazi, SUV & Pickup" },
      { id: "vasita-motosiklet", name: "Motosiklet" },
      { id: "vasita-minivan-panelvan", name: "Minivan & Panelvan" },
      { id: "vasita-ticari", name: "Ticari Araçlar" },
      { id: "vasita-deniz", name: "Deniz Araçları" },
      { id: "vasita-hasarli", name: "Hasarlı Araçlar" },
      { id: "vasita-klasik", name: "Klasik Araçlar" },
      { id: "vasita-elektrikli-bisiklet", name: "Elektrikli Bisiklet" },
      { id: "vasita-atv", name: "ATV" },
      { id: "vasita-karavan", name: "Karavan" },
    ],
  },
  {
    id: "emlak",
    name: "Emlak",
    children: [
      { id: "emlak-konut", name: "Konut" },
      { id: "emlak-isyeri", name: "İşyeri" },
      { id: "emlak-arsa", name: "Arsa" },
      { id: "emlak-devremulk", name: "Devre Mülk" },
      { id: "emlak-turistik", name: "Turistik Tesis" },
      { id: "emlak-konut-projeleri", name: "Konut Projeleri" },
    ],
  },
  {
    id: "elektronik",
    name: "Elektronik",
    children: [
      { id: "elektronik-cep-telefonu", name: "Cep Telefonu" },
      { id: "elektronik-bilgisayar", name: "Bilgisayar" },
      { id: "elektronik-tablet", name: "Tablet" },
      { id: "elektronik-fotograf-kamera", name: "Fotoğraf & Kamera" },
      { id: "elektronik-tv-goruntu", name: "TV & Görüntü" },
      { id: "elektronik-ses-sistemleri", name: "Ses Sistemleri" },
      { id: "elektronik-giyilebilir", name: "Giyilebilir Teknoloji" },
      { id: "elektronik-oyun-konsol", name: "Oyun & Konsol" },
    ],
  },
  {
    id: "ev-yasam",
    name: "Ev & Yaşam",
    children: [
      { id: "ev-beyaz-esya", name: "Beyaz Eşya" },
      { id: "ev-mobilya", name: "Mobilya" },
      { id: "ev-dekorasyon", name: "Dekorasyon" },
      { id: "ev-mutfak", name: "Mutfak Gereçleri" },
      { id: "ev-bahce", name: "Bahçe" },
      { id: "ev-ev-tekstili", name: "Ev Tekstili" },
    ],
  },
  {
    id: "is-makineleri",
    name: "İş Makineleri & Sanayi",
    children: [
      { id: "is-makineleri", name: "İş Makineleri" },
      { id: "is-tarim", name: "Tarım Makineleri" },
      { id: "is-sanayi", name: "Sanayi" },
      { id: "is-elektrik-enerji", name: "Elektrik & Enerji" },
    ],
  },
  {
    id: "giyim-aksesuar",
    name: "Giyim & Aksesuar",
    children: [
      { id: "giyim-kadin", name: "Kadın Giyim" },
      { id: "giyim-erkek", name: "Erkek Giyim" },
      { id: "giyim-cocuk", name: "Çocuk Giyim" },
      { id: "giyim-saat", name: "Saat" },
      { id: "giyim-ayakkabi", name: "Ayakkabı & Çanta" },
    ],
  },
  {
    id: "anne-bebek",
    name: "Anne & Bebek",
    children: [
      { id: "anne-bebek-araclari", name: "Bebek Araç Gereçleri" },
      { id: "anne-bebek-giyim", name: "Bebek Giyim" },
      { id: "anne-oyuncak", name: "Oyuncak" },
    ],
  },
  {
    id: "spor-outdoor",
    name: "Spor & Outdoor",
    children: [
      { id: "spor-fitness", name: "Fitness & Kondisyon" },
      { id: "spor-bisiklet", name: "Bisiklet" },
      { id: "spor-kamp", name: "Kamp & Outdoor" },
      { id: "spor-su", name: "Su Sporları" },
    ],
  },
  {
    id: "hobi-eglence",
    name: "Hobi & Eğlence",
    children: [
      { id: "hobi-muzik", name: "Müzik Aletleri" },
      { id: "hobi-koleksiyon", name: "Koleksiyon" },
      { id: "hobi-kitap", name: "Kitap & Dergi" },
      { id: "hobi-film", name: "Film & Müzik" },
    ],
  },
  {
    id: "yedek-parca",
    name: "Yedek Parça, Aksesuar & Tuning",
    children: [
      { id: "yedek-otomotiv", name: "Otomotiv Ekipmanları" },
      { id: "yedek-motosiklet", name: "Motosiklet Ekipmanları" },
      { id: "yedek-deniz", name: "Deniz Aracı Ekipmanları" },
    ],
  },
];

/**
 * Flattens the tree into leaf paths like "Vasıta > Otomobil".
 */
export function flattenCategoryPaths(
  nodes: CategoryNode[] = CATEGORY_TREE,
  parentPath = "",
): Array<{ id: string; path: string; name: string; parent?: string }> {
  const results: Array<{
    id: string;
    path: string;
    name: string;
    parent?: string;
  }> = [];

  for (const node of nodes) {
    const path = parentPath ? `${parentPath} > ${node.name}` : node.name;

    if (node.children && node.children.length > 0) {
      results.push(...flattenCategoryPaths(node.children, path));
    } else {
      results.push({
        id: node.id,
        path,
        name: node.name,
        ...(parentPath ? { parent: parentPath } : {}),
      });
    }
  }

  return results;
}
