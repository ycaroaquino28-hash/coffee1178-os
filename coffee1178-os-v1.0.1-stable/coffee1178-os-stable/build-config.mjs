import fs from "node:fs";

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Faltam VITE_SUPABASE_URL e/ou VITE_SUPABASE_PUBLISHABLE_KEY.");
  process.exit(1);
}

const safeUrl = JSON.stringify(url);
const safeKey = JSON.stringify(key);

fs.writeFileSync(
  "config.js",
  `window.COFFEE1178_CONFIG={SUPABASE_URL:${safeUrl},SUPABASE_KEY:${safeKey}};\n`,
  "utf8"
);

console.log("Configuração pública gerada com sucesso.");
