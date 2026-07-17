/* ============================================================
   SILLAGE — ui.js  (V2.0 · couche INTERFACE)
   Ne modifie JAMAIS les données directement :
   appelle Store.actions.*, écoute les notifications, redessine.
   ============================================================ */
(function(){
"use strict";
const $ = s => document.querySelector(s);
const esc = s => String(s??"").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

//================ CONFIG UI (clé API, modèle, contexte…) ================
const CFG_CLE = "sillage_cfg";
let cfg = {};
try{ cfg = JSON.parse(localStorage.getItem(CFG_CLE))||{}; }catch(e){}
cfg = Object.assign({cle:"", modele:"claude-sonnet-4-6", contexte:"", tokens:0, cout:0}, cfg);
const cfgSauver = () => localStorage.setItem(CFG_CLE, JSON.stringify(cfg));

//================ ÉTAT DE VUE ================
const V = { mode:"fil", zoom:"J", dom:"tous", tag:null,
            offS:0, offM:0, offA:0, filPasse:7, filFutur:21,
            tri:{cle:"date_apparition", sens:1} };
const F = o => (V.dom==="tous"||o.domaine===V.dom) && (!V.tag || (o.tags||[]).includes(V.tag));

//================ DATES & FORMATS ================
const MOIS=["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];
const JSEM=["dim.","lun.","mar.","mer.","jeu.","ven.","sam."];
const auj = () => Store.aujourdhui();
function dateDe(iso){ return new Date(iso+"T12:00:00"); }
function fmt(iso){
  if(iso===auj()) return "Aujourd'hui";
  if(iso===Store.plusJours(auj(),1)) return "Demain";
  if(iso===Store.plusJours(auj(),-1)) return "Hier";
  const d = dateDe(iso);
  return JSEM[d.getDay()]+" "+d.getDate()+" "+MOIS[d.getMonth()].slice(0,4)+".";
}
function lundiDe(offSem){
  const d = dateDe(auj());
  d.setDate(d.getDate() - ((d.getDay()+6)%7) + 7*offSem);
  return d;
}

//================ REQUÊTES DE VUE ================
function itemsDuJour(d){
  const res = [];
  for(const o of Store.tous()){
    if(!F(o) || o.nature==="projet") continue;
    if(o.nature==="rdv"){
      if((o.date_heure_debut||"").slice(0,10)===d) res.push({o, type:"rdv"});
      continue;
    }
    if(o.instances.some(i=>i.etat==="faite" && i.date_reelle===d)) res.push({o, type:"faite"});
    if(o.statut==="active"   && o.date_apparition===d) res.push({o, type:"active"});
    if(o.statut==="dormante" && o.date_apparition===d) res.push({o, type:"dormante"});
  }
  res.sort((a,b)=>{
    const h = x => x.type==="rdv" ? (x.o.date_heure_debut||"").slice(11) : "99";
    return h(a) < h(b) ? -1 : 1;
  });
  return res;
}

//================ CARTE (partagée) ================
// plat=true : rendu sans hiérarchie (fil quotidien) — ni glissement, ni
// récurrence, ni chip projet. Les fiches (jour, projet) gardent le détail complet.
function carte(it, plat){
  const o = it.o || it, type = it.type || "active";
  const hd = o.echeance_dure ? `<span class="hdure">⚑ ${esc(fmtCourt(o.echeance_dure))}</span>` : "";
  const gl = (!plat && type==="active" && o.glissements) ? `<span class="ondule">⌇${o.glissements}</span>` : "";
  const rec = (!plat && o.recurrence) ? `<span class="tag">↻${o.recurrence.jourMois?" le "+o.recurrence.jourMois:o.recurrence.n+"j"}</span>` : "";
  const heure = o.nature==="rdv" ? `<span>${esc((o.date_heure_debut||"").slice(11,16)||"journée")}</span>` : "";
  const p = plat ? null : Store.parent(o);
  const proj = p ? `<span class="tag">${esc(p.titre.slice(0,16))}</span>` : "";
  let coche = `<div style="width:24px"></div>`;
  if(o.nature==="tache"){
    if(type==="faite") coche = `<button class="coche ok" data-act="decocher" data-id="${o.id}">✓</button>`;
    else if(type!=="dormante") coche = `<button class="coche" data-act="cocher" data-id="${o.id}">✓</button>`;
  }
  return `<div class="carte ${o.domaine} ${o.nature} ${type==="faite"?"faite":""}" data-fiche="${o.id}">
    <div class="puce"></div>
    <div class="corps"><div class="t">${esc(o.titre)}</div>
      <div class="m">${heure}${gl}${hd}${rec}${proj}</div></div>
    ${coche}</div>`;
}
function fmtCourt(e){ return /^\d{4}-\d{2}-\d{2}$/.test(e) ? dateDe(e).getDate()+"/"+String(dateDe(e).getMonth()+1).padStart(2,"0") : e; }

//================ RENDU CENTRAL ================
function render(){
  syncSeg();
  const z = $("#zone");
  if(V.mode==="tab"){ z.innerHTML = rTableau(); return; }
  if(V.zoom==="J") z.innerHTML = rFil();
  if(V.zoom==="S") z.innerHTML = rSemaine();
  if(V.zoom==="M") z.innerHTML = rMois();
  if(V.zoom==="A") z.innerHTML = rAnnee();
  if(V.zoom!=="J") activerSwipe();
}

//---- J : le fil ----
function rFil(){
  let h = `<div id="fil"><button class="charger" data-act="passePlus">↑ charger le passé</button>`;
  for(let j=-V.filPasse; j<=V.filFutur; j++){
    const d = Store.plusJours(auj(), j);
    const items = itemsDuJour(d);
    if(j!==0 && !items.length) continue;
    h += `<div class="jour ${j===0?"auj":j<0?"passe":""}"><span class="noeud"></span>
      <h2>${fmt(d)}<small>${j===0?"le sillage te suit":j<0?"gravé":""}</small></h2></div>`;
    h += items.length ? items.map(it=>carte(it,true)).join("") : `<div class="vide">Rien pour aujourd'hui — profite ⛵</div>`;
  }
  h += `<button class="charger" data-act="futurPlus">↓ charger la suite</button></div>`;
  return h;
}

//---- S : semaine (carrousel) ----
function rSemaine(){
  const lundi = lundiDe(V.offS);
  const dim = new Date(lundi); dim.setDate(dim.getDate()+6);
  let cols = "";
  for(let i=0;i<7;i++){
    const d = new Date(lundi); d.setDate(d.getDate()+i);
    const iso = d.toISOString().slice(0,10);
    const items = itemsDuJour(iso);
    const minis = items.slice(0,5).map(it =>
      `<div class="mini ${it.o.domaine} ${it.o.nature} ${it.type==="faite"?"faitmini":""}">${esc(it.o.titre.slice(0,26))}</div>`).join("");
    cols += `<div class="sjour ${iso===auj()?"auj":""}" data-jour="${iso}">
      <h4>${JSEM[d.getDay()]}<b>${d.getDate()}</b></h4>${minis}
      ${items.length>5?`<div class="spile">+${items.length-5}</div>`:""}</div>`;
  }
  return `<div class="grille" id="swipe"><div class="gnav">
      <button data-act="prevG">‹</button>
      <h3>${lundi.getDate()} ${MOIS[lundi.getMonth()].slice(0,4)}. – ${dim.getDate()} ${MOIS[dim.getMonth()].slice(0,4)}.
        <small>balayer ‹ › · toucher un jour → détail</small></h3>
      <button data-act="nextG">›</button></div>
    <div class="sem">${cols}</div>
    <div class="legende"><span><i style="background:var(--ecume)"></i>perso</span>
      <span><i style="background:var(--laiton)"></i>pro</span>
      <span><i style="background:var(--fait)"></i>fait</span></div></div>`;
}

//---- M : mois (carrousel) ----
function rMois(){
  const base = dateDe(auj()); base.setDate(1); base.setMonth(base.getMonth()+V.offM);
  const an = base.getFullYear(), mo = base.getMonth();
  const nbJ = new Date(an, mo+1, 0).getDate();
  const decale = (new Date(an, mo, 1).getDay()+6)%7;
  let cells = "";
  for(let i=0;i<decale;i++) cells += `<div class="mjour hors"></div>`;
  for(let d=1; d<=nbJ; d++){
    const iso = an+"-"+String(mo+1).padStart(2,"0")+"-"+String(d).padStart(2,"0");
    const items = itemsDuJour(iso);
    const pts = items.slice(0,5).map(it=>{
      const cl = it.type==="faite" ? "faitpt" : it.o.echeance_dure ? "hd" : it.o.domaine==="pro" ? "pro" : "";
      return `<span class="pt ${cl}"></span>`;}).join("");
    const multi = Store.tous().some(o=>F(o)&&o.nature==="rdv"&&o.date_heure_debut&&o.date_heure_fin
      && o.date_heure_debut.slice(0,10)<=iso && o.date_heure_fin.slice(0,10)>=iso
      && o.date_heure_debut.slice(0,10)!==o.date_heure_fin.slice(0,10));
    cells += `<div class="mjour ${iso===auj()?"auj":""}" data-jour="${iso}">${d}
      ${items.length?`<span class="n">${items.length}</span>`:""}
      ${multi?`<div class="bande"></div>`:""}<div class="pts">${pts}</div></div>`;
  }
  return `<div class="grille" id="swipe"><div class="gnav">
      <button data-act="prevG">‹</button>
      <h3>${MOIS[mo][0].toUpperCase()+MOIS[mo].slice(1)} ${an}<small>balayer ‹ › · toucher un jour → détail</small></h3>
      <button data-act="nextG">›</button></div>
    <div class="mois">${["lu","ma","me","je","ve","sa","di"].map(x=>`<div class="wd">${x}</div>`).join("")}${cells}</div>
    <div class="legende"><span><i style="background:var(--ecume)"></i>perso</span>
      <span><i style="background:var(--laiton)"></i>pro</span>
      <span><i style="background:var(--alerte)"></i>échéance dure</span>
      <span><i style="background:var(--fait)"></i>fait</span></div></div>`;
}

//---- A : année ----
function rAnnee(){
  const an = dateDe(auj()).getFullYear() + V.offA;
  let grid = "";
  for(let m=0; m<12; m++){
    const pre = an+"-"+String(m+1).padStart(2,"0");
    const dorm = Store.tous().filter(o=>F(o)&&o.nature==="tache"&&o.statut==="dormante"&&o.date_apparition.startsWith(pre)).length;
    const rdv  = Store.tous().filter(o=>F(o)&&o.nature==="rdv"&&(o.date_heure_debut||"").startsWith(pre)).length;
    const durs = Store.tous().filter(o=>F(o)&&(o.echeance_dure||"").startsWith(pre));
    const estAuj = pre===auj().slice(0,7);
    grid += `<div class="amois ${estAuj?"auj":""}" data-mois="${m}">
      <h5>${MOIS[m][0].toUpperCase()+MOIS[m].slice(1,3)}</h5>
      <div class="jal">${durs.map(o=>`<b>⚑ ${esc(o.titre.slice(0,18))}</b>`).join("<br>")||""}
      ${dorm?`<br>${dorm} à venir`:""}${rdv?`<br>${rdv} rdv`:""}
      ${!durs.length&&!dorm&&!rdv?"<span style='color:var(--efface)'>—</span>":""}</div></div>`;
  }
  return `<div class="grille" id="swipe"><div class="gnav">
      <button data-act="prevG">‹</button><h3>${an}<small>échéances dures ⚑ · dormantes · rdv</small></h3>
      <button data-act="nextG">›</button></div>
    <div class="annee">${grid}</div></div>`;
}

//---- TABLEAU ----
function rTableau(){
  const cols=[["titre","Titre"],["statut","Statut"],["domaine","Dom."],["date_apparition","Date"],
              ["glissements","⌇"],["echeance_dure","Échéance"],["proj","Projet"],["tags","Tags"]];
  let l = Store.tous().filter(o=>F(o)&&o.nature!=="projet"&&o.statut!=="faite");
  const val = (o,k) => k==="proj" ? (Store.parent(o)?Store.parent(o).titre:"") :
              k==="tags" ? (o.tags||[]).join(",") : (o[k]??"");
  l.sort((a,b)=>{const x=val(a,V.tri.cle),y=val(b,V.tri.cle);return (x>y?1:x<y?-1:0)*V.tri.sens;});
  const lignes = l.map(o=>{
    const p = Store.parent(o);
    return `<tr><td data-fiche="${o.id}"><span class="dot ${o.domaine}"></span>${esc(o.titre)}</td>
    <td>${o.statut==="a_planifier"?"à planifier":o.statut}</td><td>${o.domaine}</td>
    <td class="num">${o.statut==="a_planifier"?"—":o.date_apparition===auj()?"auj.":fmt(o.date_apparition)}</td>
    <td class="num">${o.glissements?"⌇"+o.glissements:""}</td>
    <td class="num" style="color:${o.echeance_dure?'var(--alerte)':'var(--efface)'}">${esc(o.echeance_dure||"—")}</td>
    <td>${p?`<a style="color:var(--laiton)" data-projet="${p.id}">${esc(p.titre.slice(0,20))}</a>`:"—"}</td>
    <td>${(o.tags||[]).slice(0,3).map(x=>`<span class="tag">${esc(x)}</span>`).join(" ")}</td></tr>`;}).join("");
  return `<div id="tableau"><div class="thint">${l.length} éléments (actives + dormantes + vivier) · tri par en-tête · titre → fiche</div>
    <div class="tscroll"><table><thead><tr>${cols.map(c=>
      `<th class="${V.tri.cle===c[0]?"tri":""}" data-tri="${c[0]}">${c[1]}${V.tri.cle===c[0]?(V.tri.sens>0?" ↑":" ↓"):""}</th>`).join("")}</tr></thead>
    <tbody>${lignes}</tbody></table></div></div>`;
}

//================ SHEET (pile de navigation) ================
const pile = [];
function sheetPush(fn){ pile.push(fn); sheetRedraw(); $("#voile").classList.add("on"); $("#sheet").classList.add("on"); }
function sheetBack(){ pile.pop(); pile.length ? sheetRedraw() : sheetClose(); }
function sheetClose(){ pile.length=0; $("#voile").classList.remove("on"); $("#sheet").classList.remove("on"); }
function sheetRedraw(){ if(!pile.length) return; $("#sheetcorps").innerHTML = pile[pile.length-1]();
  $("#bretour").classList.toggle("on", pile.length>1); $("#sheetcorps").scrollTop=0; }

//---- feuille du jour ----
function ouvrirJour(iso){
  sheetPush(()=>{
    const items = itemsDuJour(iso);
    return `<div class="fiche-titre">${fmt(iso)}</div>
      <div class="ariane">${items.length} élément(s)</div>
      ${items.map(carte).join("") || "<p class='vide'>Rien ce jour-là.</p>"}
      <button class="btn prim" style="margin-top:12px" data-act="rapide" data-jour="${iso}">＋ tâche ce jour</button>`;
  });
}

//---- fiche ----
function ouvrirFiche(id){
  sheetPush(()=>{
    const o = Store.lire(id); if(!o) return "<p class='vide'>Objet introuvable (corbeille ?)</p>";
    if(o.nature==="projet") return renduProjet(id);
    const formules = Store.evaluerFormules(o);
    const champs = Object.entries(o.champs||{}).map(([k,v])=>{
      const estF = typeof v==="string" && v.startsWith("=");
      return `<div class="champ"><span class="k">${esc(k.replace(/_/g," "))}</span>
        <span class="v ${estF?"f":""}" data-champ="${esc(k)}" data-id="${id}">${esc(v)}${estF?` <b style="color:var(--fait)">→ ${esc(formules[k])}</b>`:""}</span></div>`;
    }).join("");
    const proc = (o.procedure||[]).map((p,i)=>`
      <div class="etape ${p.fait?"ok":""}">
        <button class="coche ${p.fait?"ok":""}" data-act="etape" data-id="${id}" data-i="${i}">✓</button>
        <span>${esc(p.etape)}</span>
        ${p.promue?`<span class="promo" data-fiche="${p.promue}">→ sous-tâche</span>`
                  :`<button class="promo" data-act="promo" data-id="${id}" data-i="${i}">promouvoir</button>`}
      </div>`).join("");
    const ch = Store.chaine(o);
    const enf = Store.enfants(id);
    return `
      <div class="fiche-titre" data-edit="titre" data-id="${id}">${esc(o.titre)} <span style="font-size:12px;color:var(--efface)">✎</span></div>
      <div class="ariane">${ch.map(a=>`<a data-fiche="${a.id}">${esc(a.titre)}</a>`).join('<span class="sep">›</span>')}
        ${ch.length?'<span class="sep">›</span>':''}<span>${esc(o.titre.slice(0,24))}</span></div>
      <div class="champ"><span class="k">statut · domaine</span>
        <span class="v">${o.statut} · <span style="color:${o.domaine==='pro'?'var(--laiton)':'var(--ecume)'}"
          data-act="basculeDom" data-id="${id}">${o.domaine}</span></span></div>
      ${o.nature==="tache" ? `
      <div class="champ"><span class="k">date (glissante)</span>
        <span class="v">${o.statut==="a_planifier"?"— (vivier)":fmt(o.date_apparition)}${o.glissements?" · ⌇"+o.glissements:""}</span></div>
      <div class="champ"><span class="k">planifier</span>
        <span class="v"><input type="date" value="${o.date_apparition}" data-plan="${id}" style="text-align:right"></span></div>
      <div class="champ"><span class="k">date initiale</span><span class="v">${fmt(o.date_initiale)}</span></div>`
      : `<div class="champ"><span class="k">horaire (ancré)</span><span class="v">${esc(o.date_heure_debut||"")}${o.date_heure_fin?" → "+esc(o.date_heure_fin):""}</span></div>`}
      <div class="champ"><span class="k">échéance dure</span>
        <span class="v" style="color:${o.echeance_dure?'var(--alerte)':'inherit'}" data-edit="echeance_dure" data-id="${id}">${esc(o.echeance_dure||"—")} ✎</span></div>
      <div class="champ"><span class="k">récurrence</span>
        <span class="v" data-edit="recurrence" data-id="${id}">${o.recurrence?(o.recurrence.jourMois?"le "+o.recurrence.jourMois+" du mois":"tous les "+o.recurrence.n+" j ("+o.recurrence.ancrage+")"):"—"} ✎</span></div>
      <div class="champ"><span class="k">tags</span>
        <span class="v" data-edit="tags" data-id="${id}">${(o.tags||[]).map(esc).join(", ")||"—"} ✎</span></div>
      <div class="champ"><span class="k">notes</span>
        <span class="v" data-edit="notes" data-id="${id}">${esc(o.notes||"—")} ✎</span></div>
      ${champs}
      <div class="ligne" style="margin-top:10px">
        <input id="nchK" placeholder="nouveau champ" style="flex:1">
        <input id="nchV" placeholder="valeur ou =formule" style="flex:1">
        <button class="btn" data-act="addChamp" data-id="${id}">＋</button></div>
      ${proc?`<div class="htitre">Procédure</div>${proc}`:""}
      <div class="ligne"><input id="netape" placeholder="ajouter une étape…" style="flex:1">
        <button class="btn" data-act="addEtape" data-id="${id}">＋</button></div>
      ${enf.length?`<div class="htitre">Sous-tâches</div>${enf.map(e=>carte({o:e,type:e.statut})).join("")}`:""}
      <div class="actions" style="margin-top:16px">
        ${o.nature==="tache"&&o.statut!=="faite"?`<button class="btn ok" data-act="cocher" data-id="${id}">✓ Fait</button>`:""}
        ${o.nature==="tache"?`<button class="btn" data-act="vivier" data-id="${id}">→ Vivier</button>`:""}
        ${o.nature==="rdv"?`<button class="btn ok" data-act="assiste" data-id="${id}">✓ Assisté</button>
          <button class="btn" data-act="manque" data-id="${id}">✗ Manqué</button>`:""}
        <button class="btn danger" data-act="corbeille" data-id="${id}">🗑</button>
      </div>
      <p style="font-size:11px;color:var(--efface);margin-top:14px">▸ Le bouton « Faire » (session Claude) arrive en V2.1</p>`;
  });
}

//---- vue projet ----
function ouvrirProjet(id){ sheetPush(()=>renduProjet(id)); }
function renduProjet(id){
  const p = Store.lire(id); if(!p) return "<p class='vide'>Projet introuvable</p>";
  const desc = Store.sousArbre(id).filter(F);
  const actives = desc.filter(o=>o.nature==="tache"&&["active","dormante","a_planifier"].includes(o.statut));
  const faites = desc.filter(o=>o.statut==="faite");
  const enfants = Store.enfants(id).filter(F);
  const ch = Store.chaine(p);
  let corps = "";
  for(const e of enfants){
    if(e.nature==="projet" || Store.enfants(e.id).length){
      const n = Store.sousArbre(e.id).filter(o=>o.statut!=="faite").length;
      corps += `<div class="brgroupe">↳ <a data-projet="${e.id}">${esc(e.titre)}</a> · ${n} en cours</div>`;
    } else if(e.statut!=="faite") corps += carte({o:e, type:e.statut});
  }
  return `<div class="fiche-titre">📂 ${esc(p.titre)}</div>
    <div class="ariane">${ch.map(a=>`<a data-projet="${a.id}">${esc(a.titre)}</a>`).join('<span class="sep">›</span>')||"racine"}</div>
    <div class="projstat">
      <div><b>${actives.length}</b><span>en cours</span></div>
      <div><b>${faites.length}</b><span>faites</span></div>
      <div><b>${Math.max(0,...actives.map(o=>o.glissements||0))}</b><span>⌇ max</span></div></div>
    ${corps||"<p class='vide'>Rien en cours.</p>"}
    <div class="ligne" style="margin-top:12px"><input id="nsous" placeholder="nouvelle tâche dans ce projet…" style="flex:1">
      <button class="btn prim" data-act="addSous" data-id="${id}">＋</button></div>
    ${faites.length?`<div class="htitre">Faites récemment</div>${faites.slice(-4).reverse().map(o=>carte({o,type:"faite"})).join("")}`:""}`;
}

//================ CAPTURE / INBOX ================
function renderCapture(){
  const inbox = Store.vivier().filter(o=>(o.tags||[]).includes("inbox"));
  $("#capture").innerHTML = `
    <div class="salut">Capture éclair</div>
    <div class="sous">Balance tout — tu trieras à la revue (ou tout de suite).</div>
    <textarea class="grandinput" id="capin" rows="2" placeholder="« vérifier le pH après l'orage »"></textarea>
    <div class="actions">
      <button class="btn prim" data-act="capTache">→ Inbox</button>
      <button class="btn" data-act="capAuj">→ Aujourd'hui</button>
    </div>
    <div class="htitre" style="margin-top:18px">Créer un rendez-vous</div>
    <div class="ligne"><input type="date" id="rdvD" value="${auj()}"><input type="time" id="rdvH" value="12:00">
      <button class="btn" data-act="capRdv">＋ RDV</button></div>
    <div class="htitre" style="margin-top:18px">Inbox — ${inbox.length} à trier</div>
    ${inbox.map(o=>`<div class="inboxitem">${esc(o.titre)}
      <small>${fmt(o.creele)} — <a style="color:var(--ecume)" data-act="triAuj" data-id="${o.id}">aujourd'hui</a> ·
      <a style="color:var(--courant)" data-act="triVivier" data-id="${o.id}">à planifier</a> ·
      <a style="color:var(--alerte)" data-act="corbeilleSansFiche" data-id="${o.id}">🗑</a></small></div>`).join("")
      || "<p class='vide'>Inbox vide ✓</p>"}`;
}

//================ RECHERCHE ================
function renderRecherche(){
  const q = $("#chin").value.trim();
  $("#chres").innerHTML = q.length<2 ? "" :
    Store.rechercher(q).filter(F).slice(0,30).map(o=>carte({o, type:o.statut==="faite"?"faite":o.statut})).join("")
    || "<p class='vide'>Rien — même dans les champs libres.</p>";
}

//================ RÉGLAGES ================
function renderReglages(){
  const occ = Store.occupation(), pc = Math.min(100, Math.round(occ/5120*100));
  const nb = Store.tous().length, corb = Store.corbeille();
  $("#reglages").innerHTML = `
    <div class="salut">Réglages</div>
    <div class="bloc"><h3>Claude (V2.1)</h3>
      <div class="ligne"><label>Clé API (stockée sur cet appareil uniquement)</label></div>
      <div class="ligne"><input type="password" id="rcle" value="${esc(cfg.cle)}" placeholder="sk-ant-…" style="flex:1">
        <button class="btn" data-act="sauveCle">OK</button></div>
      <div class="ligne"><label>Modèle</label>
        <select id="rmodele">${["claude-haiku-4-5-20251001","claude-sonnet-4-6","claude-opus-4-8"]
          .map(m=>`<option ${cfg.modele===m?"selected":""}>${m}</option>`).join("")}</select></div>
      <div class="ligne"><label>Contexte permanent (injecté dans chaque requête)</label></div>
      <textarea class="grandinput" id="rctx" rows="3" placeholder="Qui tu es, tes projets, tes préférences…">${esc(cfg.contexte)}</textarea>
      <div class="ligne"><label>Consommation</label><span style="font-family:var(--mono);font-size:12px">${cfg.tokens} tk · ${cfg.cout.toFixed(2)} €</span></div>
    </div>
    <div class="bloc"><h3>Données</h3>
      <div class="ligne"><label>${nb} objets · ${occ} ko / ~5120 ko</label></div>
      <div class="jauge"><i style="width:${pc}%"></i></div>
      <div class="actions">
        <button class="btn prim" data-act="exporter">⬇ Exporter (sauvegarde)</button>
        <button class="btn" data-act="partager">Partager…</button>
        <button class="btn" data-act="configurerCapture">Configurer la capture</button></div>
      <p style="font-size:11px;color:var(--efface)">${Capture.aJeton() ? "Jeton de capture configuré sur cet appareil ✓" : "Jeton de capture non configuré"} — jamais écrit dans le code (dépôt public), stocké en localStorage.</p>
      <div class="htitre">Importer / restaurer une sauvegarde Sillage</div>
      <textarea class="grandinput" id="rimport" rows="2" placeholder="Coller le JSON Sillage v2 ici…"></textarea>
      <div class="actions"><button class="btn" data-act="importer">Importer (remplace tout)</button></div>
      <div class="htitre">Migrer depuis l'app v1</div>
      <textarea class="grandinput" id="rmig" rows="2" placeholder="Coller l'export JSON de l'ancienne app…"></textarea>
      <div class="actions"><button class="btn" data-act="migrer">Migrer (ajoute à la base)</button></div>
    </div>
    <div class="bloc"><h3>Versions (anneau de ${Store.versions().length})</h3>
      ${Store.versions().slice().reverse().map(v=>`<div class="ligne"><label>${v.ts.slice(0,16).replace("T"," ")} · ${v.n} objets</label>
        <button class="btn" data-act="restaurerV" data-i="${v.index}">Restaurer</button></div>`).join("")||"<p class='vide'>Aucune encore.</p>"}
    </div>
    <div class="bloc"><h3>Corbeille (${corb.length})</h3>
      ${corb.map(o=>`<div class="ligne"><label>${esc(o.titre)}</label>
        <button class="btn" data-act="restaurerC" data-id="${o.id}">↩</button></div>`).join("")||"<p class='vide'>Vide.</p>"}
      ${corb.length?`<div class="actions"><button class="btn danger" data-act="purger">Vider définitivement</button></div>`:""}
    </div>
    <p style="font-size:11px;color:var(--efface)">Sillage V2.0 · store schéma 2 · données 100 % locales.<br>
    Sauvegarde auto NAS/iCloud : Raccourci (Phase 2.2).</p>`;
}


//================ ACTIONS UI ================
function agir(el){
  const act = el.dataset.act, id = el.dataset.id;
  const R = res => { if(!res.ok){ toast("⚠ "+res.erreur); return false; } return true; };
  switch(act){
    case "cocher": {
      const res = Store.actions.cocher(id);
      if(R(res)) toast(res.detail&&res.detail.recurrence_suivante ? "✓ Fait · prochaine le "+fmt(res.detail.recurrence_suivante) : "✓ Fait, gravé");
      break; }
    case "decocher": if(R(Store.actions.decocher(id))) toast("↩ Réalisation annulée"); break;
    case "assiste": if(R(Store.actions.marquerRdv(id,"assiste"))) toast("✓ Assisté"); sheetBack(); break;
    case "manque":  if(R(Store.actions.marquerRdv(id,"manque")))  toast("✗ Manqué, gravé"); sheetBack(); break;
    case "vivier": if(R(Store.actions.auVivier(id))) toast("→ À planifier"); sheetRedraw(); break;
    case "corbeille": if(R(Store.actions.supprimer(id))){ toast("🗑 En corbeille (restaurable)"); sheetClose(); } break;
    case "corbeilleSansFiche": if(R(Store.actions.supprimer(id))) toast("🗑"); break;
    case "etape": Store.actions.cocherEtape(id, +el.dataset.i); sheetRedraw(); break;
    case "promo": {
      const res = Store.actions.promouvoirEtape(id, +el.dataset.i);
      if(R(res)) toast("→ promue en sous-tâche"); sheetRedraw(); break; }
    case "addChamp": {
      const k=$("#nchK").value.trim(), v=$("#nchV").value.trim();
      if(k && R(Store.actions.remplirChamp(id, k, v))) sheetRedraw();
      break; }
    case "addEtape": {
      const t=$("#netape").value.trim(); if(!t) break;
      const o=Store.lire(id); const proc=(o.procedure||[]).concat([{etape:t,fait:0}]);
      if(R(Store.actions.modifier(id,{procedure:proc}))) sheetRedraw(); break; }
    case "addSous": {
      const t=$("#nsous").value.trim(); if(!t) break;
      const res=Store.actions.creer({titre:t, statut:"a_planifier"});
      if(R(res)){ Store.actions.lier(res.data.id,"parent",id); toast("＋ ajoutée au projet (vivier)"); sheetRedraw(); }
      break; }
    case "basculeDom": {
      const o=Store.lire(id);
      if(R(Store.actions.modifier(id,{domaine:o.domaine==="perso"?"pro":"perso"}))) sheetRedraw(); break; }
    case "rapide": {
      const t=prompt("Titre de la tâche pour "+fmt(el.dataset.jour)+" :"); if(!t) break;
      const res=Store.actions.creer({titre:t, date_apparition:el.dataset.jour});
      if(R(res)) { toast("＋ créée"); sheetRedraw(); } break; }
    case "capTache": case "capAuj": {
      const t=$("#capin").value.trim(); if(!t){ toast("Écris d'abord quelque chose 😉"); break; }
      const res = Store.actions.creer(act==="capAuj" ? {titre:t} : {titre:t, statut:"a_planifier", tags:["inbox"]});
      if(R(res)){ $("#capin").value=""; toast(act==="capAuj"?"＋ pour aujourd'hui":"＋ dans l'inbox"); renderCapture(); }
      break; }
    case "capRdv": {
      const t=$("#capin").value.trim(); if(!t){ toast("Écris le titre du RDV au-dessus"); break; }
      const res = Store.actions.creer({titre:t, nature:"rdv", date_heure_debut:$("#rdvD").value+"T"+$("#rdvH").value});
      if(R(res)){ $("#capin").value=""; toast("＋ RDV "+fmt($("#rdvD").value)); renderCapture(); }
      break; }
    case "triAuj": Store.actions.modifier(id,{tags:Store.lire(id).tags.filter(x=>x!=="inbox")});
      Store.actions.planifier(id, auj()); toast("→ aujourd'hui"); break;
    case "triVivier": Store.actions.modifier(id,{tags:Store.lire(id).tags.filter(x=>x!=="inbox")});
      toast("→ vivier"); break;
    case "passePlus": V.filPasse+=14; render(); break;
    case "futurPlus": V.filFutur+=30; render(); break;
    case "prevG": bougeG(-1); break;
    case "nextG": bougeG(1); break;
    case "sauveCle": cfg.cle=$("#rcle").value.trim(); cfgSauver(); toast("Clé enregistrée (localement)"); break;
    case "configurerCapture": {
      const t = prompt("Jeton GitHub (accès au repo privé sillage-inbox) :");
      if(t===null) break;
      if(Capture.definirJeton(t)){ toast("Jeton enregistré (localement)"); Capture.relever(); }
      else toast("Jeton retiré");
      renderReglages();
      break; }
    case "exporter": {
      const blob=new Blob([Store.exporter()],{type:"application/json;charset=utf-8"});
      const a=document.createElement("a"); a.href=URL.createObjectURL(blob);
      a.download="sillage_"+auj()+".json"; a.click(); toast("⬇ Export généré"); break; }
    case "partager": {
      if(navigator.share){
        const f=new File([Store.exporter()],"sillage_"+auj()+".json",{type:"application/json;charset=utf-8"});
        navigator.share({files:[f],title:"Sauvegarde Sillage"}).catch(()=>{});
      } else toast("Partage non disponible ici");
      break; }
    case "importer": {
      if(!confirm("Remplacer TOUTE la base par ce JSON ? (l'état actuel part en versions)")) break;
      const res=Store.importer($("#rimport").value);
      if(R(res)){ toast("Import OK : "+res.data.n+" objets"); renderReglages(); render(); }
      break; }
    case "migrer": {
      const res=Store.migrerV1($("#rmig").value);
      if(R(res)){ toast("Migration : "+res.data.taches+" tâches, "+res.data.projets+" projets"); renderReglages(); render(); }
      break; }
    case "restaurerV": if(confirm("Restaurer cette version ? (l'état actuel est d'abord sauvegardé)"))
      { if(R(Store.restaurerVersion(+el.dataset.i))){ toast("Version restaurée"); renderReglages(); render(); } } break;
    case "restaurerC": if(R(Store.actions.restaurer(id))){ toast("↩ Restauré"); renderReglages(); } break;
    case "purger": if(confirm("Vider définitivement la corbeille ?"))
      { Store.actions.viderCorbeille(); toast("Corbeille vidée"); renderReglages(); } break;
  }
}

//---- éditions inline (fiche) ----
function editer(el){
  const id = el.dataset.id, quoi = el.dataset.edit;
  const o = Store.lire(id); if(!o) return;
  let nv;
  if(quoi==="titre"){ nv=prompt("Titre :", o.titre); if(nv) Store.actions.modifier(id,{titre:nv}); }
  if(quoi==="notes"){ nv=prompt("Notes :", o.notes||""); if(nv!==null) Store.actions.modifier(id,{notes:nv}); }
  if(quoi==="tags"){ nv=prompt("Tags (séparés par des virgules) :", (o.tags||[]).join(", "));
    if(nv!==null) Store.actions.modifier(id,{tags:nv.split(",").map(x=>x.trim()).filter(Boolean)}); }
  if(quoi==="echeance_dure"){ nv=prompt("Échéance dure (AAAA-MM-JJ, vide = aucune) :", o.echeance_dure||"");
    if(nv!==null) Store.actions.modifier(id,{echeance_dure:nv.trim()||null}); }
  if(quoi==="recurrence"){
    nv=prompt("Récurrence : « 7 » (tous les 7 j), « 7c » (calendrier), « m20 » (le 20 du mois), vide = aucune :",
      o.recurrence ? (o.recurrence.jourMois?"m"+o.recurrence.jourMois:o.recurrence.n+(o.recurrence.ancrage==="calendrier"?"c":"")) : "");
    if(nv!==null){
      nv=nv.trim().toLowerCase(); let r=null, m;
      if((m=nv.match(/^m(\d+)$/))) r={n:30, ancrage:"calendrier", jourMois:+m[1]};
      else if((m=nv.match(/^(\d+)(c?)$/))) r={n:+m[1], ancrage:m[2]?"calendrier":"realisation"};
      Store.actions.modifier(id,{recurrence:r});
    }
  }
  sheetRedraw();
}
function editerChamp(el){
  const id=el.dataset.id, k=el.dataset.champ, o=Store.lire(id);
  const nv=prompt("Champ « "+k+" » (vide = supprimer) :", o.champs[k]);
  if(nv===null) return;
  if(nv.trim()==="" ){ const c=Object.assign({},o.champs); delete c[k]; Store.actions.modifier(id,{champs:c}); }
  else Store.actions.remplirChamp(id,k,nv);
  sheetRedraw();
}

//================ NAVIGATION GRILLES ================
function bougeG(sens){
  if(V.zoom==="S") V.offS+=sens;
  if(V.zoom==="M") V.offM+=sens;
  if(V.zoom==="A") V.offA+=sens;
  render();
}
let swipeX=null;
function activerSwipe(){
  const g=$("#swipe"); if(!g) return;
  g.addEventListener("touchstart",e=>{swipeX=e.touches[0].clientX;},{passive:true});
  g.addEventListener("touchend",e=>{
    if(swipeX===null) return;
    const dx=e.changedTouches[0].clientX-swipeX; swipeX=null;
    if(Math.abs(dx)>60) bougeG(dx<0?1:-1);
  },{passive:true});
}

//================ POPOVER FILTRES ================
function renderPop(){
  const tags=[...new Set(Store.tous().flatMap(o=>o.tags||[]))].filter(t=>t!=="inbox").sort().slice(0,12);
  $("#pop").innerHTML = `<small>Domaine</small>
    <button data-d="tous" class="${V.dom==="tous"?"on":""}">Tous</button>
    <button data-d="perso" class="${V.dom==="perso"?"on":""}">● Perso</button>
    <button data-d="pro" class="${V.dom==="pro"?"on":""}">● Pro</button>
    <small>Tag</small>
    <button data-t="" class="${!V.tag?"on":""}">Tous les tags</button>
    ${tags.map(t=>`<button data-t="${esc(t)}" class="${V.tag===t?"on":""}">#${esc(t)}</button>`).join("")}`;
}
function syncSeg(){
  document.querySelectorAll("#segzoom button").forEach(x=>x.classList.toggle("on",x.dataset.z===V.zoom));
  document.querySelectorAll("#segmode button").forEach(x=>x.classList.toggle("on",x.dataset.m===V.mode));
  const bf=$("#bfiltre");
  bf.className="rond"+((V.dom!=="tous"||V.tag)?" actif"+(V.dom==="pro"?" pro":""):"");
}

//================ TOAST ================
let toastT=null;
function toast(msg){
  const t=$("#toast"); t.textContent=msg; t.classList.add("on");
  clearTimeout(toastT); toastT=setTimeout(()=>t.classList.remove("on"), 2200);
}

//================ ÉVÉNEMENTS GLOBAUX (délégation) ================
document.addEventListener("click", e=>{
  const el = e.target.closest("[data-act],[data-fiche],[data-projet],[data-jour],[data-tri],[data-edit],[data-champ],[data-mois]");
  if(!el) return;
  if(el.dataset.act){ agir(el); return; }
  if(el.dataset.edit){ editer(el); return; }
  if(el.dataset.champ){ editerChamp(el); return; }
  if(el.dataset.tri){ const k=el.dataset.tri;
    V.tri = V.tri.cle===k ? {cle:k, sens:-V.tri.sens} : {cle:k, sens:1}; render(); return; }
  if(el.dataset.projet){ ouvrirProjet(el.dataset.projet); return; }
  if(el.dataset.fiche){ ouvrirFiche(el.dataset.fiche); return; }
  if(el.dataset.mois!==undefined && el.classList.contains("amois")){ V.offM = (+el.dataset.mois) - dateDe(auj()).getMonth() + 12*V.offA; V.zoom="M"; render(); return; }
  if(el.dataset.jour && (el.classList.contains("sjour")||el.classList.contains("mjour"))){ ouvrirJour(el.dataset.jour); return; }
});
document.addEventListener("change", e=>{
  if(e.target.dataset.plan){
    const res=Store.actions.planifier(e.target.dataset.plan, e.target.value);
    if(res.ok){ toast("→ "+fmt(e.target.value)); sheetRedraw(); }
  }
  if(e.target.id==="rmodele"){ cfg.modele=e.target.value; cfgSauver(); toast("Modèle : "+cfg.modele); }
});
document.addEventListener("input", e=>{
  if(e.target.id==="chin") renderRecherche();
  if(e.target.id==="rctx"){ cfg.contexte=e.target.value; cfgSauver(); }
});
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll("nav button").forEach(x=>x.classList.remove("on"));
  document.querySelectorAll(".vue").forEach(x=>x.classList.remove("on"));
  b.classList.add("on"); $("#"+b.dataset.v).classList.add("on");
  if(b.dataset.v==="v-cap") renderCapture();
  if(b.dataset.v==="v-reg") renderReglages();
});
document.querySelectorAll("#segmode button").forEach(b=>b.onclick=()=>{ V.mode=b.dataset.m; render(); });
document.querySelectorAll("#segzoom button").forEach(b=>b.onclick=()=>{ V.zoom=b.dataset.z; V.mode="fil"; render(); });
$("#bfiltre").onclick=()=>{ renderPop(); $("#pop").classList.toggle("on"); };
$("#pop").addEventListener("click", e=>{
  const b=e.target.closest("button"); if(!b) return;
  if(b.dataset.d!==undefined){ V.dom=b.dataset.d; }
  if(b.dataset.t!==undefined){ V.tag=b.dataset.t||null; }
  $("#pop").classList.remove("on"); render();
});
$("#bfermer").onclick=sheetClose;
$("#voile").onclick=sheetClose;
$("#bretour").onclick=sheetBack;

//================ INIT ================
Store.abonner((type)=>{ if(["cocher","decocher","creer","tick","planifier","vivier","rdv","import","migration","restauration"].includes(type)) render(); });
Store.init();
Capture.init({ alerter: n => console.log(n + " capture(s) au vivier") });
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden){ const r=Store.tick(); if(r.glisses) toast("〜 "+r.glisses+" tâche(s) ont suivi le courant"); render(); } });
render();
if(!Store.tous().length){
  sheetPush(()=>`<div class="fiche-titre">Bienvenue dans Sillage ⛵</div>
    <p style="font-size:13.5px;line-height:1.6;color:var(--sourd)">Ta base est vide. Va dans <b>Réglages</b> pour
    importer ta sauvegarde <b>sillage_seed_v2.json</b> (colle son contenu dans « Importer »), ou commence
    à zéro avec le bouton <b>＋</b>.</p>
    <div class="actions"><button class="btn prim" onclick="document.querySelector('[data-v=v-reg]').click();document.getElementById('sheet').classList.remove('on');document.getElementById('voile').classList.remove('on')">Ouvrir les réglages</button></div>`);
}
})();
