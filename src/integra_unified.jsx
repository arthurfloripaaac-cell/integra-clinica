import React, { useState, useEffect, useMemo } from "react";
// v8.9 - welcome popup + whatsapp fix + UI melhorias

// ─── FIREBASE REALTIME DATABASE ────────────────────
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBc2krr7dpI11IR7z2VTTPc_Hi0ItGWiG4",
  authDomain: "integra-clinica-9301d.firebaseapp.com",
  databaseURL: "https://integra-clinica-9301d-default-rtdb.firebaseio.com",
  projectId: "integra-clinica-9301d",
  storageBucket: "integra-clinica-9301d.firebasestorage.app",
};

let _fbDb = null;
let _fbReady = false;
const _fbReadyCallbacks = [];

function onFirebaseReady(fn) { if(_fbReady) fn(); else _fbReadyCallbacks.push(fn); }

if(typeof document !== "undefined") {
  const s1 = document.createElement("script");
  s1.src = "https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js";
  s1.onload = () => {
    const s2 = document.createElement("script");
    s2.src = "https://www.gstatic.com/firebasejs/10.12.0/firebase-database-compat.js";
    s2.onload = () => {
      try {
        const app = window.firebase.initializeApp(FIREBASE_CONFIG);
        _fbDb = window.firebase.database();
        _fbReady = true;
        _fbReadyCallbacks.forEach(fn=>fn());
        _fbReadyCallbacks.length = 0;
      } catch(e) { console.error("Firebase init error:", e); }
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

function sanitizeP2(p2r) {
  if(!p2r) return {achadosDente:{},achadoAtivo:null,segAtivo:null,arcadaAtiva:null,obsTexto:"",obsCorrigido:"",achados:null,obsAchados:{},notasInternas:"",faltouConsulta:false};
  if(!p2r.achadosDente) p2r.achadosDente={};
  if(!p2r.obsAchados) p2r.obsAchados={};
  if(!p2r.achados) p2r.achados=null;
  if(!p2r.obsTexto) p2r.obsTexto="";
  if(p2r.notasInternas===undefined) p2r.notasInternas="";
  if(p2r.faltouConsulta===undefined) p2r.faltouConsulta=false;
  if(!p2r.obsCorrigido) p2r.obsCorrigido="";
  if(p2r.achadoAtivo===undefined) p2r.achadoAtivo=null;
  if(p2r.segAtivo===undefined) p2r.segAtivo=null;
  if(p2r.arcadaAtiva===undefined) p2r.arcadaAtiva=null;
  return p2r;
}

function fbSanitizeKey(str) {
  return (str||"sessao").replace(/[.#$\[\]\/]/g,"_").toLowerCase().slice(0,60);
}

function useFirebaseSync(sessionId, p1, p2, p3, p4State, setP1, setP2, setP3, setP4State) {
  const [fbStatus, setFbStatus] = React.useState("off");
  const [fbSessao, setFbSessao] = React.useState(sessionId||"");
  const [fbConectado, setFbConectado] = React.useState(false);
  const [fbUltimoSync, setFbUltimoSync] = React.useState(null);
  const _skipNextRef = React.useRef(false);
  const _listenerRef = React.useRef(null);
  const _lastWriteRef = React.useRef("");

  const conectar = React.useCallback((sessao) => {
    if(!_fbDb || !sessao) return;
    const key = fbSanitizeKey(sessao);
    setFbSessao(sessao);
    setFbStatus("connecting");
    try { localStorage.setItem("integra_fb_sessao", sessao); } catch(e){}

    if(_listenerRef.current) { _listenerRef.current(); _listenerRef.current = null; }

    const ref = _fbDb.ref("sessoes/"+key);

    // Primeiro: verificar se já existem dados na sessão
    ref.once("value").then((snap) => {
      const existente = snap.val();

      if(existente && existente._p1 && existente._p1.nome) {
        // Sessão já tem dados — PUXAR em vez de sobrescrever
        _lastWriteRef.current = JSON.stringify(existente._ts||"");
        _skipNextRef.current = true;
        try {
          if(existente._p1) setP1(existente._p1);
          if(existente._p2) setP2(sanitizeP2(existente._p2));
          if(existente._p3) {
            const p3r = existente._p3;
            if(!p3r.fc) p3r.fc = [];
            if(!Array.isArray(p3r.fc)) p3r.fc = Object.values(p3r.fc);
            setP3(prev=>({...prev,...p3r,ct:false,bt:false}));
          }
          if(existente._p4) {
            const p4r = existente._p4;
            if(!p4r.procsBase) p4r.procsBase = null;
            if(!p4r.customProcs) p4r.customProcs = [];
            if(!Array.isArray(p4r.customProcs)) p4r.customProcs = Object.values(p4r.customProcs);
            if(p4r.itens && !Array.isArray(p4r.itens)) p4r.itens = Object.values(p4r.itens);
            if(p4r.itens) p4r.itens = p4r.itens.map(it=>({...it,dentes:it.dentes||[],subtopicos:it.subtopicos||[],subtipos:it.subtipos||{},valoresDente:it.valoresDente||{}}));
            setP4State(p4r);
          }
        } catch(e) { console.error("Firebase pull error:", e); }
        setTimeout(()=>{ _skipNextRef.current = false; }, 500);
      } else {
        // Sessão vazia — ENVIAR dados locais
        const tsInicial = Date.now().toString();
        _lastWriteRef.current = JSON.stringify(tsInicial);
        const dadosLocais = JSON.parse(JSON.stringify({
          _ts: tsInicial,
          _lastUpdate: new Date().toISOString(),
          _paciente: p1.nome||"",
          _p1: p1,
          _p2: {...p2, achadosDente:p2.achadosDente||{}, obsAchados:p2.obsAchados||{}},
          _p3: {...p3, fc:p3.fc||[]},
          _p4: p4State ? {...p4State, customProcs:p4State.customProcs||[], itens:(p4State.itens||[]).map(it=>({...it,dentes:it.dentes||[],subtopicos:it.subtopicos||[],subtipos:it.subtipos||{},valoresDente:it.valoresDente||{}}))} : null,
        }));
        ref.set(dadosLocais);
      }

      // Começar a ouvir mudanças do outro computador
      const unsub = ref.on("value", (snap) => {
        const data = snap.val();
        if(!data) { setFbConectado(true); setFbStatus("connected"); return; }
        const hash = JSON.stringify(data._ts||"");
        if(hash === _lastWriteRef.current) return;
        _skipNextRef.current = true;
        try {
          if(data._p1) setP1(data._p1);
          if(data._p2) setP2(sanitizeP2(data._p2));
          if(data._p3) {
            const p3r = data._p3;
            if(!p3r.fc) p3r.fc = [];
            if(!Array.isArray(p3r.fc)) p3r.fc = Object.values(p3r.fc);
            setP3(prev=>({...prev,...p3r}));
          }
          if(data._p4) {
            const p4r = data._p4;
            if(!p4r.procsBase) p4r.procsBase = null;
            if(!p4r.customProcs) p4r.customProcs = [];
            if(!Array.isArray(p4r.customProcs)) p4r.customProcs = Object.values(p4r.customProcs);
            if(p4r.itens && !Array.isArray(p4r.itens)) p4r.itens = Object.values(p4r.itens);
            if(p4r.itens) p4r.itens = p4r.itens.map(it=>({...it,dentes:it.dentes||[],subtopicos:it.subtopicos||[],subtipos:it.subtipos||{},valoresDente:it.valoresDente||{}}));
            setP4State(p4r);
          }
        } catch(e) { console.error("Firebase sync parse error:", e); }
        setFbUltimoSync(new Date());
        setFbConectado(true);
        setFbStatus("connected");
        setTimeout(()=>{ _skipNextRef.current = false; }, 500);
      });
      _listenerRef.current = () => ref.off("value", unsub);
      setFbConectado(true);
      setFbStatus("connected");
    }).catch(e => {
      console.error("Firebase connect error:", e);
      setFbStatus("off");
    });
  },[p1,p2,p3,p4State,setP1,setP2,setP3,setP4State]);

  const salvar = React.useCallback(() => {
    if(!_fbDb || !fbSessao || _skipNextRef.current) return;
    const key = fbSanitizeKey(fbSessao);
    const ts = Date.now().toString();
    _lastWriteRef.current = JSON.stringify(ts);
    // Firebase remove arrays vazios e undefined — usar JSON parse/stringify para limpar
    const clean = JSON.parse(JSON.stringify({
      _ts: ts,
      _lastUpdate: new Date().toISOString(),
      _paciente: p1.nome||"",
      _p1: p1,
      _p2: {...p2, achadosDente:p2.achadosDente||{}, obsAchados:p2.obsAchados||{}},
      _p3: {...p3, fc:p3.fc||[]},
      _p4: p4State ? {...p4State, customProcs:p4State.customProcs||[], itens:(p4State.itens||[]).map(it=>({...it,dentes:it.dentes||[],subtopicos:it.subtopicos||[],subtipos:it.subtipos||{},valoresDente:it.valoresDente||{}}))} : null,
    }));
    _fbDb.ref("sessoes/"+key).set(clean).catch(e=>console.error("Firebase write error:",e));
  },[fbSessao,p1,p2,p3,p4State]);

  const desconectar = React.useCallback(() => {
    if(_listenerRef.current) { _listenerRef.current(); _listenerRef.current = null; }
    setFbConectado(false);
    setFbStatus("off");
    setFbSessao("");
    try { localStorage.removeItem("integra_fb_sessao"); } catch(e){}
  },[]);

  React.useEffect(()=>{
    if(!fbConectado || !fbSessao || _skipNextRef.current) return;
    const t = setTimeout(()=>salvar(), 2000);
    return ()=>clearTimeout(t);
  },[p1,p2,p3,p4State,fbConectado,fbSessao,salvar]);

  return { fbStatus, fbSessao, fbConectado, fbUltimoSync, conectar, desconectar, salvar, setFbSessao };
}


// CSS de impressão global
if(typeof document !== "undefined" && !document.getElementById("integra-print-css")) {
  const _s = document.createElement("style");
  _s.id = "integra-print-css";
  _s.textContent = `
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      html, body { margin: 0 !important; padding: 0 !important; background: #fff !important; }
      #root { background: #fff !important; }
      #root > div { padding: 0 !important; background: #fff !important; }
      .no-print { display: none !important; }
      .relatorio-outer {
        max-width: 100% !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .relatorio-container {
        border: none !important;
        border-radius: 0 !important;
        box-shadow: none !important;
        width: 100% !important;
        max-width: 100% !important;
        display: block !important;
        min-height: auto !important;
        overflow: visible !important;
      }
      /* Header/footer apenas na página 1 — sem repetir */
      .rel-header {
        position: relative;
        background: #fff !important;
      }
      .rel-footer {
        position: relative;
        background: #fff !important;
      }
      /* Conteúdo sem padding extra */
      .rel-content {
        padding-top: 22px !important;
        padding-bottom: 22px !important;
      }
      /* Títulos nunca ficam sozinhos no fim da página */
      .rel-section-title {
        break-after: avoid !important;
        page-break-after: avoid !important;
      }
      /* Cards não quebram no meio */
      .rel-card {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }
      @page { margin: 15mm 10mm 12mm 10mm; size: A4 portrait; }
    }
  `;
  document.head.appendChild(_s);
}


// v5.0 - procedimentos editáveis + paleta

// ─── NOMES DOS DENTES ───────────────────────────────────────────────────────
const NOMES_DENTES = {
  // Superiores direitos
  18:"18 – 3º molar sup. dir.", 17:"17 – 2º molar sup. dir.", 16:"16 – 1º molar sup. dir.",
  15:"15 – 2º pré-molar sup. dir.", 14:"14 – 1º pré-molar sup. dir.",
  13:"13 – canino sup. dir.", 12:"12 – incisivo lat. sup. dir.", 11:"11 – incisivo cent. sup. dir.",
  // Superiores esquerdos
  21:"21 – incisivo cent. sup. esq.", 22:"22 – incisivo lat. sup. esq.",
  23:"23 – canino sup. esq.", 24:"24 – 1º pré-molar sup. esq.", 25:"25 – 2º pré-molar sup. esq.",
  26:"26 – 1º molar sup. esq.", 27:"27 – 2º molar sup. esq.", 28:"28 – 3º molar sup. esq.",
  // Inferiores esquerdos
  38:"38 – 3º molar inf. esq.", 37:"37 – 2º molar inf. esq.", 36:"36 – 1º molar inf. esq.",
  35:"35 – 2º pré-molar inf. esq.", 34:"34 – 1º pré-molar inf. esq.",
  33:"33 – canino inf. esq.", 32:"32 – incisivo lat. inf. esq.", 31:"31 – incisivo cent. inf. esq.",
  // Inferiores direitos
  41:"41 – incisivo cent. inf. dir.", 42:"42 – incisivo lat. inf. dir.",
  43:"43 – canino inf. dir.", 44:"44 – 1º pré-molar inf. dir.", 45:"45 – 2º pré-molar inf. dir.",
  46:"46 – 1º molar inf. dir.", 47:"47 – 2º molar inf. dir.", 48:"48 – 3º molar inf. dir.",
  // Decíduos superiores
  55:"55 – 2º molar dec. sup. dir.", 54:"54 – 1º molar dec. sup. dir.",
  53:"53 – canino dec. sup. dir.", 52:"52 – incisivo lat. dec. sup. dir.", 51:"51 – incisivo cent. dec. sup. dir.",
  61:"61 – incisivo cent. dec. sup. esq.", 62:"62 – incisivo lat. dec. sup. esq.",
  63:"63 – canino dec. sup. esq.", 64:"64 – 1º molar dec. sup. esq.", 65:"65 – 2º molar dec. sup. esq.",
  // Decíduos inferiores
  75:"75 – 2º molar dec. inf. esq.", 74:"74 – 1º molar dec. inf. esq.",
  73:"73 – canino dec. inf. esq.", 72:"72 – incisivo lat. dec. inf. esq.", 71:"71 – incisivo cent. dec. inf. esq.",
  81:"81 – incisivo cent. dec. inf. dir.", 82:"82 – incisivo lat. dec. inf. dir.",
  83:"83 – canino dec. inf. dir.", 84:"84 – 1º molar dec. inf. dir.", 85:"85 – 2º molar dec. inf. dir.",
};

function nomeDente(n) { return NOMES_DENTES[n] || String(n); }
function listaDentes(arr) {
  if(!arr||!arr.length) return "—";
  return arr.sort((a,b)=>a-b).map(n=>nomeDente(n)).join("\n");
}

// ─── PALETA ───────────────────────────────────────
const GOLD = "#B8962E", GOLD_DARK = "#7A6020", GOLD_LIGHT = "#D4B96A";
const GOLD_PALE = "#F5EED8", CREAM = "#FDFAF4", BORDER = "#E8DCC8", PURPLE = "#5B2D6E", PURPLE_LIGHT = "#7B4D8E", PURPLE_BORDER = "#D4C0DE";
const NEUTRO = "#5C5850", NEUTRO_LIGHT = "#7A7568", NEUTRO_PALE = "#E9E7E1";

const fmt = v => "R$ " + (v||0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
function maskTelefone(v) {
  let d = String(v||"").replace(/\D/g,"");
  if(d.length===0) return "";
  if(d.length<=2) return "("+d;
  if(d.length<=6) return "("+d.slice(0,2)+") "+d.slice(2);
  if(d.length<=10) return "("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7);
  if(d.length===11) return "("+d.slice(0,2)+") "+d.slice(2,7)+"-"+d.slice(7,11);
  return "+"+d.slice(0,d.length-11)+" ("+d.slice(-11,-9)+") "+d.slice(-9,-5)+"-"+d.slice(-5);
}


// ─── COMPONENTES COMUNS ───────────────────────────
function Header() {
  return (
    <div style={{background:"linear-gradient(135deg,#3D1F4E 0%,#2A1538 100%)", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
      <div style={{display:"flex", alignItems:"center", gap:12}}>
        <svg width="32" height="42" viewBox="0 0 40 52" fill="none">
          <ellipse cx="20" cy="26" rx="18" ry="24" stroke="#B8962E" strokeWidth="1.5"/>
          <text x="20" y="32" textAnchor="middle" fontFamily="Georgia" fontSize="18" fontStyle="italic" fill="#B8962E">i</text>
        </svg>
        <div>
          <div style={{fontFamily:"Georgia", fontSize:18, fontWeight:700, color:"#fff", letterSpacing:3, textTransform:"uppercase"}}>Íntegra</div>
          <div style={{fontSize:7, letterSpacing:2.5, color:GOLD_LIGHT, textTransform:"uppercase"}}>Clínica Odontológica · Desde 1996</div>
        </div>
      </div>
    </div>
  );
}

function Card({children, style={}}) {
  return <div style={{background:"#fff", border:"1px solid "+BORDER, borderRadius:4, padding:20, marginBottom:14, ...style}}>{children}</div>;
}

function SectionTitle({children}) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:14}}>
      <span style={{fontSize:9, letterSpacing:2.5, textTransform:"uppercase", color:GOLD_DARK, fontWeight:700, whiteSpace:"nowrap"}}>{children}</span>
      <div style={{flex:1, height:1, background:BORDER}}/>
    </div>
  );
}

function Field({label, children}) {
  return (
    <div style={{display:"flex", flexDirection:"column", gap:4}}>
      <label style={{fontSize:9, letterSpacing:2, textTransform:"uppercase", color:GOLD_DARK, fontWeight:600}}>{label}</label>
      {children}
    </div>
  );
}

const inp = {width:"100%", padding:"10px 12px", border:"1px solid "+BORDER, borderRadius:2, fontSize:13, color:"#1C1410", background:"#fff", outline:"2px solid transparent", fontFamily:"inherit"};
const sel = {...inp, cursor:"pointer"};

// ─── PARTE 1: DADOS DO PACIENTE ───────────────────
const EQUIPE = [
  {nome:"Dr. Arthur A. Cheade",            area:"Ortodontia e DTM"},
  {nome:"Dra. Rosana Maria Arioli",        area:"Ortodontia"},
  {nome:"Dr. Artur Breno W. Alécio",       area:"Implantodontia"},
  {nome:"Dra. Deborah S. R. da Cunha",     area:"Periodontia"},
  {nome:"Dra. Maria Juliete F. de Souza",  area:"Clínica Geral"},
  {nome:"Dr. Gustavo Zanatta Brandeburgo", area:"Prótese Dentária"},
  {nome:"Dra. Maria Clara S. Lisboa",      area:"Implantodontia e Periodontia"},
  {nome:"Dr. José Adilson Marchetto",      area:"Endodontia e Cirurgia"},
  {nome:"Dra. Estefany Rodrigues dos Santos", area:"Clínica Geral, Endodontia, Estomatologia e Estética"},
];

function formatCpf(v) {
  const d = v.replace(/\D/g,"").slice(0,11);
  return d.replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2");
}

// ─── ANAMNESE — utilitário compartilhado (Dados do Paciente + Relatório) ──
const ANAMNESE_LABELS = {
  genero: "Gênero",
  profissao: "Profissão / Ocupação",
  queixa: "Queixa principal",
  alergia: "Alergia a medicamento/material",
  medicamento: "Uso de medicamento atual",
  condicoes: "Doença pré-existente",
  denteAusente: "Dente(s) ausente(s)",
  gravida: "Gestante",
  comoConheceu: "Como conheceu a clínica",
  relatoLivre: "Relato livre",
  bruxismo: "Bruxismo",
  sintomasDtm: "Sintomas de DTM",
  aparelhoAnterior: "Uso de aparelho anterior",
};
function formatarAnamnese(an) {
  if(!an) return [];
  const linhas = [];
  const add = (label, valor) => { if(valor && String(valor).trim()) linhas.push({label, valor:String(valor).trim()}); };
  const comDetalhe = (campo, detalheCampo, label) => {
    let v = an[campo];
    if(!v) return;
    if(detalheCampo && an[detalheCampo]) v += " — " + an[detalheCampo];
    add(label, v);
  };
  if(an.queixa&&an.queixa.length) add(ANAMNESE_LABELS.queixa, an.queixa.join(", ")+(an.queixaOutro?" — "+an.queixaOutro:""));
  add(ANAMNESE_LABELS.profissao, an.profissao);
  comDetalhe("alergia","alergiaQual",ANAMNESE_LABELS.alergia);
  comDetalhe("medicamento","medicamentoQual",ANAMNESE_LABELS.medicamento);
  if(an.condicoes&&an.condicoes.length) {
    const listaCondicoes = an.condicoes.length===1 && an.condicoes[0]==="Nenhuma dessas" ? "Nenhuma" : an.condicoes.join(", ");
    add(ANAMNESE_LABELS.condicoes, listaCondicoes+(an.condicoesDetalhe?" — "+an.condicoesDetalhe:""));
  }
  comDetalhe("denteAusente","denteAusenteQuais",ANAMNESE_LABELS.denteAusente);
  add(ANAMNESE_LABELS.gravida, an.gravida);
  comDetalhe("comoConheceu","comoConheceuOutro",ANAMNESE_LABELS.comoConheceu);
  add(ANAMNESE_LABELS.relatoLivre, an.relatoLivre);
  add(ANAMNESE_LABELS.bruxismo, an.bruxismo);
  if(an.sintomasDtm&&an.sintomasDtm.length) {
    const listaSintomas = an.sintomasDtm.length===1 && an.sintomasDtm[0]==="Nenhum desses" ? "Nenhum" : an.sintomasDtm.join(", ");
    add(ANAMNESE_LABELS.sintomasDtm, listaSintomas+(an.sintomasDtmOutro?" — "+an.sintomasDtmOutro:""));
  }
  if(an.aparelhoAnterior) add(ANAMNESE_LABELS.aparelhoAnterior, an.aparelhoAnterior+(an.aparelhoTempo?" — "+an.aparelhoTempo:""));
  return linhas;
}
// Exibição compacta reaproveitando o padrão já usado no cabeçalho do relatório
// (rótulo pequeno em caixa alta acima, valor abaixo). Grid auto-preenchível:
// respostas curtas (Sim/Não) ocupam pouco espaço e ficam lado a lado; respostas
// longas naturalmente ocupam sua própria célula sem esticar a página.
function AnamneseCompacta({anamnese}) {
  const linhas = formatarAnamnese(anamnese);
  if(!linhas.length) return null;
  return (
    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill, minmax(190px, 1fr))",columnGap:20,rowGap:10}}>
      {linhas.map((l,i)=>(
        <div key={i} style={{minWidth:0}}>
          <div style={{fontSize:9,letterSpacing:1,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:2}}>{l.label}</div>
          <div style={{fontSize:12,color:"#5C4A2A",lineHeight:1.35,wordBreak:"break-word"}}>{l.valor}</div>
        </div>
      ))}
    </div>
  );
}

function P1({data, setData, onNovoPaciente, onImportarFormulario}) {
  const {nome,cpf,telefone,email,dataNasc,idade,isMinor,respNome,respCpf,dataConsulta,responsavel} = data;

  const [equipe, setEquipe] = React.useState(EQUIPE);
  const [gerenciandoEquipe, setGerenciandoEquipe] = React.useState(false);
  const [novoMembro, setNovoMembro] = React.useState({nome:"", area:""});
  const [adicionandoMembro, setAdicionandoMembro] = React.useState(false);
  const [showEnviarForm, setShowEnviarForm] = React.useState(false);
  const [showFormRecebidos, setShowFormRecebidos] = React.useState(false);
  const [showAnamnese, setShowAnamnese] = React.useState(false);
  const [linkCopiado, setLinkCopiado] = React.useState(false);
  const [formLinkId, setFormLinkId] = React.useState("f"+Date.now().toString(36));
  const [espLinkForm, setEspLinkForm] = React.useState("geral");
  const [dentistaLinkForm, setDentistaLinkForm] = React.useState("");

  // Carregar equipe persistente
  useEffect(()=>{
    try {
      const saved = JSON.parse(localStorage.getItem("integra_equipe")||"[]");
      if(saved.length>0) setEquipe(saved);
    } catch(e){}
  },[]);

  const salvarEquipe = (novaEquipe) => {
    setEquipe(novaEquipe);
    try { localStorage.setItem("integra_equipe", JSON.stringify(novaEquipe)); } catch(e){}
  };

  const adicionarMembro = () => {
    if(!novoMembro.nome.trim()) return;
    const novo = {nome:novoMembro.nome.trim(), area:novoMembro.area.trim()||"Clínica Geral"};
    const nova = [...equipe, novo];
    salvarEquipe(nova);
    setNovoMembro({nome:"", area:""});
    setAdicionandoMembro(false);
    set("responsavel", novo.nome);
  };

  const removerMembro = (idx) => {
    const nova = equipe.filter((_,i)=>i!==idx);
    salvarEquipe(nova);
    if(responsavel===equipe[idx].nome) set("responsavel", nova[0]?.nome||"");
  };

  const editarMembro = (idx, campo, valor) => {
    const nova = equipe.map((p,i)=>i===idx?{...p,[campo]:valor}:p);
    salvarEquipe(nova);
    if(campo==="nome" && responsavel===equipe[idx].nome) set("responsavel", valor);
  };

  useEffect(() => {
    if (!dataNasc) { setData(p=>({...p,idade:"",isMinor:false})); return; }
    const nasc = new Date(dataNasc), hoje = new Date();
    let anos = hoje.getFullYear() - nasc.getFullYear();
    const m = hoje.getMonth() - nasc.getMonth();
    if (m < 0 || (m===0 && hoje.getDate()<nasc.getDate())) anos--;
    if (anos>=0 && anos<130) setData(p=>({...p,idade:anos+" anos",isMinor:anos<18}));
    else setData(p=>({...p,idade:"",isMinor:false}));
  }, [dataNasc]);

  useEffect(() => {
    if (!dataConsulta) setData(p=>({...p,dataConsulta:new Date().toISOString().split("T")[0]}));
  }, []);

  const set = (k,v) => setData(p=>({...p,[k]:v}));

  return (
    <div style={{maxWidth:640, margin:"0 auto", padding:"20px 16px 40px"}}>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:6}}>
          <SectionTitle style={{margin:0}}>Dados do Paciente</SectionTitle>
          {onNovoPaciente&&<div style={{display:"flex",gap:6}}>
            <div onClick={()=>{
              const temDados = data.nome && data.nome.trim().length>0;
              if(temDados && !window.confirm("Iniciar novo paciente? Os dados atuais n\u00e3o salvos ser\u00e3o perdidos.")) return;
              onNovoPaciente();
            }} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",background:"#fff",border:"1px solid "+GOLD,borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:GOLD_DARK}}>
              + Novo
            </div>
            <div onClick={()=>{if(!showEnviarForm){setFormLinkId("f"+Date.now().toString(36));setDentistaLinkForm("");}setShowEnviarForm(true);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",background:showEnviarForm?"#25D366":"#fff",border:"1px solid "+(showEnviarForm?"#25D366":BORDER),borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:showEnviarForm?"#fff":"#25D366"}}>
              📱 WhatsApp
            </div>
          </div>}
        </div>
        {/* Painel enviar formulário via WhatsApp */}
        {showEnviarForm&&(
          <div style={{marginBottom:14,padding:"14px 16px",background:"#E8F5E9",border:"1px solid #4CAF50",borderRadius:4}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <div style={{fontSize:12,fontWeight:700,color:"#2E7D32"}}>Enviar formulário via WhatsApp</div>
              <div style={{display:"flex",gap:6}}>
                <div onClick={()=>{setFormLinkId("f"+Date.now().toString(36));setDentistaLinkForm("");}} style={{fontSize:10,color:"#2E7D32",cursor:"pointer",padding:"3px 8px",border:"1px solid #4CAF50",borderRadius:20}}>+ Novo link</div>
                <div onClick={()=>setShowEnviarForm(false)} style={{fontSize:10,color:"#9A8060",cursor:"pointer",padding:"3px 8px",border:"1px solid "+BORDER,borderRadius:20}}>✕</div>
              </div>
            </div>
            <div style={{fontSize:11,color:"#5C4A2A",marginBottom:10,lineHeight:1.5}}>O paciente preenche os dados pelo celular e eles aparecem automaticamente aqui.</div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2E7D32",marginBottom:6,letterSpacing:0.5}}>ESPECIALIDADE DA AVALIAÇÃO</div>
              <div style={{display:"flex",gap:6}}>
                <div onClick={()=>setEspLinkForm("geral")} style={{flex:1,padding:"8px 10px",background:espLinkForm==="geral"?"#4CAF50":"#fff",border:"1px solid "+(espLinkForm==="geral"?"#4CAF50":BORDER),borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:espLinkForm==="geral"?"#fff":"#5C4A2A",textAlign:"center"}}>Geral</div>
                <div onClick={()=>setEspLinkForm("ortho")} style={{flex:1,padding:"8px 10px",background:espLinkForm==="ortho"?"#4CAF50":"#fff",border:"1px solid "+(espLinkForm==="ortho"?"#4CAF50":BORDER),borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:espLinkForm==="ortho"?"#fff":"#5C4A2A",textAlign:"center"}}>Ortodontia / DTM</div>
              </div>
            </div>
            <div style={{marginBottom:10}}>
              <div style={{fontSize:10,fontWeight:700,color:"#2E7D32",marginBottom:6,letterSpacing:0.5}}>DENTISTA RESPONSÁVEL *</div>
              <select value={dentistaLinkForm} onChange={e=>{setDentistaLinkForm(e.target.value);set("responsavel",e.target.value);}} style={{width:"100%",padding:"9px 10px",border:"1px solid "+(dentistaLinkForm?"#4CAF50":"#E57373"),borderRadius:4,fontSize:12,fontWeight:600,color:"#5C4A2A",background:"#fff",boxSizing:"border-box"}}>
                <option value="">Selecione antes de enviar...</option>
                {equipe.map(m=><option key={m.nome} value={m.nome}>{m.nome}</option>)}
              </select>
              {!dentistaLinkForm && <div style={{fontSize:10,color:"#E57373",marginTop:4}}>Obrigatório — evita enviar o link com o dentista errado.</div>}
            </div>
            {(()=>{
              const link = (typeof window!=="undefined"?window.location.origin:"")+"/f/"+formLinkId+(espLinkForm==="ortho"?"?esp=ortho":"");
              const msg = "Olá! Segue o link para preencher seu cadastro na Íntegra Clínica Odontológica:\n"+link;
              const waLink = "https://wa.me/?text="+encodeURIComponent(msg);
              const liberado = !!dentistaLinkForm;
              return(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{padding:"10px 12px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,fontSize:11,wordBreak:"break-all",color:GOLD_DARK,fontWeight:500}}>{link}</div>
                  <div style={{display:"flex",gap:8,opacity:liberado?1:0.5,pointerEvents:liberado?"auto":"none"}}>
                    <div onClick={()=>{if(!liberado)return;navigator.clipboard.writeText(link);setLinkCopiado(true);setTimeout(()=>setLinkCopiado(false),2000);}} style={{flex:1,padding:"10px",background:linkCopiado?"#4CAF50":"#fff",border:"1px solid "+(linkCopiado?"#4CAF50":BORDER),borderRadius:4,cursor:liberado?"pointer":"default",fontSize:11,fontWeight:600,color:linkCopiado?"#fff":"#5C4A2A",textAlign:"center"}}>
                      {linkCopiado?"✓ Copiado!":"📋 Copiar link"}
                    </div>
                    <a href={liberado?waLink:undefined} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:"10px",background:"#25D366",borderRadius:4,fontSize:11,fontWeight:700,color:"#fff",textAlign:"center",textDecoration:"none",display:"block"}}>
                      Abrir WhatsApp
                    </a>
                  </div>
                </div>
              );
            })()}
          </div>
        )}
        {/* Formulários recebidos via WhatsApp — collapsible */}
        {onImportarFormulario&&(
          <div style={{marginBottom:14}}>
            <div onClick={()=>setShowFormRecebidos&&setShowFormRecebidos(!showFormRecebidos)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 12px",background:showFormRecebidos?"#E8F5E9":"#fff",border:"1px solid "+(showFormRecebidos?"#4CAF50":BORDER),borderRadius:4}}>
              <span style={{fontSize:14}}>📩</span>
              <span style={{fontSize:11,fontWeight:700,color:showFormRecebidos?"#2E7D32":GOLD_DARK,flex:1}}>Formulários recebidos via WhatsApp</span>
              <span style={{fontSize:12,color:"#9A8060"}}>{showFormRecebidos?"▲":"▼"}</span>
            </div>
            {showFormRecebidos&&(
              <div style={{marginTop:8,padding:"10px 12px",border:"1px solid "+BORDER,borderRadius:4,background:"#fff"}}>
                <FormulariosRecebidos onImportar={onImportarFormulario}/>
              </div>
            )}
          </div>
        )}
        <div style={{marginBottom:12}}>
          <Field label="Nome completo"><input style={inp} spellCheck={false} value={nome} onChange={e=>set("nome",e.target.value)} placeholder="Nome completo"/></Field>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
          <Field label="CPF"><input style={inp} value={cpf} onChange={e=>set("cpf",formatCpf(e.target.value))} placeholder="000.000.000-00"/></Field>
          <Field label="Telefone / WhatsApp"><input style={inp} value={maskTelefone(telefone)} onChange={e=>set("telefone",e.target.value.replace(/\D/g,""))} placeholder="(048) 99999-9999"/></Field>
        </div>
        <div style={{marginBottom:12}}>
          <Field label="E-mail"><input style={inp} type="email" spellCheck={false} value={email||""} onChange={e=>set("email",e.target.value)} placeholder="paciente@email.com"/></Field>
        </div>
        <div style={{marginBottom:12}}>
          <Field label="Data de nascimento"><input style={inp} type="date" value={dataNasc} onChange={e=>set("dataNasc",e.target.value)}/></Field>
        </div>
        {dataNasc && idade && (
          <div style={{fontSize:11, color:isMinor?PURPLE:GOLD_DARK, fontWeight:600, marginBottom:12, padding:"6px 10px", background:isMinor?"rgba(91,45,142,0.06)":GOLD_PALE, borderRadius:2, border:"1px solid "+(isMinor?"rgba(91,45,142,0.2)":GOLD_LIGHT)}}>
            {isMinor?"⚠️ Menor de idade — ":""}{idade}{isMinor?" — preencha o responsável":""}
          </div>
        )}
        {isMinor && (
          <div style={{background:"rgba(91,45,142,0.05)", border:"1px solid rgba(91,45,142,0.2)", borderRadius:3, padding:"14px 16px", marginBottom:12}}>
            <div style={{fontSize:9, letterSpacing:2, textTransform:"uppercase", color:PURPLE, fontWeight:700, marginBottom:12}}>Responsável Legal</div>
            <div style={{marginBottom:10}}>
              <Field label="Nome do responsável"><input style={inp} value={respNome} onChange={e=>set("respNome",e.target.value)} spellCheck={false} placeholder="Nome completo"/></Field>
            </div>
            <Field label="CPF do responsável"><input style={inp} value={respCpf} onChange={e=>set("respCpf",formatCpf(e.target.value))} placeholder="000.000.000-00"/></Field>
          </div>
        )}
        {/* Assinatura digital do paciente */}
        {data.assinatura&&(
          <div style={{marginTop:12,marginBottom:8,padding:"10px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:4}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Assinatura Digital</div>
            <img src={data.assinatura} alt="Assinatura" style={{maxWidth:280,height:"auto",border:"1px solid "+BORDER,borderRadius:3,background:"#fff"}}/>
            <div style={{fontSize:9,color:"#9A8060",marginTop:4}}>Assinatura coletada via formulário digital</div>
          </div>
        )}
        {/* Anamnese recebida via formulário — compacta e retrátil para não pesar na tela */}
        {data.anamnese && (
          <div style={{marginBottom:14}}>
            <div onClick={()=>setShowAnamnese(!showAnamnese)} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"8px 12px",background:showAnamnese?GOLD_PALE:"#fff",border:"1px solid "+(showAnamnese?GOLD:BORDER),borderRadius:4}}>
              <span style={{fontSize:14}}>📋</span>
              <span style={{fontSize:11,fontWeight:700,color:GOLD_DARK,flex:1}}>Anamnese do paciente</span>
              <span style={{fontSize:12,color:"#9A8060"}}>{showAnamnese?"▲":"▼"}</span>
            </div>
            {showAnamnese&&(
              <div style={{marginTop:8,padding:"10px 12px",border:"1px solid "+BORDER,borderRadius:4,background:"#fff"}}>
                <AnamneseCompacta anamnese={data.anamnese}/>
              </div>
            )}
          </div>
        )}
        <div style={{borderTop:"1px solid "+BORDER, marginTop:4, paddingTop:16}}>
          <div style={{fontSize:9, letterSpacing:2, textTransform:"uppercase", color:GOLD_DARK, fontWeight:700, marginBottom:12}}>Dados da Consulta</div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:8}}>
            <Field label="Data da consulta"><input style={inp} type="date" value={dataConsulta} onChange={e=>set("dataConsulta",e.target.value)}/></Field>
            <Field label="Responsável clínico">
              <select style={sel} value={responsavel} onChange={e=>set("responsavel",e.target.value)}>
                {equipe.map(p=><option key={p.nome} value={p.nome}>{p.nome} — {p.area}</option>)}
              </select>
            </Field>
          </div>
          <div onClick={()=>setGerenciandoEquipe(!gerenciandoEquipe)} style={{fontSize:10,color:gerenciandoEquipe?GOLD_DARK:"#9A8060",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:4,padding:"3px 8px",border:"1px solid "+(gerenciandoEquipe?GOLD:BORDER),borderRadius:20,marginBottom:gerenciandoEquipe?12:0}}>
            {gerenciandoEquipe?"✓ Concluir":"✎ Gerenciar equipe clínica"}
          </div>
          {gerenciandoEquipe&&(
            <div style={{padding:"12px 14px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3,marginTop:8}}>
              <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:10}}>
                {equipe.map((p,i)=>(
                  <div key={i} style={{display:"flex",gap:6,alignItems:"center"}}>
                    <input spellCheck={false} style={{flex:1,padding:"6px 8px",border:"1px solid "+GOLD,borderRadius:2,fontSize:12,fontWeight:600,color:GOLD_DARK,background:GOLD_PALE,outline:"none",fontFamily:"inherit"}} value={p.nome} onChange={e=>editarMembro(i,"nome",e.target.value)} placeholder="Nome"/>
                    <input style={{flex:1,padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,color:"#5C4A2A",background:"#fff",outline:"none",fontFamily:"inherit"}} value={p.area} onChange={e=>editarMembro(i,"area",e.target.value)} spellCheck={false} placeholder="Especialidade"/>
                    <div onClick={()=>removerMembro(i)} style={{fontSize:10,color:"#9A8060",cursor:"pointer",padding:"4px 8px",border:"1px solid "+BORDER,borderRadius:2,flexShrink:0}}>✕</div>
                  </div>
                ))}
              </div>
              {!adicionandoMembro?(
                <div onClick={()=>setAdicionandoMembro(true)} style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px",border:"1.5px dashed "+BORDER,borderRadius:2,cursor:"pointer",color:GOLD_DARK,fontSize:11,fontWeight:600}}>+ Novo membro</div>
              ):(
                <div style={{display:"flex",gap:6,alignItems:"center"}}>
                  <input style={{flex:1,padding:"7px 8px",border:"1px solid "+GOLD,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}} value={novoMembro.nome} onChange={e=>setNovoMembro(p=>({...p,nome:e.target.value}))} spellCheck={false} placeholder="Nome completo" autoFocus/>
                  <input style={{flex:1,padding:"7px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,outline:"none",fontFamily:"inherit"}} value={novoMembro.area} onChange={e=>setNovoMembro(p=>({...p,area:e.target.value}))} spellCheck={false} placeholder="Especialidade"/>
                  <div onClick={adicionarMembro} style={{padding:"7px 12px",background:GOLD,color:"#fff",borderRadius:2,fontSize:11,fontWeight:700,cursor:"pointer",flexShrink:0}}>+ Add</div>
                  <div onClick={()=>{setAdicionandoMembro(false);setNovoMembro({nome:"",area:""}); }} style={{padding:"7px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,cursor:"pointer",color:"#9A8060",flexShrink:0}}>✕</div>
                </div>
              )}
              <div style={{fontSize:9,color:"#9A8060",marginTop:8}}>✦ Alterações salvas automaticamente.</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── PARTE 2: ODONTOGRAMA ─────────────────────────
const QUADRANTES = {
  q1:[18,17,16,15,14,13,12,11], q2:[21,22,23,24,25,26,27,28],
  q3:[38,37,36,35,34,33,32,31], q4:[41,42,43,44,45,46,47,48],
};
const DECIDUOS = {
  d1:[55,54,53,52,51], d2:[61,62,63,64,65],
  d3:[85,84,83,82,81], d4:[71,72,73,74,75],
};
const SEGMENTOS = {
  "Anterior":      {sup:[13,12,11,21,22,23], inf:[33,32,31,41,42,43]},
  "Post. Direita": {sup:[18,17,16,15,14],    inf:[48,47,46,45,44]},
  "Post. Esquerda":{sup:[28,27,26,25,24],    inf:[38,37,36,35,34]},
};
const BOCA_TODA = Object.values(QUADRANTES).flat();
const ARCADA_DENTES = {
  Superior:[...QUADRANTES.q1,...QUADRANTES.q2],
  Inferior:[...QUADRANTES.q3,...QUADRANTES.q4],
};
// ACHADOS now in p2.achados state

function tipoDente(n) {
  const u=n%10;
  if(u===8) return "siso";
  if(u>=6) return "molar";
  if(u>=4) return "premolar";
  return "anterior";
}

function Dente({numero, achadoAtivo, achadosDente, onClick, achados}) {
  const tipo=tipoDente(numero), size=tipo==="molar"?28:tipo==="premolar"?24:22;
  const achadosDenteArr=Object.entries(achadosDente[numero]||{}).filter(([,v])=>v);
  const tem=achadosDenteArr.length>0;
  const cor=tem?achados.find(a=>a.id===achadosDenteArr[0][0])?.cor:null;
  const marcado=achadoAtivo&&achadosDente[numero]?.[achadoAtivo];
  return (
    <div onClick={()=>onClick(numero)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
      <div style={{width:size,height:size,borderRadius:tipo==="anterior"?"50%":4,border:"2px solid "+(marcado?GOLD_DARK:tem?cor:BORDER),background:tem?cor+"33":achadoAtivo?GOLD_PALE:"#fff",position:"relative",transition:"all 0.12s",boxShadow:marcado?"0 0 0 2px "+GOLD_PALE:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {marcado&&<span style={{fontSize:9,color:GOLD_DARK,fontWeight:900}}>✓</span>}
        {!achadoAtivo&&achadosDenteArr.length>1&&<div style={{position:"absolute",top:-4,right:-4,width:10,height:10,borderRadius:"50%",background:achados.find(a=>a.id===achadosDenteArr[1][0])?.cor,border:"1px solid #fff"}}/>}
      </div>
      <span style={{fontSize:8,color:marcado?GOLD_DARK:tem?cor:"#B0A090",fontWeight:tem||marcado?700:400}}>{numero}</span>
    </div>
  );
}

function P2({data, setData}) {
  const {achadosDente={}, achadoAtivo=null, segAtivo=null, arcadaAtiva=null, obsTexto="", obsCorrigido="", notasInternas="", faltouConsulta=false} = data;
  const ACHADOS = data.achados || ACHADOS_DEFAULT;
  const [editandoAchados, setEditandoAchados] = useState(false);
  const [novoAchado, setNovoAchado] = useState({label:"", cor:"#4CAF50"});
  const [adicionando, setAdicionando] = useState(false);
  const set = (k,v) => setData(p=>({...p,[k]:v}));

  const toggleDente = n => {
    if(!achadoAtivo) return;
    setData(p=>({...p,achadosDente:{...p.achadosDente,[n]:{...(p.achadosDente[n]||{}),[achadoAtivo]:!p.achadosDente[n]?.[achadoAtivo]}}}));
  };

  const aplicarSelecao = (seg, arc) => {
    if(!achadoAtivo) return;
    let dentes=[];
    if(seg&&arc){const s=SEGMENTOS[seg];dentes=arc==="Superior"?s.sup:arc==="Inferior"?s.inf:[...s.sup,...s.inf];}
    else if(seg){const s=SEGMENTOS[seg];dentes=[...s.sup,...s.inf];}
    else if(arc){dentes=arc==="Ambas"?BOCA_TODA:ARCADA_DENTES[arc]||[];}
    if(!dentes.length) return;
    const all=dentes.every(d=>achadosDente[d]?.[achadoAtivo]);
    setData(p=>{const novo={...p.achadosDente};dentes.forEach(d=>{novo[d]={...(novo[d]||{}),[achadoAtivo]:!all};});return{...p,achadosDente:novo,segAtivo:null,arcadaAtiva:null};});
  };

  const limpar = () => setData(p=>({...p,achadosDente:{},achadoAtivo:null}));

  const resumo = ACHADOS.map(a=>{const dentes=Object.entries(achadosDente).filter(([k,v])=>k!=="_geral"&&v&&v[a.id]).map(([d])=>parseInt(d)).sort((x,y)=>x-y);const geral=achadosDente["_geral"]?.[a.id]||false;return{...a,dentes,geral};}).filter(a=>a.dentes.length>0||a.geral);
  const aObj = ACHADOS.find(a=>a.id===achadoAtivo);

  return (
    <div style={{maxWidth:680, margin:"0 auto", padding:"20px 16px 40px"}}>
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16,paddingBottom:12,borderBottom:"1px solid "+BORDER}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:18}}>🦷</span>
            <span style={{fontSize:11,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Odontograma</span>
          </div>
          {resumo.length>0&&<div onClick={limpar} style={{fontSize:10,color:"#E57373",cursor:"pointer",padding:"3px 10px",border:"1px solid #E57373",borderRadius:20}}>✕ Limpar tudo</div>}
        </div>

        {/* Achados */}
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"#9A8060"}}>Achados clínicos</div>
            <div style={{display:"flex",gap:6}}>
              <div onClick={()=>setAdicionando(!adicionando)} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20}}>+ Novo</div>
              <div onClick={()=>setEditandoAchados(!editandoAchados)} style={{fontSize:10,color:editandoAchados?"#E57373":"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(editandoAchados?"#E57373":BORDER),borderRadius:20}}>{editandoAchados?"✓ Concluir":"✎ Editar"}</div>
            </div>
          </div>
          {adicionando&&(
            <div style={{padding:"10px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:10}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input style={{flex:1,padding:"6px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",minWidth:120}} placeholder="Nome do achado" value={novoAchado.label} onChange={e=>setNovoAchado(p=>({...p,label:e.target.value}))}/>
                <input type="color" value={novoAchado.cor} onChange={e=>setNovoAchado(p=>({...p,cor:e.target.value}))} style={{width:30,height:28,border:"1px solid "+BORDER,borderRadius:2,cursor:"pointer",padding:2}}/>
                <div onClick={()=>{if(!novoAchado.label.trim())return;const id="c_"+Date.now();set("achados",[...ACHADOS,{id,label:novoAchado.label.trim(),cor:novoAchado.cor}]);setNovoAchado({label:"",cor:"#4CAF50"});setAdicionando(false);}} style={{padding:"6px 12px",background:GOLD,color:"#fff",borderRadius:2,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Adicionar</div>
                <div onClick={()=>setAdicionando(false)} style={{padding:"6px 10px",border:"1px solid "+BORDER,color:"#9A8060",borderRadius:2,fontSize:11,cursor:"pointer"}}>✕</div>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {ACHADOS.map(a=>{
              const ativo=achadoAtivo===a.id,qtd=Object.entries(achadosDente).filter(([k,v])=>k!=="_geral"&&v&&v[a.id]).length,isGeral=achadosDente["_geral"]?.[a.id]||false;
              return(<div key={a.id} style={{position:"relative",display:"flex",alignItems:"center"}}>
                {editandoAchados&&<div onClick={()=>{set("achados",ACHADOS.filter(x=>x.id!==a.id));}} style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",background:"#E57373",color:"#fff",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:10,lineHeight:1}}>✕</div>}
                <div onClick={()=>set("achadoAtivo",ativo?null:a.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",border:"2px solid "+(ativo?a.cor:(qtd>0||isGeral)?a.cor+"88":BORDER),background:ativo?a.cor:(qtd>0||isGeral)?a.cor+"11":"#fff",color:ativo?"#fff":(qtd>0||isGeral)?a.cor:"#5C4A2A",fontWeight:ativo||qtd>0||isGeral?700:400,display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:ativo?"#fff":a.cor}}/>
                {a.label}
                {qtd>0&&<span style={{fontSize:9,background:ativo?"rgba(255,255,255,0.3)":a.cor,color:"#fff",borderRadius:10,padding:"1px 5px"}}>{qtd}</span>}
                {isGeral&&qtd===0&&<span style={{fontSize:9,background:ativo?"rgba(255,255,255,0.3)":a.cor,color:"#fff",borderRadius:10,padding:"1px 5px"}}>✓</span>}
              </div>
              </div>);
            })}
          </div>
          {achadoAtivo&&<div style={{marginTop:10}}>
            {/* Header do achado — SEM background colorido para não interferir no spellCheck */}
            <div style={{padding:"8px 12px",border:"1px solid #ddd",borderRadius:"3px 3px 0 0",fontSize:11,color:"#5C4A2A",fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center",background:"#fafafa"}}>
              <span style={{display:"flex",alignItems:"center",gap:6}}>
                <span style={{width:8,height:8,borderRadius:"50%",background:aObj.cor,display:"inline-block"}}/>
                Marcando: {aObj.label}
              </span>
              <span style={{display:"flex",alignItems:"center",gap:8}}>
                <span onClick={()=>{setData(p=>({...p,achadosDente:{...p.achadosDente,_geral:{...(p.achadosDente._geral||{}),[achadoAtivo]:!p.achadosDente._geral?.[achadoAtivo]}}}));}} style={{cursor:"pointer",color:achadosDente["_geral"]?.[achadoAtivo]?"#2E7D32":GOLD_DARK,fontSize:10,padding:"2px 8px",border:"1px solid "+(achadosDente["_geral"]?.[achadoAtivo]?"#4CAF50":GOLD),borderRadius:20,background:achadosDente["_geral"]?.[achadoAtivo]?"#E8F5E9":"#fff"}}>{achadosDente["_geral"]?.[achadoAtivo]?"✓ Região registrada":"+ Nova região"}</span>
                <span onClick={()=>set("achadoAtivo",null)} style={{cursor:"pointer",color:"#9A8060",fontSize:12}}>✕</span>
              </span>
            </div>
            {/* Textarea FORA de qualquer container colorido */}
            <textarea
              spellCheck="true"
              lang="pt-BR"
              autoCorrect="on"
              autoCapitalize="sentences"
              value={(data.obsAchados||{})[achadoAtivo]||""}
              onChange={e=>set("obsAchados",{...(data.obsAchados||{}),[achadoAtivo]:e.target.value})}
              placeholder={"Observação: "+aObj.label.toLowerCase()+"..."}
              style={{
                display:"block",
                width:"100%",
                padding:"10px 12px",
                border:"1px solid #ddd",
                borderTop:"none",
                borderRadius:"0 0 3px 3px",
                fontSize:13,
                fontFamily:"Arial,sans-serif",
                resize:"vertical",
                minHeight:60,
                background:"#fff",
                color:"#222",
                boxSizing:"border-box",
                outline:"none",
              }}
            />
          </div>}
        </div>

        {/* Seletor região */}
        <div style={{marginBottom:14,opacity:achadoAtivo?1:0.4,pointerEvents:achadoAtivo?"auto":"none"}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"#9A8060",marginBottom:8}}>Selecionar por região e arcada</div>
          <div style={{display:"flex",gap:12,flexWrap:"wrap",alignItems:"flex-start"}}>
            <div>
              <div style={{fontSize:8.5,letterSpacing:1.5,textTransform:"uppercase",color:"#9A8060",marginBottom:5}}>Região</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {Object.keys(SEGMENTOS).map(seg=>(
                  <div key={seg} onClick={()=>set("segAtivo",segAtivo===seg?null:seg)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(segAtivo===seg?GOLD_DARK:BORDER),background:segAtivo===seg?GOLD_PALE:"#fff",color:segAtivo===seg?GOLD_DARK:"#5C4A2A",fontWeight:segAtivo===seg?700:400}}>{seg}</div>
                ))}
              </div>
            </div>
            <div style={{alignSelf:"stretch",width:1,background:BORDER,margin:"16px 0"}}/>
            <div>
              <div style={{fontSize:8.5,letterSpacing:1.5,textTransform:"uppercase",color:"#9A8060",marginBottom:5}}>Arcada</div>
              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {["Superior","Inferior","Ambas"].map(arc=>(
                  <div key={arc} onClick={()=>set("arcadaAtiva",arcadaAtiva===arc?null:arc)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(arcadaAtiva===arc?GOLD_DARK:BORDER),background:arcadaAtiva===arc?GOLD_PALE:"#fff",color:arcadaAtiva===arc?GOLD_DARK:"#5C4A2A",fontWeight:arcadaAtiva===arc?700:400}}>{arc}</div>
                ))}
              </div>
            </div>
            {(segAtivo||arcadaAtiva)&&(
              <div style={{display:"flex",flexDirection:"column",gap:6,justifyContent:"center"}}>
                <div onClick={()=>aplicarSelecao(segAtivo,arcadaAtiva)} style={{padding:"10px 14px",borderRadius:3,background:GOLD,color:"#fff",fontSize:11,fontWeight:700,cursor:"pointer",textAlign:"center",lineHeight:1.6}}>
                  ✓ Aplicar<br/><span style={{fontSize:9,fontWeight:400,opacity:0.85}}>{[segAtivo,arcadaAtiva].filter(Boolean).join(" · ")}</span>
                </div>
              </div>
            )}
            <div style={{display:"flex",flexDirection:"column",justifyContent:"center"}}>
              <div style={{fontSize:8.5,letterSpacing:1.5,textTransform:"uppercase",color:"#9A8060",marginBottom:5}}>Atalho</div>
              <div onClick={()=>aplicarSelecao(null,"Ambas")} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+BORDER,background:"#fff",color:"#5C4A2A"}}>Boca Toda</div>
            </div>
          </div>
        </div>

        {/* Odontograma visual */}
        <div style={{background:CREAM,borderRadius:3,padding:"14px 6px",border:"1px solid "+BORDER}}>
          <div style={{textAlign:"center",fontSize:9,letterSpacing:1.5,color:"#C0B090",textTransform:"uppercase",marginBottom:6}}>Superior</div>
          <div style={{display:"flex",justifyContent:"center",gap:3,marginBottom:8}}>
            <div style={{display:"flex",gap:3,paddingRight:8,borderRight:"1px dashed "+BORDER}}>
              {QUADRANTES.q1.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
            </div>
            <div style={{display:"flex",gap:3,paddingLeft:8}}>
              {QUADRANTES.q2.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
            </div>
          </div>
          <div style={{borderTop:"1px dashed "+BORDER,margin:"4px 0"}}/>
          <div style={{display:"flex",justifyContent:"center",gap:3,marginTop:8}}>
            <div style={{display:"flex",gap:3,paddingRight:8,borderRight:"1px dashed "+BORDER}}>
              {[...QUADRANTES.q4].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
            </div>
            <div style={{display:"flex",gap:3,paddingLeft:8}}>
              {[...QUADRANTES.q3].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
            </div>
          </div>
          <div style={{textAlign:"center",fontSize:9,letterSpacing:1.5,color:"#C0B090",textTransform:"uppercase",marginTop:6}}>Inferior</div>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:6,padding:"0 8px"}}>
            <span style={{fontSize:9,color:"#C0B090"}}>← DIREITO</span>
            <span style={{fontSize:9,color:"#C0B090"}}>ESQUERDO →</span>
          </div>

          {/* Dentes decíduos */}
          <div style={{borderTop:"1px dashed "+BORDER,marginTop:8,paddingTop:8}}>
            <div style={{textAlign:"center",fontSize:8,letterSpacing:1.5,color:"#C0B090",textTransform:"uppercase",marginBottom:5,opacity:0.7}}>Decíduos</div>
            <div style={{display:"flex",justifyContent:"center",gap:2,marginBottom:4}}>
              <div style={{display:"flex",gap:2,paddingRight:5,borderRight:"1px dashed "+BORDER}}>
                {DECIDUOS.d1.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
              </div>
              <div style={{display:"flex",gap:2,paddingLeft:5}}>
                {DECIDUOS.d2.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
              </div>
            </div>
            <div style={{borderTop:"1px dashed "+BORDER,margin:"3px 0"}}/>
            <div style={{display:"flex",justifyContent:"center",gap:2,marginTop:4}}>
              <div style={{display:"flex",gap:2,paddingRight:5,borderRight:"1px dashed "+BORDER}}>
                {[...DECIDUOS.d3].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
              </div>
              <div style={{display:"flex",gap:2,paddingLeft:5}}>
                {[...DECIDUOS.d4].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} onClick={toggleDente} achados={ACHADOS}/>)}
              </div>
            </div>
          </div>
        </div>

        {/* Resumo achados */}
        {resumo.length>0&&(
          <div style={{marginTop:14}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"#9A8060",marginBottom:8}}>Resumo dos achados</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {resumo.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"center",gap:0,border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:4,background:a.cor,alignSelf:"stretch",flexShrink:0}}/>
                  <div style={{flex:1,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:a.cor}}/>
                      <span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{a.label}</span>
                    </div>
                    <div style={{fontSize:10,color:"#9A8060",textAlign:"right",whiteSpace:"pre-line",maxWidth:"55%"}}>{descreverRegiao(a.dentes,true)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* Informações Clínicas */}
      <Card>
        <SectionTitle>Informações Clínicas</SectionTitle>
        <textarea spellCheck="true" lang="pt-BR" autoCorrect="on" autoCapitalize="sentences" value={obsTexto} onChange={e=>set("obsTexto",e.target.value)} placeholder="Queixa principal do paciente, histórico clínico, sinais e sintomas..." style={{width:"100%",padding:"10px 12px",border:"1px solid "+BORDER,borderRadius:2,fontSize:13,color:"#1C1410",background:"#fff",fontFamily:"inherit",minHeight:90,resize:"vertical",lineHeight:1.6}}/>
        <div style={{fontSize:10,color:"#9A8060",marginTop:6}}>Este campo aparece no relatório do paciente.</div>
      </Card>

      {/* Notas internas — NUNCA aparecem no relatório, uso exclusivo da equipe */}
      <Card>
        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:10}}>
          <span style={{fontSize:13}}>🔒</span>
          <span style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:"#7A6020",fontWeight:700}}>Notas internas</span>
        </div>
        <textarea spellCheck="true" lang="pt-BR" autoCorrect="on" autoCapitalize="sentences" value={notasInternas} onChange={e=>set("notasInternas",e.target.value)} placeholder="Anotações da equipe: ex. orçamento ainda não apresentado, pendências internas, observações que não devem ir para o paciente..." style={{width:"100%",padding:"10px 12px",border:"1px solid "+GOLD,borderRadius:2,fontSize:13,color:"#1C1410",background:GOLD_PALE,fontFamily:"inherit",minHeight:70,resize:"vertical",lineHeight:1.6}}/>
        <div style={{fontSize:10,color:GOLD_DARK,marginTop:6,fontWeight:600}}>🔒 Este campo NÃO aparece no relatório — fica só no sistema.</div>
      </Card>
    </div>
  );
}

// ─── PARTE 3: CALCULADORA ─────────────────────────
const DESCONTOS = [{label:"Sem desconto",value:0},{label:"5% à vista",value:5},{label:"10% à vista",value:10},{label:"Outro",value:-1}];
const FORMAS = [
  {id:"dinheiro",label:"Dinheiro",icon:"💵",taxa:0},
  {id:"pix",label:"PIX",icon:"⚡",taxa:0},
  {id:"boleto",label:"Boleto",icon:"📄",taxa:0},
  {id:"debito",label:"Cartão de débito",icon:"💳",taxa:1.99},
  {id:"credito",label:"Cartão de crédito",icon:"💳",taxa:4.99},
];

// ─── PLANOS PAGSEGURO + CALCULADORA ─────────────
const PLANOS_PAGSEGURO = {
  hora: {
    label:"Na hora", descricao:"Recebimento imediato",
    taxaInt:5.59, jurosMes:3.49, badge:"Antecipado",
  },
  dias14: {
    label:"14 dias", descricao:"Plano atual da clínica",
    taxaInt:4.59, jurosMes:2.99, badge:"Plano atual",
  },
};

// quemPaga: "comprador" = cliente paga os juros (clínica recebe líquido fixo)
//           "vendedor"  = clínica absorve os juros (cliente paga valor fixo)
function calcCreditoPlano(valorCobrado, n, plano="hora", quemPaga="comprador") {
  const p = PLANOS_PAGSEGURO[plano] || PLANOS_PAGSEGURO.hora;
  const taxaInt = valorCobrado * p.taxaInt / 100;
  const liq = valorCobrado - taxaInt;
  if(n===1) return {parcela:valorCobrado,total:valorCobrado,totalCliente:valorCobrado,liquido:liq,taxa:taxaInt,juros:0};
  const i = p.jurosMes / 100;
  if(quemPaga==="comprador") {
    // cliente paga valorCobrado + juros
    const pmt = valorCobrado * i / (1 - Math.pow(1+i,-n));
    const total = pmt * n;
    return {parcela:pmt, total, totalCliente:total, liquido:liq, taxa:taxaInt, juros:total-valorCobrado};
  } else {
    // clínica absorve juros: cliente paga valorCobrado/n fixo
    const pmt = valorCobrado / n;
    // custo real: clínica recebe valorCobrado mas precisa pagar juros implícitos
    const fvn = valorCobrado * i * Math.pow(1+i,n) / (Math.pow(1+i,n)-1) * n;
    const jurosAbsorvido = fvn - valorCobrado;
    return {parcela:pmt, total:valorCobrado, totalCliente:valorCobrado, liquido:liq-jurosAbsorvido, taxa:taxaInt, juros:0, jurosAbsorvido};
  }
}

// Modo "quanto quero receber" — calcula valorCobrado a partir do líquido
function calcInverso(liqDesejado, n, plano="hora", quemPaga="comprador") {
  const p = PLANOS_PAGSEGURO[plano] || PLANOS_PAGSEGURO.hora;
  const i = p.jurosMes / 100;
  const taxaIntPct = p.taxaInt / 100;
  if(quemPaga==="comprador") {
    // líq = cobrado*(1-taxaInt) → cobrado = líq/(1-taxaInt)
    const cobrado = liqDesejado / (1 - taxaIntPct);
    return calcCreditoPlano(cobrado, n, plano, quemPaga);
  } else {
    // líq = cobrado*(1-taxaInt) - jurosAbsorvido
    // Aproximação: cobrado ≈ (liq + jurosAbsorvido)/(1-taxaInt)
    // Iteramos 3x
    let cobrado = liqDesejado / (1 - taxaIntPct);
    for(let k=0; k<5; k++) {
      const r = calcCreditoPlano(cobrado, n, plano, quemPaga);
      const diff = r.liquido - liqDesejado;
      cobrado -= diff * 0.9;
    }
    return calcCreditoPlano(cobrado, n, plano, quemPaga);
  }
}

// Legacy — mantido para compatibilidade
function calcCreditoHora(valor,n) { return calcCreditoPlano(valor,n,"hora","comprador"); }
function calcCredito14dias(valor,n) { return calcCreditoPlano(valor,n,"dias14","comprador"); }
function calcCredito(valor,n) { return calcCreditoPlano(valor,n,"hora","comprador"); }


function VerificadorTaxas({plano}) {
  const [status, setStatus] = useState(null);
  const [msg, setMsg] = useState("");

  const verificar = async () => {
    setStatus("checking"); setMsg("");
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{
        method:"POST",
        headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},
        body:JSON.stringify({
          model:"claude-sonnet-4-20250514",max_tokens:300,
          system:"Verifique taxas PagBank crédito parcelado. Responda SOMENTE JSON: {taxaVista_hora,taxaParc_hora,taxaVista_14,taxaParc_14,juros_14,mudou,data}. Compare: hora={4.99%,5.59%,3.49%am}, 14dias={3.99%,4.59%,2.99%am}. Se mudou=true, descreva em campo 'diff'.",
          messages:[{role:"user",content:"Taxas atuais PagBank maquininha crédito parcelado 2026?"}]
        })
      });
      const d = await res.json();
      const txt = d.content.filter(b=>b.type==="text").map(b=>b.text).join("").trim();
      const j = JSON.parse(txt.replace(/```json|```/g,"").trim());
      if(j.mudou) {setStatus("alerta");setMsg("⚠️ Taxas mudaram! "+JSON.stringify(j.diff||j));}
      else {setStatus("ok");setMsg("✓ Taxas verificadas em "+j.data+". Sem alterações.");}
    } catch(e) {setStatus("erro");setMsg("Erro ao verificar. Cheque manualmente no app PagBank.");}
  };

  return (
    <div style={{marginTop:12,padding:"10px 14px",background:status==="alerta"?"rgba(229,115,115,0.06)":CREAM,border:"1px solid "+(status==="alerta"?"#E57373":status==="ok"?"#4CAF50":BORDER),borderRadius:3}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600}}>Taxas PagBank</div>
        <div onClick={status==="checking"?null:verificar} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"3px 10px",border:"1px solid "+GOLD,borderRadius:20,opacity:status==="checking"?0.5:1}}>
          {status==="checking"?"Verificando...":"🔄 Verificar agora"}
        </div>
      </div>
      {msg&&<div style={{fontSize:10,marginTop:6,color:status==="alerta"?"#C62828":status==="ok"?"#2E7D32":"#9A8060"}}>{msg}</div>}
      <div style={{fontSize:9,color:"#9A8060",marginTop:4}}>Plano atual: {plano==="dias14"?"14 dias (3.99% / 4.59%)":"Na hora (4.99% / 5.59%)"}</div>
    </div>
  );
}

function P3({vb:valorBruto,setVb:setValorBruto,ds:descSel,setDs:setDescSel,dc:descCustom,setDc:setDescCustom,fc:formasChecked,setFc:setFormasChecked,fa:formaAtiva,setFa:setFormaAtiva,bm:boletoModo,setBm:setBoletoModo,bp:boletoParc,setBp:setBoletoParc,bj:boletoJuros,setBj:setBoletoJuros,bi:boletoIsento,setBi:setBoletoIsento,ci:creditoIsento,setCi:setCreditoIsento,cp:creditoParc,setCp:setCreditoParc,tb:tab,setTb:setTab,entrada,setEntrada,entradaTipo,setEntradaTipo,entradaVal,setEntradaVal,saldoTipo,setSaldoTipo,ct=false,setCt,bt=false,setBt,planoExterno,setPlanoExterno,p3QuemPaga,setP3QuemPaga,boletoComDesconto=false,setBoletoComDesconto,p4State=null,modoRel="soma",setModoRel,bpSel,setBpSel,cpSel,setCpSel}) {
  const [plano, setPlanoLocal] = React.useState(planoExterno||"hora");
  const setPlano = (v) => { setPlanoLocal(v); if(setPlanoExterno) setPlanoExterno(v); };
  const planoAtual = plano;
  const quemPaga = p3QuemPaga || "comprador";
  const setQuemPaga = (v) => { if(setP3QuemPaga) setP3QuemPaga(v); };
  const [modoCred, setModoCred] = React.useState("cobrar");
  const [valorCobrarInput, setValorCobrarInput] = React.useState("");

  const descPct=descSel===-1?(parseFloat(descCustom)||0):descSel;
  const valorBase=parseFloat(String(valorBruto).replace(",","."))||0;
  const descVal=valorBase*descPct/100;
  const valorFinal=valorBase-descVal;
  const nBoleto=parseInt(boletoParc)||1;
  const nIsentoCredito=parseInt(creditoIsento)||0;

  // Entrada calculations
  const entradaPct = entradaTipo === "pct" ? (parseFloat(entradaVal)||0) : 0;
  const entradaFixo = entradaTipo === "fixo" ? (parseFloat(String(entradaVal).replace(",","."))||0) : 0;
  // Desconto à vista: só aplica quando NÃO há entrada (pagamento total de uma vez)
  // Com entrada, a base de cálculo é sempre o valorBase (sem desconto)
  const baseEntrada = entrada ? valorBase : valorFinal;
  const entradaValor = entrada ? (entradaTipo === "pct" ? baseEntrada * entradaPct / 100 : entradaFixo) : 0;
  const saldo = entrada ? Math.max(0, baseEntrada - entradaValor) : valorFinal;

  const creditoBase=(entrada&&entradaValor>0&&saldoTipo==="parcelado")?saldo:valorBase;
  const baseCredInput = modoCred==="cobrar" || !valorCobrarInput
    ? creditoBase
    : parseFloat(String(valorCobrarInput).replace(",","."))||creditoBase;

  const tabelaCredito=useMemo(()=>{
    if(baseCredInput<=0) return[];
    const rows = [1,2,3,4,5,6,7,8,9,10,11,12].map(n=>{
      if(modoCred==="receber" && valorCobrarInput) {
        const r = calcInverso(baseCredInput, n, planoAtual, quemPaga);
        return {n, ...r};
      }
      return {n, ...calcCreditoPlano(baseCredInput, n, planoAtual, quemPaga)};
    });
    return rows;
  },[baseCredInput, planoAtual, quemPaga, modoCred, valorCobrarInput]);

  const creditoParcObj=creditoParc?tabelaCredito.find(r=>r.n===creditoParc):null;

  const toggleForma=id=>{
    const wasChecked = formasChecked.includes(id);
    if(!wasChecked) {
      setFormasChecked([...formasChecked, id]);
    }
    // Sempre abre o painel ao clicar — resolve valor antes de passar ao sp3
    const novoAtivo = formaAtiva === id ? null : id;
    setFormaAtiva(novoAtivo);
  };
  const desmarcarForma=id=>{
    setFormasChecked(formasChecked.filter(x=>x!==id));
    if(formaAtiva===id) setFormaAtiva(null);
  };

  const calcBoleto=()=>{
    const base=(entrada&&entradaValor>0&&saldoTipo==="parcelado")?saldo:valorFinal;
    if(boletoModo==="avista") return{total:base,parcela:base,n:1,juros:0};
    const nLim=parseInt(boletoIsento)||0;
    let total=base;
    if(boletoJuros==="com_juros") total=base*(1+0.012*nBoleto);
    else if(boletoJuros==="combinado"&&nBoleto>nLim) total=base*(1+0.012*(nBoleto-nLim));
    return{total,parcela:total/nBoleto,n:nBoleto,juros:total-base};
  };

  const Chip=({label,ativo,onClick})=>(
    <div onClick={onClick} style={{padding:"5px 14px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(ativo?GOLD_DARK:BORDER),background:ativo?GOLD_PALE:"#fff",color:ativo?GOLD_DARK:"#5C4A2A",fontWeight:ativo?700:400,transition:"all 0.15s"}}>{label}</div>
  );

  // PROPOSTA RENDER
  // modoPreview agora vem via props (modoRel/setModoRel)

  const renderProposta=()=>{
    if(valorFinal<=0||formasChecked.length===0) return(
      <div style={{padding:20,background:"#fff",border:"1px solid "+BORDER,borderRadius:4,fontSize:13,color:"#9A8060",textAlign:"center"}}>
        {valorFinal<=0?"Informe o valor na calculadora.":"Selecione formas de pagamento na calculadora."}
      </div>
    );

    const temPix=formasChecked.includes("pix"),temDin=formasChecked.includes("dinheiro");
    const temBolAv=formasChecked.includes("boleto")&&boletoModo==="avista";
    const temDeb=formasChecked.includes("debito");
    const avGrupo=[temPix,temDin,temBolAv,temDeb].filter(Boolean).length>=2;
    const avIcons=[temPix&&"⚡",temDin&&"💵",temBolAv&&"📄",temDeb&&"💳"].filter(Boolean).join("");
    const avLabel=[temPix&&"PIX",temDin&&"Dinheiro",temBolAv&&"Boleto",temDeb&&"Débito"].filter(Boolean).join(" · ");

    // Verificar se há propostas individuais
    const itensSepP3 = [...(p4State?.itens||[]).filter(it=>it.ativo&&it.proposta),...(p4State?.customProcs||[]).filter(it=>it.ativo&&it.proposta)];
    const temSep = itensSepP3.length > 0;
    const totalAtivosP3 = ((p4State?.itens||[]).filter(i=>i.ativo).length) + ((p4State?.customProcs||[]).filter(i=>i.ativo).length);

    return(
      <div>
        {/* Toggle modo preview */}
        {temSep&&totalAtivosP3>1&&(
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,padding:"10px 14px",background:"#fff",border:"1px solid "+BORDER,borderRadius:4}}>
            <span style={{fontSize:11,color:"#5C4A2A",flex:1,fontWeight:600}}>Modo de apresentação:</span>
            <div style={{display:"flex",gap:6}}>
              {[["soma","Soma tudo"],["separado","Separado"],["ambos","Ambos"]].map(([k,l])=>(
                <div key={k} onClick={()=>setModoRel&&setModoRel(k)} style={{padding:"6px 12px",borderRadius:20,cursor:"pointer",border:"1.5px solid "+(modoRel===k?GOLD_DARK:BORDER),background:modoRel===k?GOLD_PALE:"#fff",fontSize:11,fontWeight:modoRel===k?700:400,color:modoRel===k?GOLD_DARK:"#5C4A2A"}}>{l}</div>
              ))}
            </div>
          </div>
        )}

        {/* Propostas individuais — modo separado */}
        {temSep&&(modoRel==="separado"||modoRel==="ambos"||totalAtivosP3<=1)&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:10}}>Propostas</div>
            {itensSepP3.map((it,idx)=>{
              const proc=(p4State?.procsBase||[]).find(p=>p.id===it.id)||{nome:it.nome||it.id};
              const prop=it.proposta;
              const vb2=parseFloat(String(prop.vb||0).replace(",","."))||0;
              const dp2=prop.ds===-1?(parseFloat(prop.dc)||0):(prop.ds||0);
              const vf2=dp2>0?vb2*(1-dp2/100):vb2;
              // Entrada individual
              const propEntrada=prop.entrada||false;
              const propEntradaTipo=prop.entradaTipo||"pct";
              const propEntradaVal=parseFloat(String(prop.entradaVal||"0").replace(",","."))||0;
              const propBaseEntrada=propEntrada?vb2:vf2;
              const propEntradaValor=propEntrada?(propEntradaTipo==="pct"?propBaseEntrada*propEntradaVal/100:propEntradaVal):0;
              const propSaldo=propEntrada?Math.max(0,propBaseEntrada-propEntradaValor):vf2;
              const propPlano=prop.plano||"hora";
              const propQuem=prop.quemPaga||"comprador";
              const propCi=parseInt(prop.ci||"0");
              const propCp=prop.cp?parseInt(prop.cp):null;
              const creditoBaseInd=(propEntrada&&propEntradaValor>0&&(prop.saldoTipo||"parcelado")==="parcelado")?propSaldo:vb2;
              const tCp=(prop.fc&&prop.fc.includes("credito"))
                ?[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>{const r=calcCreditoPlano(creditoBaseInd,n,propPlano,propQuem);return{n,...r};})
                :[];
              const tCpf=propCp?tCp.filter(r=>r.n===1||r.n<=propCp):tCp;
              const propBp=parseInt(prop.bp||"6");
              const propBj=prop.bj||"sem_juros";
              const propBi=parseInt(prop.bi||"3");
              const bBase2=(propEntrada&&propEntradaValor>0&&(prop.saldoTipo||"parcelado")==="parcelado")?propSaldo:(prop.boletoComDesconto?vf2:vb2);
              const bLs=(prop.fc&&prop.fc.includes("boleto")&&(prop.bm||"avista")==="parcelado")
                ?Array.from({length:propBp},(_,i)=>{const n=i+1,nl=propBj==="sem_juros"?propBp:propBj==="com_juros"?0:propBi;const sj=n<=nl,pc=propBj==="combinado"?Math.max(0,n-nl):sj?0:n;const t=sj?bBase2:bBase2*(1+0.012*pc);return{n,p:t/n,sj,t};})
                :[];
              const nomes={pix:"PIX",dinheiro:"Dinheiro",credito:"Cartão de crédito",boleto:"Boleto parcelado"};
              return(
                <div key={idx} style={{marginBottom:10,border:"1px solid "+BORDER,borderRadius:4,overflow:"hidden",background:"#fff"}}>
                  <div style={{padding:"10px 14px",background:"#F5F2EC",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{proc.nome}</span>
                    <div>
                      {dp2>0?(<><span style={{fontSize:12,color:"#9A8060",textDecoration:"line-through"}}>{fmt(vb2)}</span><span style={{fontSize:10,color:"#9A8060",margin:"0 4px"}}>{dp2}%</span></>):null}<span style={{fontSize:13,fontWeight:700,color:GOLD_DARK}}>{fmt(vf2)}</span>
                    </div>
                  </div>
                  {/* Entrada individual */}
                  {propEntrada&&propEntradaValor>0&&(
                    <div style={{padding:"8px 14px",fontSize:12,color:GOLD_DARK,borderBottom:"1px solid "+BORDER,background:GOLD_PALE}}>
                      <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>Entrada</span><span style={{fontWeight:700}}>{fmt2(propEntradaValor)}{propEntradaTipo==="pct"?" ("+prop.entradaVal+"%)":""}</span></div>
                      <div style={{display:"flex",justifyContent:"space-between",marginTop:2,fontSize:11,color:"#9A8060"}}><span>Valor remanescente</span><span>{fmt2(propSaldo)}</span></div>
                    </div>
                  )}
                  {/* À vista */}
                  {prop.fc&&(prop.fc.includes("pix")||prop.fc.includes("dinheiro"))&&(
                    <div style={{padding:"8px 14px",fontSize:12,color:"#5C4A2A",borderBottom:tCpf.length||bLs.length?"1px solid "+BORDER:"none"}}>
                      {[prop.fc.includes("pix")&&"PIX",prop.fc.includes("dinheiro")&&"Dinheiro"].filter(Boolean).join(" · ")} — {fmt(propEntrada&&propEntradaValor>0?propSaldo:vf2)}
                    </div>
                  )}
                  {/* Crédito */}
                  {tCpf.length>0&&(
                    <div style={{borderBottom:bLs.length?"1px solid "+BORDER:"none"}}>
                      <div style={{padding:"7px 14px 4px",fontSize:11,fontWeight:700,color:"#1C1410"}}>Cartão de crédito{propCi>0&&<span style={{fontWeight:400,color:"#9A8060",marginLeft:4}}>até {propCi}x sem juros</span>}</div>
                      {(()=>{const m=Math.ceil(tCpf.length/2),c1=tCpf.slice(0,m),c2=tCpf.slice(m);const rr=(r,i,last)=>{const sj=r.n>1&&r.n<=propCi,p=sj?vf2/r.n:r.parcela,t=sj?vf2:r.total;return(<div key={r.n} style={{display:"flex",gap:6,padding:"4px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:10,fontWeight:700,color:"#1C1410",minWidth:28}}>{r.n===1?"Àvista":r.n+"x"}</span><span style={{fontSize:10,color:GOLD_DARK,fontWeight:600,flex:1}}>{r.n===1?fmt(vb2):fmt(p)}</span><span style={{fontSize:9,color:sj&&r.n>1?GOLD_DARK:"#9A8060"}}>{r.n===1?"":sj?"s/j":"tot "+fmt(t)}</span></div>);};return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{c1.map((r,i)=>rr(r,i,i===c1.length-1))}</div><div>{c2.map((r,i)=>rr(r,i,i===c2.length-1))}</div></div>);})()}
                    </div>
                  )}
                  {/* Boleto */}
                  {bLs.length>0&&(
                    <div>
                      <div style={{padding:"7px 14px 4px",fontSize:11,fontWeight:700,color:"#1C1410"}}>Boleto parcelado</div>
                      {(()=>{const m=Math.ceil(bLs.length/2),c1=bLs.slice(0,m),c2=bLs.slice(m);const rb=(l,i,last)=>(<div key={l.n} style={{display:"flex",gap:6,padding:"4px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:10,fontWeight:700,color:"#1C1410",minWidth:28}}>{l.n+"x"}</span><span style={{fontSize:10,color:GOLD_DARK,fontWeight:600,flex:1}}>{fmt(l.p)}</span><span style={{fontSize:9,color:l.sj?GOLD_DARK:"#9A8060"}}>{l.sj?"s/j":"tot "+fmt(l.t)}</span></div>);return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{c1.map((l,i)=>rb(l,i,i===c1.length-1))}</div><div>{c2.map((l,i)=>rb(l,i,i===c2.length-1))}</div></div>);})()}
                    </div>
                  )}
                  {prop.obs&&<div style={{padding:"5px 14px 8px",fontSize:10,color:"#9A8060",fontStyle:"italic"}}>{prop.obs}</div>}
                </div>
              );
            })}
          </div>
        )}

      {(modoRel==="soma"||modoRel==="ambos")&&<div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,overflow:"hidden",marginTop:4}}>
        <div style={{padding:"16px 22px",borderBottom:"2px solid "+GOLD,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <svg width="30" height="30" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="14" stroke={GOLD} strokeWidth="1.2" fill="none"/>
              {[0,45,90,135,180,225,270,315].map((a,i)=>{const rad=a*Math.PI/180;const x=20+14*Math.cos(rad);const y=20+14*Math.sin(rad);return(<rect key={i} x={x-2.5} y={y-2.5} width="5" height="5" rx="0.8" fill={GOLD} transform={"rotate("+a+" "+x+" "+y+")"}/>);})}
            </svg>
            <div>
              <div style={{fontFamily:"Georgia,serif",fontSize:15,fontWeight:400,color:GOLD_DARK,letterSpacing:4,textTransform:"uppercase",lineHeight:1}}>Íntegra</div>
              <div style={{fontSize:7,letterSpacing:2,color:GOLD,textTransform:"uppercase",marginTop:2}}>Clínica Odontológica</div>
            </div>
          </div>
          <div style={{textAlign:"right"}}><div style={{fontSize:9,color:GOLD,letterSpacing:1.5,textTransform:"uppercase"}}>Proposta de Investimento</div></div>
        </div>
        <div style={{padding:"18px 22px"}}>
          <div style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:14}}>Formas de pagamento disponíveis</div>
          {entrada && entradaValor>0 && (
            <div style={{padding:"12px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:12}}>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:6}}>Condições de Pagamento</div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:3}}><span style={{color:GOLD_DARK,fontWeight:700}}>Entrada</span><span style={{color:GOLD_DARK,fontWeight:700}}>{fmt2(entradaValor)}{entradaTipo==="pct"?" ("+entradaVal+"%)":""}</span></div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}><span style={{color:"#5C4A2A"}}>{saldoTipo==="entrega"?"Saldo na entrega":"Saldo a parcelar"}</span><span style={{color:"#1C1410",fontWeight:600}}>{fmt2(saldo)}</span></div>
            </div>
          )}
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {avGrupo&&(
              <div style={{display:"flex",alignItems:"stretch",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                <div style={{width:4,background:GOLD,flexShrink:0}}/>
                <div style={{flex:1,padding:"12px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:14}}>{avIcons}</span><span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{avLabel}</span></div>
                  {entrada&&entradaValor>0&&saldoTipo==="parcelado"
                  ?<div style={{fontSize:13,fontWeight:600,color:GOLD_DARK}}>{fmt(saldo)} (saldo após entrada)</div>
                  :descPct>0?(<><div style={{fontSize:12,color:"#9A8060"}}>{fmt(valorBase)} à vista</div><div style={{fontSize:12,fontWeight:700,color:GOLD_DARK}}>Com {descPct}% de desconto: {fmt(valorFinal)}</div></>)
                  :<div style={{fontSize:13,fontWeight:600,color:GOLD_DARK}}>{fmt(valorFinal)} à vista</div>}
                </div>
              </div>
            )}
            {formasChecked.includes("credito")&&(()=>{
              return(
                <div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{borderLeft:"4px solid "+GOLD}}>
                    <div style={{padding:"12px 16px 8px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:8,background:"#fff"}}>
                      <span style={{fontSize:15}}>💳</span><span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>Cartão de crédito</span>
                      {nIsentoCredito>0&&<span style={{fontSize:10,color:GOLD_DARK,background:GOLD_PALE,padding:"2px 8px",borderRadius:10}}>até {nIsentoCredito}x sem juros</span>}
                    </div>
                    {tabelaCredito.map((r,i)=>{
                      const sj=r.n>1&&r.n<=nIsentoCredito,parc=sj?creditoBase/r.n:r.parcela,tot=sj?creditoBase:r.total;
                      return(<div key={r.n} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr",padding:"7px 16px",background:i%2===0?"#fff":CREAM,borderBottom:i<tabelaCredito.length-1?"1px solid "+BORDER:"none"}}>
                        <span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{r.n===1?"À vista":r.n+"x"}</span>
                        <span style={{fontSize:12,color:GOLD_DARK,fontWeight:600}}>{r.n===1?fmt(creditoBase):fmt(parc)}</span>
                        <span style={{fontSize:10,color:sj&&r.n>1?"#4CAF50":r.juros>0&&!sj?"#E57373":"#9A8060"}}>{r.n===1?"—":sj?"sem juros":"total "+fmt(tot)}</span>
                      </div>);
                    })}
                  </div>
                </div>
              );
            })()}
            {FORMAS.filter(f=>formasChecked.includes(f.id)).map(f=>{
              if(f.id==="credito") return null;
              const maisAv=[temPix,temDin,temBolAv,temDeb].filter(Boolean).length>=2;
              if(maisAv&&(f.id==="pix"||f.id==="dinheiro"||f.id==="debito")) return null;
              if(maisAv&&f.id==="boleto"&&boletoModo==="avista") return null;
              if(f.id==="boleto"&&boletoModo==="parcelado"){
                const bBase=(entrada&&entradaValor>0&&saldoTipo==="parcelado")?saldo:valorFinal;
                const nLim=boletoJuros==="sem_juros"?nBoleto:boletoJuros==="com_juros"?0:parseInt(boletoIsento)||0;
                const linhas=Array.from({length:nBoleto},(_,i)=>{
                  const n=i+1,sj=n<=nLim,pc=boletoJuros==="combinado"?Math.max(0,n-nLim):sj?0:n;
                  const tot=sj?bBase:bBase*(1+0.012*pc),parc=n===1?bBase:tot/n;
                  return{n,parc,sj,total:n===1?bBase:tot};
                });
                return(
                  <div key={f.id} style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                    <div style={{borderLeft:"4px solid "+GOLD}}>
                      <div style={{padding:"12px 16px 8px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:8,background:"#fff"}}>
                        <span style={{fontSize:15}}>📄</span><span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>Boleto parcelado</span>
                      </div>
                      {linhas.map((l,i)=>(
                        <div key={l.n} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr",padding:"7px 16px",background:i%2===0?"#fff":CREAM,borderBottom:i<linhas.length-1?"1px solid "+BORDER:"none"}}>
                          <span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{l.n===1?"À vista":l.n+"x"}</span>
                          <div>
                            <div style={{fontSize:12,color:GOLD_DARK,fontWeight:600}}>{fmt(l.n===1?valorBase:l.parc)}</div>
                            {l.n===1&&descPct>0&&<div style={{fontSize:10,color:GOLD_DARK,fontWeight:700}}>Com {descPct}%: {fmt(valorFinal)}</div>}
                          </div>
                          <span style={{fontSize:10,color:l.sj||boletoJuros==="sem_juros"?"#4CAF50":"#9A8060"}}>{l.n===1?"—":l.sj||boletoJuros==="sem_juros"?"sem juros":"total "+fmt(l.total)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              }
              let linha1="",linha2="";
              if(f.id==="dinheiro"||f.id==="pix"||f.id==="debito"){
                linha1=descPct>0?fmt(valorBase)+" à vista":fmt(valorFinal)+" à vista";
                if(descPct>0) linha2="Com "+descPct+"% de desconto: "+fmt(valorFinal);
                if(f.id==="debito") linha2=(descPct>0?"Com "+descPct+"% de desconto: "+fmt(valorFinal)+" · ":"")+"Taxa "+f.taxa+"% PagBank";
              } else if(f.id==="boleto"&&boletoModo==="avista"){
                linha1=descPct>0?fmt(valorBase)+" à vista":fmt(valorFinal)+" à vista";
                if(descPct>0) linha2="Com "+descPct+"% de desconto: "+fmt(valorFinal);
              }
              return(
                <div key={f.id} style={{display:"flex",alignItems:"stretch",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:4,background:GOLD,flexShrink:0}}/>
                  <div style={{flex:1,padding:"12px 16px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}><span style={{fontSize:15}}>{f.icon}</span><span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{f.label}</span></div>
                    {descPct>0&&linha2&&!linha2.includes("Taxa")?(<><div style={{fontSize:12,color:"#9A8060"}}>{linha1}</div><div style={{fontSize:12,fontWeight:700,color:GOLD_DARK}}>{linha2}</div></>)
                    :(<><div style={{fontSize:13,fontWeight:600,color:GOLD_DARK}}>{linha1}</div>{linha2&&<div style={{fontSize:10,color:"#9A8060",marginTop:2}}>{linha2}</div>}</>)}
                  </div>
                </div>
              );
            })}
          </div>
          <div style={{borderTop:"1px solid "+BORDER,marginTop:20,paddingTop:14,fontSize:10,color:"#9A8060",fontStyle:"italic"}}>
            www.odontologiaintegra.com.br · WhatsApp (48) 98404-2890 · (48) 3234-1002
          </div>
        </div>
      </div>}
      </div>
    );
  };

  return(
    <div style={{maxWidth:620,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{display:"flex",gap:8,marginBottom:20}}>
        {[["calc","⚙️ Calculadora"]].map(([t,l])=>(
          <div key={t} onClick={()=>setTab(t)} style={{padding:"7px 16px",borderRadius:20,fontSize:11,cursor:"pointer",background:tab===t?GOLD:"#fff",color:tab===t?"#fff":GOLD_DARK,border:"1.5px solid "+(tab===t?GOLD_DARK:BORDER),fontWeight:tab===t?700:400}}>{l}</div>
        ))}
      </div>
      {p4State && (
        <div style={{fontSize:12,color:PURPLE,marginBottom:14,padding:"14px 18px",background:"#F3EDF6",border:"1.5px solid "+PURPLE_LIGHT,borderRadius:10,lineHeight:1.7}}>
          <div style={{fontWeight:700,marginBottom:4,fontSize:13}}>ℹ️ Orçamento Geral</div>
          Esta calculadora configura o orçamento que soma todos os procedimentos selecionados. Para criar orçamentos individuais por procedimento, acesse a aba <strong>Plano de Tratamento</strong> e clique em <strong>"Formas de pagamento"</strong> no procedimento desejado.
        </div>
      )}
      {tab==="calc"&&<>
        <Card>
          <SectionTitle>Valor do Tratamento</SectionTitle>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:18,color:GOLD_DARK,fontWeight:700}}>R$</span>
            <input style={{...inp,fontSize:24,fontWeight:700,color:GOLD_DARK,border:"none",borderBottom:"2px solid "+GOLD,borderRadius:0,padding:"2px 0",width:"100%"}} value={valorBruto} onChange={e=>setValorBruto(e.target.value.replace(/[^0-9,.]/g,""))} placeholder="0,00"/>
          </div>
          {valorBase>0&&<div style={{fontSize:11,color:"#9A8060",marginTop:6}}>{fmt(valorBase)}</div>}
        </Card>
        <Card>
          <SectionTitle>Desconto à Vista</SectionTitle>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {DESCONTOS.map(d=><Chip key={d.value} label={d.label} ativo={descSel===d.value} onClick={()=>setDescSel(d.value)}/>)}
          </div>
          {descSel===-1&&<div style={{display:"flex",alignItems:"center",gap:8,marginTop:10}}><input style={{...inp,width:70,textAlign:"center"}} value={descCustom} onChange={e=>setDescCustom(e.target.value.replace(/[^0-9.]/g,""))} placeholder="0"/><span style={{fontSize:13,color:"#5C4A2A"}}>%</span></div>}
          {descPct>0&&valorBase>0&&<div style={{marginTop:12,padding:"10px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,display:"flex",justifyContent:"space-between"}}><span style={{fontSize:11,color:GOLD_DARK}}>Economia de {fmt(descVal)}</span><span style={{fontSize:15,fontWeight:700,color:GOLD_DARK}}>{fmt(valorFinal)}</span></div>}
        </Card>
        {/* Entrada */}
      <Card>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:entrada?14:0}}>
          <SectionTitle>Entrada</SectionTitle>
          <div onClick={()=>setEntrada(!entrada)} style={{
            width:44,height:24,borderRadius:12,cursor:"pointer",
            background:entrada?GOLD:"#D0C8B8",position:"relative",transition:"all 0.2s",flexShrink:0,marginLeft:10,marginBottom:14,
          }}>
            <div style={{position:"absolute",top:2,left:entrada?20:2,width:20,height:20,borderRadius:"50%",background:"#fff",transition:"all 0.2s"}}/>
          </div>
        </div>
        {entrada && <>
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            {[["pct","Percentual (%)"],["fixo","Valor fixo"]].map(([t,l])=>(
              <div key={t} onClick={()=>setEntradaTipo(t)} style={{padding:"6px 14px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(entradaTipo===t?GOLD_DARK:BORDER),background:entradaTipo===t?GOLD_PALE:"#fff",color:entradaTipo===t?GOLD_DARK:"#5C4A2A",fontWeight:entradaTipo===t?700:400}}>{l}</div>
            ))}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}>
            <span style={{fontSize:13,color:GOLD_DARK,fontWeight:600}}>{entradaTipo==="pct"?"%" :"R$"}</span>
            <input style={{...inp,width:100,fontSize:16,fontWeight:700,color:GOLD_DARK}} value={entradaVal} onChange={e=>setEntradaVal(e.target.value.replace(/[^0-9,.]/g,""))} placeholder={entradaTipo==="pct"?"30":"0,00"}/>
            {entradaTipo==="pct" && valorFinal>0 && <span style={{fontSize:12,color:"#9A8060"}}>= {fmt(entradaValor)}</span>}
          </div>
          {valorFinal>0 && entradaValor>0 && (
            <div style={{padding:"10px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                <span style={{color:GOLD_DARK,fontWeight:600}}>Entrada</span>
                <span style={{color:GOLD_DARK,fontWeight:700}}>{fmt(entradaValor)}</span>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginTop:4}}>
                <span style={{color:"#5C4A2A"}}>Saldo restante</span>
                <span style={{color:"#1C1410",fontWeight:600}}>{fmt(saldo)}</span>
              </div>
            </div>
          )}
          <div style={{marginBottom:4}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Saldo pago</div>
            <div style={{display:"flex",gap:6}}>
              {[["parcelado","Parcelado"],["entrega","Na entrega"]].map(([t,l])=>(
                <div key={t} onClick={()=>setSaldoTipo(t)} style={{padding:"6px 14px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(saldoTipo===t?GOLD_DARK:BORDER),background:saldoTipo===t?GOLD_PALE:"#fff",color:saldoTipo===t?GOLD_DARK:"#5C4A2A",fontWeight:saldoTipo===t?700:400}}>{l}</div>
              ))}
            </div>
            {saldoTipo==="entrega" && saldo>0 && (
              <div style={{marginTop:10,padding:"10px 14px",background:"#3D1F4E",borderRadius:3}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:6}}>Resumo</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:"rgba(255,255,255,0.7)"}}>
                  <span>Entrada</span><span>{fmt(entradaValor)}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:GOLD_LIGHT,fontWeight:700,marginTop:4,paddingTop:4,borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                  <span>Na entrega do trabalho</span><span>{fmt(saldo)}</span>
                </div>
              </div>
            )}
          </div>
        </>}
      </Card>

      <Card>
          <SectionTitle>Formas de Pagamento</SectionTitle>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {FORMAS.map(f=>{
              const checked=formasChecked.includes(f.id),ativo=formaAtiva===f.id;
              return(<div key={f.id} style={{padding:"12px 16px",borderRadius:3,border:"1.5px solid "+(ativo?GOLD_DARK:checked?GOLD_LIGHT:BORDER),background:ativo?GOLD_PALE:checked?"#FFFDF7":"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}>
                <div onClick={()=>toggleForma(f.id)} style={{display:"flex",alignItems:"center",gap:10,flex:1,cursor:"pointer"}}>
                  <span style={{fontSize:18}}>{f.icon}</span>
                  <span style={{fontSize:13,fontWeight:checked?700:500,color:checked?GOLD_DARK:"#1C1410"}}>{f.label}</span>
                  {f.id==="debito"&&<span style={{fontSize:10,color:"#9A8060"}}>taxa {f.taxa}% PagBank</span>}
                  {f.id==="credito"&&<span style={{fontSize:10,color:"#9A8060"}}>4,99% + juros 3,49% a.m.</span>}
                </div>
                {checked
                  ?<div style={{display:"flex",alignItems:"center",gap:8}}><span style={{color:GOLD_DARK,fontWeight:700}}>✓</span><div onClick={e=>{e.stopPropagation();desmarcarForma(f.id);}} style={{fontSize:10,color:"#9A8060",cursor:"pointer",padding:"2px 6px",border:"1px solid "+BORDER,borderRadius:10}}>✕</div></div>
                  :<span style={{fontSize:10,color:"#9A8060"}}>selecionar</span>}
              </div>);
            })}
          </div>
          {formaAtiva==="boleto"&&(
            <div style={{marginTop:14,padding:"14px 16px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                {[["avista","À vista"],["parcelado","Parcelado"]].map(([m,l])=>(
                  <div key={m} onClick={()=>setBoletoModo(m)} style={{padding:"6px 16px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(boletoModo===m?GOLD_DARK:BORDER),background:boletoModo===m?GOLD_PALE:"#fff",color:boletoModo===m?GOLD_DARK:"#5C4A2A",fontWeight:boletoModo===m?700:400}}>{l}</div>
                ))}
              </div>
              {boletoModo==="avista"&&valorFinal>0&&(
                <div style={{background:"#3D1F4E",borderRadius:3,padding:"14px 16px"}}>
                  <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:8}}>Resumo</div>
                  <div style={{fontFamily:"Georgia",fontSize:26,fontWeight:700,color:"#fff"}}>{fmt(valorFinal)}</div>
                  <div style={{fontSize:11,color:GOLD_LIGHT,marginTop:8}}>✦ Sem taxas · 100% para a clínica</div>
                </div>
              )}
              {boletoModo==="parcelado"&&<>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Parcelas</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:10}}>
                  {[2,3,4,5,6,8,10,12,15,18,24].map(n=>(
                    <div key={n} onClick={()=>setBoletoParc(String(n))} style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(nBoleto===n?GOLD_DARK:BORDER),background:nBoleto===n?GOLD:"#fff",color:nBoleto===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer"}}>{n}</div>
                  ))}
                  <input style={{...inp,width:50,textAlign:"center",padding:"4px 8px"}} value={boletoParc} onChange={e=>setBoletoParc(e.target.value.replace(/[^0-9]/g,""))}/>
                </div>
                <div style={{marginBottom:10}}>
                  <div style={{fontSize:9,color:"#9A8060",marginBottom:4}}>Mostrar apenas parcelas específicas (separar por vírgula, vazio = todas)</div>
                  <input style={{...inp,width:"100%",padding:"6px 10px",fontSize:11}} defaultValue={bpSel||""} onChange={e=>{const v=e.target.value.replace(/[^0-9,]/g,"");setBpSel(v);}} onBlur={e=>setBpSel(e.target.value.replace(/[^0-9,]/g,""))} placeholder="Ex: 6,12,18"/>
                </div>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Modalidade</div>
                <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
                  {[["sem_juros","Sem juros"],["com_juros","Com juros 1,2% a.m."],["combinado","Combinado"]].map(([m,l])=>(
                    <div key={m} onClick={()=>setBoletoJuros(m)} style={{padding:"6px 14px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(boletoJuros===m?GOLD_DARK:BORDER),background:boletoJuros===m?GOLD_PALE:"#fff",color:boletoJuros===m?GOLD_DARK:"#5C4A2A",fontWeight:boletoJuros===m?700:400}}>{l}</div>
                  ))}
                </div>
                {boletoJuros==="combinado"&&(
                  <div style={{padding:"10px 12px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,marginBottom:12}}>
                    <div style={{fontSize:11,color:"#5C4A2A",marginBottom:8}}>Até quantas parcelas sem juros?</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>(
                        <div key={n} onClick={()=>setBoletoIsento(String(n))} style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(parseInt(boletoIsento)===n?GOLD_DARK:BORDER),background:parseInt(boletoIsento)===n?GOLD:"#fff",color:parseInt(boletoIsento)===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer"}}>{n}</div>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"#9A8060",marginTop:6}}>Até {bole
