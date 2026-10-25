// O Next.js 16 grava os ficheiros de pré-carregamento de cada segmento em
// pastas (ex.: out/medications/__next.medications/__PAGE__.txt), mas o cliente
// pede-os com pontos (out/medications/__next.medications.__PAGE__.txt). Num
// alojamento estático simples isso dá 404 e a navegação offline falha.
// Este passo cria também a versão "com pontos" de cada ficheiro.
import { copyFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const OUT = "out";
let copied = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (name.endsWith(".txt")) flatten(p);
  }
}

function flatten(file) {
  const parts = relative(OUT, file).split(sep);
  const i = parts.findIndex((s, idx) => s.startsWith("__next.") && idx < parts.length - 1);
  if (i < 0) return;
  const flat = parts.slice(i).join(".");
  copyFileSync(file, join(OUT, ...parts.slice(0, i), flat));
  copied++;
}

walk(OUT);
console.log(`postbuild: ${copied} ficheiro(s) de segmento copiados.`);
