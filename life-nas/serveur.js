// =====================================================================
// Life NAS — la porte d'entrée de Life vers les fichiers du NAS.
// Lister des dossiers, lire un fichier (vidéo comprise, par morceaux).
// Lecture seule. Accès par jeton. Réservé à l'origine de l'app Life.
// Aucune dépendance : Node seul. Aucun secret dans ce fichier (dépôt public) :
// le jeton vient de la variable d'environnement JETON.
// =====================================================================
"use strict";
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = +process.env.PORT || 8787;
const RACINE = path.resolve(process.env.RACINE || "/data");
const JETON = process.env.JETON || "";
const ORIGINES = (process.env.ORIGINES || "https://laurent1meyer.github.io").split(",").map(s => s.trim()).filter(Boolean);
if (JETON.length < 16) { console.error("JETON manquant ou trop court (16 caractères minimum) : le serveur refuse de démarrer."); process.exit(1); }

const TYPES = { ".mp4":"video/mp4", ".m4v":"video/mp4", ".mov":"video/quicktime", ".webm":"video/webm", ".mkv":"video/x-matroska",
  ".mp3":"audio/mpeg", ".m4a":"audio/mp4", ".aac":"audio/aac", ".wav":"audio/wav", ".flac":"audio/flac",
  ".jpg":"image/jpeg", ".jpeg":"image/jpeg", ".png":"image/png", ".gif":"image/gif", ".heic":"image/heic", ".webp":"image/webp",
  ".pdf":"application/pdf", ".txt":"text/plain; charset=utf-8", ".md":"text/markdown; charset=utf-8", ".json":"application/json", ".csv":"text/csv; charset=utf-8" };
const typeDe = f => TYPES[path.extname(f).toLowerCase()] || "application/octet-stream";

