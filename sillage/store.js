/* ============================================================
   SILLAGE — store.js  (V2.0 · couche DONNÉES)
   Source de vérité unique. Zéro DOM, zéro réseau.
   Toute modification passe par les ACTIONS (Store.actions.*).
   L'UI et l'agent Claude sont des clients égaux de ce store.
   ============================================================ */

const Store = (() => {

  //=========================================================
  // CONFIG & UTILITAIRES
  //=========================================================
  const CLE = "sillage_v2";
  const CLE_VERSIONS = "sillage_v2_versions";
  const MAX_VERSIONS = 10;
  const MAX_JOURNAL = 300;

  // Horloge injectable (indispensable pour les tests : simuler +N jours)
  let _maintenant = () => new Date();
  const maintenant = () => _maintenant();
  const aujourdhui = () => isoJour(maintenant());          // "2026-07-04"
  function isoJour(d){ 
    const z = n => String(n).padStart(2,"0");
    return d.getFullYear()+"-"+z(d.getMonth()+1)+"-"+z(d.getDate());
  }
  function plusJours(iso, n){
    const d = new Date(iso+"T12:00:00"); d.setDate(d.getDate()+n);
    return isoJour(d);
  }
  const uid = () => "t" + Date.now().toString(36) + Math.random().toString(36).slice(2,6);

  // Adaptateur de persistance (localStorage, remplaçable par iCloud/backend)
  let persist = {
    lire:  cle => { try { return JSON.parse(localStorage.getItem(cle)); } catch(e){ return null; } },
    ecrire:(cle,val) => { try { localStorage.setItem(cle, JSON.stringify(val)); return true; } catch(e){ return false; } }
  };

  //=========================================================
  // ÉTAT
  //=========================================================
  let etat = { objets: {}, journal: [], meta: { creele: null, tick_dernier: null, schema: 2 } };
  const abonnes = [];
  function notifier(type, detail){ abonnes.forEach(f => { try{ f(type, detail); }catch(e){} }); }

  //=========================================================
  // SCHÉMA — un seul type d'objet, trois couches (cf. CDC §3)
  //=========================================================
  function nouvelObjet(base){
    const auj = aujourdhui();
    return Object.assign({
      // — NOYAU —
      id: uid(), titre: "", notes: "",
      nature: "tache",              // tache | rdv | projet
      domaine: "perso",             // perso | pro
      statut: "active",             // dormante | active | faite | a_planifier | corbeille
      date_apparition: auj,         // glissante (tâches)
      date_initiale: base.date_apparition || auj,   // figée : l'intention d'origine
      date_heure_debut: null, date_heure_fin: null, // ancrées (rdv)
      echeance_dure: null,
      recurrence: null,             // { n:7, ancrage:"realisation"|"calendrier" }
      lieu: null,
      instances: [],                // [{date_prevue, date_reelle, etat}]
      glissements: 0,
      // — ORGANISATION —
      tags: [],
      liens: [],                    // [{type:"parent"|"bloquee_par"|"alimente", cible:id}]
      // — CHAMPS LIBRES —
      champs: {},                   // clé:valeur ; valeur "=..." → formule
      procedure: [],                // [{etape, fait, promue?}]
      // — MÉTA —
      creele: auj, derniere_modif: maintenant().toISOString()
    }, base);
  }

  function valider(o){
    const err = [];
    if(!o.titre || !o.titre.trim()) err.push("titre requis");
    if(!["tache","rdv","projet"].includes(o.nature)) err.push("nature invalide");
    if(!["perso","pro"].includes(o.domaine)) err.push("domaine invalide");
    if(!["dormante","active","faite","a_planifier","corbeille"].includes(o.statut)) err.push("statut invalide");
    if(o.nature==="rdv" && !o.date_heure_debut) err.push("rdv sans date_heure_debut");
    if(o.date_apparition && !/^\d{4}-\d{2}-\d{2}$/.test(o.date_apparition)) err.push("date_apparition non ISO");
    return err;
  }

  //=========================================================
  // VERSIONS (anneau de 10) & JOURNAL & CORBEILLE
  //=========================================================
  let _derniereVersionTs = 0;
  function snapshot(force){
    const t = maintenant().getTime();
    if(!force && t - _derniereVersionTs < 60000) return;   // coalescence 1/min
    _derniereVersionTs = t;
    const v = persist.lire(CLE_VERSIONS) || [];
    v.push({ ts: maintenant().toISOString(), donnees: JSON.parse(JSON.stringify(etat.objets)) });
    while(v.length > MAX_VERSIONS) v.shift();
    persist.ecrire(CLE_VERSIONS, v);
  }
  function versions(){ return (persist.lire(CLE_VERSIONS)||[]).map((v,i)=>({index:i, ts:v.ts, n:Object.keys(v.donnees).length})); }
  function restaurerVersion(index){
    const v = persist.lire(CLE_VERSIONS)||[];
    if(!v[index]) return faux("version inexistante");
    snapshot(true);                                        // sécuriser l'état courant d'abord
    etat.objets = JSON.parse(JSON.stringify(v[index].donnees));
    journaliser("restauration", null, {version: v[index].ts});
    sauver(); notifier("restauration");
    return ok();
  }
  function journaliser(action, id, detail, source){
    etat.journal.push({ ts: maintenant().toISOString(), action, id, detail: detail||null, source: source||"ui" });
    while(etat.journal.length > MAX_JOURNAL) etat.journal.shift();
  }

  //=========================================================
  // PERSISTANCE
  //=========================================================
  function sauver(){
    const okp = persist.ecrire(CLE, etat);
    if(!okp) notifier("erreur", {msg:"Échec de sauvegarde (stockage plein ?)"});
    return okp;
  }
  function charger(){
    const d = persist.lire(CLE);
    if(d && d.meta && d.meta.schema === 2){ etat = d; return true; }
    return false;
  }
  function occupation(){ // jauge localStorage (≈ 5 Mo max)
    try{ return Math.round(JSON.stringify(etat).length / 1024); }catch(e){ return -1; }
  }

  //=========================================================
  // TICK — mécanique bête et robuste (CDC §2.1, §3.2)
  //=========================================================
  function tick(){
    const auj = aujourdhui();
    if(etat.meta.tick_dernier === auj) return {glisses:0, activees:0};
    let glisses = 0, activees = 0;
    for(const o of Object.values(etat.objets)){
      if(o.nature !== "tache") continue;
      // dormante dont la date arrive → active
      if(o.statut === "dormante" && o.date_apparition <= auj){
        o.statut = "active"; activees++;
        o.derniere_modif = maintenant().toISOString();
      }
      // active dans le passé → glisse à aujourd'hui, compteur +1
      if(o.statut === "active" && o.date_apparition < auj){
        o.glissements += (joursEntre(o.date_apparition, auj));
        o.date_apparition = auj; glisses++;
        o.derniere_modif = maintenant().toISOString();
      }
    }
    etat.meta.tick_dernier = auj;
    if(glisses || activees){ journaliser("tick", null, {glisses, activees}, "systeme"); sauver(); notifier("tick",{glisses,activees}); }
    else { sauver(); }
    return {glisses, activees};
  }
  function joursEntre(a,b){ return Math.round((new Date(b+"T12:00:00") - new Date(a+"T12:00:00")) / 86400000); }

  //=========================================================
  // FORMULES (niveau 1) — champs "=expr" entre champs numériques
  //=========================================================
  function evaluerFormules(o){
    const num = {};
    for(const [k,v] of Object.entries(o.champs)){
      if(typeof v === "number") num[k] = v;
      else if(typeof v === "string" && !v.startsWith("=")){
        const f = parseFloat(String(v).replace(",", ".").replace(/[^\d.\-]/g,""));
        if(!isNaN(f)) num[k] = f;
      }
    }
    const resultats = {};
    for(const [k,v] of Object.entries(o.champs)){
      if(typeof v !== "string" || !v.startsWith("=")) continue;
      let expr = v.slice(1);
      // remplacer les noms de champs par leurs valeurs (les plus longs d'abord)
      for(const nom of Object.keys(num).sort((a,b)=>b.length-a.length))
        expr = expr.split(nom).join("("+num[nom]+")");
      // sécurité : uniquement chiffres et opérateurs après substitution
      if(!/^[\d\s+\-*/().eE]+$/.test(expr)){ resultats[k] = "#CHAMP?"; continue; }
      try{ 
        const r = Function('"use strict";return ('+expr+')')();
        resultats[k] = (typeof r === "number" && isFinite(r)) ? Math.round(r*1000)/1000 : "#ERREUR";
      }catch(e){ resultats[k] = "#ERREUR"; }
    }
    return resultats; // { nom_champ: valeur_calculée }
  }

  //=========================================================
  // REQUÊTES (lecture seule)
  //=========================================================
  const lire = id => { const o = etat.objets[id]; return (o && o.statut!=="corbeille") ? o : null; };
  const tous = () => Object.values(etat.objets).filter(o=>o.statut!=="corbeille");
  const actifs = () => tous().filter(o=>o.statut==="active");
  const vivier = () => tous().filter(o=>o.statut==="a_planifier");
  const corbeille = () => Object.values(etat.objets).filter(o=>o.statut==="corbeille");

  function enfants(id){ return tous().filter(o=>o.liens.some(l=>l.type==="parent"&&l.cible===id)); }
  function parent(o){ const l=o.liens.find(l=>l.type==="parent"); return l?lire(l.cible):null; }
  function chaine(o){ const c=[]; let p=parent(o); while(p){ c.unshift(p); p=parent(p); if(c.length>10)break; } return c; }
  function sousArbre(id){
    const res=[], pile=[id];
    while(pile.length){ const cur=pile.pop(); for(const e of enfants(cur)){ res.push(e); pile.push(e.id); } }
    return res;
  }
  function rechercher(q){
    q=q.toLowerCase();
    return tous().filter(o=>JSON.stringify(o).toLowerCase().includes(q));
  }
  function velocite(jours=14){
    const depuis = plusJours(aujourdhui(), -jours);
    let n=0;
    for(const o of Object.values(etat.objets))
      n += o.instances.filter(i=>i.etat==="faite" && i.date_reelle >= depuis).length;
    return Math.round(n/jours*10)/10;
  }
  function duJour(){
    const auj = aujourdhui();
    return tous().filter(o =>
      (o.nature==="tache" && o.statut==="active") ||
      (o.nature==="rdv" && o.date_heure_debut && o.date_heure_debut.startsWith(auj)));
  }

  //=========================================================
  // ACTIONS (écriture) — les seules portes d'entrée
  //=========================================================
  const ok  = (data) => ({ok:true, data});
  const faux = (msg) => ({ok:false, erreur:msg});

  function mutation(action, fn, source){
    snapshot();
    const res = fn();
    if(res.ok){
      journaliser(action, res.data && res.data.id, res.detail, source);
      sauver(); notifier(action, res.data);
    }
    return res;
  }

  const actions = {

    creer(props, source){
      return mutation("creer", () => {
        const o = nouvelObjet(props||{});
        // rdv : ancré, jamais de glissement ; statut selon date
        if(o.nature==="rdv"){ o.date_apparition = (o.date_heure_debut||"").slice(0,10) || aujourdhui(); }
        if(o.nature==="tache" && o.date_apparition > aujourdhui() && o.statut==="active") o.statut="dormante";
        const err = valider(o);
        if(err.length) return faux(err.join(", "));
        etat.objets[o.id] = o;
        return ok(o);
      }, source);
    },

    modifier(id, patch, source){
      return mutation("modifier", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        const interdit = ["id","instances","glissements","creele","date_initiale"];
        for(const k of Object.keys(patch)) if(interdit.includes(k)) return faux("champ protégé : "+k);
        const copie = Object.assign({}, o, patch, {derniere_modif: maintenant().toISOString()});
        const err = valider(copie);
        if(err.length) return faux(err.join(", "));
        Object.assign(o, copie);
        return ok(o);
      }, source);
    },

    remplirChamp(id, cle, valeur, source){
      return mutation("champ", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        if(!/^[\w àâéèêëîïôùûç%()²³./-]{1,60}$/i.test(cle)) return faux("nom de champ invalide");
        o.champs[cle] = valeur;
        o.derniere_modif = maintenant().toISOString();
        return Object.assign(ok(o), {detail:{cle, valeur}});
      }, source);
    },

    cocher(id, source){
      return mutation("cocher", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        if(o.nature!=="tache") return faux("seules les tâches se cochent (rdv → marquerRdv)");
        const auj = aujourdhui();
        o.instances.push({date_prevue: o.date_apparition, date_reelle: auj, etat:"faite",
                          glissements: o.glissements});
        o.statut = "faite";
        o.derniere_modif = maintenant().toISOString();
        // récurrence → nouvelle instance dormante
        let suivante = null;
        if(o.recurrence && (o.recurrence.n > 0 || o.recurrence.jourMois)){
          let prochaine;
          if(o.recurrence.jourMois){          // mensuel à jour fixe (ex. le 20)
            const d = new Date(auj+"T12:00:00");
            const jm = Math.min(o.recurrence.jourMois, 28);
            let cible = new Date(d.getFullYear(), d.getMonth(), jm, 12);
            if(isoJour(cible) <= auj) cible = new Date(d.getFullYear(), d.getMonth()+1, jm, 12);
            prochaine = isoJour(cible);
          } else {
            const base = o.recurrence.ancrage==="calendrier" ? o.date_apparition : auj;
            prochaine = plusJours(base, o.recurrence.n);
            if(prochaine <= auj) prochaine = plusJours(auj, o.recurrence.n);
          }
          o.statut = prochaine <= auj ? "active" : "dormante";
          o.date_apparition = prochaine;
          o.glissements = 0;
          o.statut = "dormante";
          suivante = prochaine;
        }
        return Object.assign(ok(o), {detail:{recurrence_suivante: suivante}});
      }, source);
    },

    decocher(id, source){
      return mutation("decocher", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        const i = o.instances.map(x=>x.etat).lastIndexOf("faite");
        if(i<0) return faux("aucune réalisation à annuler");
        o.instances.splice(i,1);
        o.statut = "active"; o.date_apparition = aujourdhui();
        return ok(o);
      }, source);
    },

    marquerRdv(id, etatRdv, source){   // "assiste" | "manque"
      return mutation("rdv", () => {
        const o = lire(id); if(!o||o.nature!=="rdv") return faux("rdv introuvable");
        o.instances.push({date_prevue:o.date_apparition, date_reelle:o.date_apparition, etat:etatRdv});
        o.statut="faite";
        return ok(o);
      }, source);
    },

    planifier(id, dateIso, source){    // (re)donner une date — sort du vivier si besoin
      return mutation("planifier", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        o.date_apparition = dateIso;
        o.statut = dateIso > aujourdhui() ? "dormante" : "active";
        return ok(o);
      }, source);
    },

    auVivier(id, source){              // rétrogradation → À planifier
      return mutation("vivier", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        o.statut = "a_planifier";
        return ok(o);
      }, source);
    },

    lier(id, type, cibleId, source){
      return mutation("lier", () => {
        const o = lire(id), c = lire(cibleId);
        if(!o||!c) return faux("objet ou cible introuvable");
        if(!["parent","bloquee_par","alimente"].includes(type)) return faux("type de lien invalide");
        if(type==="parent"){
          if(chaine(c).some(a=>a.id===id) || cibleId===id) return faux("cycle de hiérarchie interdit");
          o.liens = o.liens.filter(l=>l.type!=="parent");   // un seul parent
        }
        if(!o.liens.some(l=>l.type===type&&l.cible===cibleId)) o.liens.push({type, cible:cibleId});
        return ok(o);
      }, source);
    },

    promouvoirEtape(id, index, source){ // procédure hybride → vraie sous-tâche
      return mutation("promotion", () => {
        const o = lire(id); if(!o||!o.procedure[index]) return faux("étape introuvable");
        const et = o.procedure[index];
        const st = nouvelObjet({ titre: et.etape, domaine:o.domaine, tags:[...o.tags],
                                 statut: et.fait?"faite":"active" });
        st.liens.push({type:"parent", cible:o.id});
        etat.objets[st.id] = st;
        et.promue = st.id;
        return Object.assign(ok(st), {detail:{depuis:o.id}});
      }, source);
    },

    cocherEtape(id, index, source){
      return mutation("etape", () => {
        const o = lire(id); if(!o||!o.procedure[index]) return faux("étape introuvable");
        o.procedure[index].fait = o.procedure[index].fait ? 0 : 1;
        return ok(o);
      }, source);
    },

    supprimer(id, source){             // → corbeille (jamais de suppression directe)
      return mutation("corbeille", () => {
        const o = lire(id); if(!o) return faux("objet introuvable");
        o.statut_avant = o.statut; o.statut = "corbeille";
        return ok(o);
      }, source);
    },
    restaurer(id, source){
      return mutation("restaurer", () => {
        const o = etat.objets[id]; if(!o||o.statut!=="corbeille") return faux("pas en corbeille");
        o.statut = o.statut_avant || "active"; delete o.statut_avant;
        return ok(o);
      }, source);
    },
    viderCorbeille(source){
      return mutation("purge", () => {
        const n = corbeille().length;
        for(const o of corbeille()) delete etat.objets[o.id];
        return Object.assign(ok(), {detail:{purges:n}});
      }, source);
    }
  };

  //=========================================================
  // IMPORT / EXPORT / MIGRATION
  //=========================================================
  function exporter(){ return JSON.stringify(etat, null, 1); }
  function importer(json){
    try{
      const d = typeof json==="string" ? JSON.parse(json) : json;
      if(!d.objets || !d.meta) return faux("format Sillage v2 non reconnu");
      snapshot(true);
      etat = d; sauver(); notifier("import");
      return ok({n:Object.keys(etat.objets).length});
    }catch(e){ return faux("JSON invalide : "+e.message); }
  }

  // Migration depuis l'app v1 — DEUX formats acceptés :
  //  A) plat    : {tasks:[{id,title,project,desc,parentId,recurring:bool,recurDays,...}]}
  //  B) imbriqué: {projects:{pid:{name,color,tasks:{tid:{title,parent,status,priority,instances,recurring:"4-daily"|...}}}}}
  function parseRecurring(r, recurDays){
    if(!r) return null;
    if(r === true) return {n: recurDays||7, ancrage:"realisation"};
    if(typeof r === "object") return r;
    const s = String(r).toLowerCase(); let m;
    if(s==="daily") return {n:1, ancrage:"realisation"};
    if(s==="weekly") return {n:7, ancrage:"realisation"};
    if((m=s.match(/^(\d+)-weekly$/))) return {n:7*+m[1], ancrage:"realisation"};
    if((m=s.match(/^(\d+)-daily$/)))  return {n:+m[1], ancrage:"realisation"};
    if((m=s.match(/^monthly-?(\d+)/))) return {n:30, ancrage:"calendrier", jourMois:+m[1]};
    return {n:7, ancrage:"realisation"};
  }

  function migrerTacheV1(t, auj){
    const statutV1 = String(t.status||"").toLowerCase();
    const faite = ["fait","faite","done","termine","terminé","complete"].includes(statutV1);
    const aPlanif = ["todo","a_planifier","idee"].includes(statutV1);
    const instOuverte = (t.instances||[]).filter(i=>!i.completed).map(i=>i.date).sort().pop() || null;
    const o = nouvelObjet({
      titre: t.title || t.titre || "(sans titre)",
      notes: t.desc || t.notes || "",
      nature: "tache",
      domaine: t.domaine==="pro" ? "pro" : "perso",
      statut: faite ? "faite"
            : aPlanif ? "a_planifier"
            : instOuverte ? (instOuverte > auj ? "dormante" : "active")
            : "a_planifier",
      tags: [].concat(t.tags||[], t.blocking?["bloquante"]:[]),
      recurrence: parseRecurring(t.recurring, t.recurDays)
    });
    o.date_apparition = instOuverte ? (instOuverte <= auj && o.statut==="active" ? auj : instOuverte) : auj;
    o.date_initiale = instOuverte || auj;
    if(instOuverte && instOuverte < auj && o.statut==="active") o.glissements = joursEntre(instOuverte, auj);
    for(const i of (t.instances||[]).filter(i=>i.completed))
      o.instances.push({date_prevue:i.date, date_reelle:i.date, etat:"faite"});
    if(t.lastCompleted && !o.instances.some(i=>i.date_reelle===t.lastCompleted))
      o.instances.push({date_prevue:t.lastCompleted, date_reelle:t.lastCompleted, etat:"faite"});
    if(t.priority) o.champs.priorite = t.priority;
    if(t.convRef) o.champs.conversation_ref = t.convRef;
    return o;
  }

  function migrerV1(sourceJson){
    let src;
    try{ src = typeof sourceJson==="string" ? JSON.parse(sourceJson) : sourceJson; }
    catch(e){ return faux("JSON v1 invalide"); }
    snapshot(true);
    const auj = aujourdhui();
    let n=0, np=0, mapId={};

    if(src.projects){                                    // ——— format B (imbriqué)
      for(const p of Object.values(src.projects)){
        const po = nouvelObjet({titre: p.name||p.id, nature:"projet", tags:["projet"]});
        if(p.color) po.champs.couleur = p.color;
        etat.objets[po.id]=po; np++;
        const taches = Object.values(p.tasks||{});
        for(const t of taches){
          const o = migrerTacheV1(t, auj);
          o.tags.push(String(p.name||p.id).replace(/[^\p{L}\p{N} ]/gu,"").trim().toLowerCase());
          etat.objets[o.id]=o; mapId[t.id]=o.id; n++;
        }
        // hiérarchie : parent interne sinon rattaché au projet
        for(const t of taches){
          const o = etat.objets[mapId[t.id]];
          o.liens.push({type:"parent", cible: (t.parent && mapId[t.parent]) ? mapId[t.parent] : po.id});
        }
      }
    } else {                                             // ——— format A (plat)
      const anciennes = src.tasks || src.taches || (Array.isArray(src)?src:null);
      if(!anciennes) return faux("structure v1 non reconnue");
      const projets={};
      for(const t of anciennes){
        const p = t.project || t.projet;
        if(p && !projets[p]){
          const po = nouvelObjet({titre:p, nature:"projet", tags:["projet"]});
          etat.objets[po.id]=po; projets[p]=po.id; np++;
        }
      }
      for(const t of anciennes){
        const o = migrerTacheV1(t, auj);
        const p = t.project || t.projet;
        if(p){ o.tags.push(String(p).toLowerCase()); }
        etat.objets[o.id]=o; mapId[t.id]=o.id; n++;
        if(p && projets[p]) o.liens.push({type:"parent", cible:projets[p]});
      }
      for(const t of anciennes){
        if(t.parentId && mapId[t.parentId]){
          const o = etat.objets[mapId[t.id]];
          o.liens = o.liens.filter(l=>l.type!=="parent");
          o.liens.push({type:"parent", cible:mapId[t.parentId]});
        }
      }
    }
    journaliser("migration_v1", null, {taches:n, projets:np}, "systeme");
    sauver(); notifier("migration");
    return ok({taches:n, projets:np});
  }

  //=========================================================
  // INITIALISATION & API PUBLIQUE
  //=========================================================
  function init(options){
    options = options||{};
    if(options.maintenant) _maintenant = options.maintenant;   // horloge injectable
    if(options.persist) persist = options.persist;             // stockage injectable
    if(!charger()){
      etat.meta.creele = maintenant().toISOString();
      sauver();
    }
    tick();
    return { objets: Object.keys(etat.objets).length, tick_dernier: etat.meta.tick_dernier };
  }

  return {
    init, tick, actions,
    lire, tous, actifs, vivier, corbeille, duJour,
    enfants, parent, chaine, sousArbre, rechercher, velocite,
    evaluerFormules, joursEntre, plusJours, aujourdhui,
    exporter, importer, migrerV1,
    versions, restaurerVersion, occupation,
    journal: () => etat.journal.slice(),
    abonner: f => abonnes.push(f),
    _debug: () => etat            // lecture seule pour la console
  };
})();

if(typeof module!=="undefined") module.exports = Store;
