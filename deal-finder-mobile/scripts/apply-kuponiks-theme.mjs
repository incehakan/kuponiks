/**
 * Property-aware Kuponiks theme hex remapping for RN StyleSheets / inline colors.
 */
import fs from "fs";
import path from "path";

const ROOT = path.resolve("src");

const files = [
  "screens/main/FiltersScreen.tsx",
  "screens/main/ProfileScreen.tsx",
  "screens/main/HomeScreen.tsx",
  "screens/DealDetailScreen.tsx",
  "components/UpgradeModal.tsx",
  "components/PaymentWebViewModal.tsx",
  "navigation/AppNavigator.tsx",
  "services/pushNotifications.ts",
];

const STANDALONE = {
  "#0D9488": "#FF7A00",
  "#14B8A6": "#FF7A00",
  "#10B981": "#FF7A00",
  "#CCFBF1": "#3D1E6D",
  "#DCFCE7": "#3D1E6D",
  "#166534": "#FF7A00",
  "#F8FAFC": "#240D47",
  "#E2E8F0": "#2A164D",
  "#64748B": "#A0A0C0",
  "#475569": "#A0A0C0",
  "#94A3B8": "#666688",
  "#334155": "#A0A0C0",
  "#FEF08A": "#3D1E6D",
  "#854D0E": "#FF7A00",
};

function mapProp(prop, hex) {
  const h = hex.toUpperCase();

  if (h === "#FFFFFF" || h === "#FFF") {
    if (prop === "color" || prop === "tintColor" || prop === "thumbColor") {
      return "#FFFFFF";
    }
    return "#1A0836";
  }

  if (h === "#0F172A") {
    if (prop === "color") return "#FFFFFF";
    return "#12022B";
  }

  return STANDALONE[h] ?? hex;
}

function transform(source) {
  // property: '#hex' or property: "#hex"
  let out = source.replace(
    /(backgroundColor|borderColor|borderTopColor|borderBottomColor|borderLeftColor|borderRightColor|color|tintColor|shadowColor|thumbColor|lightColor)\s*:\s*(['"])(#[0-9A-Fa-f]{3,8})\2/g,
    (_m, prop, quote, hex) => `${prop}: ${quote}${mapProp(prop, hex)}${quote}`,
  );

  // color="#hex" or color={'#hex'}
  out = out.replace(
    /color=\{?(['"])(#[0-9A-Fa-f]{3,8})\1\}?/g,
    (m, quote, hex) => {
      const mapped = mapProp("tintColor", hex);
      if (m.includes("{")) return `color={${quote}${mapped}${quote}}`;
      return `color=${quote}${mapped}${quote}`;
    },
  );

  // colors={['#hex']}
  out = out.replace(
    /colors=\{\[(['"])(#[0-9A-Fa-f]{3,8})\1\]\}/g,
    (_m, quote, hex) => `colors={[${quote}${mapProp("tintColor", hex)}${quote}]}`,
  );

  // bg: '#hex' helper objects
  out = out.replace(
    /\bbg:\s*(['"])(#[0-9A-Fa-f]{3,8})\1/g,
    (_m, quote, hex) => `bg: ${quote}${mapProp("backgroundColor", hex)}${quote}`,
  );

  return out;
}

for (const rel of files) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) {
    console.warn("skip missing", rel);
    continue;
  }
  const before = fs.readFileSync(full, "utf8");
  const after = transform(before);
  fs.writeFileSync(full, after);
  console.log("updated", rel);
}

console.log("THEME_SWEEP_OK");