function egal(a, b){ const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function cors(req, res){
  const o = req.headers.origin;
  if (o && ORIGINES.includes(o)) { res.setHeader("Access-Control-Allow-Origin", o); res.setHeader("Vary", "Origin"); }
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Range");
  res.setHeader("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
  res.setHeader("Access-Control-Allow-Private-Network", "true");
}
function json(res, code, obj){ res.writeHead(code, { "Content-Type":"application/json; charset=utf-8", "Cache-Control":"no-store" }); res.end(JSON.stringify(obj)); }
// Un chemin demandé ne doit jamais sortir de RACINE
function resoudre(ch){
  const p = path.resolve(RACINE, "." + path.posix.normalize("/" + String(ch || "").replace(/\\/g, "/")));
  if (p !== RACINE && !p.startsWith(RACINE + path.sep)) return null;
  return p;
}
const relatif = p => "/" + path.relative(RACINE, p).split(path.sep).join("/");

const API = {
  nom: "Life NAS", version: 1,
  description: "Fichiers du NAS de Laurent, en lecture seule. Chaque appel (sauf celui-ci) demande le jeton : en-tête « Authorization: Bearer <jeton> », ou paramètre « jeton=<jeton> » pour une balise <video>/<img>.",
  appels: {
    "GET /liste?chemin=/dossier": "Contenu d'un dossier : { chemin, parent, dossiers:[{nom, chemin}], fichiers:[{nom, chemin, taille, modifie, type}] }. Fichiers et dossiers cachés exclus.",
    "GET /fichier?chemin=/dossier/film.mp4": "Le fichier lui-même ; les requêtes Range sont gérées (lecture vidéo par morceaux).",
    "GET /chercher?q=texte&chemin=/": "Fichiers dont le nom contient le texte (500 au plus) : { resultats:[{nom, chemin, taille, type}] }."
  },
  exemple_video: "<video controls playsinline src=\"https://<nas>/fichier?chemin=/Vidéos/film.mp4&jeton=<jeton>\"></video>",
  remarque: "L'iPhone lit le MP4 (H.264/HEVC) et le MOV ; pas le MKV."
};

function lister(res, ch){
  const p = resoudre(ch); if (!p) return json(res, 400, { erreur:"chemin invalide" });
  fs.readdir(p, { withFileTypes:true }, (err, ents) => {
    if (err) return json(res, err.code === "ENOENT" ? 404 : 500, { erreur: err.code === "ENOENT" ? "dossier introuvable" : err.message });
    const dossiers = [], fichiers = [];
    for (const e of ents) {
      if (e.name.startsWith(".") || e.name.startsWith("@") || e.name === "#recycle") continue;   // fichiers cachés et dossiers système Synology
      const q = path.join(p, e.name);
      if (e.isDirectory()) dossiers.push({ nom:e.name, chemin:relatif(q) });
      else if (e.isFile()) { try { const st = fs.statSync(q); fichiers.push({ nom:e.name, chemin:relatif(q), taille:st.size, modifie:st.mtime.toISOString(), type:typeDe(e.name) }); } catch (_) {} }
    }
    const tri = (a, b) => a.nom.localeCompare(b.nom, "fr");
    json(res, 200, { chemin:relatif(p), parent: p === RACINE ? null : relatif(path.dirname(p)), dossiers:dossiers.sort(tri), fichiers:fichiers.sort(tri) });
  });
}
function chercher(res, q, ch){
  const p = resoudre(ch || "/"); if (!p) return json(res, 400, { erreur:"chemin invalide" });
  const t = String(q || "").toLowerCase().trim(); if (t.length < 2) return json(res, 400, { erreur:"texte trop court" });
  const resultats = []; const pile = [p]; let vus = 0;
  while (pile.length && resultats.length < 500 && vus < 20000) {
    const d = pile.pop(); let ents; try { ents = fs.readdirSync(d, { withFileTypes:true }); } catch (_) { continue; }
    for (const e of ents) { vus++;
      if (e.name.startsWith(".") || e.name.startsWith("@") || e.name === "#recycle") continue;
      const q2 = path.join(d, e.name);
      if (e.isDirectory()) pile.push(q2);
      else if (e.isFile() && e.name.toLowerCase().includes(t)) { try { resultats.push({ nom:e.name, chemin:relatif(q2), taille:fs.statSync(q2).size, type:typeDe(e.name) }); } catch (_) {} }
    }
  }
  json(res, 200, { q:t, resultats });
}
function servir(req, res, ch){
  const p = resoudre(ch); if (!p) return json(res, 400, { erreur:"chemin invalide" });
  fs.stat(p, (err, st) => {
    if (err || !st.isFile()) return json(res, 404, { erreur:"fichier introuvable" });
    const type = typeDe(p), taille = st.size;
    const base = { "Content-Type":type, "Accept-Ranges":"bytes", "Cache-Control":"private, max-age=3600",
      "Content-Disposition":"inline; filename*=UTF-8''" + encodeURIComponent(path.basename(p)) };
    const r = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (r) {
      let debut = r[1] === "" ? taille - +r[2] : +r[1];
      let fin = r[1] !== "" && r[2] !== "" ? +r[2] : taille - 1;
      if (r[1] === "") fin = taille - 1;
      if (isNaN(debut) || debut < 0 || debut >= taille || fin < debut) { res.writeHead(416, { "Content-Range":`bytes */${taille}` }); return res.end(); }
      fin = Math.min(fin, taille - 1);
      res.writeHead(206, { ...base, "Content-Range":`bytes ${debut}-${fin}/${taille}`, "Content-Length":fin - debut + 1 });
      if (req.method === "HEAD") return res.end();
      return fs.createReadStream(p, { start:debut, end:fin }).pipe(res);
    }
    res.writeHead(200, { ...base, "Content-Length":taille });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(p).pipe(res);
  });
}

http.createServer((req, res) => {
  cors(req, res);
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  if (req.method !== "GET" && req.method !== "HEAD") return json(res, 405, { erreur:"lecture seule" });
  const u = new URL(req.url, "http://nas");
  if (u.pathname === "/" || u.pathname === "") return json(res, 200, API);
  const auth = (req.headers.authorization || "").replace(/^Bearer\s+/i, "") || u.searchParams.get("jeton") || "";
  if (!egal(auth, JETON)) return json(res, 401, { erreur:"jeton manquant ou faux" });
  if (u.pathname === "/liste") return lister(res, u.searchParams.get("chemin") || "/");
  if (u.pathname === "/fichier") return servir(req, res, u.searchParams.get("chemin"));
  if (u.pathname === "/chercher") return chercher(res, u.searchParams.get("q"), u.searchParams.get("chemin"));
  json(res, 404, { erreur:"appel inconnu", voir:"GET /" });
}).listen(PORT, () => console.log(`Life NAS : port ${PORT}, racine ${RACINE}, origines ${ORIGINES.join(", ")}`));
