/* ============================================================
   SILLAGE — capture.js  (V2.0 · relève via API GitHub)
   Lit inbox.txt du repo privé sillage-inbox, crée une entrée
   au vivier par ligne, puis vide le fichier (commit "purge").
   Client du Store comme l'UI : tout passe par Store.actions.*.
   Le jeton n'est JAMAIS dans le code : il vit dans le
   localStorage de chaque appareil (voir definirJeton).
   Format d'une ligne : "2026-07-17 19:25 | réparer le mur"
   ============================================================ */

const Capture = (() => {

  const API = "https://api.github.com/repos/Laurent1meyer/sillage-inbox/contents/inbox.txt";
  const CLE_JETON = "sillage_capture_jeton";     // localStorage, par appareil

  let _enCours = false;

  //=========================================================
  // JETON — stocké localement, jamais commité
  //=========================================================
  const jeton = () => { try { return localStorage.getItem(CLE_JETON); } catch(e){ return null; } };

  function definirJeton(t){
    try {
      if(t && t.trim()){ localStorage.setItem(CLE_JETON, t.trim()); return true; }
      localStorage.removeItem(CLE_JETON); return false;
    } catch(e){ return false; }
  }

  const entetes = () => ({
    "Authorization": "Bearer " + jeton(),
    "Accept": "application/vnd.github+json"
  });

  //=========================================================
  // BASE64 ↔ TEXTE (UTF-8 strict — atob seul massacre les accents,
  // leçon du mojibake retenue 😄 ; fatal:true rejette un flux
  // mal formé plutôt que de le remplacer silencieusement)
  //=========================================================
  function b64VersTexte(b64){
    const bin = atob(b64.replace(/\s/g, ""));
    return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }

  //=========================================================
  // PARSING — "date | texte", tolérant
  //=========================================================
  function parserLigne(ligne){
    const i = ligne.indexOf(" | ");
    return {
      horodatage: i > 0 ? ligne.slice(0, i).trim() : null,
      texte:      i > 0 ? ligne.slice(i + 3).trim() : ligne.trim()
    };
  }

  function empreintesExistantes(){
    const s = new Set();
    for(const o of Store.tous())
      if(o.champs && o.champs.capture) s.add(o.champs.capture + "|" + o.titre);
    return s;
  }

  //=========================================================
  // RELÈVE
  //=========================================================
  async function relever(){
    if(_enCours || !jeton()) return {ok:false, raison: jeton() ? "déjà en cours" : "jeton absent"};
    _enCours = true;
    try{
      // 1) lire la boîte
      const r = await fetch(API, { headers: entetes(), cache: "no-store" });
      if(!r.ok){ console.warn("Capture : GET →", r.status); return {ok:false, raison:"HTTP "+r.status}; }
      const doc = await r.json();                 // { content: base64, sha: ... }
      const brut = doc.content ? b64VersTexte(doc.content) : "";
      const lignes = brut.split("\n").map(l => l.trim()).filter(Boolean);
      if(lignes.length === 0) return {ok:true, importees:0};

      // 2) créer les entrées au vivier — via l'action officielle
      const deja = empreintesExistantes();
      let importees = 0;
      for(const ligne of lignes){
        const {horodatage, texte} = parserLigne(ligne);
        if(!texte) continue;
        if(horodatage && deja.has(horodatage + "|" + texte)) continue;   // doublon
        const res = Store.actions.creer({
          titre:  texte,
          nature: "tache",
          statut: "a_planifier",                  // → le vivier
          champs: horodatage ? { capture: horodatage } : {}
        }, "capture");
        if(res.ok) importees++;
        else console.warn("Capture : ligne refusée —", ligne, res.erreur);
      }

      // 3) purger APRÈS insertion (le sha protège : si une capture
      //    arrive entre-temps, GitHub répond 409, rien n'est perdu,
      //    l'anti-doublon absorbera la relève suivante)
      const p = await fetch(API, {
        method: "PUT", headers: entetes(),
        body: JSON.stringify({ message: "purge", content: "", sha: doc.sha })
      });
      if(!p.ok) console.warn("Capture : purge →", p.status);

      return {ok:true, importees};
    }catch(e){
      console.warn("Capture : relève impossible —", e.message);   // hors ligne : silencieux
      return {ok:false, raison:e.message};
    }finally{
      _enCours = false;
    }
  }

  //=========================================================
  // INITIALISATION — à appeler UNE fois, après Store.init()
  //=========================================================
  function init(options){
    options = options || {};
    const alerter = options.alerter || (n => console.log("Capture :", n, "entrée(s) au vivier"));
    const lancer = () => relever().then(r => { if(r.ok && r.importees > 0) alerter(r.importees); });
    lancer();
    document.addEventListener("visibilitychange", () => {
      if(document.visibilityState === "visible") lancer();
    });
  }

  return { init, relever, definirJeton, aJeton: () => !!jeton() };
})();

if(typeof module !== "undefined") module.exports = Capture;
