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
  if(!p2r) return {achadosDente:{},achadoAtivo:null,segAtivo:null,arcadaAtiva:null,obsTexto:"",obsCorrigido:"",achados:null,obsAchados:{}};
  if(!p2r.achadosDente) p2r.achadosDente={};
  if(!p2r.obsAchados) p2r.obsAchados={};
  if(!p2r.achados) p2r.achados=null;
  if(!p2r.obsTexto) p2r.obsTexto="";
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
            setP3(prev=>({...prev,...p3r}));
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

function P1({data, setData, onNovoPaciente, onImportarFormulario}) {
  const {nome,cpf,telefone,dataNasc,idade,isMinor,respNome,respCpf,dataConsulta,responsavel} = data;

  const [equipe, setEquipe] = React.useState(EQUIPE);
  const [gerenciandoEquipe, setGerenciandoEquipe] = React.useState(false);
  const [novoMembro, setNovoMembro] = React.useState({nome:"", area:""});
  const [adicionandoMembro, setAdicionandoMembro] = React.useState(false);
  const [showEnviarForm, setShowEnviarForm] = React.useState(false);
  const [showFormRecebidos, setShowFormRecebidos] = React.useState(false);
  const [linkCopiado, setLinkCopiado] = React.useState(false);
  const [formLinkId, setFormLinkId] = React.useState("f"+Date.now().toString(36));

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
            <div onClick={()=>{if(!showEnviarForm)setFormLinkId("f"+Date.now().toString(36));setShowEnviarForm(true);}} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 14px",background:showEnviarForm?"#25D366":"#fff",border:"1px solid "+(showEnviarForm?"#25D366":BORDER),borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:showEnviarForm?"#fff":"#25D366"}}>
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
                <div onClick={()=>setFormLinkId("f"+Date.now().toString(36))} style={{fontSize:10,color:"#2E7D32",cursor:"pointer",padding:"3px 8px",border:"1px solid #4CAF50",borderRadius:20}}>+ Novo link</div>
                <div onClick={()=>setShowEnviarForm(false)} style={{fontSize:10,color:"#9A8060",cursor:"pointer",padding:"3px 8px",border:"1px solid "+BORDER,borderRadius:20}}>✕</div>
              </div>
            </div>
            <div style={{fontSize:11,color:"#5C4A2A",marginBottom:10,lineHeight:1.5}}>O paciente preenche os dados pelo celular e eles aparecem automaticamente aqui.</div>
            {(()=>{
              const link = (typeof window!=="undefined"?window.location.origin:"")+"/f/"+formLinkId;
              const msg = "Olá! Segue o link para preencher seu cadastro na Íntegra Clínica Odontológica:\n"+link;
              const waLink = "https://wa.me/?text="+encodeURIComponent(msg);
              return(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  <div style={{padding:"10px 12px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,fontSize:11,wordBreak:"break-all",color:GOLD_DARK,fontWeight:500}}>{link}</div>
                  <div style={{display:"flex",gap:8}}>
                    <div onClick={()=>{navigator.clipboard.writeText(link);setLinkCopiado(true);setTimeout(()=>setLinkCopiado(false),2000);}} style={{flex:1,padding:"10px",background:linkCopiado?"#4CAF50":"#fff",border:"1px solid "+(linkCopiado?"#4CAF50":BORDER),borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:linkCopiado?"#fff":"#5C4A2A",textAlign:"center"}}>
                      {linkCopiado?"✓ Copiado!":"📋 Copiar link"}
                    </div>
                    <a href={waLink} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:"10px",background:"#25D366",borderRadius:4,fontSize:11,fontWeight:700,color:"#fff",textAlign:"center",textDecoration:"none",display:"block"}}>
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
  const {achadosDente={}, achadoAtivo=null, segAtivo=null, arcadaAtiva=null, obsTexto="", obsCorrigido=""} = data;
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

function P3({vb:valorBruto,setVb:setValorBruto,ds:descSel,setDs:setDescSel,dc:descCustom,setDc:setDescCustom,fc:formasChecked,setFc:setFormasChecked,fa:formaAtiva,setFa:setFormaAtiva,bm:boletoModo,setBm:setBoletoModo,bp:boletoParc,setBp:setBoletoParc,bj:boletoJuros,setBj:setBoletoJuros,bi:boletoIsento,setBi:setBoletoIsento,ci:creditoIsento,setCi:setCreditoIsento,cp:creditoParc,setCp:setCreditoParc,tb:tab,setTb:setTab,entrada,setEntrada,entradaTipo,setEntradaTipo,entradaVal,setEntradaVal,saldoTipo,setSaldoTipo,ct=true,setCt,bt=true,setBt,planoExterno,setPlanoExterno,p3QuemPaga,setP3QuemPaga,boletoComDesconto=false,setBoletoComDesconto,p4State=null,modoRel="soma",setModoRel}) {
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

    return(
      <div>
        {/* Toggle modo preview */}
        {temSep&&(
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
        {temSep&&(modoRel==="separado"||modoRel==="ambos")&&(
          <div style={{marginBottom:12}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:10}}>Propostas Individuais</div>
            {itensSepP3.map((it,idx)=>{
              const proc=(p4State?.procsBase||[]).find(p=>p.id===it.id)||{nome:it.nome||it.id};
              const prop=it.proposta;
              const vb2=parseFloat(String(prop.vb||0).replace(",","."))||0;
              const dp2=prop.ds||0;
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
              const bBase2=prop.boletoComDesconto?vf2:vb2;
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
                      {[1,2,3,4,5,6].map(n=>(
                        <div key={n} onClick={()=>setBoletoIsento(String(n))} style={{width:32,height:32,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(parseInt(boletoIsento)===n?GOLD_DARK:BORDER),background:parseInt(boletoIsento)===n?GOLD:"#fff",color:parseInt(boletoIsento)===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer"}}>{n}</div>
                      ))}
                    </div>
                    <div style={{fontSize:10,color:"#9A8060",marginTop:6}}>Até {boletoIsento}x sem juros · demais com 1,2% a.m.</div>
                  </div>
                )}
                {/* Toggle aplicar desconto no boleto */}
                {descPct>0&&(
                  <div style={{marginTop:8,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
                    <span style={{fontSize:11,color:"#5C4A2A"}}>Aplicar desconto ({descPct}%) no boleto</span>
                    <div onClick={()=>setBoletoComDesconto&&setBoletoComDesconto(!boletoComDesconto)} style={{width:36,height:20,borderRadius:10,background:boletoComDesconto?GOLD:"#ccc",cursor:"pointer",position:"relative",transition:"all 0.2s"}}>
                      <div style={{position:"absolute",top:2,left:boletoComDesconto?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"all 0.2s"}}/>
                    </div>
                  </div>
                )}
                {/* Toggle ocultar total boleto */}
                <div style={{marginTop:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
                  <span style={{fontSize:11,color:"#5C4A2A"}}>Mostrar total no relatório</span>
                  <div onClick={()=>setBt&&setBt(!bt)} style={{width:36,height:20,borderRadius:10,background:bt?GOLD:"#ccc",cursor:"pointer",position:"relative",transition:"all 0.2s"}}>
                    <div style={{position:"absolute",top:2,left:bt?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"all 0.2s"}}/>
                  </div>
                </div>
                {valorFinal>0&&nBoleto>0&&(()=>{
                  const b=calcBoleto();
                  const desc=boletoJuros==="sem_juros"?"Sem juros":boletoJuros==="com_juros"?"Juros 1,2% a.m.":"Primeiras "+boletoIsento+"x sem juros";
                  return(<div style={{background:"#3D1F4E",borderRadius:3,padding:"14px 16px"}}>
                    <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:8}}>Resumo</div>
                    <div style={{display:"flex",alignItems:"baseline",gap:8,marginBottom:6}}><span style={{fontFamily:"Georgia",fontSize:26,fontWeight:700,color:"#fff"}}>{nBoleto}x</span><span style={{fontFamily:"Georgia",fontSize:18,fontWeight:700,color:GOLD_LIGHT}}>{fmt(b.parcela)}</span></div>
                    <div style={{fontSize:10,color:GOLD_LIGHT,opacity:0.8,marginBottom:10}}>{desc}</div>
                    {[b.juros>0&&["Juros paciente","+"+fmt(b.juros)],["Total paciente",fmt(b.total)],["Líquido clínica",fmt(valorFinal)]].filter(Boolean).map(([l,v],i,arr)=>(
                      <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:i===arr.length-1?GOLD_LIGHT:"rgba(255,255,255,0.7)",fontWeight:i===arr.length-1?700:400,paddingTop:i===arr.length-1?8:0,borderTop:i===arr.length-1?"1px solid rgba(255,255,255,0.15)":undefined}}><span>{l}</span><span>{v}</span></div>
                    ))}
                  </div>);
                })()}
              </>}
            </div>
          )}
          {formaAtiva==="credito"&&valorBase>0&&(
            <div style={{marginTop:14,padding:"14px 16px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
              {descPct>0&&<div style={{marginBottom:12,padding:"8px 12px",background:"#FFF8DC",border:"1px solid #FFD700",borderRadius:3,fontSize:11,color:"#7A6020"}}>⚠️ Desconto não se aplica ao crédito — valor: {fmt(valorBase)}</div>}

              {/* Modo cobrar / receber */}
              <div style={{display:"flex",marginBottom:14,border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                {[["cobrar","Quanto vou cobrar"],["receber","Quanto quero receber"]].map(([m,l])=>(
                  <div key={m} onClick={()=>{setModoCred(m);setValorCobrarInput("");}} style={{flex:1,padding:"10px",textAlign:"center",fontSize:11,fontWeight:700,cursor:"pointer",background:modoCred===m?GOLD_DARK:"#fff",color:modoCred===m?"#fff":"#9A8060",transition:"all 0.15s"}}>
                    {l}
                  </div>
                ))}
              </div>

              {/* Input valor (no modo receber) */}
              {modoCred==="receber"&&(
                <div style={{marginBottom:14}}>
                  <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:6}}>Valor líquido que precisa receber</div>
                  <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 12px",background:"#fff",border:"1px solid "+GOLD,borderRadius:3}}>
                    <span style={{fontSize:14,color:GOLD_DARK,fontWeight:700}}>R$</span>
                    <input style={{flex:1,fontSize:18,fontWeight:700,color:GOLD_DARK,border:"none",outline:"none",background:"transparent",fontFamily:"inherit"}} value={valorCobrarInput} onChange={e=>setValorCobrarInput(e.target.value.replace(/[^0-9,]/g,""))} placeholder="0,00"/>
                  </div>
                  {valorCobrarInput&&tabelaCredito[0]&&<div style={{fontSize:10,color:"#9A8060",marginTop:4}}>Para receber {fmt(baseCredInput)}, você cobrará {fmt(tabelaCredito[0].cobrado||tabelaCredito[0].total)} à vista</div>}
                </div>
              )}

              {/* Plano PagBank */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Plano PagBank</div>
                <div style={{display:"flex",gap:6,marginBottom:8}}>
                  {Object.entries(PLANOS_PAGSEGURO).map(([key,p])=>(
                    <div key={key} onClick={()=>setPlano(key)} style={{flex:1,padding:"10px 12px",borderRadius:3,cursor:"pointer",border:"2px solid "+(plano===key?GOLD_DARK:BORDER),background:plano===key?GOLD_PALE:"#fff"}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:plano===key?GOLD:"#ccc",flexShrink:0}}/>
                        <span style={{fontSize:11,fontWeight:700,color:plano===key?GOLD_DARK:"#5C4A2A"}}>{p.label}</span>
                        {key==="dias14"&&<span style={{fontSize:7,background:GOLD,color:"#fff",padding:"1px 5px",borderRadius:8,fontWeight:700}}>ATUAL</span>}
                      </div>
                      <div style={{fontSize:9,color:"#9A8060",paddingLeft:14}}>{p.jurosMes}% a.m. · taxa {p.taxaInt}%</div>
                    </div>
                  ))}
                </div>
                <VerificadorTaxas plano={plano}/>
              </div>

              {/* Quem paga os juros */}
              <div style={{marginBottom:14}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Juros pagos por</div>
                <div style={{display:"flex",gap:6}}>
                  {[["comprador","Paciente","Cliente paga os juros — você recebe o mesmo em todas as parcelas"],["vendedor","Clínica","Você absorve os juros — cliente paga valor fixo"]].map(([k,label,desc])=>(
                    <div key={k} onClick={()=>setQuemPaga(k)} style={{flex:1,padding:"10px 12px",borderRadius:3,cursor:"pointer",border:"2px solid "+(quemPaga===k?GOLD_DARK:BORDER),background:quemPaga===k?GOLD_PALE:"#fff"}}>
                      <div style={{fontSize:12,fontWeight:700,color:quemPaga===k?GOLD_DARK:"#5C4A2A",marginBottom:3}}>{label}</div>
                      <div style={{fontSize:9,color:"#9A8060",lineHeight:1.4}}>{desc}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Parcelas sem juros */}
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Parcelas sem juros para o paciente</div>
              <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:14}}>
                <span style={{fontSize:11,color:"#5C4A2A"}}>Até</span>
                <div style={{display:"flex",gap:5}}>
                  {[1,2,3,4,5,6].map(n=>(
                    <div key={n} onClick={()=>setCreditoIsento(String(n))} style={{width:30,height:30,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(nIsentoCredito===n?GOLD_DARK:BORDER),background:nIsentoCredito===n?GOLD:"#fff",color:nIsentoCredito===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer"}}>{n}</div>
                  ))}
                  <div onClick={()=>setCreditoIsento("0")} style={{padding:"0 10px",height:30,borderRadius:20,display:"flex",alignItems:"center",border:"1.5px solid "+(nIsentoCredito===0?GOLD_DARK:BORDER),background:nIsentoCredito===0?GOLD:"#fff",color:nIsentoCredito===0?"#fff":"#5C4A2A",fontSize:10,cursor:"pointer"}}>Nenhuma</div>
                </div>
              </div>

              {/* Tabela */}
              <div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                <div style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr",background:"#3D1F4E",padding:"8px 14px"}}>
                  {["Parc.","Valor/parc.",quemPaga==="comprador"?"Total paciente":"Parcela fixa","Líquido clínica"].map(h=><div key={h} style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_LIGHT,fontWeight:600}}>{h}</div>)}
                </div>
                {tabelaCredito.map((r,i)=>{
                  const s=creditoParc===r.n;
                  const sj=r.n>1&&r.n<=nIsentoCredito;
                  const parc=sj?baseCredInput/r.n:r.parcela;
                  const tot=sj?baseCredInput:r.total;
                  return(<div key={r.n} onClick={()=>setCreditoParc(s?null:r.n)} style={{display:"grid",gridTemplateColumns:"50px 1fr 1fr 1fr",padding:"8px 14px",cursor:"pointer",background:s?GOLD_PALE:i%2===0?"#fff":CREAM,borderLeft:"3px solid "+(s?GOLD_DARK:"transparent"),borderBottom:i<tabelaCredito.length-1?"1px solid "+BORDER:"none"}}>
                    <span style={{fontSize:11,fontWeight:s?700:600,color:s?GOLD_DARK:"#1C1410"}}>{r.n===1?"Àvista":r.n+"x"}</span>
                    <span style={{fontSize:11,color:GOLD_DARK,fontWeight:s?700:500}}>{r.n===1?fmt(r.totalCliente||baseCredInput):fmt(parc)}</span>
                    <span style={{fontSize:10,color:sj&&r.n>1?GOLD_DARK:r.juros>0&&!sj?"#9A8060":"#9A8060"}}>{r.n===1?fmt(r.totalCliente||baseCredInput):sj?"sem juros":fmt(tot)}</span>
                    <span style={{fontSize:11,color:GOLD_DARK}}>{fmt(r.liquido)}</span>
                  </div>);
                })}
              </div>

              {/* Toggle mostrar total relatório */}
              <div style={{marginTop:10,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
                <span style={{fontSize:11,color:"#5C4A2A"}}>Mostrar total no relatório</span>
                <div onClick={()=>setCt(!ct)} style={{width:36,height:20,borderRadius:10,background:ct?GOLD:"#ccc",cursor:"pointer",position:"relative",transition:"all 0.2s"}}>
                  <div style={{position:"absolute",top:2,left:ct?16:2,width:16,height:16,borderRadius:"50%",background:"#fff",transition:"all 0.2s"}}/>
                </div>
              </div>
            </div>
          )}
          {formaAtiva&&!["boleto","credito"].includes(formaAtiva)&&valorFinal>0&&(
            <div style={{marginTop:14,background:"#3D1F4E",borderRadius:3,padding:"14px 16px"}}>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:8}}>Resumo</div>
              <div style={{fontFamily:"Georgia",fontSize:26,fontWeight:700,color:"#fff",marginBottom:10}}>{fmt(valorFinal)}</div>
              {FORMAS.find(f=>f.id===formaAtiva)?.taxa>0
                ?[["Taxa "+(FORMAS.find(f=>f.id===formaAtiva)?.label)+" ("+FORMAS.find(f=>f.id===formaAtiva)?.taxa+"%)", "−"+fmt(valorFinal*FORMAS.find(f=>f.id===formaAtiva).taxa/100)],["Líquido clínica",fmt(valorFinal*(1-FORMAS.find(f=>f.id===formaAtiva).taxa/100))]].map(([l,v],i)=>(
                  <div key={i} style={{display:"flex",justifyContent:"space-between",fontSize:11,color:i===1?GOLD_LIGHT:"rgba(255,255,255,0.7)",fontWeight:i===1?700:400,paddingTop:i===1?8:0,borderTop:i===1?"1px solid rgba(255,255,255,0.15)":undefined}}><span>{l}</span><span>{v}</span></div>
                ))
                :<div style={{fontSize:11,color:GOLD_LIGHT}}>✦ Sem taxas · 100% para a clínica</div>
              }
            </div>
          )}
        </Card>

        {/* Painel de resumo — propostas individuais */}
        {(()=>{
          const itensSepCalc = [...(p4State?.itens||[]).filter(it=>it.ativo&&it.proposta),...(p4State?.customProcs||[]).filter(it=>it.ativo&&it.proposta)];
          if(!itensSepCalc.length) return null;
          return(
            <Card>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <SectionTitle style={{margin:0}}>Propostas Individuais ({itensSepCalc.length})</SectionTitle>
                <div style={{display:"flex",gap:4}}>
                  {[["soma","Soma tudo"],["separado","Separado"],["ambos","Ambos"]].map(([k,l])=>(
                    <div key={k} onClick={()=>setModoRel&&setModoRel(k)} style={{padding:"5px 10px",borderRadius:20,cursor:"pointer",border:"1.5px solid "+(modoRel===k?GOLD_DARK:BORDER),background:modoRel===k?GOLD_PALE:"#fff",fontSize:10,fontWeight:modoRel===k?700:400,color:modoRel===k?GOLD_DARK:"#5C4A2A"}}>{l}</div>
                  ))}
                </div>
              </div>
              {(modoRel==="separado"||modoRel==="ambos")?(
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {itensSepCalc.map((it,idx)=>{
                    const proc=(p4State?.procsBase||[]).find(p=>p.id===it.id)||{nome:it.nome||it.id};
                    const prop=it.proposta;
                    const vb2=parseFloat(String(prop.vb||0).replace(",","."))||0;
                    const dp2=prop.ds||0;
                    const vf2=dp2>0?vb2*(1-dp2/100):vb2;
                    const propPlano=prop.plano||"hora";
                    const propQuem=prop.quemPaga||"comprador";
                    const propCi=parseInt(prop.ci||"0");
                    const propCp=prop.cp?parseInt(prop.cp):null;
                    const tCp2=(prop.fc&&prop.fc.includes("credito"))
                      ?[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>{const r=calcCreditoPlano(vb2,n,propPlano,propQuem);return{n,...r};})
                      :[];
                    const tCpf2=propCp?tCp2.filter(r=>r.n===1||r.n<=propCp):tCp2;
                    const propBp=parseInt(prop.bp||"6");
                    const propBj=prop.bj||"sem_juros";
                    const propBi2=parseInt(prop.bi||"3");
                    const bBaseC=prop.boletoComDesconto?vf2:vb2;
                    const bLs2=(prop.fc&&prop.fc.includes("boleto")&&(prop.bm||"avista")==="parcelado")
                      ?Array.from({length:propBp},(_,i)=>{const n=i+1,nl=propBj==="sem_juros"?propBp:propBj==="com_juros"?0:propBi2;const sj=n<=nl,pc=propBj==="combinado"?Math.max(0,n-nl):sj?0:n;const t=sj?bBaseC:bBaseC*(1+0.012*pc);return{n,p:t/n,sj,t};})
                      :[];
                    const formasList=[prop.fc&&prop.fc.includes("pix")&&"PIX",prop.fc&&prop.fc.includes("dinheiro")&&"Dinheiro",prop.fc&&prop.fc.includes("credito")&&"Cartão",prop.fc&&prop.fc.includes("boleto")&&"Boleto"].filter(Boolean).join(" · ");
                    return(
                      <div key={idx} style={{border:"1px solid "+BORDER,borderRadius:4,overflow:"hidden",background:"#fff"}}>
                        <div style={{padding:"8px 14px",background:"#F5F2EC",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                          <div>
                            <div style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{proc.nome}</div>
                            <div style={{fontSize:10,color:"#9A8060",marginTop:1}}>{formasList}</div>
                          </div>
                          <div style={{textAlign:"right"}}>
                            <div style={{display:"flex",alignItems:"center",gap:4}}>{dp2>0&&<><span style={{fontSize:11,color:"#9A8060",textDecoration:"line-through"}}>{fmt(vb2)}</span><span style={{fontSize:9,color:"#9A8060"}}>{dp2}%</span></>}<span style={{fontSize:13,fontWeight:700,color:GOLD_DARK}}>{fmt(vf2)}</span></div>
                            {dp2>0&&<div style={{fontSize:9,color:"#9A8060"}}>{dp2}% desc.</div>}
                          </div>
                        </div>
                        {/* Crédito resumo */}
                        {tCpf2.length>0&&(
                          <div style={{borderBottom:bLs2.length?"1px solid "+BORDER:"none"}}>
                            <div style={{padding:"6px 14px 3px",fontSize:10,fontWeight:700,color:"#1C1410"}}>Cartão de crédito{propCi>0&&<span style={{fontWeight:400,color:"#9A8060",marginLeft:4}}>até {propCi}x s/j</span>}</div>
                            {(()=>{const m=Math.ceil(tCpf2.length/2),c1=tCpf2.slice(0,m),c2=tCpf2.slice(m);const rr=(r,i,last)=>{const sj=r.n>1&&r.n<=propCi,p=sj?vf2/r.n:r.parcela,t=sj?vf2:r.total;return(<div key={r.n} style={{display:"flex",gap:6,padding:"3px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:10,fontWeight:700,color:"#1C1410",minWidth:28}}>{r.n===1?"À vista":r.n+"x"}</span><span style={{fontSize:10,color:GOLD_DARK,fontWeight:600,flex:1}}>{r.n===1?fmt(vb2):fmt(p)}</span><span style={{fontSize:9,color:sj&&r.n>1?GOLD_DARK:"#9A8060"}}>{r.n===1?"":sj?"s/j":"tot "+fmt(t)}</span></div>);};return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{c1.map((r,i)=>rr(r,i,i===c1.length-1))}</div><div>{c2.map((r,i)=>rr(r,i,i===c2.length-1))}</div></div>);})()}
                          </div>
                        )}
                        {/* Boleto resumo */}
                        {bLs2.length>0&&(
                          <div>
                            <div style={{padding:"6px 14px 3px",fontSize:10,fontWeight:700,color:"#1C1410"}}>Boleto parcelado</div>
                            {(()=>{const m=Math.ceil(bLs2.length/2),c1=bLs2.slice(0,m),c2=bLs2.slice(m);const rb=(l,i,last)=>(<div key={l.n} style={{display:"flex",gap:6,padding:"3px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:10,fontWeight:700,color:"#1C1410",minWidth:28}}>{l.n+"x"}</span><span style={{fontSize:10,color:GOLD_DARK,fontWeight:600,flex:1}}>{fmt(l.p)}</span><span style={{fontSize:9,color:l.sj?GOLD_DARK:"#9A8060"}}>{l.sj?"s/j":"tot "+fmt(l.t)}</span></div>);return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{c1.map((l,i)=>rb(l,i,i===c1.length-1))}</div><div>{c2.map((l,i)=>rb(l,i,i===c2.length-1))}</div></div>);})()}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div style={{fontSize:10,color:"#9A8060",textAlign:"center",marginTop:4}}>Propostas configuradas no Plano · Edite clicando em "✓ Proposta própria" no procedimento</div>
                </div>
              ):(
                <div style={{padding:12,background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,textAlign:"center"}}>
                  <div style={{fontSize:11,color:GOLD_DARK,fontWeight:600}}>{itensSepCalc.length} procedimento(s) com proposta individual</div>
                  <div style={{fontSize:10,color:"#9A8060",marginTop:4}}>No modo "Soma tudo", a calculadora acima se aplica ao total. Troque para "Separado" para ver cada proposta.</div>
                </div>
              )}
            </Card>
          );
        })()}

      </>}

    </div>
  );
}

// ─── MÓDULO DE ARQUIVO DE RELATÓRIOS ─────────────────────────────────────────

const STORAGE_KEY = "integra_relatorios_v1";

function verificarDuplicata(p1) {
  const relatorios = carregarRelatorios();
  // Verificar se existe atendimento com mesmo paciente e mesma data de consulta
  return relatorios.find(r =>
    r.paciente === (p1.nome||"Sem nome") &&
    r.dataConsulta === (p1.dataConsulta||"")
  ) || null;
}

function salvarRelatorio(p1, p2, p3, p4State, sobrepor=false) {
  try {
    const relatorios = carregarRelatorios();
    const novo = {
      id: Date.now() + Math.floor(Math.random()*1000),
      data: new Date().toISOString(),
      paciente: p1.nome || "Sem nome",
      cpf: p1.cpf || "",
      telefone: p1.telefone || "",
      dataNasc: p1.dataNasc || "",
      responsavel: p1.responsavel || "",
      dataConsulta: p1.dataConsulta || "",
      valorTotal: parseFloat(p3.vb)||0,
      desconto: p3.ds||0,
      formas: p3.fc||[],
      temEntrada: p3.entrada||false,
      _p1: JSON.parse(JSON.stringify(p1)),
      _p2: JSON.parse(JSON.stringify(p2)),
      _p3: JSON.parse(JSON.stringify(p3)),
      _p4: p4State ? JSON.parse(JSON.stringify(p4State)) : null,
    };
    if(sobrepor) {
      const idx = relatorios.findIndex(r => r.paciente===novo.paciente && r.dataConsulta===novo.dataConsulta);
      if(idx >= 0) {
        relatorios[idx] = novo;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(relatorios.slice(0,200)));
        return novo;
      }
    }
    relatorios.unshift(novo);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(relatorios.slice(0,200)));
    return novo;
  } catch(e) {
    console.error("Erro ao salvar:", e);
    alert("Erro ao salvar atendimento: " + e.message);
    return null;
  }
}

function carregarRelatorios() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||"[]"); } catch(e){ return []; }
}

function excluirRelatorio(id) {
  const lista = carregarRelatorios().filter(r=>r.id!==id);
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(lista)); } catch(e){}
}

function Arquivo({onCarregar}) {
  const [lista, setLista] = useState([]);
  const [busca, setBusca] = useState("");
  const [filtroProcedimento, setFiltroProcedimento] = useState("");
  const [filtroForma, setFiltroForma] = useState("");
  const [filtroData, setFiltroData] = useState({de:"", ate:""});
  const [filtroValor, setFiltroValor] = useState({min:"", max:""});
  const [expandido, setExpandido] = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(null);

  useEffect(()=>{ setLista(carregarRelatorios()); }, []);

  const dataFmt = d => d ? new Date(d+"T12:00:00").toLocaleDateString("pt-BR") : "—";
  const fmt2 = v => "R$ "+(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});

  // Todos os procedimentos e formas únicos para filtros
  const todosProcedimentos = [...new Set(lista.flatMap(r=>r.procedimentos||[]))].sort();
  const todasFormas = [...new Set(lista.flatMap(r=>r.formas||[]))].sort();

  const filtrados = lista.filter(r => {
    if (busca && !r.paciente.toLowerCase().includes(busca.toLowerCase()) && !r.cpf.includes(busca) && !r.telefone.includes(busca)) return false;
    if (filtroProcedimento && !(r.procedimentos||[]).includes(filtroProcedimento)) return false;
    if (filtroForma && !(r.formas||[]).includes(filtroForma)) return false;
    if (filtroData.de && r.dataConsulta < filtroData.de) return false;
    if (filtroData.ate && r.dataConsulta > filtroData.ate) return false;
    if (filtroValor.min && r.valorTotal < parseFloat(filtroValor.min)) return false;
    if (filtroValor.max && r.valorTotal > parseFloat(filtroValor.max)) return false;
    return true;
  });

  // Estatísticas dos filtrados
  const stats = {
    total: filtrados.length,
    valorMedio: filtrados.length ? filtrados.reduce((a,r)=>a+r.valorTotal,0)/filtrados.length : 0,
    valorTotal: filtrados.reduce((a,r)=>a+r.valorTotal,0),
    comEntrada: filtrados.filter(r=>r.temEntrada).length,
  };

  const limparFiltros = () => { setBusca(""); setFiltroProcedimento(""); setFiltroForma(""); setFiltroData({de:"",ate:""}); setFiltroValor({min:"",max:""}); };
  const temFiltro = busca||filtroProcedimento||filtroForma||filtroData.de||filtroData.ate||filtroValor.min||filtroValor.max;

  const [msgImport, setMsgImport] = useState(null);

  const importarJSON = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = (e) => {
      const file = e.target.files[0];
      if(!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const dados = JSON.parse(ev.target.result);
          const itens = Array.isArray(dados) ? dados : [dados];
          const relatorios = carregarRelatorios();
          const novos = itens.filter(item => item.id && item.paciente);
          const idsExist = new Set(relatorios.map(r=>r.id));
          const paraAdicionar = novos.filter(n=>!idsExist.has(n.id));
          const duplicados = novos.length - paraAdicionar.length;

          if(novos.length === 0) {
            setMsgImport({tipo:"erro", texto:"Arquivo não reconhecido. Use arquivos JSON exportados pelo sistema."});
            setTimeout(()=>setMsgImport(null), 4000);
            return;
          }

          // Se todos são duplicados, forçar re-importação com novo ID
          const finalParaAdd = paraAdicionar.length === 0 && duplicados > 0
            ? novos.map(n=>({...n, id: Date.now() + Math.random()}))
            : paraAdicionar;

          const nova = [...finalParaAdd, ...relatorios].slice(0,200);
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(nova)); } catch(e){}
          setLista(nova);
          setExpandido(finalParaAdd[0]?.id || null);

          let msg = finalParaAdd.length + " atendimento(s) importado(s)";
          if(duplicados > 0 && paraAdicionar.length > 0) msg += " · " + duplicados + " já existia(m)";
          if(duplicados > 0 && paraAdicionar.length === 0) msg += " (re-importado com novo ID)";
          setMsgImport({tipo:"ok", texto:msg});
          setTimeout(()=>setMsgImport(null), 4000);
        } catch(err) {
          setMsgImport({tipo:"erro", texto:"Arquivo inválido: " + err.message});
          setTimeout(()=>setMsgImport(null), 4000);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const BotaoImportar = () => (
    <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:6}}>
      <div onClick={importarJSON} style={{
        display:"flex",alignItems:"center",gap:6,padding:"8px 16px",
        border:"1px solid "+BORDER,borderRadius:3,cursor:"pointer",
        fontSize:12,color:GOLD_DARK,fontWeight:600,background:"#fff",
      }}>📂 Importar JSON</div>
      {msgImport&&(
        <div style={{
          fontSize:11,padding:"6px 12px",borderRadius:3,
          background:msgImport.tipo==="ok"?GOLD_PALE:"#FFF0F0",
          border:"1px solid "+(msgImport.tipo==="ok"?GOLD:"#E57373"),
          color:msgImport.tipo==="ok"?GOLD_DARK:"#C62828",
        }}>{msgImport.tipo==="ok"?"✓ ":""}{msgImport.texto}</div>
      )}
    </div>
  );

  if (lista.length === 0) return (
    <div style={{maxWidth:640,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:12}}>
        <BotaoImportar/>
      </div>
      <Card>
        <div style={{textAlign:"center",padding:"40px 0",color:"#9A8060"}}>
          <div style={{fontSize:32,marginBottom:12}}>📁</div>
          <div style={{fontSize:13,fontWeight:600,marginBottom:6}}>Nenhum relatório arquivado</div>
          <div style={{fontSize:11}}>Salve um atendimento pelo Relatório para aparecer aqui.</div>
        </div>
      </Card>
    </div>
  );

  return (
    <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 40px"}}>

      {/* Cabeçalho com importar */}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:10}}>
        <BotaoImportar/>
      </div>

      {/* Estatísticas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:16}}>
        {[
          ["Atendimentos",stats.total+" de "+lista.length],
          ["Ticket médio",fmt2(stats.valorMedio)],
          ["Volume total",fmt2(stats.valorTotal)],
          ["Com entrada",stats.comEntrada+" ("+Math.round(stats.comEntrada/Math.max(stats.total,1)*100)+"%)"],
        ].map(([l,v])=>(
          <div key={l} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,padding:"12px 14px"}}>
            <div style={{fontSize:8,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:4}}>{l}</div>
            <div style={{fontSize:16,fontWeight:700,color:"#1C1410",fontFamily:"Georgia,serif"}}>{v}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <Card style={{marginBottom:14}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
          <SectionTitle>Filtros</SectionTitle>
          {temFiltro && <div onClick={limparFiltros} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20}}>✕ Limpar</div>}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <input
            style={{...{width:"100%",padding:"9px 12px",border:"1px solid "+BORDER,borderRadius:2,fontSize:13,outline:"none",fontFamily:"inherit"}}}
            placeholder="Buscar por nome, CPF ou telefone..."
            value={busca} onChange={e=>setBusca(e.target.value)}
          />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Procedimento</div>
              <select style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",cursor:"pointer"}} value={filtroProcedimento} onChange={e=>setFiltroProcedimento(e.target.value)}>
                <option value="">Todos</option>
                {todosProcedimentos.map(p=><option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Forma de pagamento</div>
              <select style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",cursor:"pointer"}} value={filtroForma} onChange={e=>setFiltroForma(e.target.value)}>
                <option value="">Todas</option>
                {todasFormas.map(f=><option key={f} value={f}>{f}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Data — de</div>
              <input type="date" style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}} value={filtroData.de} onChange={e=>setFiltroData(p=>({...p,de:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Data — até</div>
              <input type="date" style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}} value={filtroData.ate} onChange={e=>setFiltroData(p=>({...p,ate:e.target.value}))}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Valor mínimo</div>
              <input type="number" style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}} placeholder="R$ 0" value={filtroValor.min} onChange={e=>setFiltroValor(p=>({...p,min:e.target.value}))}/>
            </div>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Valor máximo</div>
              <input type="number" style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}} placeholder="R$ ∞" value={filtroValor.max} onChange={e=>setFiltroValor(p=>({...p,max:e.target.value}))}/>
            </div>
          </div>
        </div>
      </Card>

      {/* Lista */}
      {filtrados.length === 0 ? (
        <Card><div style={{textAlign:"center",padding:20,color:"#9A8060",fontSize:12}}>Nenhum resultado para os filtros aplicados.</div></Card>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {filtrados.map(r=>(
            <div key={r.id} style={{background:"#fff",border:"1px solid "+(expandido===r.id?GOLD:BORDER),borderRadius:4,overflow:"hidden"}}>
              <div onClick={()=>setExpandido(expandido===r.id?null:r.id)} style={{display:"flex",alignItems:"center",padding:"14px 16px",cursor:"pointer",borderLeft:"4px solid "+(expandido===r.id?GOLD:BORDER)}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{r.paciente}</div>
                  <div style={{fontSize:10,color:"#9A8060",marginTop:2}}>{dataFmt(r.dataConsulta)} · {r.responsavel?.split(" ").slice(0,3).join(" ")}</div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:GOLD_DARK}}>{fmt2(r.valorTotal)}</div>
                  <div style={{fontSize:10,color:"#9A8060",marginTop:2}}>{(r.procedimentos||[]).length} proc.</div>
                </div>
                <div style={{marginLeft:12,color:GOLD_DARK,fontSize:12}}>{expandido===r.id?"▲":"▼"}</div>
              </div>
              {expandido===r.id&&(
                <div style={{padding:"14px 16px",borderTop:"1px solid "+BORDER,background:CREAM}}>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
                    {[["CPF",r.cpf||"—"],["Telefone",r.telefone||"—"],["Nascimento",dataFmt(r.dataNasc)],["Consulta",dataFmt(r.dataConsulta)]].map(([l,v])=>(
                      <div key={l} style={{padding:"8px 10px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3}}>
                        <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:2}}>{l}</div>
                        <div style={{fontSize:11,color:"#1C1410"}}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {(r.procedimentos||[]).length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:6}}>Procedimentos</div>
                      <div style={{display:"flex",flexWrap:"wrap",gap:4}}>
                        {r.procedimentos.map((p,i)=><span key={i} style={{fontSize:10,padding:"3px 10px",background:GOLD_PALE,border:"1px solid "+GOLD_LIGHT,borderRadius:20,color:GOLD_DARK}}>{p}</span>)}
                      </div>
                    </div>
                  )}
                  {(r.formas||[]).length>0&&(
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:6}}>Pagamento</div>
                      <div style={{fontSize:11,color:"#5C4A2A"}}>{r.formas.join(" · ")}{r.temEntrada?" · com entrada":""}</div>
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:8}}>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      {onCarregar&&r._p1&&(
                        <div onClick={()=>onCarregar(r)} style={{fontSize:11,color:GOLD_DARK,cursor:"pointer",padding:"5px 12px",border:"1px solid "+GOLD,borderRadius:2,fontWeight:600}}>
                          ✎ Abrir para edição
                        </div>
                      )}
                      <div onClick={()=>{
                        try {
                          const json = JSON.stringify(r, null, 2);
                          const nome = "integra_"+((r.paciente||"atendimento").replace(/[^a-zA-Z0-9]/g,"_"))+"_"+new Date(r.data||Date.now()).toLocaleDateString("pt-BR").replace(/\//g,"-")+".json";
                          const bytes = new TextEncoder().encode(json);
                          const blob = new Blob([bytes], {type:"application/octet-stream"});
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = nome;
                          a.style.display = "none";
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                        } catch(e) { alert("Erro ao exportar: " + e.message); }
                      }} style={{fontSize:11,color:"#5C4A2A",cursor:"pointer",padding:"5px 12px",border:"1px solid "+BORDER,borderRadius:2,fontWeight:600}}>
                        ⬇ Baixar JSON
                      </div>
                    </div>
                    {confirmExcluir===r.id?(
                      <div style={{display:"flex",gap:8,alignItems:"center"}}>
                        <span style={{fontSize:11,color:"#9A8060"}}>Confirmar exclusão?</span>
                        <div onClick={()=>{excluirRelatorio(r.id);setLista(carregarRelatorios());setConfirmExcluir(null);setExpandido(null);}} style={{fontSize:11,padding:"4px 10px",background:"#9A8060",color:"#fff",borderRadius:2,cursor:"pointer"}}>Excluir</div>
                        <div onClick={()=>setConfirmExcluir(null)} style={{fontSize:11,padding:"4px 10px",border:"1px solid "+BORDER,borderRadius:2,cursor:"pointer",color:"#5C4A2A"}}>Cancelar</div>
                      </div>
                    ):(
                      <div onClick={()=>setConfirmExcluir(r.id)} style={{fontSize:10,color:"#9A8060",cursor:"pointer",padding:"3px 8px",border:"1px solid "+BORDER,borderRadius:2}}>✕ Excluir</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Seção Google Drive */}
      <Card style={{marginTop:16}}>
        <SectionTitle>Google Drive</SectionTitle>
        <ArquivoDriveSection onCarregar={onCarregar}/>
      </Card>

    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────
const p1Initial = {
  nome:"",
  cpf:"",
  telefone:"",
  dataNasc:"",
  idade:"",
  isMinor:false,
  respNome:"",
  respCpf:"",
  dataConsulta:new Date().toISOString().split("T")[0],
  responsavel:"Dr. Arthur A. Cheade",
  assinatura:"",
};
const ACHADOS_DEFAULT = [
  {id:"gengivite",      label:"Gengivite",          cor:"#E57373"},
  {id:"carie_ativa",    label:"Cárie ativa",         cor:"#8D6E63"},
  {id:"suspeita_carie", label:"Suspeita de cárie",   cor:"#FFB74D"},
  {id:"perda_ossea",    label:"Perda óssea",         cor:"#7986CB"},
  {id:"retracao",       label:"Retração gengival",   cor:"#F06292"},
  {id:"desgaste",       label:"Desgaste dentário",   cor:"#4DB6AC"},
  {id:"erosao",         label:"Erosão dentária",     cor:"#81C784"},
  {id:"fratura",        label:"Fratura dentária",    cor:"#FF8A65"},
  {id:"ausente",        label:"Dentes ausentes",     cor:"#90A4AE"},
];
function getAchadosInicial() {
  try {
    const saved = localStorage.getItem("integra_achados_config");
    return saved ? JSON.parse(saved) : ACHADOS_DEFAULT;
  } catch(e) { return ACHADOS_DEFAULT; }
}
const p2Initial = {achadosDente:{},achadoAtivo:null,segAtivo:null,arcadaAtiva:null,obsTexto:"",obsCorrigido:"",achados:null,obsAchados:{}};



// Procedimentos pré-definidos
const PROC_BASE = [
  {
    id: "profilaxia",
    nome: "Profilaxia",
    icone: "✦",
    descricao: "Limpeza e polimento dental",
    modo: "regiao",
    valorPadrao: 250,
  },
  {
    id: "clareamento",
    nome: "Clareamento Dental",
    icone: "✦",
    descricao: "Clareamento de consultório",
    modo: "regiao",
    valorPadrao: 800,
  },
  {
    id: "restauracao",
    nome: "Restauração",
    icone: "✦",
    descricao: "Restauração em resina composta",
    modo: "dente",
    valorPadrao: 320,
  },
  {
    id: "extracao",
    nome: "Extração Dentária",
    icone: "✦",
    descricao: "Extração simples",
    modo: "dente",
    valorPadrao: 280,
  },
  {
    id: "endodontia",
    nome: "Endodontia",
    icone: "✦",
    descricao: "Tratamento de canal",
    modo: "dente",
    valorPadrao: 900,
  },
  {
    id: "implante",
    nome: "Implante Dentário",
    icone: "✦",
    descricao: "Implante de titânio",
    modo: "dente",
    valorPadrao: 2800,
  },
  {
    id: "protese",
    nome: "Prótese Dentária",
    icone: "✦",
    descricao: "Prótese sobre implante ou convencional",
    modo: "dente",
    valorPadrao: 1800,
  },
  {
    id: "dtm",
    nome: "DTM",
    icone: "✦",
    descricao: "Disfunção temporomandibular",
    modo: "livre",
    valorPadrao: 1200,
  },
  {
    id: "ortodontia",
    nome: "Ortodontia",
    icone: "✦",
    descricao: "Aparelho ortodôntico (instalação)",
    modo: "regiao",
    valorPadrao: 3500,
  },
];



const TODOS = Object.values(QUADRANTES).flat();
const SUP = [...QUADRANTES.q1, ...QUADRANTES.q2];
const INF = [...QUADRANTES.q3, ...QUADRANTES.q4];

const parseMoeda = v => parseFloat(String(v).replace(/[^0-9,]/g, "").replace(",", ".")) || 0;

function MiniDente({ numero, selecionado, onClick }) {
  const tipo = tipoDente(numero);
  const size = tipo === "molar" ? 24 : tipo === "premolar" ? 21 : 19;
  return (
    <div onClick={() => onClick(numero)} style={{
      display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer",
    }}>
      <div style={{
        width: size, height: size,
        borderRadius: tipo === "anterior" ? "50%" : 3,
        border: "2px solid " + (selecionado ? GOLD_DARK : BORDER),
        background: selecionado ? GOLD : "#fff",
        display: "flex", alignItems: "center", justifyContent: "center",
        transition: "all 0.1s",
      }}>
        {selecionado && <span style={{ fontSize: 8, color: "#fff", fontWeight: 900 }}>✓</span>}
      </div>
      <span style={{ fontSize: 7, color: selecionado ? GOLD_DARK : "#C0B090", fontWeight: selecionado ? 700 : 400 }}>{numero}</span>
    </div>
  );
}

function OdontogramaMini({ selecionados, onToggle }) {
  return (
    <div style={{ background: CREAM, borderRadius: 3, padding: "10px 6px", border: "1px solid " + BORDER }}>
      <div style={{ textAlign: "center", fontSize: 8, letterSpacing: 1.5, color: "#C0B090", textTransform: "uppercase", marginBottom: 5 }}>Superior</div>
      <div style={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: 5 }}>
        <div style={{ display: "flex", gap: 2, paddingRight: 5, borderRight: "1px dashed " + BORDER }}>
          {QUADRANTES.q1.map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
        </div>
        <div style={{ display: "flex", gap: 2, paddingLeft: 5 }}>
          {QUADRANTES.q2.map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
        </div>
      </div>
      <div style={{ borderTop: "1px dashed " + BORDER, margin: "3px 0" }} />
      <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 5 }}>
        <div style={{ display: "flex", gap: 2, paddingRight: 5, borderRight: "1px dashed " + BORDER }}>
          {[...QUADRANTES.q4].reverse().map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
        </div>
        <div style={{ display: "flex", gap: 2, paddingLeft: 5 }}>
          {[...QUADRANTES.q3].reverse().map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
        </div>
      </div>
      <div style={{ textAlign: "center", fontSize: 8, letterSpacing: 1.5, color: "#C0B090", textTransform: "uppercase", marginTop: 5 }}>Inferior</div>

      {/* Decíduos */}
      <div style={{ borderTop: "1px dashed " + BORDER, marginTop: 6, paddingTop: 6 }}>
        <div style={{ textAlign: "center", fontSize: 7, letterSpacing: 1.5, color: "#C0B090", textTransform: "uppercase", marginBottom: 4, opacity: 0.7 }}>Decíduos</div>
        <div style={{ display: "flex", justifyContent: "center", gap: 2, marginBottom: 3 }}>
          <div style={{ display: "flex", gap: 2, paddingRight: 4, borderRight: "1px dashed " + BORDER }}>
            {DECIDUOS.d1.map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
          </div>
          <div style={{ display: "flex", gap: 2, paddingLeft: 4 }}>
            {DECIDUOS.d2.map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
          </div>
        </div>
        <div style={{ borderTop: "1px dashed " + BORDER, margin: "2px 0" }} />
        <div style={{ display: "flex", justifyContent: "center", gap: 2, marginTop: 3 }}>
          <div style={{ display: "flex", gap: 2, paddingRight: 4, borderRight: "1px dashed " + BORDER }}>
            {[...DECIDUOS.d3].reverse().map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
          </div>
          <div style={{ display: "flex", gap: 2, paddingLeft: 4 }}>
            {[...DECIDUOS.d4].reverse().map(n => <MiniDente key={n} numero={n} selecionado={selecionados.includes(n)} onClick={onToggle} />)}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProcedimentoItem({ proc, item, onChange, onRemove, editavel=false }) {
  const [expandido, setExpandido] = useState(false);
  const [valorPorDente, setValorPorDente] = useState(false);

  // Subtotal: se valorPorDente, soma valores individuais; senão, unitário × qtd
  const modoEfetivo = item.modo || proc.modo;
  const subtotal = modoEfetivo === "dente"
    ? valorPorDente && item.valoresDente
      ? item.dentes?.reduce((acc, n) => acc + parseMoeda(item.valoresDente[n] || item.valor), 0) || 0
      : (item.dentes?.length || 0) * parseMoeda(item.valor)
    : proc.subtipos
      ? Object.values(item.subtipos || {}).reduce((acc, st) => acc + parseMoeda(st.valor || "0"), 0)
      : parseMoeda(item.valor) * (item.qtd || 1);

  const toggleDente = (n) => {
    const atual = item.dentes || [];
    const novo = atual.includes(n) ? atual.filter(x => x !== n) : [...atual, n];
    onChange({ ...item, dentes: novo });
  };

  const toggleRegiao = (regiao) => {
    let dentes = [];
    if (regiao === "boca") dentes = TODOS;
    else if (regiao === "sup") dentes = SUP;
    else if (regiao === "inf") dentes = INF;
    onChange({ ...item, regiao, dentes });
  };

  const descricaoDentes = () => {
    if (!item.dentes || item.dentes.length === 0) return "Nenhum dente selecionado";
    if (item.dentes.length === TODOS.length) return "Boca toda";
    if (item.dentes.length === SUP.length && SUP.every(d => item.dentes.includes(d))) return "Arcada superior";
    if (item.dentes.length === INF.length && INF.every(d => item.dentes.includes(d))) return "Arcada inferior";
    return item.dentes.sort((a, b) => a - b).join(", ");
  };

  return (
    <div style={{
      border: "1px solid " + (item.ativo ? GOLD : BORDER),
      borderRadius: 4, overflow: "hidden",
      background: item.ativo ? "#fff" : "#FAFAF8",
    }}>
      {item._showMiniOrc && (
        <MiniOrcamento
          valor={subtotal}
          procNome={proc.nome}
          propostaInicial={item.proposta}
          onSave={(prop)=>onChange({...item, proposta:prop, _showMiniOrc:false})}
          onClose={()=>onChange({...item,_showMiniOrc:false})}
        />
      )}
      {/* Header do procedimento */}
      <div style={{
        display: "flex", alignItems: "center", gap: 0,
        borderLeft: "4px solid " + (item.ativo ? GOLD : BORDER),
      }}>
        {/* Toggle ativo */}
        <div onClick={() => onChange({ ...item, ativo: !item.ativo })} style={{
          width: 44, display: "flex", alignItems: "center", justifyContent: "center",
          alignSelf: "stretch", cursor: "pointer", flexShrink: 0,
          background: item.ativo ? GOLD_PALE : "transparent",
        }}>
          <div style={{
            width: 20, height: 20, borderRadius: "50%",
            border: "2px solid " + (item.ativo ? GOLD_DARK : BORDER),
            background: item.ativo ? GOLD : "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {item.ativo && <span style={{ fontSize: 10, color: "#fff", fontWeight: 900 }}>✓</span>}
          </div>
        </div>

        {/* Info */}
        <div style={{ flex: 1, padding: "12px 8px 12px 4px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{flex:1}}>
              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: item.ativo ? "#1C1410" : "#9A8060" }}>
                  {proc.nome}
                </div>
                {item.ativo && (<>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    {!item._permanente&&(
                      <div onClick={e=>{e.stopPropagation();onChange({...item,_permanente:true});}} style={{fontSize:9,color:"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+BORDER,borderRadius:20,whiteSpace:"nowrap"}} title="Salvar como favorito">⭐ Favoritar</div>
                    )}
                    {item._permanente&&(
                      <div style={{fontSize:9,color:GOLD_DARK,padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20,whiteSpace:"nowrap",background:GOLD_PALE}}>⭐ Salvo</div>
                    )}
                    <div onClick={e=>{e.stopPropagation();onChange({...item,_showMiniOrc:!item._showMiniOrc});}} style={{fontSize:9,color:item.proposta?GOLD_DARK:"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(item.proposta?GOLD:BORDER),borderRadius:20,whiteSpace:"nowrap"}}>
                      {item.proposta?"✓ Proposta própria":"+ Proposta individual"}
                    </div>
                  </div>
                  {/* Resumo das condições de pagamento da proposta individual */}
                  {item.proposta&&item.proposta.fc&&item.proposta.fc.length>0&&(
                    <div style={{display:"flex",flexWrap:"wrap",gap:4,marginTop:6}}>
                      {(()=>{
                        const prop=item.proposta;
                        const vb2=parseFloat(String(prop.vb||0).replace(",","."))||0;
                        const dp2=prop.ds||0;
                        const vf2=dp2>0?vb2*(1-dp2/100):vb2;
                        const entVal=prop.entrada?((prop.entradaTipo||"pct")==="pct"?vb2*(parseFloat(prop.entradaVal||0)/100):parseFloat(prop.entradaVal||0)):0;
                        const saldo=prop.entrada?Math.max(0,vb2-entVal):vf2;
                        const tags=[];
                        if(prop.entrada&&entVal>0) tags.push({lb:"Entrada "+fmt(entVal),cor:"#E8F5E9",txt:"#2E7D32"});
                        if(prop.fc.includes("pix")||prop.fc.includes("dinheiro")){
                          const ms=[prop.fc.includes("pix")&&"PIX",prop.fc.includes("dinheiro")&&"Dinh."].filter(Boolean).join("/");
                          tags.push({lb:ms+" "+fmt(dp2>0?vf2:saldo),cor:GOLD_PALE,txt:GOLD_DARK});
                        }
                        if(prop.fc.includes("credito")){
                          const mx=prop.cp?parseInt(prop.cp):12;
                          tags.push({lb:"Cartão até "+mx+"x",cor:"#F3EDF6",txt:PURPLE});
                        }
                        if(prop.fc.includes("boleto")){
                          const bp=parseInt(prop.bp||"6");
                          tags.push({lb:"Boleto "+bp+"x",cor:"#FFF8E1",txt:"#E65100"});
                        }
                        return tags.map((t,i)=>(
                          <span key={i} style={{fontSize:8,padding:"2px 7px",borderRadius:10,background:t.cor,color:t.txt,fontWeight:600,whiteSpace:"nowrap"}}>{t.lb}</span>
                        ));
                      })()}
                    </div>
                  )}
                </>)}
              </div>
              {item.ativo && (
                <div style={{ marginTop: 4 }}>
                  {proc.subtipos
                    ? <span style={{fontSize:10,color:"#9A8060"}}>{Object.keys(item.subtipos || {}).map(id => proc.subtipos.find(s=>s.id===id)?.label).filter(Boolean).join(" + ") || "Selecione o tipo"}</span>
                    : modoEfetivo === "dente"
                    ? <span style={{fontSize:10,color:"#9A8060"}}>{descricaoDentes()}</span>
                    : modoEfetivo === "regiao"
                    ? <div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:2}}>
                        {[["boca","Boca toda"],["sup","Sup."],["inf","Inf."]].map(([k,l])=>(
                          <div key={k} onClick={e=>{e.stopPropagation();onChange({...item,regiao:k});}} style={{padding:"2px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1.5px solid "+(item.regiao===k?GOLD_DARK:BORDER),background:item.regiao===k?GOLD_PALE:"#fff",color:item.regiao===k?GOLD_DARK:"#5C4A2A",fontWeight:item.regiao===k?700:400}}>{l}</div>
                        ))}
                      </div>
                    : <span style={{fontSize:10,color:"#9A8060"}}>Valor livre</span>}
                </div>
              )}
            </div>
            {item.ativo && (
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: GOLD_DARK }}>{fmt(subtotal)}</div>
                {modoEfetivo === "dente" && item.dentes?.length > 1 && (
                  <div style={{ fontSize: 9, color: "#9A8060" }}>{item.dentes.length}x {fmt(parseMoeda(item.valor))}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Expandir */}
        {item.ativo && (
          <div onClick={() => setExpandido(!expandido)} style={{
            width: 40, alignSelf: "stretch", display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer", borderLeft: "1px solid " + BORDER,
            color: GOLD_DARK, fontSize: 14, flexShrink: 0,
          }}>
            {expandido ? "▲" : "▼"}
          </div>
        )}
      </div>

      {/* Painel expandido */}
      {item.ativo && expandido && (
        <div style={{ padding: "14px 16px", borderTop: "1px solid " + BORDER, background: CREAM }}>

          {/* Subtipos multi-select (ex: DTM) */}
          {proc.subtipos && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 8 }}>Tipo de tratamento</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {proc.subtipos.map(st => {
                  const subtiposAtivos = item.subtipos || {};
                  const ativo = !!subtiposAtivos[st.id];
                  const toggleSt = () => {
                    const novo = { ...subtiposAtivos };
                    if (ativo) {
                      delete novo[st.id];
                    } else {
                      novo[st.id] = { valor: String(st.valorPadrao).replace(".", ",") };
                    }
                    onChange({ ...item, subtipos: novo });
                  };
                  return (
                    <div key={st.id}>
                      <div onClick={toggleSt} style={{
                        display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                        borderRadius: 3, cursor: "pointer",
                        border: "1.5px solid " + (ativo ? GOLD_DARK : BORDER),
                        background: ativo ? GOLD_PALE : "#fff",
                      }}>
                        <div style={{
                          width: 18, height: 18, borderRadius: 3, flexShrink: 0,
                          border: "2px solid " + (ativo ? GOLD_DARK : BORDER),
                          background: ativo ? GOLD : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {ativo && <span style={{ fontSize: 9, color: "#fff", fontWeight: 900 }}>✓</span>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: ativo ? 700 : 400, color: ativo ? GOLD_DARK : "#1C1410", flex: 1 }}>{st.label}</span>
                        {ativo && <span style={{ fontSize: 12, fontWeight: 600, color: GOLD_DARK }}>{fmt(parseMoeda(subtiposAtivos[st.id]?.valor || "0"))}</span>}
                      </div>
                      {ativo && (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "#FDFAF4", border: "1px solid " + BORDER, borderTop: "none", borderRadius: "0 0 3px 3px" }}>
                          <span style={{ fontSize: 11, color: GOLD_DARK }}>R$</span>
                          <input
                            style={{ width: 110, padding: "6px 8px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 13, fontWeight: 600, color: GOLD_DARK, background: "#fff", outline: "none", fontFamily: "inherit" }}
                            value={subtiposAtivos[st.id]?.valor || ""}
                            onChange={e => {
                              const novo = { ...subtiposAtivos, [st.id]: { valor: e.target.value.replace(/[^0-9,]/g, "") } };
                              onChange({ ...item, subtipos: novo });
                            }}
                            placeholder="0,00"
                          />
                          <span style={{ fontSize: 10, color: "#9A8060" }}>por sessão/tratamento</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tipo do procedimento — editável para procedimentos personalizados */}
          {editavel && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 6 }}>Tipo</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["dente","Por dente"],["regiao","Por região"],["livre","Valor livre"]].map(([k,l])=>(
                  <div key={k} onClick={()=>onChange({...item, modo:k, dentes:[], regiao:k==="regiao"?"boca":null})}
                    style={{flex:1,padding:"7px 10px",borderRadius:3,cursor:"pointer",textAlign:"center",
                      border:"1.5px solid "+(modoEfetivo===k?GOLD_DARK:BORDER),
                      background:modoEfetivo===k?GOLD_PALE:"#fff",
                      color:modoEfetivo===k?GOLD_DARK:"#5C4A2A",
                      fontSize:11,fontWeight:modoEfetivo===k?700:400}}>
                    {l}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Valor — com opção de valor por dente individual */}
          {!proc.subtipos && <div style={{ marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700 }}>
                Valor {modoEfetivo === "dente" ? (valorPorDente ? "individual por dente" : "por dente (único)") : ""}
              </div>
              {modoEfetivo === "dente" && item.dentes?.length > 0 && (
                <div onClick={() => setValorPorDente(!valorPorDente)} style={{ fontSize: 10, color: valorPorDente ? GOLD_DARK : "#9A8060", cursor: "pointer", padding: "2px 8px", border: "1px solid " + (valorPorDente ? GOLD : BORDER), borderRadius: 20 }}>
                  {valorPorDente ? "✓ Individual" : "Definir por dente"}
                </div>
              )}
            </div>
            {!valorPorDente ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, color: GOLD_DARK, fontWeight: 600 }}>R$</span>
                <input
                  style={{ width: 120, padding: "8px 10px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 14, fontWeight: 600, color: GOLD_DARK, background: "#fff", outline: "none", fontFamily: "inherit" }}
                  value={item.valor}
                  onChange={e => onChange({ ...item, valor: e.target.value.replace(/[^0-9,]/g, "") })}
                  placeholder="0,00"
                />
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {(item.dentes || []).sort((a, b) => a - b).map(n => (
                  <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "#5C4A2A", minWidth: 140 }}>{nomeDente(n)}</div>
                    <span style={{ fontSize: 12, color: GOLD_DARK, fontWeight: 600 }}>R$</span>
                    <input
                      style={{ width: 100, padding: "6px 8px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 13, fontWeight: 600, color: GOLD_DARK, background: "#fff", outline: "none", fontFamily: "inherit" }}
                      value={(item.valoresDente||{})[n]!==undefined?(item.valoresDente||{})[n]:item.valor}
                      onChange={e => onChange({ ...item, valoresDente: { ...(item.valoresDente || {}), [n]: e.target.value.replace(/[^0-9,]/g, "") } })}
                      placeholder="0,00"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>}

          {/* Seleção por região */}
          {modoEfetivo === "regiao" && modoEfetivo !== "livre" && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 8 }}>Região</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["boca", "Boca toda"], ["sup", "Arcada superior"], ["inf", "Arcada inferior"], [null, "Nenhuma"]].map(([k, l]) => (
                  <div key={String(k)} onClick={() => k ? toggleRegiao(k) : onChange({...item, regiao:null, dentes:[]})} style={{
                    padding: "6px 14px", borderRadius: 20, fontSize: 11, cursor: "pointer",
                    border: "1.5px solid " + (item.regiao === k ? GOLD_DARK : BORDER),
                    background: item.regiao === k ? GOLD_PALE : "#fff",
                    color: item.regiao === k ? GOLD_DARK : "#5C4A2A",
                    fontWeight: item.regiao === k ? 700 : 400,
                  }}>{l}</div>
                ))}
              </div>
            </div>
          )}

          {/* Seleção por dente */}
          {modoEfetivo === "dente" && modoEfetivo !== "livre" && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 8 }}>
                Selecione os dentes ({item.dentes?.length || 0} selecionado{item.dentes?.length !== 1 ? "s" : ""})
              </div>
              <OdontogramaMini selecionados={item.dentes || []} onToggle={toggleDente} />
              {item.dentes?.length > 0 && (
                <div onClick={() => onChange({ ...item, dentes: [] })} style={{
                  marginTop: 8, fontSize: 10, color: "#E57373", cursor: "pointer", textAlign: "right",
                }}>✕ Limpar seleção</div>
              )}
            </div>
          )}
          {/* Campo de observação livre */}
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 6 }}>Observação</div>
            <textarea
              spellCheck="true"
              lang="pt-BR"
              autoCorrect="on"
              autoCapitalize="sentences"
              data-gramm="true"
              value={item.obs || ""}
              onChange={e => onChange({ ...item, obs: e.target.value })}
              placeholder="Observações clínicas, materiais utilizados..."
              style={{
                display:"block",
                width:"100%",
                padding:"8px 10px",
                border:"1px solid "+BORDER,
                borderRadius:2,
                fontSize:12,
                fontFamily:"inherit",
                resize:"vertical",
                minHeight:52,
                background:"#fff",
                color:"#1C1410",
                boxSizing:"border-box",
              }}
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700 }}>Etapas / Detalhes</div>
              <div
                onClick={() => onChange({ ...item, subtopicos: [...(item.subtopicos || []), ""] })}
                style={{ fontSize: 10, color: GOLD_DARK, cursor: "pointer", padding: "2px 8px", border: "1px solid " + GOLD, borderRadius: 20, fontWeight: 600 }}
              >+ Adicionar</div>
            </div>
            {(item.subtopicos || []).length === 0 && (
              <div style={{ fontSize: 11, color: "#9A8060", fontStyle: "italic", padding: "4px 0" }}>
                Nenhuma etapa adicionada — clique em "+ Adicionar" para criar subtópicos
              </div>
            )}
            {(item.subtopicos || []).map((st, si) => (
              <div key={si} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 11, color: GOLD_DARK, fontWeight: 700, minWidth: 18 }}>{si + 1}.</div>
                <textarea
                  spellCheck="true"
                  lang="pt-BR"
                  autoCorrect="on"
                  autoCapitalize="sentences"
                  rows={1}
                  style={{ flex: 1, padding: "6px 10px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 12, color: "#1C1410", background: "#fff", fontFamily: "inherit", resize: "none", lineHeight: 1.4, overflow: "hidden" }}
                  value={st}
                  onChange={e => {
                    e.target.style.height = "auto";
                    e.target.style.height = e.target.scrollHeight + "px";
                    const novos = [...(item.subtopicos || [])];
                    novos[si] = e.target.value;
                    onChange({ ...item, subtopicos: novos });
                  }}
                  placeholder={"Etapa " + (si + 1) + "..."}
                />
                <div
                  onClick={() => {
                    const novos = (item.subtopicos || []).filter((_, i) => i !== si);
                    onChange({ ...item, subtopicos: novos });
                  }}
                  style={{ fontSize: 11, color: "#9A8060", cursor: "pointer", padding: "4px 6px", flexShrink: 0 }}
                >✕</div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function ArquivoDriveSection({onCarregar}) {
  const logado = useDriveLogado();
  const [arquivos, setArquivos] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const [carregando, setCarregando] = React.useState(null);
  const [filtro, setFiltro] = React.useState("");
  const [selecionados, setSelecionados] = React.useState(new Set());
  const [excluindo, setExcluindo] = React.useState(false);

  const login = async () => {
    if(!window.location.hostname.includes("integra-clinica") && window.location.hostname !== "localhost") {
      window.location.href = GDRIVE_ORIGIN + window.location.pathname;
      return;
    }
    setErro(null);
    try {
      await gdriveEnsureScript();
      await gdriveLogin();
    } catch(e) {
      const msg = e&&e.message?e.message:"";
      setErro(msg.includes("cancelado")||msg.includes("access_denied")?"Use: integratrindade@gmail.com, arthurarioli@hotmail.com ou arthurfloripa.aac@gmail.com":"Erro: "+msg);
    }
  };

  const listar = async () => {
    try { setArquivos(await gdriveListarTodos()); } catch(e) { setErro(e.message); }
  };

  React.useEffect(()=>{ if(logado) listar(); },[logado]);

  const extrairNome = (fn) => {
    const m = fn.replace(/\.json$/,"").replace(/^integra_/,"").replace(/_[a-f0-9-]+$/,"").replace(/_/g," ");
    return m.charAt(0).toUpperCase()+m.slice(1);
  };

  const fmtData = (iso) => {
    if(!iso) return "";
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
  };

  const carregar = async (arq) => {
    setCarregando(arq.id);
    try { const dados = await gdriveCarregarArquivo(arq.id); if(onCarregar) onCarregar(dados); } catch(e) { setErro("Erro: "+e.message); }
    setCarregando(null);
  };

  const toggleSel = (id) => { setSelecionados(prev => { const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const excluirSelecionados = async () => {
    if(!selecionados.size) return;
    if(!window.confirm("Excluir "+selecionados.size+" arquivo(s) do Drive?")) return;
    setExcluindo(true);
    try {
      for(const id of selecionados) { await fetch("https://www.googleapis.com/drive/v3/files/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+_gdriveToken}}); }
      setSelecionados(new Set());
      setArquivos(await gdriveListarTodos());
    } catch(e) { setErro("Erro ao excluir: "+e.message); }
    setExcluindo(false);
  };

  const excluirUnico = async (id) => {
    if(!window.confirm("Excluir este arquivo do Drive?")) return;
    try {
      await fetch("https://www.googleapis.com/drive/v3/files/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+_gdriveToken}});
      setArquivos(await gdriveListarTodos());
      selecionados.delete(id); setSelecionados(new Set(selecionados));
    } catch(e) { setErro("Erro: "+e.message); }
  };

  const filtrados = arquivos ? arquivos.filter(a => !filtro || extrairNome(a.name).toLowerCase().includes(filtro.toLowerCase())) : [];

  if(!logado) return (
    <div style={{textAlign:"center",padding:20}}>
      <div onClick={login} style={{display:"inline-flex",alignItems:"center",gap:8,padding:"10px 18px",background:"#fff",border:"1px solid #dadce0",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,color:"#3c4043",boxShadow:"0 1px 3px rgba(0,0,0,0.12)"}}>
        <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
        Conectar ao Google Drive
      </div>
      {erro&&<div style={{fontSize:11,color:"#C62828",marginTop:8}}>{erro}</div>}
    </div>
  );

  return (
    <div>
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:10}}>
        <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar paciente..." style={{flex:1,padding:"7px 10px",border:"1px solid "+BORDER,borderRadius:3,fontSize:11,outline:"none"}}/>
        {filtrados.length>0&&<div onClick={()=>{if(selecionados.size===filtrados.length)setSelecionados(new Set());else setSelecionados(new Set(filtrados.map(a=>a.id)));}} style={{padding:"5px 8px",border:"1px solid "+BORDER,borderRadius:3,cursor:"pointer",fontSize:9,color:"#9A8060"}}>{selecionados.size===filtrados.length?"Desmarcar":"Sel. tudo"}</div>}
        <div onClick={listar} style={{padding:"7px 12px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,cursor:"pointer",fontSize:10,color:"#9A8060"}}>↻</div>
        <div onClick={()=>{_gdriveToken=null;_gdriveFolderId=null;notifyDriveLogin();setArquivos(null);}} style={{fontSize:10,color:"#9A8060",cursor:"pointer"}}>Sair</div>
      </div>
      {selecionados.size>0&&<div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8,padding:"6px 10px",background:"#FFF0F0",border:"1px solid #E57373",borderRadius:3}}>
        <span style={{fontSize:11,color:"#C62828",flex:1}}>{selecionados.size} selecionado(s)</span>
        <div onClick={excluirSelecionados} style={{padding:"4px 10px",background:"#C62828",color:"#fff",borderRadius:3,cursor:excluindo?"default":"pointer",fontSize:10,fontWeight:600}}>{excluindo?"Excluindo...":"🗑 Excluir"}</div>
        <div onClick={()=>setSelecionados(new Set())} style={{fontSize:10,color:"#9A8060",cursor:"pointer"}}>✕</div>
      </div>}
      {erro&&<div style={{fontSize:11,color:"#C62828",marginBottom:8}}>{erro}</div>}
      {!arquivos&&<div style={{textAlign:"center",padding:20,color:"#9A8060",fontSize:11}}>Carregando...</div>}
      {arquivos&&<div style={{fontSize:10,color:"#9A8060",marginBottom:6}}>{arquivos.length} arquivo(s) na pasta</div>}
      {arquivos&&filtrados.length===0&&<div style={{textAlign:"center",padding:14,color:"#9A8060",fontSize:11}}>Nenhum arquivo encontrado</div>}
      {filtrados.map(arq=>{const sel=selecionados.has(arq.id);return(
        <div key={arq.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid "+BORDER,background:sel?"#FFF8F0":"transparent"}}>
          <div onClick={()=>toggleSel(arq.id)} style={{width:18,height:18,borderRadius:3,border:"2px solid "+(sel?GOLD_DARK:BORDER),background:sel?GOLD:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{sel&&<span style={{fontSize:9,color:"#fff",fontWeight:900}}>✓</span>}</div>
          <div onClick={()=>carregar(arq)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
            <div style={{fontSize:12,fontWeight:600,color:"#5C4A2A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{extrairNome(arq.name)}</div>
            <div style={{fontSize:9,color:"#9A8060",marginTop:1}}>{fmtData(arq.modifiedTime)}</div>
          </div>
          <div onClick={()=>excluirUnico(arq.id)} style={{padding:"4px 8px",border:"1px solid #E57373",borderRadius:3,cursor:"pointer",fontSize:10,color:"#C62828",flexShrink:0}}>🗑</div>
        </div>
      );})}
    </div>
  );
}

function P4({onTotalChange, p4State, setP4State}) {
  // Force spellCheck on mount
  React.useEffect(()=>{try{document.querySelectorAll("textarea").forEach(t=>{t.setAttribute("spellcheck","true");t.setAttribute("lang","pt-BR");});}catch(e){}},[]);
  const defaultItens = PROC_BASE.map(p => ({
    id: p.id, ativo: false,
    valor: String(p.valorPadrao).replace(".", ","),
    dentes: [], subtipos: {},
    regiao: p.id === "profilaxia" ? "boca" : p.id === "clareamento" ? "boca" : null,
    qtd: 1,
  }));
  const itens = p4State.itens || defaultItens;
  const setItens = (val) => setP4State(prev => ({ ...prev, itens: typeof val === "function" ? val(prev.itens || defaultItens) : val }));
  const customProcs = p4State.customProcs || [];
  const setCustomProcs = (val) => setP4State(prev => ({ ...prev, customProcs: typeof val === "function" ? val(prev.customProcs || []) : val }));

  // Procedimentos customizados de base (editáveis, como achados clínicos)
  const procsBase = p4State.procsBase || PROC_BASE.map(p => ({...p}));
  const setProcsBase = (val) => setP4State(prev => ({ ...prev, procsBase: typeof val === "function" ? val(prev.procsBase || PROC_BASE.map(p=>({...p}))) : val }));

  const [editandoProcs, setEditandoProcs] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoModo, setNovoModo] = useState("dente");
  const [novoObs, setNovoObs] = useState("");
  const [mostrarForm, setMostrarForm] = useState(false);

  const atualizarItem = (idx, novo) => {
    setItens(prev => prev.map((it, i) => i === idx ? novo : it));
  };

  const atualizarCustom = (idx, novo) => {
    setCustomProcs(prev => prev.map((it, i) => i === idx ? novo : it));
  };

  const adicionarCustom = (permanente=true) => {
    if (!novoNome.trim()) return;
    setCustomProcs(prev => [...prev, {
      id: "custom_" + Date.now(),
      nome: novoNome.trim(),
      modo: novoModo,
      ativo: true,
      valor: novoValor || "0",
      obs: novoObs.trim(),
      dentes: [],
      regiao: novoModo === "regiao" ? "boca" : null,
      qtd: 1,
      _permanente: permanente,
    }]);
    setNovoNome("");
    setNovoValor("");
    setNovoObs("");
    setMostrarForm(false);
  };

  const removerCustom = (idx) => {
    if(idx < 0) return;
    setCustomProcs(prev => prev.filter((_, i) => i !== idx));
  };

  const removerProcBase = (id) => {
    setProcsBase(prev => prev.filter(p => p.id !== id));
    // Remove item correspondente do itens
    setItens(prev => prev.filter(it => it.id !== id));
  };

  const editarNomeProcBase = (id, novoNomeVal) => {
    setProcsBase(prev => prev.map(p => p.id === id ? {...p, nome: novoNomeVal} : p));
  };

  // Calcular total
  const calcSubtotal = (item, proc) => {
    if (!item.ativo) return 0;
    if (proc.subtipos) {
      return Object.values(item.subtipos || {}).reduce((acc, st) => acc + parseMoeda(st.valor || "0"), 0);
    }
    const v = parseMoeda(item.valor);
    if (proc.modo === "dente") {
      if (item.valoresDente && Object.keys(item.valoresDente).length > 0) {
        return (item.dentes || []).reduce((acc, n) => acc + parseMoeda(item.valoresDente[n] || item.valor), 0);
      }
      return (item.dentes?.length || 0) * v;
    }
    if (proc.modo === "livre") return v;
    return v * (item.qtd || 1);
  };

  // Sincronizar itens quando procsBase mudar (novos procs adicionados)
  React.useEffect(() => {
    const ids = (p4State.itens || defaultItens).map(it => it.id);
    const novosProcs = procsBase.filter(p => !ids.includes(p.id));
    if (novosProcs.length > 0) {
      setItens(prev => [...(prev || defaultItens), ...novosProcs.map(p => ({
        id: p.id, ativo: false,
        valor: String(p.valorPadrao).replace(".", ","),
        dentes: [], subtipos: {},
        regiao: null, qtd: 1,
      }))]);
    }
  }, [procsBase.length]);

  const totalGeral = [
    ...itens.map((it) => {
      const proc = procsBase.find(p => p.id === it.id);
      return proc ? calcSubtotal(it, proc) : 0;
    }),
    ...customProcs.map(it => {
      if (!it.ativo) return 0;
      const v = parseMoeda(it.valor);
      return it.modo === "dente" ? (it.dentes?.length || 0) * v : v;
    }),
  ].reduce((a, b) => a + b, 0);

  React.useEffect(() => { if(onTotalChange) onTotalChange(totalGeral); }, [totalGeral]);
  const itensAtivos = [...itens.filter(it => it.ativo), ...customProcs.filter(it => it.ativo)];

  return (
    <div style={{ fontFamily: "'Outfit',system-ui,sans-serif", background: CREAM, minHeight: "100vh", paddingBottom: 40 }}>

      <div style={{ maxWidth: 620, margin: "0 auto", padding: "20px 16px" }}>

        {/* Total flutuante */}
        {totalGeral > 0 && (
          <div style={{
            background: "linear-gradient(135deg,#3D1F4E,#2A1538)", borderRadius: 4,
            padding: "14px 18px", marginBottom: 16,
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_LIGHT, marginBottom: 3 }}>
                Total do Tratamento
              </div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>
                {itensAtivos.length} procedimento{itensAtivos.length !== 1 ? "s" : ""} selecionado{itensAtivos.length !== 1 ? "s" : ""}
              </div>
            </div>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 28, fontWeight: 700, color: "#fff" }}>
              {fmt(totalGeral)}
            </div>
          </div>
        )}

        {/* Procedimentos — chips igual achados clínicos */}
        <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 4, padding: 18, marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, paddingBottom: 12, borderBottom: "1px solid " + BORDER }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 11, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700 }}>Plano de Tratamento</span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <div onClick={() => setEditandoProcs(!editandoProcs)} style={{ fontSize: 11, color: editandoProcs ? "#fff" : GOLD_DARK, cursor: "pointer", padding: "5px 14px", border: "1.5px solid " + GOLD, borderRadius: 20, background: editandoProcs ? GOLD_DARK : "#fff", fontWeight: 600 }}>
                {editandoProcs ? "✓ Concluir" : "✎ Editar"}
              </div>
            </div>
          </div>

          {/* Chips de procedimentos — igual achados clínicos */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
            {[...procsBase, ...customProcs.map(c => ({...c, isCustom: true}))].map((proc, idx) => {
              const isCustom = proc.isCustom;
              const itemIdx = isCustom ? -1 : itens.findIndex(it => it.id === proc.id);
              const item = isCustom
                ? customProcs.find(c => c.id === proc.id)
                : (itens[itemIdx] || { id: proc.id, ativo: false, valor: String(proc.valorPadrao||0).replace(".", ","), dentes: [], subtipos: {}, regiao: null, qtd: 1 });
              const ativo = item?.ativo || false;
              const customIdx = isCustom ? customProcs.findIndex(c => c.id === proc.id) : -1;
              return (
                <div key={proc.id} style={{ position: "relative" }}>
                  {editandoProcs && (
                    <div onClick={() => isCustom ? removerCustom(customIdx) : removerProcBase(proc.id)}
                      style={{ position: "absolute", top: -6, right: -6, width: 16, height: 16, borderRadius: "50%", background: "#9A8060", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", zIndex: 10, lineHeight: 1 }}>✕</div>
                  )}
                  <div
                    onClick={() => {
                      if (editandoProcs) return;
                      const newAtivo = !ativo;
                      if (isCustom) {
                        atualizarCustom(customIdx, { ...item, ativo: newAtivo });
                      } else if (itemIdx >= 0) {
                        atualizarItem(itemIdx, { ...item, ativo: newAtivo });
                      } else {
                        setItens(prev => [...(prev || []), { id: proc.id, ativo: true, valor: String(proc.valorPadrao||0).replace(".", ","), dentes: [], subtipos: {}, regiao: null, qtd: 1 }]);
                      }
                    }}
                    style={{
                      padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer",
                      border: "2px solid " + (ativo ? GOLD_DARK : BORDER),
                      background: ativo ? GOLD : "#fff",
                      color: ativo ? "#fff" : "#5C4A2A",
                      fontWeight: ativo ? 700 : 400,
                      display: "flex", alignItems: "center", gap: 6,
                      transition: "all 0.15s",
                    }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: ativo ? "#fff" : BORDER, flexShrink: 0 }} />
                    {editandoProcs ? (
                      <input
                        spellCheck={false} style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, fontWeight: ativo ? 700 : 400, color: ativo ? "#fff" : "#5C4A2A", fontFamily: "inherit", width: Math.max(60, proc.nome.length * 7) + "px", cursor: "text" }}
                        value={proc.nome}
                        onClick={e => e.stopPropagation()}
                        onChange={e => isCustom
                          ? atualizarCustom(customIdx, { ...customProcs[customIdx], nome: e.target.value })
                          : editarNomeProcBase(proc.id, e.target.value)
                        }
                      />
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span>{proc.nome}</span>
                        {(ativo || (isCustom && editandoProcs)) && !proc.subtipos && (
                          <div onClick={e => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                            <span style={{ fontSize: 10, color: ativo?"rgba(255,255,255,0.7)":"#9A8060", marginLeft: 4 }}>R$</span>
                            <input
                              style={{ width: 64, padding: "2px 4px", background: ativo?"rgba(255,255,255,0.15)":"rgba(0,0,0,0.04)", border: "1px solid "+(ativo?"rgba(255,255,255,0.3)":BORDER), borderRadius: 3, fontSize: 11, fontWeight: 700, color: ativo?"#fff":"#5C4A2A", outline: "none", fontFamily: "inherit", textAlign: "right" }}
                              value={isCustom?(customProcs[customIdx]?.valor||""):(item?.valor || "")}
                              onChange={e => {
                                const v = e.target.value.replace(/[^0-9,]/g, "");
                                if (isCustom) atualizarCustom(customIdx, {...customProcs[customIdx], valor:v});
                                else { const idx2 = itens.findIndex(x => x.id === proc.id); if(idx2>=0) atualizarItem(idx2, {...item, valor:v}); }
                              }}
                              placeholder="0,00"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {/* Botão + Novo */}
            {editandoProcs && (
              <div onClick={() => setMostrarForm(true)} style={{ padding: "7px 14px", borderRadius: 20, fontSize: 12, cursor: "pointer", border: "2px dashed " + BORDER, color: GOLD_DARK, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                + Novo
              </div>
            )}
          </div>

          {/* Painel de detalhe do procedimento selecionado */}
          {itens.filter(it => it.ativo).map((it) => {
            const proc = procsBase.find(p => p.id === it.id);
            if (!proc) return null;
            const itemIdx = itens.findIndex(x => x.id === it.id);
            return (
              <div key={it.id} style={{ marginBottom: 10, border: "1px solid " + GOLD_LIGHT, borderRadius: 4, overflow: "hidden" }}>
                <ProcedimentoItem
                  proc={proc}
                  item={it}
                  onChange={novo => atualizarItem(itemIdx, novo)}
                />
              </div>
            );
          })}
          {customProcs.filter(it => it.ativo).map((it, i) => {
            const proc = { id: it.id, nome: it.nome, modo: it.modo, valorPadrao: 0 };
            return (
              <div key={it.id} style={{ marginBottom: 10, border: "1px solid " + GOLD_LIGHT, borderRadius: 4, overflow: "hidden" }}>
                <ProcedimentoItem
                  proc={proc}
                  item={it}
                  editavel={true}
                  onChange={novo => {
                    // Se modo mudou, atualizar também no proc via atualizarCustom
                    if(novo.modo && novo.modo !== proc.modo) {
                      atualizarCustom(i, {...novo});
                    } else {
                      atualizarCustom(i, novo);
                    }
                  }}
                />
              </div>
            );
          })}
        </div>

        {/* Formulário adicionar — só aparece quando mostrarForm ativo */}
        {mostrarForm && <div style={{ background: "#fff", border: "1px solid " + GOLD, borderRadius: 4, padding: 18, marginBottom: 14 }}>
          <SectionTitle>Novo Procedimento</SectionTitle>
          {true && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 600 }}>Nome do procedimento</label>
                <input
                  style={{ padding: "10px 12px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 13, outline: "none", fontFamily: "inherit" }}
                  value={novoNome}
                  onChange={e => setNovoNome(e.target.value)}
                  spellCheck={false} placeholder="Ex: Faceta de porcelana"
                  autoFocus
                />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 600 }}>Valor (R$)</label>
                  <input
                    style={{ padding: "10px 12px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 13, outline: "none", fontFamily: "inherit" }}
                    value={novoValor}
                    onChange={e => setNovoValor(e.target.value.replace(/[^0-9,]/g, ""))}
                    placeholder="0,00"
                  />
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                  <label style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 600 }}>Tipo</label>
                  <select
                    style={{ padding: "10px 12px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 12, outline: "none", fontFamily: "inherit", cursor: "pointer" }}
                    value={novoModo}
                    onChange={e => setNovoModo(e.target.value)}
                  >
                    <option value="dente">Por dente</option>
                    <option value="regiao">Por região</option>
                    <option value="livre">Valor livre</option>
                  </select>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <label style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 600 }}>Observação / Descrição</label>
                <textarea
                  spellCheck="true" lang="pt-BR" autoCorrect="on" autoCapitalize="sentences"
                  style={{ padding: "10px 12px", border: "1px solid " + BORDER, borderRadius: 2, fontSize: 12, fontFamily: "inherit", resize: "vertical", minHeight: 60, color: "#1C1410" }}
                  value={novoObs}
                  onChange={e => setNovoObs(e.target.value)}
                  placeholder="Descrição, materiais, observações clínicas..."
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <div onClick={()=>adicionarCustom(false)} style={{
                  flex: 1, padding: "10px", borderRadius: 3, background: GOLD,
                  color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer", textAlign: "center",
                }}>+ Adicionar (este atendimento)</div>
                <div onClick={()=>adicionarCustom(true)} style={{
                  flex: 1, padding: "10px", borderRadius: 3, background: GOLD_DARK,
                  color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer", textAlign: "center",
                }}>⭐ Salvar como padrão</div>
                <div onClick={() => { setMostrarForm(false); setNovoNome(""); setNovoValor(""); }} style={{
                  padding: "10px 16px", borderRadius: 3, border: "1px solid " + BORDER,
                  color: "#9A8060", fontSize: 12, cursor: "pointer", textAlign: "center",
                }}>Cancelar</div>
              </div>
            </div>
          )}
        </div>}

        {/* Resumo */}
        {itensAtivos.length > 0 && (
          <div style={{ background: "#fff", border: "1px solid " + BORDER, borderRadius: 4, padding: 18 }}>
            <SectionTitle>Resumo do Plano</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {itens.filter(it => it.ativo).map((it) => {
                const proc = procsBase.find(p => p.id === it.id);
                if (!proc) return null;
                const sub = calcSubtotal(it, proc);
                const desc = proc.subtipos
                  ? Object.keys(it.subtipos||{}).map(id=>proc.subtipos.find(s=>s.id===id)?.label).filter(Boolean).join(" + ")||"—"
                  : proc.modo === "dente"
                  ? (it.dentes?.length > 0 ? it.dentes.sort((a,b)=>a-b).join(", ") + (it.dentes.length > 1 ? ` (${it.dentes.length}x)` : "") : "—")
                  : (it.regiao === "boca" ? "Boca toda" : it.regiao === "sup" ? "Arcada superior" : "Arcada inferior");
                return (
                  <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid " + BORDER }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1C1410" }}>{proc.nome}</div>
                      <div style={{ fontSize: 10, color: "#9A8060", marginTop: 2 }}>{desc}</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GOLD_DARK, flexShrink: 0, marginLeft: 12 }}>{fmt(sub)}</div>
                  </div>
                );
              })}
              {customProcs.filter(it => it.ativo).map(it => {
                const v = parseMoeda(it.valor);
                const sub = it.modo === "dente" ? (it.dentes?.length || 0) * v : v;
                const desc = it.modo === "dente"
                  ? (it.dentes?.length > 0 ? it.dentes.sort((a,b)=>a-b).join(", ") : "—")
                  : it.modo === "livre" ? ""
                  : (it.regiao === "boca" ? "Boca toda" : it.regiao === "sup" ? "Arcada superior" : "Arcada inferior");
                return (
                  <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid " + BORDER }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1C1410" }}>{it.nome}</div>
                      {desc && <div style={{ fontSize: 10, color: "#9A8060", marginTop: 2 }}>{desc}</div>}
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: GOLD_DARK, flexShrink: 0, marginLeft: 12 }}>{fmt(sub)}</div>
                  </div>
                );
              })}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 12, marginTop: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#1C1410", letterSpacing: 1 }}>TOTAL</span>
                <span style={{ fontFamily: "Georgia,serif", fontSize: 22, fontWeight: 700, color: GOLD_DARK }}>{fmt(totalGeral)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
function descreverRegiao(dentes, comNomes=false) {
  const sup = [18,17,16,15,14,13,12,11,21,22,23,24,25,26,27,28];
  const inf = [48,47,46,45,44,43,42,41,31,32,33,34,35,36,37,38];
  const antSup = [13,12,11,21,22,23], antInf = [43,42,41,31,32,33];
  const pdSup = [18,17,16,15,14], pdInf = [48,47,46,45,44];
  const peSup = [28,27,26,25,24], peInf = [38,37,36,35,34];
  const dentesSet = new Set(dentes);
  const todosEm = arr => arr.every(d => dentesSet.has(d));
  const algumEm = arr => arr.some(d => dentesSet.has(d));
  if (todosEm([...sup,...inf])) return "Boca toda";
  if (todosEm(sup) && !algumEm(inf)) return "Arcada superior";
  if (todosEm(inf) && !algumEm(sup)) return "Arcada inferior";
  const partes = [];
  const antSupOk = todosEm(antSup), antInfOk = todosEm(antInf);
  const pdSupOk = todosEm(pdSup), pdInfOk = todosEm(pdInf);
  const peSupOk = todosEm(peSup), peInfOk = todosEm(peInf);
  if (antSupOk && antInfOk) partes.push("Região anterior");
  else if (antSupOk) partes.push("Anterior superior");
  else if (antInfOk) partes.push("Anterior inferior");
  if (pdSupOk && pdInfOk) partes.push("Post. direita");
  else if (pdSupOk) partes.push("Post. direita superior");
  else if (pdInfOk) partes.push("Post. direita inferior");
  if (peSupOk && peInfOk) partes.push("Post. esquerda");
  else if (peSupOk) partes.push("Post. esquerda superior");
  else if (peInfOk) partes.push("Post. esquerda inferior");
  if (partes.length > 0) return partes.join(", ");
  if(comNomes) return dentes.sort((a,b)=>a-b).map(n=>nomeDente(n)).join("\n");
  return "Dente"+(dentes.length>1?"s":"")+": "+dentes.sort((a,b)=>a-b).join(", ");
}


// ── RELATÓRIO COMPLETO ──
const ACHADOS_MAP = {gengivite:"Gengivite",carie_ativa:"Cárie ativa",suspeita_carie:"Suspeita de cárie",perda_ossea:"Perda óssea",retracao:"Retração gengival",desgaste:"Desgaste dentário",erosao:"Erosão dentária",fratura:"Fratura dentária",ausente:"Dentes ausentes"};
const ACH_CORES = {gengivite:"#E57373",carie_ativa:"#8D6E63",suspeita_carie:"#FFB74D",perda_ossea:"#7986CB",retracao:"#F06292",desgaste:"#4DB6AC",erosao:"#81C784",fratura:"#FF8A65",ausente:"#90A4AE"};

// v3.0
function Relatorio({p1,p2,p3,p4State,onSalvar,salvoOk,isPreview=false,onSetModoRel,onCarregarDrive}) {
  const _driveData = React.useMemo(()=>({
    id: Date.now(),
    data: new Date().toISOString(),
    paciente: p1.nome||"Sem nome",
    cpf: p1.cpf||"",
    telefone: p1.telefone||"",
    dataNasc: p1.dataNasc||"",
    responsavel: p1.responsavel||"",
    dataConsulta: p1.dataConsulta||new Date().toISOString().slice(0,10),
    valorTotal: parseFloat(p3.vb)||0,
    _p1:p1, _p2:p2, _p3:p3, _p4:p4State,
  }),[p1,p2,p3,p4State]);
  const {nome,cpf,telefone,dataNasc,idade,isMinor,respNome,respCpf,dataConsulta,responsavel} = p1;
  const {achadosDente={},obsTexto=""} = p2;
  const {vb,ds,dc,fc,bm,bp,bj,bi,ci,entrada=false,entradaTipo="pct",entradaVal="0",saldoTipo="parcelado",ct=true,bt=true,plano="dias14",quemPaga="comprador",boletoComDesconto=false} = p3;
  const dp = ds===-1?(parseFloat(dc)||0):ds;
  const vB = parseFloat(String(vb).replace(",","."))||0;
  const vF = dp>0 ? vB*(1-dp/100) : vB;
  // Entrada sempre sobre vB (valor base sem desconto) — desconto só aplica no pagamento total à vista
  const baseEntradaRel = entrada ? vB : vF;
  const entradaValor2=entrada?(entradaTipo==="pct"?baseEntradaRel*(parseFloat(entradaVal)||0)/100:(parseFloat(String(entradaVal).replace(",","."))||0)):0;
  const saldo2=entrada?Math.max(0,baseEntradaRel-entradaValor2):vF;
  const nb = parseInt(bp)||1, nic = parseInt(ci)||0;
  // Crédito sempre usa valor SEM desconto (PagBank não permite desconto no crédito)
  const baseCreditoSemDesc=(entrada&&entradaValor2>0&&saldoTipo==="parcelado")
    ?(entrada?Math.max(0,vB-(entrada?(entradaTipo==="pct"?vB*(parseFloat(entradaVal)||0)/100:(parseFloat(String(entradaVal).replace(",","."))||0)):0)):vB)
    :vB;
  const creditoBaseRel=(entrada&&entradaValor2>0&&saldoTipo==="parcelado")?baseCreditoSemDesc:vB;
  const tC = creditoBaseRel>0?[1,2,3,4,5,6,7,8,9,10,11,12].map(n=>{const r=calcCreditoPlano(creditoBaseRel,n,plano,quemPaga);return{n,...r};}):[];

  const defaultItensRel = PROC_BASE.map(p => ({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],subtipos:{},regiao:p.id==="profilaxia"?"boca":p.id==="clareamento"?"boca":null,qtd:1}));
  const procsBaseRel = p4State?.procsBase || PROC_BASE.map(p => ({...p}));
  const p4Itens = (p4State?.itens || defaultItensRel).filter(it => it.ativo);
  const p4Custom = (p4State?.customProcs || []).filter(it => it.ativo);
  const temPlano = p4Itens.length > 0 || p4Custom.length > 0;

  // Helper: describe dente set as regions instead of numbers


  const achadosList = p2.achados || ACHADOS_DEFAULT;
  const resumoAch = achadosList.map(a => ({
    id: a.id, lb: a.label, cor: a.cor,
    dentes: Object.entries(achadosDente).filter(([k,v])=>k!=="_geral"&&v&&v[a.id]).map(([d])=>parseInt(d)).sort((a,b)=>a-b),
    geral: achadosDente["_geral"]?.[a.id]||false
  })).filter(a=>a.dentes.length>0||a.geral);

  const fmt2 = v => "R$ "+(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const dataFmt = d => d ? new Date(d+"T12:00:00").toLocaleDateString("pt-BR") : "—";

  const temDados = nome || cpf || responsavel;
  const temAval = resumoAch.length > 0 || obsTexto;
  const temOrc = fc.length > 0 && vB > 0;

  if (!temDados && !temAval && !temOrc) return (
    <div style={{maxWidth:640,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{padding:30,background:"#fff",border:"1px solid "+BORDER,borderRadius:4,textAlign:"center",color:"#9A8060",fontSize:13}}>
        Preencha os dados nas abas Paciente, Avaliação e Orçamento para gerar o relatório.
      </div>
    </div>
  );

  return (
    <div className="relatorio-outer" style={{maxWidth:680,margin:"0 auto",padding:"8px 16px 40px"}}>
      <div className="relatorio-container" style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,display:"flex",flexDirection:"column",minHeight:"calc(100vh - 80px)"}}>

        {/* Cabeçalho */}
        <div className="rel-header" style={{position:"relative",overflow:"hidden",padding:"22px 28px 18px",borderBottom:"2px solid "+GOLD}}>
          <svg style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox="0 0 680 80" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
            <polygon points="0,0 480,0 680,80 200,80" fill="#5B2D6E" opacity="0.06"/>
            <line x1="0" y1="0" x2="200" y2="80" stroke="#5B2D6E" strokeWidth="2.5" opacity="0.30"/>
            <line x1="480" y1="0" x2="680" y2="80" stroke="#5B2D6E" strokeWidth="2.5" opacity="0.30"/>
            <polygon points="80,0 560,0 680,48 200,48" fill="#B8962E" opacity="0.05"/>
            <line x1="80" y1="0" x2="200" y2="48" stroke="#B8962E" strokeWidth="1.8" opacity="0.25"/>
            <line x1="560" y1="0" x2="680" y2="48" stroke="#B8962E" strokeWidth="1.8" opacity="0.25"/>
          </svg>
          <div style={{position:"relative",zIndex:1,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div style={{display:"flex",alignItems:"center",gap:14}}>
              <svg width="42" height="42" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="20" cy="20" r="14" stroke={GOLD} strokeWidth="1.3" fill="none"/>
                <rect x="31.50" y="17.50" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(0 34 20)"/>
                <rect x="27.40" y="27.40" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(45 29.9 29.9)"/>
                <rect x="17.50" y="31.50" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(90 20 34)"/>
                <rect x="7.60" y="27.40" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(135 10.1 29.9)"/>
                <rect x="3.50" y="17.50" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(180 6 20)"/>
                <rect x="7.60" y="7.60" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(225 10.1 10.1)"/>
                <rect x="17.50" y="3.50" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(270 20 6)"/>
                <rect x="27.40" y="7.60" width="5" height="5" rx="0.8" fill={GOLD_DARK} transform="rotate(315 29.9 10.1)"/>
              </svg>
              <div>
                <div style={{fontFamily:"Georgia,serif",fontSize:22,fontWeight:400,color:"#5B2D6E",letterSpacing:5,textTransform:"uppercase",lineHeight:1}}>Íntegra</div>
                <div style={{fontSize:8,letterSpacing:2.5,color:"#7B4D8E",textTransform:"uppercase",marginTop:3}}>Clínica Odontológica <span style={{color:"#9A8060",marginLeft:4}}>· Desde 1996</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="rel-content" style={{padding:"22px 24px",flex:1}}>

          {/* Dados do Paciente */}
          {temDados && <>
            <div className="rel-section-title" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <span style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:PURPLE,fontWeight:700}}>Dados do Paciente</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:6}}>
              {[
                ["Paciente",nome||"—"],
                ["CPF",cpf||"—"],
                ["Telefone",telefone||"—"],
                ["Data de nascimento",dataNasc?dataFmt(dataNasc)+(idade?" ("+idade+")":""):"—"],
                ["Responsável clínico",responsavel||"—"],
                ["Data da consulta",dataFmt(dataConsulta)],
              ].map(([l,v])=>(
                <div key={l} style={{padding:"7px 10px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
                  <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:13,color:"#5C4A2A",fontWeight:500}}>{v}</div>
                </div>
              ))}
            </div>
            {isMinor && respNome && (
              <div style={{padding:"9px 12px",background:"rgba(91,45,142,0.05)",border:"1px solid rgba(91,45,142,0.2)",borderRadius:3,marginBottom:8}}>
                <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:PURPLE,fontWeight:600,marginBottom:3}}>Responsável Legal</div>
                <div style={{fontSize:13,color:"#5C4A2A"}}>{respNome} {respCpf?"· CPF: "+respCpf:""}</div>
              </div>
            )}
          </>}

          {/* Avaliação Clínica */}
          {temAval && <>
            <div className="rel-section-title" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:PURPLE,fontWeight:700}}>Avaliação Clínica</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            {resumoAch.length>0 && <div style={{display:"flex",flexDirection:"column",gap:4,marginBottom:12}}>
              {resumoAch.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"stretch",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:3,background:PURPLE,flexShrink:0}}/>
                  <div style={{flex:1,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div>
                      <span style={{fontSize:13,fontWeight:600,color:"#5C4A2A"}}>{a.lb}</span>
                      {(p2.obsAchados||{})[a.id]&&<div style={{fontSize:11,color:"#7A6020",fontStyle:"italic",marginTop:2}}>{(p2.obsAchados||{})[a.id]}</div>}
                    </div>
                    <div style={{fontSize:11,color:"#9A8060",textAlign:"right",whiteSpace:"pre-line",maxWidth:"50%"}}>{a.dentes.length>0?descreverRegiao(a.dentes,true):""}</div>
                  </div>
                </div>
              ))}
            </div>}
            {obsTexto && <div style={{padding:"12px 14px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3,fontSize:13,color:"#5C4A2A",lineHeight:1.7}}>
              <div style={{fontSize:10,letterSpacing:1.5,textTransform:"uppercase",color:PURPLE,fontWeight:600,marginBottom:6}}>Informações Clínicas</div>
              {obsTexto}
            </div>}
          </>}

          {/* Plano de Tratamento */}
          {temPlano && <>
            <div className="rel-section-title" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:PURPLE,fontWeight:700}}>Plano de Tratamento</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {[...p4Itens.map(it => {
                const proc = procsBaseRel.find(p=>p.id===it.id) || PROC_BASE.find(p=>p.id===it.id);
                if(!proc) return null;
                const v = parseMoeda(it.valor);
                const sub = proc.subtipos
                  ? Object.values(it.subtipos||{}).reduce((a,s)=>a+parseMoeda(s.valor||"0"),0)
                  : proc.modo==="dente"
                    ? (it.valoresDente&&Object.keys(it.valoresDente).length>0
                        ? (it.dentes||[]).reduce((a,n)=>a+parseMoeda((it.valoresDente||{})[n]||it.valor),0)
                        : (it.dentes?.length||0)*v)
                    : v;
                const desc = proc.subtipos
                  ? Object.keys(it.subtipos||{}).map(id=>proc.subtipos.find(s=>s.id===id)?.label).filter(Boolean).join(" + ")||"—"
                  : proc.modo==="dente"?(it.dentes?.length>0?it.dentes.sort((a,b)=>a-b).map(n=>{const vd=it.valoresDente&&it.valoresDente[n];return nomeDente(n)+(vd&&vd!==it.valor?" — "+fmt2(parseMoeda(vd)):"");}).join("\n"):"—")
                  :(it.regiao==="boca"?"Boca toda":it.regiao==="sup"?"Arcada superior":"Arcada inferior");
                return (<div key={it.id} className="rel-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#5C4A2A"}}>{proc.nome}</div>
                    <div style={{fontSize:11,color:"#9A8060",marginTop:1,whiteSpace:"pre-line"}}>{desc}</div>
                    {it.obs&&<div style={{fontSize:11,color:"#7A6020",fontStyle:"italic",marginTop:2}}>{it.obs}</div>}
                    {(it.subtopicos||[]).length>0&&<div style={{marginTop:4,paddingLeft:8,borderLeft:"2px solid "+BORDER}}>
                      {(it.subtopicos||[]).map((st,si)=>st.trim()&&<div key={si} style={{fontSize:11,color:"#5C4A2A",marginTop:2}}>{si+1}. {st}</div>)}
                    </div>}

                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK,flexShrink:0,marginLeft:12}}>{fmt2(sub)}</div>
                </div>)
              }),
              ...p4Custom.map(it => {
                const v = parseMoeda(it.valor);
                const sub = it.modo==="dente" && it.dentes?.length > 0
                  ? (it.valoresDente&&Object.keys(it.valoresDente).length>0
                      ? (it.dentes||[]).reduce((a,n)=>a+parseMoeda((it.valoresDente||{})[n]||it.valor),0)
                      : it.dentes.length*v)
                  : v;
                const desc = it.modo==="livre" ? "" : it.modo==="dente"?(it.dentes?.length>0?it.dentes.sort((a,b)=>a-b).map(n=>nomeDente(n)).join("\n"):"—"):(it.regiao==="boca"?"Boca toda":it.regiao==="sup"?"Arcada superior":it.regiao==="inf"?"Arcada inferior":"—");
                return (<div key={it.id} className="rel-card" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
                  <div>
                    <div style={{fontSize:13,fontWeight:600,color:"#5C4A2A"}}>{it.nome}</div>
                    <div style={{fontSize:11,color:"#9A8060",marginTop:1,whiteSpace:"pre-line"}}>{desc}</div>
                    {it.obs&&<div style={{fontSize:11,color:"#7A6020",fontStyle:"italic",marginTop:2}}>{it.obs}</div>}
                    {(it.subtopicos||[]).length>0&&<div style={{marginTop:4,paddingLeft:8,borderLeft:"2px solid "+BORDER}}>
                      {(it.subtopicos||[]).map((st,si)=>st.trim()&&<div key={si} style={{fontSize:11,color:"#5C4A2A",marginTop:2}}>{si+1}. {st}</div>)}
                    </div>}
                  </div>
                  <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK,flexShrink:0,marginLeft:12}}>{fmt2(sub)}</div>
                </div>)
              })].filter(Boolean)}
            </div>
          </>}

          {/* Propostas individuais por procedimento */}
          {(()=>{
            const itensSep = [...(p4State?.itens||[]).filter(it=>it.ativo&&it.proposta),...(p4State?.customProcs||[]).filter(it=>it.ativo&&it.proposta)];
            if(!itensSep.length) return null; if((p3.modoRel||"soma")!=="separado"&&(p3.modoRel||"soma")!=="ambos") return null;
            return(
              <div style={{marginTop:16}}>
                <div className="rel-section-title" style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
                  <span style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:PURPLE,fontWeight:700}}>Propostas Individuais</span>
                  <div style={{flex:1,height:1,background:BORDER}}/>
                </div>
                {itensSep.map((it,idx)=>{
                  const proc=(p4State?.procsBase||PROC_BASE).find(p=>p.id===it.id)||{nome:it.nome||it.id};
                  const prop=it.proposta;
                  const vb2=parseFloat(String(prop.vb||0).replace(",","."))||0;
                  const dp2=prop.ds||0;
                  const vf2=dp2>0?vb2*(1-dp2/100):vb2;
                  // Entrada individual
                  const propEntrada=prop.entrada||false;
                  const propEntradaTipo=prop.entradaTipo||"pct";
                  const propEntradaValCalc=parseFloat(String(prop.entradaVal||"0").replace(",","."))||0;
                  const propBaseEntrada=propEntrada?vb2:vf2;
                  const propEntradaValor=propEntrada?(propEntradaTipo==="pct"?propBaseEntrada*propEntradaValCalc/100:propEntradaValCalc):0;
                  const propSaldo=propEntrada?Math.max(0,propBaseEntrada-propEntradaValor):vf2;
                  const nomes2={pix:"PIX",dinheiro:"Dinheiro",credito:"Cartão de crédito",boleto:"Boleto parcelado"};
                  return(
                    (()=>{
                      // Calcular parcelas do cartão para esta proposta
                      const propPlano = prop.plano||"hora";
                      const propQuem = prop.quemPaga||"comprador";
                      const propCi = parseInt(prop.ci||"0");
                      const propCp = prop.cp ? parseInt(prop.cp) : null;
                      const creditoBaseRel=(propEntrada&&propEntradaValor>0&&(prop.saldoTipo||"parcelado")==="parcelado")?propSaldo:vb2;
                      const tCprop = (prop.fc&&prop.fc.includes("credito"))
                        ? [1,2,3,4,5,6,7,8,9,10,11,12].map(n=>{const r=calcCreditoPlano(creditoBaseRel,n,propPlano,propQuem);return{n,...r};})
                        : [];
                      const tCfilt = propCp ? tCprop.filter(r=>r.n===1||r.n<=propCp) : tCprop;
                      // Boleto
                      const propBp = parseInt(prop.bp||"6");
                      const propBj = prop.bj||"sem_juros";
                      const propBi = parseInt(prop.bi||"3");
                      const bBaseR=prop.boletoComDesconto?vf2:vb2;
                      const boletoLs = prop.fc&&prop.fc.includes("boleto")&&(prop.bm||"avista")==="parcelado"
                        ? Array.from({length:propBp},(_,i)=>{
                            const n=i+1,nl=propBj==="sem_juros"?propBp:propBj==="com_juros"?0:propBi;
                            const sj=n<=nl,pc=propBj==="combinado"?Math.max(0,n-nl):sj?0:n;
                            const t=sj?bBaseR:bBaseR*(1+0.012*pc);
                            return{n,p:t/n,sj,t};
                          })
                        : [];
                      return(
                        <div key={idx} style={{marginBottom:10,border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                          <div style={{padding:"8px 14px",background:"#F5F2EC",borderBottom:"1px solid "+BORDER,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                            <span style={{fontSize:13,fontWeight:700,color:"#5C4A2A"}}>{proc.nome}</span>
                            <div style={{textAlign:"right"}}>
                              <span style={{fontSize:14,fontWeight:700,color:GOLD_DARK}}>{fmt2(vf2)}</span>
                              {dp2>0&&<span style={{fontSize:11,color:"#9A8060",marginLeft:6}}>({dp2}% desc. sobre {fmt2(vb2)})</span>}
                            </div>
                          </div>
                          {/* Entrada individual */}
                          {propEntrada&&propEntradaValor>0&&(
                            <div style={{padding:"6px 14px",fontSize:11,color:GOLD_DARK,borderBottom:"1px solid "+BORDER,background:GOLD_PALE}}>
                              <div style={{display:"flex",justifyContent:"space-between"}}><span style={{fontWeight:700}}>Entrada</span><span style={{fontWeight:700}}>{fmt2(propEntradaValor)}{propEntradaTipo==="pct"?" ("+prop.entradaVal+"%)":""}</span></div>
                              <div style={{display:"flex",justifyContent:"space-between",marginTop:2,color:"#9A8060"}}><span>Valor remanescente</span><span>{fmt2(propSaldo)}</span></div>
                            </div>
                          )}
                          {/* À vista / PIX */}
                          {prop.fc&&(prop.fc.includes("pix")||prop.fc.includes("dinheiro"))&&(
                            <div style={{padding:"6px 14px",fontSize:11,color:"#5C4A2A",borderBottom:tCfilt.length||boletoLs.length?"1px solid "+BORDER:"none"}}>
                              {[prop.fc.includes("pix")&&"PIX",prop.fc.includes("dinheiro")&&"Dinheiro"].filter(Boolean).join(" · ")} — {fmt2(propEntrada&&propEntradaValor>0?propSaldo:vf2)}
                            </div>
                          )}
                          {/* Cartão */}
                          {tCfilt.length>0&&(
                            <div style={{borderBottom:boletoLs.length?"1px solid "+BORDER:"none"}}>
                              <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:"#5C4A2A",letterSpacing:0.5}}>Cartão de crédito{propCi>0&&<span style={{fontWeight:400,color:"#9A8060",marginLeft:4}}>até {propCi}x sem juros</span>}</div>
                              {(()=>{
                                const meio=Math.ceil(tCfilt.length/2);
                                const col1=tCfilt.slice(0,meio),col2=tCfilt.slice(meio);
                                const rr=(r,i,last)=>{const sj=r.n>1&&r.n<=propCi,p=sj?vf2/r.n:r.parcela,t=sj?vf2:r.total;return(<div key={r.n} style={{display:"flex",gap:6,padding:"4px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:11,fontWeight:700,color:"#5C4A2A",minWidth:28}}>{r.n===1?"Àvista":r.n+"x"}</span><span style={{fontSize:11,color:GOLD_DARK,fontWeight:600,flex:1}}>{r.n===1?fmt2(vb2):fmt2(p)}</span><span style={{fontSize:10,color:sj&&r.n>1?GOLD_DARK:"#9A8060"}}>{r.n===1?"":sj?"s/j":"tot "+fmt2(t)}</span></div>);};
                                return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{col1.map((r,i)=>rr(r,i,i===col1.length-1))}</div><div>{col2.map((r,i)=>rr(r,i,i===col2.length-1))}</div></div>);
                              })()}
                            </div>
                          )}
                          {/* Boleto */}
                          {boletoLs.length>0&&(
                            <div>
                              <div style={{padding:"6px 14px 4px",fontSize:11,fontWeight:700,color:"#5C4A2A"}}>Boleto parcelado</div>
                              {(()=>{
                                const meio=Math.ceil(boletoLs.length/2);
                                const col1=boletoLs.slice(0,meio),col2=boletoLs.slice(meio);
                                const rb=(l,i,last)=>(<div key={l.n} style={{display:"flex",gap:6,padding:"4px 14px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:11,fontWeight:700,color:"#5C4A2A",minWidth:28}}>{l.n+"x"}</span><span style={{fontSize:11,color:GOLD_DARK,fontWeight:600,flex:1}}>{fmt2(l.p)}</span><span style={{fontSize:10,color:l.sj?GOLD_DARK:"#9A8060"}}>{l.sj?"s/j":"tot "+fmt2(l.t)}</span></div>);
                                return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{col1.map((l,i)=>rb(l,i,i===col1.length-1))}</div><div>{col2.map((l,i)=>rb(l,i,i===col2.length-1))}</div></div>);
                              })()}
                            </div>
                          )}
                          {prop.obs&&<div style={{padding:"5px 14px 8px",fontSize:11,color:"#9A8060",fontStyle:"italic"}}>{prop.obs}</div>}
                        </div>
                      );
                    })()
                  );
                })}
              </div>
            );
          })()}

          {/* Proposta Financeira */}
          {temOrc && (()=>{
            const cpSel = p3.cp ? parseInt(p3.cp) : null;
            const tCFiltrado = cpSel ? tC.filter(r=>r.n===1||r.n<=cpSel) : tC;

            // Verificar quais alternativas existem
            const formasAv = ["pix","dinheiro","debito"].filter(id=>fc.includes(id));
            const bolAv = fc.includes("boleto") && bm==="avista";
            const temAVista = formasAv.length > 0 || bolAv;
            const temParcelado = fc.includes("credito") || (fc.includes("boleto") && bm==="parcelado");
            const duasAlternativas = temAVista && temParcelado;
            const nomes = {pix:"PIX", dinheiro:"Dinheiro", debito:"Cartão de débito", boleto:"Boleto"};

            const LabelAlternativa = ({num, titulo}) => (
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
                {duasAlternativas&&<div style={{width:22,height:22,borderRadius:"50%",background:PURPLE,color:"#fff",fontSize:11,fontWeight:700,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{num}</div>}
                <span style={{fontSize:11,fontWeight:700,color:"#5C4A2A",letterSpacing:1,textTransform:"uppercase"}}>{titulo}</span>
                <div style={{flex:1,height:1,background:BORDER}}/>
              </div>
            );

            return (<>
            <div className="rel-section-title" style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:11,letterSpacing:2.5,textTransform:"uppercase",color:PURPLE,fontWeight:700}}>Proposta de Investimento</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>

            {((p3.modoRel||"soma")==="soma"||(p3.modoRel||"soma")==="ambos")&&<>
            {/* ALTERNATIVA 1 — À vista com valor e desconto incorporados */}
            {temAVista && (()=>{
              const lb = [...formasAv,...(bolAv?["boleto"]:[])].map(id=>nomes[id]).join(" · ");
              return(
                <div style={{marginBottom:14}}>
                  <LabelAlternativa num="1" titulo="Pagamento à vista"/>
                  <div style={{padding:"12px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                        {dp>0?(
                          <>
                            <span style={{fontSize:13,color:GOLD_DARK}}>{fmt2(vB)}</span>
                            <span style={{fontSize:11,color:"#9A8060"}}>→</span>
                            <span style={{fontSize:13,color:GOLD_DARK}}>{fmt2(vF)}</span>
                            <span style={{fontSize:11,color:"#9A8060"}}>({dp}% de desconto)</span>
                          </>
                        ):(
                          <span style={{fontSize:13,color:GOLD_DARK}}>{fmt2(vF)}</span>
                        )}
                      </div>
                      {lb&&<span style={{fontSize:13,fontWeight:600,color:GOLD_DARK,flexShrink:0}}>{lb}</span>}
                    </div>
                    {fc.includes("debito")&&<div style={{fontSize:10,color:"#9A8060",marginTop:3}}>Taxa 1,99% PagBank no débito</div>}
                  </div>
                </div>
              );
            })()}

            {/* ALTERNATIVA 2 — Parcelado */}
            {temParcelado && (()=>{
              return(
                <div style={{marginBottom:8}}>
                  <LabelAlternativa num="2" titulo={entrada&&entradaValor2>0?"Com entrada e parcelamento":"Parcelamento"}/>

                  {/* Entrada */}
                  {entrada && entradaValor2>0 && (
                    <div style={{padding:"10px 14px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,marginBottom:8}}>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:3}}>
                        <span style={{color:GOLD_DARK,fontWeight:600}}>Entrada</span>
                        <span style={{color:GOLD_DARK,fontWeight:700}}>{fmt2(entradaValor2)}{entradaTipo==="pct"?" ("+entradaVal+"%)":""}</span>
                      </div>
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                        <span style={{color:"#9A8060"}}>{saldoTipo==="entrega"?"Saldo na entrega":"Saldo a parcelar"}</span>
                        <span style={{color:"#5C4A2A",fontWeight:600}}>{fmt2(saldo2)}</span>
                      </div>
                    </div>
                  )}

                  <div style={{display:"flex",flexDirection:"column",gap:8}}>
                    {/* Cartão de crédito */}
                    {fc.includes("credito")&&<div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                      <div style={{borderLeft:"3px solid "+GOLD}}>
                        <div style={{padding:"10px 14px 8px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:8,background:"#fff"}}>
                          <span style={{fontSize:13,fontWeight:700,color:"#5C4A2A"}}>Cartão de crédito</span>
                          {nic>0&&<span style={{fontSize:10,color:GOLD_DARK,background:GOLD_PALE,padding:"2px 6px",borderRadius:8}}>até {nic}x sem juros</span>}
                        </div>
                        {(()=>{
                          const meio=Math.ceil(tCFiltrado.length/2);
                          const col1=tCFiltrado.slice(0,meio), col2=tCFiltrado.slice(meio);
                          const rr=(r,i,last)=>{const sj=r.n>1&&r.n<=nic,p=sj?creditoBaseRel/r.n:r.parcela,t=sj?creditoBaseRel:r.total;return(<div key={r.n} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:11,fontWeight:700,color:"#5C4A2A",minWidth:28}}>{r.n===1?"Àvista":r.n+"x"}</span><span style={{fontSize:11,color:GOLD_DARK,fontWeight:600,flex:1}}>{r.n===1?fmt2(creditoBaseRel):fmt2(p)}</span>{ct&&<span style={{fontSize:10,color:sj&&r.n>1?GOLD_DARK:"#9A8060"}}>{r.n===1?"":sj?"s/j":"tot "+fmt2(t)}</span>}</div>);};
                          return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{col1.map((r,i)=>rr(r,i,i===col1.length-1))}</div><div>{col2.map((r,i)=>rr(r,i,i===col2.length-1))}</div></div>);
                        })()}
      
                      </div>
                    </div>}

                    {/* Boleto parcelado */}
                    {fc.includes("boleto")&&bm==="parcelado"&&(()=>{
                      const nl=bj==="sem_juros"?nb:bj==="com_juros"?0:parseInt(bi)||0;
                      const bBase=boletoComDesconto?vF:vB; // desconto só se toggle ativado
                      const ls=Array.from({length:nb},(_,i)=>{
                        const n=i+1,sj=n<=nl,pc=bj==="combinado"?Math.max(0,n-nl):sj?0:n;
                        const t=sj?bBase:bBase*(1+0.012*pc);
                        return{n,p:t/n,sj,t};
                      });
                      return(<div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                        <div style={{borderLeft:"3px solid "+GOLD}}>
                          <div style={{padding:"10px 14px 8px",borderBottom:"1px solid "+BORDER,background:"#fff"}}>
                            <span style={{fontSize:13,fontWeight:700,color:"#5C4A2A"}}>Boleto parcelado</span>
                          </div>
                          {(()=>{
                            const meio=Math.ceil(ls.length/2);
                            const col1=ls.slice(0,meio),col2=ls.slice(meio);
                            const rb=(l,i,last)=>(<div key={l.n} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:last?"none":"1px solid "+BORDER}}><span style={{fontSize:11,fontWeight:700,color:"#5C4A2A",minWidth:28}}>{l.n+"x"}</span><span style={{fontSize:11,color:GOLD_DARK,fontWeight:600,flex:1}}>{fmt2(l.p)}</span>{bt&&<span style={{fontSize:10,color:l.sj||bj==="sem_juros"?GOLD_DARK:"#9A8060"}}>{l.sj||bj==="sem_juros"?"s/j":"tot "+fmt2(l.t)}</span>}</div>);
                            return(<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",borderTop:"1px solid "+BORDER}}><div style={{borderRight:"1px solid "+BORDER}}>{col1.map((l,i)=>rb(l,i,i===col1.length-1))}</div><div>{col2.map((l,i)=>rb(l,i,i===col2.length-1))}</div></div>);
                          })()}
                        </div>
                      </div>);
                    })()}
                  </div>
                </div>
              );
            })()}
          </>}
          </>);})()}

        </div>
          {/* Rodapé */}
          <div className="rel-footer" style={{borderTop:"2px solid "+GOLD,marginTop:"auto",padding:"10px 24px 14px",display:"flex",alignItems:"center",gap:14,justifyContent:"center"}}>
            <div style={{flexShrink:0}}>
              <svg width="44" height="44" viewBox="0 0 25 25" xmlns="http://www.w3.org/2000/svg" style={{border:"2px solid "+GOLD_PALE,borderRadius:3,padding:2,background:"#fff"}}><rect x="0" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="0" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="1" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="2" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="3" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="4" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="5" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="6" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="7" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="7" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="7" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="7" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="7" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="8" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="9" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="10" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="11" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="7" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="12" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="13" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="7" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="14" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="15" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="7" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="16" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="17" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="18" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="19" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="13" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="20" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="15" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="23" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="21" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="22" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="22" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="12" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="17" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="19" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="20" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="23" width="1" height="1" fill="#5C4A2A"/><rect x="0" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="1" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="2" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="3" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="4" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="5" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="6" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="8" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="9" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="10" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="11" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="14" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="16" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="18" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="21" y="24" width="1" height="1" fill="#5C4A2A"/><rect x="24" y="24" width="1" height="1" fill="#5C4A2A"/></svg>
            </div>
            <div>
              <div style={{fontSize:10,color:GOLD_DARK,fontWeight:600,letterSpacing:1.5,marginBottom:2}}>Íntegra Clínica Odontológica</div>
              <div style={{fontSize:9,color:"#9A8060"}}>www.odontologiaintegra.com.br · WhatsApp (48) 98404-2890 · (48) 3234-1002</div>
              <div style={{fontSize:9,color:"#9A8060",marginTop:1}}>Rua Lauro Linhares, 1849, Sala 204 — Trindade, Florianópolis/SC</div>
            </div>
            <div className="rel-page-number" style={{marginLeft:"auto",fontSize:8,color:"#ccc",fontStyle:"italic"}}/>
          </div>
      </div>
    </div>
  );
}

const p4Initial = {
  itens: null,
  customProcs: [],
  procsBase: null, // null = será carregado do localStorage ou PROC_BASE
};

const p3Initial = {vb:"",ds:0,dc:"",fc:[],fa:null,bm:"avista",bp:"6",bj:"sem_juros",bi:"3",ci:"0",cp:null,tb:"calc",entrada:false,entradaTipo:"pct",entradaVal:"30",saldoTipo:"parcelado",ct:true,bt:true,quemPaga:"comprador",boletoComDesconto:false,modoRel:"soma"};


// ─── CALCULADORA FLUTUANTE ───────────────────────────
function CalculadoraFlutuante() {
  const [aberta, setAberta] = useState(false);
  const [display, setDisplay] = useState("0");
  const [expr, setExpr] = useState("");
  const [historico, setHistorico] = useState([]);
  const [esperandoOperando, setEsperandoOperando] = useState(false);

  const pressionar = (val) => {
    if(val==="C") { setDisplay("0"); setExpr(""); setEsperandoOperando(false); return; }
    if(val==="⌫") {
      setDisplay(d => d.length>1 ? d.slice(0,-1) : "0");
      return;
    }
    if(val==="%") {
      const n = parseFloat(display);
      if(!isNaN(n)) {
        // Se há expressão pendente (ex: "500-"), calcula % do primeiro operando
        if(expr) {
          const match = expr.match(/(-?\d+\.?\d*)[+\-*/]$/);
          if(match) {
            const base = parseFloat(match[1]);
            const pctVal = base * n / 100;
            setDisplay(String(pctVal));
            return;
          }
        }
        // Sem operação pendente: divide por 100
        setDisplay(String(n/100));
      }
      return;
    }
    if(["+","-","×","÷"].includes(val)) {
      const op = val==="×"?"*":val==="÷"?"/":val;
      setExpr(display+op);
      setEsperandoOperando(true);
      return;
    }
    if(val==="=") {
      try {
        const full = expr + display;
        // eslint-disable-next-line no-new-func
        const result = Function('"use strict"; return ('+full+')')();
        const res = parseFloat(result.toFixed(8)).toString();
        setHistorico(h=>[{expr:full,res},...h.slice(0,9)]);
        setDisplay(res);
        setExpr("");
        setEsperandoOperando(false);
      } catch(e) { setDisplay("Erro"); setExpr(""); }
      return;
    }
    if(val===".") {
      if(esperandoOperando) { setDisplay("0."); setEsperandoOperando(false); return; }
      if(!display.includes(".")) setDisplay(d=>d+".");
      return;
    }
    if(esperandoOperando) { setDisplay(val); setEsperandoOperando(false); }
    else setDisplay(d => d==="0"||d==="Erro" ? val : d+val);
  };

  const btns = [
    [{l:"C",c:"#5C4A2A"},{l:"⌫",c:"#5C4A2A"},{l:"%",c:"#5C4A2A"},{l:"÷",c:GOLD_DARK}],
    [{l:"7"},{l:"8"},{l:"9"},{l:"×",c:GOLD_DARK}],
    [{l:"4"},{l:"5"},{l:"6"},{l:"-",c:GOLD_DARK}],
    [{l:"1"},{l:"2"},{l:"3"},{l:"+",c:GOLD_DARK}],
    [{l:"0",w:2},{l:"."},{l:"=",c:GOLD_DARK}],
  ];

  return (
    <>
      {/* Botão flutuante */}
      <div className="no-print" onClick={()=>setAberta(!aberta)} style={{
        position:"fixed",bottom:76,left:16,zIndex:200,
        background:aberta?"#3D1F4E":"#5C4A2A",color:"#fff",
        borderRadius:24,padding:"9px 13px",fontSize:13,fontWeight:700,
        cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.3)",
        display:"flex",alignItems:"center",gap:5,
      }}>🧮</div>

      {/* Painel */}
      {aberta&&(
        <div className="no-print" style={{
          position:"fixed",bottom:130,left:16,zIndex:300,
          background:"#1A1A1A",borderRadius:16,
          boxShadow:"0 8px 32px rgba(0,0,0,0.5)",
          width:240,overflow:"hidden",
        }}>
          {/* Display */}
          <div style={{padding:"12px 16px 8px",textAlign:"right"}}>
            <div style={{fontSize:10,color:"#666",minHeight:16}}>{expr}</div>
            <div style={{fontSize:32,fontWeight:300,color:"#fff",lineHeight:1.2,wordBreak:"break-all"}}>{display}</div>
          </div>

          {/* Histórico */}
          {historico.length>0&&(
            <div style={{maxHeight:120,overflowY:"auto",padding:"6px 12px",borderBottom:"1px solid #333",background:"#222"}}>
              <div style={{fontSize:8,letterSpacing:2,textTransform:"uppercase",color:"#888",marginBottom:4}}>Histórico</div>
              {historico.map((h,i)=>(
                <div key={i} onClick={()=>{setDisplay(h.res);setExpr("");}} style={{padding:"5px 0",borderBottom:"1px solid #333",cursor:"pointer"}}>
                  <div style={{fontSize:10,color:"#aaa",textAlign:"right"}}>{h.expr} =</div>
                  <div style={{fontSize:14,color:"#fff",textAlign:"right",fontWeight:400}}>{h.res}</div>
                </div>
              ))}
            </div>
          )}

          {/* Botões */}
          <div style={{padding:8,display:"flex",flexDirection:"column",gap:6}}>
            {btns.map((row,ri)=>(
              <div key={ri} style={{display:"flex",gap:6}}>
                {row.map((btn,bi)=>(
                  <div key={bi} onClick={()=>pressionar(btn.l)} style={{
                    flex:btn.w||1,padding:"14px 0",borderRadius:10,
                    background:btn.c||"#333",color:"#fff",
                    fontSize:16,fontWeight:500,textAlign:"center",cursor:"pointer",
                    userSelect:"none",transition:"opacity 0.1s",
                  }}>{btn.l}</div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}


// ─── HOOK DE DESFAZER ────────────────────────────────
function undoReducer(state, action) {
  switch(action.type) {
    case "SET": {
      const novo = typeof action.payload === "function" ? action.payload(state.history[state.index]) : action.payload;
      const hist = state.history.slice(0, state.index + 1);
      hist.push(novo);
      if(hist.length > 20) hist.shift();
      return {history: hist, index: hist.length - 1};
    }
    case "UNDO":
      return state.index > 0 ? {...state, index: state.index - 1} : state;
    default:
      return state;
  }
}

function useUndo(initialState) {
  const [undoState, dispatch] = React.useReducer(undoReducer, {
    history: [initialState],
    index: 0,
  });

  const state = undoState.history[undoState.index];
  const setState = (newState) => dispatch({type:"SET", payload:newState});
  const desfazer = () => dispatch({type:"UNDO"});
  const podeDesfazer = undoState.index > 0;

  return [state, setState, desfazer, podeDesfazer];
}



// ─── GOOGLE DRIVE INTEGRATION ────────────────────────
const GDRIVE_CLIENT_ID = "608550621257-trrkg2omi2g74he41282ka2qbue4nein.apps.googleusercontent.com";
const GDRIVE_ORIGIN = "https://integra-clinica-three.vercel.app";
const GDRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GDRIVE_FOLDER_NAME = "Íntegra Clínica — Atendimentos";

let _gdriveToken = null;
let _gdriveFolderId = null;
const _driveListeners = new Set();
function onDriveLogin(fn) { _driveListeners.add(fn); return ()=>_driveListeners.delete(fn); }
function notifyDriveLogin() {
  try {
    if(_gdriveToken) {
      localStorage.setItem("integra_gdrive_token", _gdriveToken);
      localStorage.setItem("integra_gdrive_token_time", String(Date.now()));
    } else {
      localStorage.removeItem("integra_gdrive_token");
      localStorage.removeItem("integra_gdrive_token_time");
    }
  } catch(e){}
  _driveListeners.forEach(fn=>fn(!!_gdriveToken));
}
function useDriveLogado() {
  const [logado, setLogado] = React.useState(!!_gdriveToken);
  React.useEffect(()=>{ const unsub = onDriveLogin(setLogado); return unsub; },[]);
  return logado;
}

// Restaurar token Google do localStorage ao carregar
function gdriveRestaurarToken() {
  try {
    const token = localStorage.getItem("integra_gdrive_token");
    const time = localStorage.getItem("integra_gdrive_token_time");
    if(token && time) {
      const elapsed = Date.now() - Number(time);
      if(elapsed < 50 * 60 * 1000) {
        _gdriveToken = token;
        _driveListeners.forEach(fn=>fn(true));
        gdriveIniciarRenovacao();
        return true;
      } else {
        localStorage.removeItem("integra_gdrive_token");
        localStorage.removeItem("integra_gdrive_token_time");
      }
    }
  } catch(e){}
  return false;
}

// Timer para renovar token silenciosamente a cada 45min
let _gdriveRenovarTimer = null;
function gdriveIniciarRenovacao() {
  if(_gdriveRenovarTimer) clearTimeout(_gdriveRenovarTimer);
  _gdriveRenovarTimer = setTimeout(async () => {
    if(!_gdriveToken) return;
    try {
      await gdriveEnsureScript();
      const tc = window.google.accounts.oauth2.initTokenClient({
        client_id: GDRIVE_CLIENT_ID,
        scope: GDRIVE_SCOPE,
        callback: (r) => {
          if(r.access_token) { _gdriveToken = r.access_token; notifyDriveLogin(); gdriveIniciarRenovacao(); }
        },
        error_callback: () => {},
      });
      tc.requestAccessToken({prompt: ""});
    } catch(e){}
  }, 45 * 60 * 1000);
}

// Executar restauração ao carregar o módulo
gdriveRestaurarToken();

// ─── GERAR PDF COM CABEÇALHO/RODAPÉ EM TODAS AS PÁGINAS ─────────────────────
let _html2canvas = null;
let _jsPDF = null;

async function gerarPDFRelatorio() {
  // Importar libs dinamicamente (instaladas via npm)
  if(!_html2canvas) {
    const mod = await import("html2canvas");
    _html2canvas = mod.default || mod;
  }
  if(!_jsPDF) {
    const mod = await import("jspdf");
    _jsPDF = mod.jsPDF || mod.default;
  }

  const html2canvas = _html2canvas;
  const jsPDF = _jsPDF;

  // Esperar elementos aparecerem (max 3s)
  let headerEl, contentEl, footerEl;
  for(let i = 0; i < 30; i++) {
    headerEl = document.querySelector(".rel-header");
    contentEl = document.querySelector(".rel-content");
    footerEl = document.querySelector(".rel-footer");
    if(headerEl && contentEl && footerEl) break;
    await new Promise(r => setTimeout(r, 100));
  }

  if(!headerEl || !contentEl || !footerEl) {
    alert("Erro: Relatório não encontrado. Tente novamente.");
    return;
  }

  // Configurações A4
  const scale = 2;
  const pageW = 210;
  const pageH = 297;
  const marginL = 10;
  const marginR = 10;
  const marginTop = 8;
  const marginBot = 8;
  const contentW = pageW - marginL - marginR;

  // html2canvas config — foreignObjectRendering evita problema de iframe
  const h2cOpts = { scale, useCORS: true, backgroundColor: "#ffffff", foreignObjectRendering: false, allowTaint: true, logging: false };

  // Capturar imagens
  const headerCanvas = await html2canvas(headerEl, h2cOpts);
  const footerCanvas = await html2canvas(footerEl, h2cOpts);
  const contentCanvas = await html2canvas(contentEl, h2cOpts);

  const headerImg = headerCanvas.toDataURL("image/png");
  const footerImg = footerCanvas.toDataURL("image/png");

  // Alturas em mm
  const headerH = (headerCanvas.height / headerCanvas.width) * contentW;
  const footerH = (footerCanvas.height / footerCanvas.width) * contentW;
  const gapHeader = 6; // margem entre header e conteúdo
  const gapFooter = 6; // margem entre conteúdo e footer
  const espacoConteudo = pageH - marginTop - marginBot - headerH - footerH - gapHeader - gapFooter;
  const contentTotalH = (contentCanvas.height / contentCanvas.width) * contentW;
  const numPages = Math.ceil(contentTotalH / espacoConteudo);

  // Criar PDF
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  for(let pg = 0; pg < numPages; pg++) {
    if(pg > 0) pdf.addPage();

    // Header em todas as páginas (a linha dourada já está no borderBottom do header)
    pdf.addImage(headerImg, "PNG", marginL, marginTop, contentW, headerH);

    // Fatia do conteúdo para esta página
    const yInicio = pg * espacoConteudo;
    const yContent = marginTop + headerH + gapHeader;
    const sliceH = Math.min(espacoConteudo, contentTotalH - yInicio);
    const sliceHpx = (sliceH / contentTotalH) * contentCanvas.height;
    const yInicioPx = (yInicio / contentTotalH) * contentCanvas.height;

    const sliceCanvas = document.createElement("canvas");
    sliceCanvas.width = contentCanvas.width;
    sliceCanvas.height = Math.ceil(sliceHpx);
    const ctx = sliceCanvas.getContext("2d");
    ctx.drawImage(contentCanvas, 0, yInicioPx, contentCanvas.width, sliceHpx, 0, 0, contentCanvas.width, Math.ceil(sliceHpx));

    const sliceImg = sliceCanvas.toDataURL("image/png");
    pdf.addImage(sliceImg, "PNG", marginL, yContent, contentW, sliceH);

    // Footer em todas as páginas (a linha dourada já está no borderTop do footer)
    const footerY = pageH - marginBot - footerH;
    pdf.addImage(footerImg, "PNG", marginL, footerY, contentW, footerH);

    // Página X de Y
    pdf.setFontSize(7);
    pdf.setTextColor(180, 180, 180);
    pdf.text("Pagina " + (pg + 1) + " de " + numPages, pageW - marginR - 2, pageH - marginBot + 2, { align: "right" });
  }

  // Download direto em vez de abrir aba (evita bloqueio de popup)
  pdf.save("Integra_Relatorio.pdf");
}

async function gdriveEnsureScript() {
  if(window.google && window.google.accounts) return;
  // Check if already loading
  const existing = document.querySelector('script[src*="accounts.google.com/gsi"]');
  if(existing) {
    await new Promise((res,rej)=>{
      let t=0;
      const iv=setInterval(()=>{
        t+=100;
        if(window.google&&window.google.accounts){clearInterval(iv);res();}
        if(t>8000){clearInterval(iv);rej(new Error("Timeout"));}
      },100);
    });
    return;
  }
  await new Promise((res,rej)=>{
    const s=document.createElement("script");
    s.src="https://accounts.google.com/gsi/client";
    s.async=true;
    s.onload=res; s.onerror=rej;
    document.head.appendChild(s);
  });
}

async function gdriveLogin(forcarSelecao) {
  await gdriveEnsureScript();
  return new Promise((resolve,reject)=>{
    const tc = window.google.accounts.oauth2.initTokenClient({
      client_id: GDRIVE_CLIENT_ID,
      scope: GDRIVE_SCOPE,
      callback: (r)=>{
        if(r.access_token){ _gdriveToken=r.access_token; notifyDriveLogin(); gdriveIniciarRenovacao(); resolve(r.access_token); }
        else reject(new Error("Login cancelado"));
      },
      error_callback: (err)=>{
        reject(new Error(err.type||"Erro OAuth"));
      },
    });
    if(forcarSelecao && _gdriveToken) {
      try { window.google.accounts.oauth2.revoke(_gdriveToken); } catch(e){}
      _gdriveToken = null;
    }
    tc.requestAccessToken({prompt: forcarSelecao ? "consent" : "select_account"});
  });
}

async function gdriveGetFolder() {
  if(_gdriveFolderId) return _gdriveFolderId;
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?q=name%3D%27"+encodeURIComponent(GDRIVE_FOLDER_NAME)+"%27+and+mimeType%3D%27application%2Fvnd.google-apps.folder%27+and+trashed%3Dfalse&fields=files(id)",
    {headers:{Authorization:"Bearer "+_gdriveToken}}
  );
  const d = await res.json();
  if(d.files && d.files.length>0){ _gdriveFolderId=d.files[0].id; return _gdriveFolderId; }
  const cr = await fetch("https://www.googleapis.com/drive/v3/files",{
    method:"POST",
    headers:{Authorization:"Bearer "+_gdriveToken,"Content-Type":"application/json"},
    body:JSON.stringify({name:GDRIVE_FOLDER_NAME,mimeType:"application/vnd.google-apps.folder"}),
  });
  const pasta = await cr.json();
  _gdriveFolderId=pasta.id;
  return _gdriveFolderId;
}

async function gdriveListarArquivos(folderId, paciente) {
  const nomeNorm = (paciente||"").replace(/[^a-z0-9]/gi,"_").toLowerCase();
  const q = "%27"+folderId+"%27+in+parents+and+trashed%3Dfalse+and+name+contains+%27integra_%27";
  const res = await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name)",{headers:{Authorization:"Bearer "+_gdriveToken}});
  const d = await res.json();
  const all = d.files||[];
  if(!nomeNorm) return all;
  return all.filter(f=>f.name.toLowerCase().includes(nomeNorm.slice(0,15)));
}

async function gdriveSalvarAtendimento(atendimento, sobrepor=false) {
  if(!_gdriveToken) throw new Error("Não autenticado");
  const folderId = await gdriveGetFolder();
  const nomeBase = "integra_"+(atendimento.paciente||"p").replace(/[^a-z0-9]/gi,"_");
  const json = JSON.stringify(atendimento,null,2);

  if(sobrepor !== "novo") {
    // Verificar se existe arquivo similar (mesmo paciente)
    const existentes = await gdriveListarArquivos(folderId, atendimento.paciente);
    if(existentes.length > 0 && sobrepor !== true) {
      // Retornar info para o componente decidir
      return {precisaConfirmar: true, existentes, folderId, atendimento};
    }
    if(sobrepor === true && existentes.length > 0) {
      // Atualizar o primeiro encontrado
      const fileId = existentes[0].id;
      const form = new FormData();
      form.append("metadata",new Blob([JSON.stringify({name:existentes[0].name})],{type:"application/json"}));
      form.append("file",new Blob([json],{type:"application/json"}));
      await fetch("https://www.googleapis.com/upload/drive/v3/files/"+fileId+"?uploadType=multipart",{method:"PATCH",headers:{Authorization:"Bearer "+_gdriveToken},body:form});
      return {salvo:true};
    }
  }

  const nome = nomeBase+"_"+atendimento.id+".json";
  const metadata = {name:nome,mimeType:"application/json",parents:[folderId]};
  const form = new FormData();
  form.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));
  form.append("file",new Blob([json],{type:"application/json"}));
  await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",{method:"POST",headers:{Authorization:"Bearer "+_gdriveToken},body:form});
  return {salvo:true};
}

async function gdriveListarTodos() {
  if(!_gdriveToken) throw new Error("Nao autenticado");
  const folderId = await gdriveGetFolder();
  let all = [], pageToken = "";
  do {
    const url = "https://www.googleapis.com/drive/v3/files?q=%27"+folderId+"%27+in+parents+and+trashed%3Dfalse&fields=files(id,name,modifiedTime,size),nextPageToken&orderBy=name&pageSize=100"+(pageToken?"&pageToken="+pageToken:"");
    const res = await fetch(url, {headers:{Authorization:"Bearer "+_gdriveToken}});
    const d = await res.json();
    if(d.files) all = all.concat(d.files);
    pageToken = d.nextPageToken || "";
  } while(pageToken);
  return all.sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
}

async function gdriveCarregarArquivo(fileId) {
  if(!_gdriveToken) throw new Error("Nao autenticado");
  const res = await fetch("https://www.googleapis.com/drive/v3/files/"+fileId+"?alt=media", {headers:{Authorization:"Bearer "+_gdriveToken}});
  return await res.json();
}

function DrivePastaModal({onClose, onCarregar}) {
  const [arquivos, setArquivos] = React.useState(null);
  const [erro, setErro] = React.useState(null);
  const [carregando, setCarregando] = React.useState(null);
  const [filtro, setFiltro] = React.useState("");
  const [selecionados, setSelecionados] = React.useState(new Set());
  const [excluindo, setExcluindo] = React.useState(false);
  React.useEffect(()=>{ _gdriveFolderId=null; gdriveListarTodos().then(setArquivos).catch(e=>setErro(e.message)); },[]);
  const extrairNome = (fn) => { const m = fn.replace(/\.json$/,"").replace(/^integra_/,"").replace(/_[a-f0-9-]+$/,"").replace(/_/g," "); return m.charAt(0).toUpperCase()+m.slice(1); };
  const fmtData = (iso) => { if(!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); };
  const carregar = async (arq) => { setCarregando(arq.id); try { const dados = await gdriveCarregarArquivo(arq.id); onCarregar(dados); onClose(); } catch(e) { setErro("Erro: "+e.message); setCarregando(null); } };
  const toggleSel = (id) => { setSelecionados(prev => { const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; }); };
  const selTodos = () => { if(selecionados.size===filtrados.length) setSelecionados(new Set()); else setSelecionados(new Set(filtrados.map(a=>a.id))); };
  const excluirSelecionados = async () => {
    if(!selecionados.size) return;
    if(!window.confirm("Excluir "+selecionados.size+" arquivo(s) do Drive? Esta ação não pode ser desfeita.")) return;
    setExcluindo(true); setErro(null);
    try {
      for(const id of selecionados) { await fetch("https://www.googleapis.com/drive/v3/files/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+_gdriveToken}}); }
      setSelecionados(new Set());
      const novos = await gdriveListarTodos();
      setArquivos(novos);
    } catch(e) { setErro("Erro ao excluir: "+e.message); }
    setExcluindo(false);
  };
  const excluirUnico = async (id) => {
    if(!window.confirm("Excluir este arquivo do Drive?")) return;
    setExcluindo(true); setErro(null);
    try {
      await fetch("https://www.googleapis.com/drive/v3/files/"+id,{method:"DELETE",headers:{Authorization:"Bearer "+_gdriveToken}});
      const novos = await gdriveListarTodos();
      setArquivos(novos);
      selecionados.delete(id);
      setSelecionados(new Set(selecionados));
    } catch(e) { setErro("Erro: "+e.message); }
    setExcluindo(false);
  };
  const filtrados = arquivos ? arquivos.filter(a => !filtro || extrairNome(a.name).toLowerCase().includes(filtro.toLowerCase())) : [];
  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{background:"#fff",borderRadius:8,maxWidth:520,width:"100%",maxHeight:"85vh",display:"flex",flexDirection:"column",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK}}>Pasta Google Drive</div>
            <div style={{fontSize:10,color:"#9A8060",marginTop:2}}>Íntegra Clínica — Atendimentos{arquivos?" — "+arquivos.length+" arquivo(s)":""}</div>
          </div>
          <div onClick={onClose} style={{cursor:"pointer",fontSize:18,color:"#9A8060",padding:"4px 8px"}}>X</div>
        </div>
        <div style={{padding:"10px 22px 8px",display:"flex",gap:8,alignItems:"center"}}>
          <input value={filtro} onChange={e=>setFiltro(e.target.value)} placeholder="Buscar paciente..." style={{flex:1,padding:"8px 12px",border:"1px solid "+BORDER,borderRadius:4,fontSize:12,outline:"none",boxSizing:"border-box"}}/>
          {filtrados.length>0&&<div onClick={selTodos} style={{padding:"6px 10px",border:"1px solid "+BORDER,borderRadius:3,cursor:"pointer",fontSize:9,color:selecionados.size===filtrados.length?GOLD_DARK:"#9A8060",fontWeight:600,whiteSpace:"nowrap"}}>{selecionados.size===filtrados.length?"Desmarcar":"Selecionar tudo"}</div>}
        </div>
        {selecionados.size>0&&<div style={{padding:"6px 22px",display:"flex",alignItems:"center",gap:8,background:"#FFF0F0",borderBottom:"1px solid #E57373"}}>
          <span style={{fontSize:11,color:"#C62828",flex:1}}>{selecionados.size} selecionado(s)</span>
          <div onClick={excluirSelecionados} style={{padding:"5px 12px",background:"#C62828",color:"#fff",borderRadius:3,cursor:excluindo?"default":"pointer",fontSize:10,fontWeight:600,opacity:excluindo?0.6:1}}>{excluindo?"Excluindo...":"🗑 Excluir selecionados"}</div>
          <div onClick={()=>setSelecionados(new Set())} style={{padding:"5px 8px",border:"1px solid "+BORDER,borderRadius:3,cursor:"pointer",fontSize:10,color:"#9A8060"}}>✕</div>
        </div>}
        <div style={{flex:1,overflow:"auto",padding:"0 22px 16px"}}>
          {erro&&<div style={{fontSize:11,color:"#C62828",padding:10}}>{erro}</div>}
          {!arquivos&&!erro&&<div style={{textAlign:"center",padding:30,color:"#9A8060",fontSize:12}}>Carregando arquivos...</div>}
          {arquivos&&filtrados.length===0&&<div style={{textAlign:"center",padding:30,color:"#9A8060",fontSize:12}}>Nenhum arquivo encontrado</div>}
          {filtrados.map(arq=>{const sel=selecionados.has(arq.id);return(<div key={arq.id} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 0",borderBottom:"1px solid "+BORDER,background:sel?"#FFF8F0":"transparent"}}>
            <div onClick={()=>toggleSel(arq.id)} style={{width:20,height:20,borderRadius:3,border:"2px solid "+(sel?GOLD_DARK:BORDER),background:sel?GOLD:"#fff",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0}}>{sel&&<span style={{fontSize:10,color:"#fff",fontWeight:900}}>✓</span>}</div>
            <div onClick={()=>carregar(arq)} style={{flex:1,minWidth:0,cursor:"pointer"}}>
              <div style={{fontSize:12,fontWeight:600,color:"#5C4A2A",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{extrairNome(arq.name)}</div>
              <div style={{fontSize:9,color:"#9A8060",marginTop:2}}>{fmtData(arq.modifiedTime)}</div>
            </div>
            <div onClick={()=>excluirUnico(arq.id)} style={{padding:"5px 10px",background:"#fff",border:"1px solid #E57373",borderRadius:3,cursor:"pointer",fontSize:10,color:"#C62828",flexShrink:0}}>🗑</div>
          </div>);})}
        </div>
      </div>
    </div>
  );
}

function DriveSync({relatorio, onCarregar}) {
  const logado = useDriveLogado();
  const [salvando, setSalvando] = React.useState(false);
  const [msgDrive, setMsgDrive] = React.useState(null);
  const [modalDrive, setModalDrive] = React.useState(null); // {onSobrepor, onDuplicar}
  const [showPasta, setShowPasta] = React.useState(false);

  const login = async () => {
    // Se estiver em URL de preview, redirecionar para URL principal
    if(!window.location.hostname.includes("integra-clinica") &&
       window.location.hostname !== "localhost") {
      const redirect = GDRIVE_ORIGIN + window.location.pathname;
      window.location.href = redirect;
      return;
    }
    setMsgDrive({tipo:"ok",texto:"Carregando..."});
    try {
      await gdriveEnsureScript();
      await gdriveLogin();
      notifyDriveLogin();
      setMsgDrive({tipo:"ok",texto:"Conectado ao Drive"});
      setTimeout(()=>setMsgDrive(null),3000);
    } catch(e) {
      const msg = e&&e.message?e.message:"verifique popup bloqueado";
      const isAccess = msg.includes("access_denied")||msg.includes("cancelado")||msg.includes("popup");
      setMsgDrive({tipo:"erro",texto:isAccess?"Use uma conta autorizada: integratrindade@gmail.com, arthurarioli@hotmail.com ou arthurfloripa.aac@gmail.com":"Erro: "+msg});
    }
  };

  const salvar = async (opcao) => {
    if(!relatorio) return;
    setSalvando(true);
    try {
      const res = await gdriveSalvarAtendimento(relatorio, opcao);
      if(res && res.precisaConfirmar) {
        setSalvando(false);
        setModalDrive({
          onSobrepor: async () => { setModalDrive(null); await salvar(true); },
          onDuplicar: async () => { setModalDrive(null); await salvar("novo"); },
          onCancelar: () => setModalDrive(null),
        });
        return;
      }
      setMsgDrive({tipo:"ok",texto:"✓ Salvo no Google Drive"});
      setTimeout(()=>setMsgDrive(null),3000);
    } catch(e) {
      setMsgDrive({tipo:"erro",texto:"Erro: "+e.message});
    }
    setSalvando(false);
  };

  return (
    <div className="no-print" style={{marginTop:10}}>
      {/* Modal sobrepor/duplicar/cancelar */}
      {modalDrive&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:8,padding:28,maxWidth:360,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK,marginBottom:8}}>Arquivo já existe no Drive</div>
            <div style={{fontSize:12,color:"#5C4A2A",marginBottom:20,lineHeight:1.6}}>
              Já existe um arquivo para <strong>{relatorio?.paciente||"este paciente"}</strong> no Google Drive. O que deseja fazer?
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div onClick={modalDrive.onSobrepor} style={{padding:"11px 16px",background:GOLD_DARK,color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700,textAlign:"center"}}>
                Sobrepor arquivo existente
              </div>
              <div onClick={modalDrive.onDuplicar} style={{padding:"11px 16px",background:"#fff",color:GOLD_DARK,border:"1px solid "+GOLD,borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:600,textAlign:"center"}}>
                Duplicar (salvar como cópia)
              </div>
              <div onClick={modalDrive.onCancelar} style={{padding:"11px 16px",background:"#fff",color:"#9A8060",border:"1px solid "+BORDER,borderRadius:4,cursor:"pointer",fontSize:12,textAlign:"center"}}>
                Cancelar
              </div>
            </div>
          </div>
        </div>
      )}
      {!logado ? (
        <div onClick={login} style={{
          display:"flex",alignItems:"center",gap:8,padding:"8px 16px",
          background:"#fff",border:"1px solid #dadce0",borderRadius:4,
          cursor:"pointer",fontSize:12,fontWeight:600,color:"#3c4043",
          boxShadow:"0 1px 3px rgba(0,0,0,0.12)",width:"fit-content",
        }}>
          <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
          Conectar ao Google Drive
        </div>
      ) : (
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <div onClick={salvar} style={{
            display:"flex",alignItems:"center",gap:6,padding:"7px 14px",
            background:salvando?"#e8f5e9":"#fff",border:"1px solid #34A853",
            borderRadius:4,cursor:salvando?"default":"pointer",fontSize:11,fontWeight:600,color:"#1e7e34",
          }}>
            {salvando?"⏳ Salvando...":"☁ Salvar no Drive"}
          </div>
          <div onClick={()=>setShowPasta(true)} style={{
            display:"flex",alignItems:"center",gap:6,padding:"7px 14px",
            background:"#fff",border:"1px solid "+GOLD,
            borderRadius:4,cursor:"pointer",fontSize:11,fontWeight:600,color:GOLD_DARK,
          }}>
            ☁ Arquivo de pacientes em nuvem
          </div>
          <div onClick={async()=>{_gdriveFolderId=null;try{await gdriveLogin(true);}catch(e){notifyDriveLogin();}}} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"4px 10px",border:"1px solid "+GOLD,borderRadius:20}}>Trocar conta</div>
          <div onClick={()=>{_gdriveToken=null;_gdriveFolderId=null;notifyDriveLogin();setShowPasta(false);}} style={{fontSize:10,color:"#9A8060",cursor:"pointer"}}>Desconectar</div>
        </div>
      )}
      {msgDrive&&<div style={{fontSize:10,marginTop:5,color:msgDrive.tipo==="ok"?"#1e7e34":"#C62828"}}>{msgDrive.texto}</div>}
      {showPasta&&<DrivePastaModal onClose={()=>setShowPasta(false)} onCarregar={onCarregar}/>}
    </div>
  );
}


// ─── CONFIGURAÇÕES PADRÃO ────────────────────────────
const CONFIG_KEY = "integra_configs_v1";

function loadConfigs() {
  try { return JSON.parse(localStorage.getItem(CONFIG_KEY)||"{}"); } catch(e){ return {}; }
}
function saveConfigs(c) {
  try { localStorage.setItem(CONFIG_KEY, JSON.stringify(c)); } catch(e){}
}

function Configs({onClose}) {
  const [cfg, setCfg] = React.useState(loadConfigs);
  const set = (k,v) => { const n={...cfg,[k]:v}; setCfg(n); saveConfigs(n); };

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center"}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:8,padding:24,maxWidth:400,width:"90%",maxHeight:"80vh",overflowY:"auto",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <span style={{fontSize:14,fontWeight:700,color:GOLD_DARK,letterSpacing:1}}>Configurações Padrão</span>
          <span onClick={onClose} style={{cursor:"pointer",color:"#9A8060",fontSize:18}}>✕</span>
        </div>

        {/* Plano PagBank padrão */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Plano PagBank padrão</div>
          <div style={{display:"flex",gap:8}}>
            {[["hora","Na hora"],["dias14","14 dias"]].map(([k,l])=>(
              <div key={k} onClick={()=>set("plano",k)} style={{flex:1,padding:"8px 12px",borderRadius:3,cursor:"pointer",border:"2px solid "+(cfg.plano===k?GOLD_DARK:BORDER),background:cfg.plano===k?GOLD_PALE:"#fff",fontSize:11,fontWeight:cfg.plano===k?700:400,color:cfg.plano===k?GOLD_DARK:"#5C4A2A",textAlign:"center"}}>{l}</div>
            ))}
          </div>
        </div>

        {/* Quem paga juros padrão */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Juros pagos por (padrão)</div>
          <div style={{display:"flex",gap:8}}>
            {[["comprador","Paciente"],["vendedor","Clínica"]].map(([k,l])=>(
              <div key={k} onClick={()=>set("quemPaga",k)} style={{flex:1,padding:"8px 12px",borderRadius:3,cursor:"pointer",border:"2px solid "+(cfg.quemPaga===k?GOLD_DARK:BORDER),background:cfg.quemPaga===k?GOLD_PALE:"#fff",fontSize:11,fontWeight:cfg.quemPaga===k?700:400,color:cfg.quemPaga===k?GOLD_DARK:"#5C4A2A",textAlign:"center"}}>{l}</div>
            ))}
          </div>
        </div>

        {/* Parcelas sem juros padrão */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Parcelas sem juros padrão</div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
            {[0,1,2,3,4,5,6].map(n=>(
              <div key={n} onClick={()=>set("parcelasIsentas",String(n))} style={{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid "+((cfg.parcelasIsentas||"3")===String(n)?GOLD_DARK:BORDER),background:(cfg.parcelasIsentas||"3")===String(n)?GOLD:"#fff",color:(cfg.parcelasIsentas||"3")===String(n)?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer"}}>{n}</div>
            ))}
          </div>
        </div>

        {/* Desconto padrão */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Desconto à vista padrão (%)</div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {[0,5,10,15,20].map(n=>(
              <div key={n} onClick={()=>set("descontoPadrao",n)} style={{padding:"6px 14px",borderRadius:20,cursor:"pointer",border:"1.5px solid "+((cfg.descontoPadrao||0)===n?GOLD_DARK:BORDER),background:(cfg.descontoPadrao||0)===n?GOLD_PALE:"#fff",fontSize:11,fontWeight:(cfg.descontoPadrao||0)===n?700:400,color:(cfg.descontoPadrao||0)===n?GOLD_DARK:"#5C4A2A"}}>{n}%</div>
            ))}
          </div>
        </div>

        <div style={{marginTop:20,padding:"10px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,fontSize:11,color:GOLD_DARK}}>
          ✓ Configurações salvas automaticamente
        </div>
      </div>
    </div>
  );
}


// ─── MINI ORÇAMENTO POR PROCEDIMENTO — Calculadora Completa ─────
function MiniOrcamento({valor, procNome, propostaInicial, onSave, onClose}) {
  const cfg = loadConfigs();
  const init = propostaInicial || {};
  // Sempre usar o valor atual do procedimento como base
  const valorStr = valor > 0 ? String(valor) : (init.vb||"0");
  const [p3mini, setP3mini] = React.useState({
    vb: valorStr,
    ds: init.ds||cfg.descontoPadrao||0,
    dc: "", fc: init.fc||[], fa: null,
    bm: init.bm||"avista", bp: init.bp||"6",
    bj: init.bj||"sem_juros", bi: "3", ci: cfg.parcelasIsentas||"0",
    cp: null, tb: "calc",
    entrada: init.entrada||false,
    entradaTipo: init.entradaTipo||"pct",
    entradaVal: init.entradaVal||"30",
    saldoTipo: init.saldoTipo||"parcelado",
    ct: true, bt: true,
    quemPaga: init.quemPaga||cfg.quemPaga||"comprador",
    plano: init.plano||cfg.plano||"hora",
    boletoComDesconto: init.boletoComDesconto||false,
  });
  const sp = (k,v) => setP3mini(prev=>({...prev,[k]:v}));

  return (
    <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{background:CREAM,borderRadius:8,width:"100%",maxWidth:540,maxHeight:"90vh",overflowY:"auto",boxShadow:"0 8px 40px rgba(0,0,0,0.4)",display:"flex",flexDirection:"column"}}>
        {/* Header */}
        <div style={{background:"#3D1F4E",padding:"14px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",borderRadius:"8px 8px 0 0",flexShrink:0}}>
          <div>
            <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:2}}>Proposta Individual</div>
            <div style={{fontSize:13,fontWeight:700,color:"#fff"}}>{procNome}</div>
          </div>
          <span onClick={onClose} style={{cursor:"pointer",color:"#9A8060",fontSize:20,lineHeight:1}}>✕</span>
        </div>
        {/* Calculadora completa */}
        <div style={{overflowY:"auto",flex:1}}>
          <P3
            vb={p3mini.vb} setVb={v=>sp("vb",v)}
            ds={p3mini.ds} setDs={v=>sp("ds",v)}
            dc={p3mini.dc} setDc={v=>sp("dc",v)}
            fc={p3mini.fc} setFc={v=>sp("fc",v)}
            fa={p3mini.fa} setFa={v=>sp("fa",v)}
            bm={p3mini.bm} setBm={v=>sp("bm",v)}
            bp={p3mini.bp} setBp={v=>sp("bp",v)}
            bj={p3mini.bj} setBj={v=>sp("bj",v)}
            bi={p3mini.bi} setBi={v=>sp("bi",v)}
            ci={p3mini.ci} setCi={v=>sp("ci",v)}
            cp={p3mini.cp} setCp={v=>sp("cp",v)}
            tb={p3mini.tb} setTb={v=>sp("tb",v)}
            entrada={p3mini.entrada} setEntrada={v=>sp("entrada",v)}
            entradaTipo={p3mini.entradaTipo} setEntradaTipo={v=>sp("entradaTipo",v)}
            entradaVal={p3mini.entradaVal} setEntradaVal={v=>sp("entradaVal",v)}
            saldoTipo={p3mini.saldoTipo} setSaldoTipo={v=>sp("saldoTipo",v)}
            ct={p3mini.ct} setCt={v=>sp("ct",v)}
            bt={p3mini.bt} setBt={v=>sp("bt",v)}
            planoExterno={p3mini.plano} setPlanoExterno={v=>sp("plano",v)}
            p3QuemPaga={p3mini.quemPaga} setP3QuemPaga={v=>sp("quemPaga",v)}
            boletoComDesconto={p3mini.boletoComDesconto} setBoletoComDesconto={v=>sp("boletoComDesconto",v)}
          />
        </div>
        {/* Botões */}
        <div style={{padding:"12px 16px",borderTop:"1px solid "+BORDER,display:"flex",gap:8,flexShrink:0,background:"#fff"}}>
          <div onClick={()=>onSave({...p3mini, _procNome:procNome})} style={{flex:1,padding:"11px",background:GOLD_DARK,color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700,textAlign:"center"}}>
            ✓ Salvar proposta
          </div>
          <div onClick={onClose} style={{padding:"11px 16px",border:"1px solid "+BORDER,borderRadius:4,cursor:"pointer",fontSize:12,color:"#9A8060",textAlign:"center"}}>
            Cancelar
          </div>
        </div>
      </div>
    </div>
  );
}


function loadPersisted(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch(e) { return fallback; }
}
function savePersisted(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch(e) {}
}

// ─── AUTO-SYNC DRIVE ──────────────────────────────
let _lastSyncHash = "";
let _driveFileId = null;
let _driveFileName = null;

function driveDataHash(p1,p2,p3,p4) {
  return JSON.stringify({p1:p1.nome+p1.cpf+p1.telefone+p1.dataNasc+p1.dataConsulta+p1.responsavel,p2k:Object.keys(p2.achadosDente||{}).length,p2o:(p2.obsTexto||"").length,p3v:p3.vb,p4a:((p4?.itens||[]).filter(i=>i.ativo).length)});
}

function DriveAutoSync({p1,p2,p3,p4State,setP1,setP2,setP3,setP4State}) {
  const [status, setStatus] = React.useState("idle");
  const [lastSaved, setLastSaved] = React.useState(null);
  const [autoOn, setAutoOn] = React.useState(false);
  const logado = useDriveLogado();

  const temDados = p1.nome && p1.nome !== "João da Silva" && p1.nome.trim().length > 2;

  const salvarNoDrive = React.useCallback(async (forcar=false) => {
    if(!_gdriveToken || !temDados) return;
    const hash = driveDataHash(p1,p2,p3,p4State);
    if(!forcar && hash === _lastSyncHash) return;
    setStatus("saving");
    try {
      const folderId = await gdriveGetFolder();
      const nomeBase = "integra_"+(p1.nome||"p").replace(/[^a-z0-9]/gi,"_");
      const atendimento = {
        id: _driveFileId ? undefined : Date.now(),
        data: new Date().toISOString(),
        paciente: p1.nome||"Sem nome",
        cpf: p1.cpf||"",
        telefone: p1.telefone||"",
        dataNasc: p1.dataNasc||"",
        responsavel: p1.responsavel||"",
        dataConsulta: p1.dataConsulta||new Date().toISOString().slice(0,10),
        valorTotal: parseFloat(p3.vb)||0,
        _p1:p1, _p2:p2, _p3:p3, _p4:p4State,
      };
      const json = JSON.stringify(atendimento,null,2);
      if(!_driveFileId) {
        const nomeNorm = (p1.nome||"").replace(/[^a-z0-9]/gi,"_").toLowerCase();
        const q = "%27"+folderId+"%27+in+parents+and+trashed%3Dfalse+and+name+contains+%27integra_%27";
        const res = await fetch("https://www.googleapis.com/drive/v3/files?q="+q+"&fields=files(id,name)",{headers:{Authorization:"Bearer "+_gdriveToken}});
        const d = await res.json();
        const existente = (d.files||[]).find(f=>f.name.toLowerCase().includes(nomeNorm.slice(0,15)));
        if(existente) { _driveFileId=existente.id; _driveFileName=existente.name; }
      }
      if(_driveFileId) {
        const form = new FormData();
        form.append("metadata",new Blob([JSON.stringify({name:_driveFileName})],{type:"application/json"}));
        form.append("file",new Blob([json],{type:"application/json"}));
        await fetch("https://www.googleapis.com/upload/drive/v3/files/"+_driveFileId+"?uploadType=multipart",{method:"PATCH",headers:{Authorization:"Bearer "+_gdriveToken},body:form});
      } else {
        const nome = nomeBase+"_"+Date.now()+".json";
        _driveFileName = nome;
        const metadata = {name:nome,mimeType:"application/json",parents:[folderId]};
        const form = new FormData();
        form.append("metadata",new Blob([JSON.stringify(metadata)],{type:"application/json"}));
        form.append("file",new Blob([json],{type:"application/json"}));
        const r = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",{method:"POST",headers:{Authorization:"Bearer "+_gdriveToken},body:form});
        const created = await r.json();
        _driveFileId = created.id;
      }
      _lastSyncHash = hash;
      setLastSaved(new Date());
      setStatus("saved");
    } catch(e) {
      console.error("AutoSync erro:",e);
      setStatus("error");
    }
  },[p1,p2,p3,p4State,temDados]);

  const sincronizar = React.useCallback(async () => {
    if(!_gdriveToken || !_driveFileId) return;
    setStatus("loading");
    try {
      const dados = await gdriveCarregarArquivo(_driveFileId);
      if(dados._p1) setP1(dados._p1);
      if(dados._p2) setP2(sanitizeP2(dados._p2));
      if(dados._p3) setP3(prev=>({...prev,...dados._p3}));
      if(dados._p4) { const p4r=dados._p4; if(!p4r.procsBase) p4r.procsBase=PROC_BASE.map(p=>({...p})); if(!p4r.itens) p4r.itens=p4r.procsBase.map(p=>({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],obs:"",subtopics:[],proposta:null,valoresDente:{}})); setP4State(p4r); }
      _lastSyncHash = driveDataHash(dados._p1||p1,dados._p2||p2,dados._p3||p3,dados._p4||p4State);
      setStatus("saved");
    } catch(e) {
      console.error("Sync erro:",e);
      setStatus("error");
    }
  },[p1,p2,p3,p4State,setP1,setP2,setP3,setP4State]);

  React.useEffect(()=>{
    if(!autoOn || !logado || !temDados) return;
    const iv = setInterval(()=>salvarNoDrive(), 30000);
    return ()=>clearInterval(iv);
  },[autoOn,logado,temDados,salvarNoDrive]);

  const [showPastaGlobal, setShowPastaGlobal] = React.useState(false);

  const carregarDoDrive = React.useCallback((dados) => {
    if(dados._p1) setP1(dados._p1);
    if(dados._p2) setP2(sanitizeP2(dados._p2));
    if(dados._p3) setP3(prev=>({...prev,...dados._p3}));
    if(dados._p4) { const p4r=dados._p4; if(!p4r.procsBase) p4r.procsBase=PROC_BASE.map(p=>({...p})); if(!p4r.itens) p4r.itens=p4r.procsBase.map(p=>({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],obs:"",subtopics:[],proposta:null,valoresDente:{}})); setP4State(p4r); }
  },[setP1,setP2,setP3,setP4State]);

  if(!logado) return null;

  const statusIcon = status==="saving"?"⏳":status==="saved"?"✅":status==="error"?"⚠️":status==="loading"?"🔄":"⚪";
  const statusText = status==="saving"?"Salvando...":status==="saved"?"Sincronizado":status==="error"?"Erro ao salvar":status==="loading"?"Carregando...":"";
  const timeFmt = lastSaved ? lastSaved.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}) : "";

  return (<>
    <div className="no-print" style={{position:"fixed",top:60,right:12,zIndex:180,display:"flex",alignItems:"center",gap:8,background:"rgba(255,255,255,0.97)",border:"1.5px solid "+(status==="saved"?"#4CAF50":status==="error"?"#E57373":GOLD),borderRadius:12,padding:"8px 14px",boxShadow:"0 3px 12px rgba(0,0,0,0.12)",fontSize:11}}>
      <span style={{fontSize:14}}>{statusIcon}</span>
      <div style={{display:"flex",flexDirection:"column",gap:1}}>
        {statusText&&<span style={{color:status==="error"?"#C62828":status==="saved"?"#2E7D32":"#5C4A2A",fontWeight:600,fontSize:11}}>{statusText}</span>}
        {timeFmt&&status==="saved"&&<span style={{color:"#9A8060",fontSize:9}}>às {timeFmt}</span>}
      </div>
      <div style={{width:1,height:24,background:BORDER,margin:"0 2px"}}/>
      <div onClick={()=>{setAutoOn(!autoOn);if(!autoOn)salvarNoDrive(true);}} style={{padding:"5px 12px",borderRadius:8,cursor:"pointer",background:autoOn?"#E8F5E9":"#fff",border:"1.5px solid "+(autoOn?"#4CAF50":BORDER),color:autoOn?"#2E7D32":"#9A8060",fontWeight:700,fontSize:10}}>
        {autoOn?"☁ Auto ✓":"☁ Auto"}
      </div>
      {!autoOn&&<div onClick={()=>salvarNoDrive(true)} style={{padding:"5px 12px",borderRadius:8,cursor:"pointer",background:"#fff",border:"1.5px solid "+GOLD,color:GOLD_DARK,fontWeight:600,fontSize:10}}>
        Salvar
      </div>}
      <div onClick={()=>setShowPastaGlobal(true)} style={{padding:"5px 12px",borderRadius:8,cursor:"pointer",background:GOLD_PALE,border:"1.5px solid "+GOLD,color:GOLD_DARK,fontWeight:700,fontSize:10}}>
        ☁ Pacientes
      </div>
    </div>
    {showPastaGlobal&&<DrivePastaModal onClose={()=>setShowPastaGlobal(false)} onCarregar={(dados)=>{carregarDoDrive(dados);setShowPastaGlobal(false);}}/>}
  </>);
}

// ─── FORMULÁRIO PÚBLICO DO PACIENTE (via WhatsApp) ─────────────
function AssinaturaCanvas({value, onChange}) {
  const canvasRef = React.useRef(null);
  const [desenhando, setDesenhando] = React.useState(false);
  const [temTraco, setTemTraco] = React.useState(!!value);

  React.useEffect(()=>{
    if(value && canvasRef.current) {
      const img = new Image();
      img.onload = ()=>{
        const ctx = canvasRef.current.getContext("2d");
        ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
        ctx.drawImage(img,0,0);
      };
      img.src = value;
    }
  },[]);

  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const t = e.touches ? e.touches[0] : e;
    return {x:t.clientX-r.left, y:t.clientY-r.top};
  };

  const iniciar = (e) => {
    e.preventDefault();
    setDesenhando(true);
    const ctx = canvasRef.current.getContext("2d");
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
  };

  const mover = (e) => {
    if(!desenhando) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const p = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1C1410";
    ctx.lineTo(p.x,p.y);
    ctx.stroke();
    setTemTraco(true);
  };

  const parar = () => {
    setDesenhando(false);
    if(canvasRef.current && temTraco) {
      onChange(canvasRef.current.toDataURL("image/png"));
    }
  };

  const limpar = () => {
    const ctx = canvasRef.current.getContext("2d");
    ctx.clearRect(0,0,canvasRef.current.width,canvasRef.current.height);
    setTemTraco(false);
    onChange("");
  };

  return (
    <div>
      <canvas ref={canvasRef} width={320} height={140}
        onMouseDown={iniciar} onMouseMove={mover} onMouseUp={parar} onMouseLeave={parar}
        onTouchStart={iniciar} onTouchMove={mover} onTouchEnd={parar}
        style={{width:"100%",maxWidth:320,height:140,border:"2px solid "+BORDER,borderRadius:4,background:"#fff",touchAction:"none",cursor:"crosshair"}}
      />
      {temTraco&&<div onClick={limpar} style={{fontSize:10,color:"#E57373",cursor:"pointer",marginTop:6}}>✕ Limpar assinatura</div>}
    </div>
  );
}

function FormularioPaciente({formId}) {
  const [nome, setNome] = React.useState("");
  const [cpf, setCpf] = React.useState("");
  const [telefone, setTelefone] = React.useState("");
  const [dataNasc, setDataNasc] = React.useState("");
  const [dataNascTexto, setDataNascTexto] = React.useState("");
  const [respNome, setRespNome] = React.useState("");
  const [respCpf, setRespCpf] = React.useState("");
  const [assinatura, setAssinatura] = React.useState("");
  const [enviado, setEnviado] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [idade, setIdade] = React.useState(null);
  const [isMinor, setIsMinor] = React.useState(false);
  const [usarCalendario, setUsarCalendario] = React.useState(false);

  // Máscara DD/MM/AAAA para data
  const maskData = (v) => {
    const nums = v.replace(/\D/g,"").slice(0,8);
    if(nums.length<=2) return nums;
    if(nums.length<=4) return nums.slice(0,2)+"/"+nums.slice(2);
    return nums.slice(0,2)+"/"+nums.slice(2,4)+"/"+nums.slice(4);
  };

  const onDataTexto = (v) => {
    const masked = maskData(v);
    setDataNascTexto(masked);
    // Converter DD/MM/AAAA para AAAA-MM-DD
    const parts = masked.split("/");
    if(parts.length===3 && parts[2].length===4) {
      const d=parseInt(parts[0]), m=parseInt(parts[1]), y=parseInt(parts[2]);
      if(d>=1&&d<=31&&m>=1&&m<=12&&y>=1900&&y<=2030) {
        setDataNasc(y+"-"+(m<10?"0"+m:m)+"-"+(d<10?"0"+d:d));
      }
    }
  };

  const onDataCalendario = (v) => {
    setDataNasc(v);
    // Converter AAAA-MM-DD para DD/MM/AAAA
    if(v) {
      const p = v.split("-");
      if(p.length===3) setDataNascTexto(p[2]+"/"+p[1]+"/"+p[0]);
    }
  };

  React.useEffect(()=>{
    if(!dataNasc) { setIdade(null); setIsMinor(false); return; }
    const nasc = new Date(dataNasc), hoje = new Date();
    let anos = hoje.getFullYear()-nasc.getFullYear();
    const m = hoje.getMonth()-nasc.getMonth();
    if(m<0||(m===0&&hoje.getDate()<nasc.getDate())) anos--;
    if(anos>=0&&anos<130) { setIdade(anos); setIsMinor(anos<18); }
  },[dataNasc]);

  const enviar = async () => {
    if(!nome.trim()) { setErro("Preencha seu nome completo"); return; }
    if(!cpf.trim()) { setErro("Preencha seu CPF"); return; }
    if(!telefone.trim()) { setErro("Preencha seu telefone"); return; }
    if(!dataNasc) { setErro("Preencha sua data de nascimento"); return; }
    if(isMinor && !respNome.trim()) { setErro("Preencha o nome do responsável legal"); return; }
    if(!assinatura) { setErro("Assine no campo de assinatura"); return; }
    setErro("");
    setEnviando(true);
    try {
      await new Promise((res)=>{
        onFirebaseReady(()=>{
          _fbDb.ref("formularios/"+formId).set({
            nome: nome.trim(),
            cpf: cpf.trim(),
            telefone: telefone.replace(/\D/g,""),
            dataNasc,
            idade: idade+" anos",
            isMinor,
            respNome: isMinor?respNome.trim():"",
            respCpf: isMinor?respCpf.trim():"",
            assinatura,
            dataEnvio: new Date().toISOString(),
            formId,
            status: "pendente",
          }).then(res).catch(e=>{setErro("Erro ao enviar: "+e.message);setEnviando(false);});
        });
      });
      setEnviado(true);
    } catch(e) { setErro("Erro: "+e.message); setEnviando(false); }
  };

  // Estilo de input responsivo e grande para idosos
  const inpF = {width:"100%",padding:"20px 22px",border:"2.5px solid "+BORDER,borderRadius:12,fontSize:22,color:"#1C1410",background:"#fff",outline:"none",fontFamily:"inherit",boxSizing:"border-box",lineHeight:1.4};
  const lblF = {fontSize:16,letterSpacing:1,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,display:"block",marginBottom:10};

  if(enviado) return (
    <div style={{minHeight:"100vh",background:CREAM,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:"#fff",borderRadius:12,padding:36,maxWidth:440,width:"100%",textAlign:"center",border:"2px solid "+GOLD,boxShadow:"0 4px 24px rgba(0,0,0,0.1)"}}>
        <div style={{fontSize:56,marginBottom:16}}>✓</div>
        <div style={{fontSize:22,fontWeight:700,color:GOLD_DARK,marginBottom:10}}>Dados enviados com sucesso!</div>
        <div style={{fontSize:16,color:"#5C4A2A",lineHeight:1.6}}>Obrigado, {nome.split(" ")[0]}. Seus dados foram recebidos pela equipe da Íntegra Clínica Odontológica. Você pode fechar esta página.</div>
        <div style={{marginTop:24,padding:"14px 18px",background:GOLD_PALE,borderRadius:6,fontSize:13,color:GOLD_DARK}}>Íntegra Clínica Odontológica · Desde 1996</div>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:CREAM,padding:"0 0 40px"}}>
      {/* Header */}
      <div style={{background:"linear-gradient(135deg,#3D1F4E 0%,#2A1538 100%)",padding:"22px 24px",display:"flex",alignItems:"center",gap:14}}>
        <svg width="36" height="46" viewBox="0 0 40 52" fill="none">
          <ellipse cx="20" cy="26" rx="18" ry="24" stroke="#B8962E" strokeWidth="1.5"/>
          <text x="20" y="32" textAnchor="middle" fontFamily="Georgia" fontSize="18" fontStyle="italic" fill="#B8962E">i</text>
        </svg>
        <div>
          <div style={{fontFamily:"Georgia",fontSize:20,fontWeight:700,color:"#fff",letterSpacing:3,textTransform:"uppercase"}}>Íntegra</div>
          <div style={{fontSize:9,letterSpacing:2.5,color:GOLD_LIGHT,textTransform:"uppercase"}}>Clínica Odontológica · Desde 1996</div>
        </div>
      </div>

      <div style={{maxWidth:540,margin:"0 auto",padding:"24px 12px"}}>
        <div style={{background:"#fff",border:"2px solid "+BORDER,borderRadius:12,padding:"28px 18px",boxShadow:"0 2px 16px rgba(0,0,0,0.06)"}}>
          <div style={{fontSize:20,fontWeight:700,color:GOLD_DARK,marginBottom:6}}>Cadastro do Paciente</div>
          <div style={{fontSize:15,color:"#9A8060",marginBottom:24,lineHeight:1.5}}>Preencha seus dados para agilizar seu atendimento.</div>

          <div style={{display:"flex",flexDirection:"column",gap:18}}>
            <div>
              <label style={lblF}>Nome completo *</label>
              <input style={inpF} value={nome} onChange={e=>setNome(e.target.value)} placeholder="Seu nome completo" name="name" autoComplete="name" autoCapitalize="words" spellCheck={false}/>
            </div>
            <div>
              <label style={lblF}>CPF *</label>
              <input style={inpF} value={cpf} onChange={e=>setCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" name="cpf" inputMode="numeric" autoComplete="off"/>
            </div>
            <div>
              <label style={lblF}>Telefone / WhatsApp *</label>
              <input style={inpF} value={maskTelefone(telefone)} onChange={e=>setTelefone(e.target.value.replace(/\D/g,""))} placeholder="(48) 99999-9999" name="tel" inputMode="tel" autoComplete="tel"/>
            </div>
            <div>
              <label style={lblF}>Data de nascimento *</label>
              <input style={inpF} value={dataNascTexto} onChange={e=>onDataTexto(e.target.value)} placeholder="DD/MM/AAAA" inputMode="numeric" autoComplete="bday"/>
              <div onClick={()=>setUsarCalendario(!usarCalendario)} style={{fontSize:12,color:GOLD_DARK,cursor:"pointer",marginTop:6,textDecoration:"underline"}}>
                {usarCalendario?"Digitar data":"Usar calendário"}
              </div>
              {usarCalendario&&(
                <input style={{...inpF,marginTop:8}} type="date" value={dataNasc} onChange={e=>onDataCalendario(e.target.value)}/>
              )}
            </div>
            {idade!==null&&(
              <div style={{fontSize:16,color:isMinor?PURPLE:GOLD_DARK,fontWeight:600,padding:"12px 16px",background:isMinor?"rgba(91,45,142,0.06)":GOLD_PALE,borderRadius:6,border:"1.5px solid "+(isMinor?"rgba(91,45,142,0.2)":GOLD_LIGHT)}}>
                {isMinor?"⚠️ Menor de idade — preencha o responsável abaixo":idade+" anos"}
              </div>
            )}
            {isMinor&&(
              <div style={{padding:"18px 18px",background:"rgba(91,45,142,0.05)",border:"1.5px solid rgba(91,45,142,0.2)",borderRadius:8}}>
                <div style={{fontSize:13,letterSpacing:1.5,textTransform:"uppercase",color:PURPLE,fontWeight:700,marginBottom:14}}>Responsável Legal</div>
                <div style={{display:"flex",flexDirection:"column",gap:14}}>
                  <div>
                    <label style={{fontSize:13,color:PURPLE,fontWeight:600,display:"block",marginBottom:6}}>Nome do responsável *</label>
                    <input style={inpF} value={respNome} onChange={e=>setRespNome(e.target.value)} placeholder="Nome completo do responsável" name="parent-name" autoComplete="name" autoCapitalize="words" spellCheck={false}/>
                  </div>
                  <div>
                    <label style={{fontSize:13,color:PURPLE,fontWeight:600,display:"block",marginBottom:6}}>CPF do responsável</label>
                    <input style={inpF} value={respCpf} onChange={e=>setRespCpf(formatCpf(e.target.value))} placeholder="000.000.000-00" inputMode="numeric" autoComplete="off"/>
                  </div>
                </div>
              </div>
            )}

            {/* Assinatura */}
            <div>
              <label style={lblF}>Assinatura digital *</label>
              <div style={{fontSize:14,color:"#9A8060",marginBottom:10}}>Desenhe sua assinatura com o dedo no campo abaixo</div>
              <AssinaturaCanvas value={assinatura} onChange={setAssinatura}/>
            </div>

            {/* Termo */}
            <div style={{fontSize:13,color:"#9A8060",lineHeight:1.6,padding:"14px 16px",background:"#FAFAF8",borderRadius:6,border:"1px solid "+BORDER}}>
              Ao enviar este formulário, declaro que as informações prestadas são verdadeiras e autorizo a Íntegra Clínica Odontológica a utilizar estes dados para fins de atendimento odontológico.
            </div>

            {erro&&<div style={{fontSize:15,color:"#C62828",padding:"12px 16px",background:"#FFF0F0",border:"1.5px solid #E57373",borderRadius:6}}>{erro}</div>}

            <div onClick={enviando?null:enviar} style={{padding:"18px",background:enviando?"#ccc":GOLD_DARK,color:"#fff",borderRadius:8,cursor:enviando?"default":"pointer",fontSize:18,fontWeight:700,textAlign:"center",letterSpacing:0.5}}>
              {enviando?"Enviando...":"Enviar dados"}
            </div>
          </div>
        </div>

        <div style={{textAlign:"center",marginTop:20,fontSize:12,color:"#9A8060"}}>
          Íntegra Clínica Odontológica · www.odontologiaintegra.com.br
        </div>
      </div>
    </div>
  );
}

// ─── LISTA DE FORMULÁRIOS RECEBIDOS ─────────────────
function FormulariosRecebidos({onImportar}) {
  const [formularios, setFormularios] = React.useState(null);
  const [erro, setErro] = React.useState(null);

  React.useEffect(()=>{
    onFirebaseReady(()=>{
      _fbDb.ref("formularios").orderByChild("dataEnvio").on("value", (snap)=>{
        const data = snap.val();
        if(!data) { setFormularios([]); return; }
        const list = Object.entries(data).map(([k,v])=>({...v,_key:k})).sort((a,b)=>(b.dataEnvio||"").localeCompare(a.dataEnvio||""));
        setFormularios(list);
      });
    });
    return ()=>{ if(_fbDb) _fbDb.ref("formularios").off(); };
  },[]);

  const importar = (f) => {
    onImportar({
      nome: f.nome||"",
      cpf: f.cpf||"",
      telefone: f.telefone||"",
      dataNasc: f.dataNasc||"",
      idade: f.idade||"",
      isMinor: f.isMinor||false,
      respNome: f.respNome||"",
      respCpf: f.respCpf||"",
      assinatura: f.assinatura||"",
    });
    _fbDb.ref("formularios/"+f._key+"/status").set("importado");
  };

  const excluir = (f) => {
    if(!window.confirm("Excluir formulário de "+f.nome+"?")) return;
    _fbDb.ref("formularios/"+f._key).remove();
  };

  const fmtData = (iso) => { if(!iso) return ""; const d=new Date(iso); return d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); };

  if(!formularios) return <div style={{fontSize:11,color:"#9A8060",padding:12}}>Carregando formulários...</div>;
  if(!formularios.length) return <div style={{fontSize:11,color:"#9A8060",padding:12,textAlign:"center"}}>Nenhum formulário recebido ainda.</div>;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {formularios.map(f=>(
        <div key={f._key} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1px solid "+(f.status==="importado"?BORDER:GOLD),borderRadius:4,background:f.status==="importado"?"#FAFAF8":"#FFF"}}>
          <div style={{width:4,height:36,background:f.status==="importado"?"#9A8060":GOLD,borderRadius:2,flexShrink:0}}/>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:12,fontWeight:600,color:"#1C1410"}}>{f.nome}</div>
            <div style={{fontSize:10,color:"#9A8060"}}>{f.cpf} · {fmtData(f.dataEnvio)}</div>
          </div>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {f.status!=="importado"&&<div onClick={()=>importar(f)} style={{padding:"5px 10px",background:GOLD,color:"#fff",borderRadius:3,cursor:"pointer",fontSize:10,fontWeight:600}}>Importar</div>}
            {f.status==="importado"&&<div onClick={()=>importar(f)} style={{padding:"5px 10px",background:"#E8F5E9",border:"1px solid #4CAF50",color:"#2E7D32",borderRadius:3,cursor:"pointer",fontSize:10,fontWeight:600}}>📂 Abrir</div>}
            {f.status==="importado"&&<span style={{fontSize:9,color:"#9A8060"}}>✓</span>}
            <div onClick={()=>excluir(f)} style={{padding:"5px 8px",border:"1px solid #E57373",borderRadius:3,cursor:"pointer",fontSize:10,color:"#C62828"}}>🗑</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function App() {
  // Detectar URL de formulário público /f/xxxxx
  const urlPath = typeof window !== "undefined" ? window.location.pathname : "";
  const formMatch = urlPath.match(/\/f\/([a-zA-Z0-9_-]+)/);
  if(formMatch) {
    return <FormularioPaciente formId={formMatch[1]}/>;
  }

  const [pag, setPag] = useState("p1");
  const [showConfigs, setShowConfigs] = useState(false);
  const driveLogado = useDriveLogado();
  // configs loaded directly in p3 useState initializer
  const [relatorioSalvo, setRelatorioSalvo] = useState(false);
  const [previewAberto, setPreviewAberto] = useState(false);
  const [p1, setP1, desfazerP1, podeDesfazerP1] = useUndo(p1Initial);
  // p2: useState normal para evitar perda de foco no obsTexto
  // desfazer manual com histórico separado
  const [p2, _setP2Raw] = useState({...p2Initial, achados: getAchadosInicial()});
  const [p2Hist, setP2Hist] = useState([{...p2Initial, achados: getAchadosInicial()}]);
  const [p2HIdx, setP2HIdx] = useState(0);
  const setP2 = (val) => {
    const novo = typeof val === "function" ? val(p2) : val;
    _setP2Raw(novo);
    // Só registra no histórico para ações clínicas (não para texto digitado)
    const isTextoDigitado = typeof val !== "function" &&
      val !== null && typeof val === "object" &&
      Object.keys(val).length <= 2 &&
      (val.obsTexto !== undefined || val.obsCorrigido !== undefined || val.obsAchados !== undefined);
    if(!isTextoDigitado) {
      setP2Hist(h => { const nh=[...h.slice(0,p2HIdx+1),novo]; setP2HIdx(nh.length-1); return nh.slice(-20); });
    }
  };
  const desfazerP2 = () => {
    if(p2HIdx>0){ const ni=p2HIdx-1; setP2HIdx(ni); _setP2Raw(p2Hist[ni]); }
  };
  const podeDesfazerP2 = p2HIdx > 0;
  const [p3, setP3] = useState(()=>{
    const cfg = loadConfigs();
    return {
      ...p3Initial,
      ds: cfg.descontoPadrao||0,
      ci: cfg.parcelasIsentas||"0",
      quemPaga: cfg.quemPaga||"comprador",
      plano: cfg.plano||"hora",
    };
  });
  const [p3History, setP3History] = useState([p3Initial]);
  const [p3HIdx, setP3HIdx] = useState(0);
  const sp3 = (k,v) => {
    setP3(prev => {
      const novo = {...prev,[k]:v};
      setP3History(h => { const nh=[...h.slice(0,p3HIdx+1),novo]; setP3HIdx(nh.length-1); return nh.slice(-20); });
      return novo;
    });
  };
  const desfazerP3 = () => {
    if(p3HIdx>0) { const ni=p3HIdx-1; setP3HIdx(ni); setP3(p3History[ni]); }
  };
  const podeDesfazerP3 = p3HIdx > 0;
  const [p4Total, setP4Total] = useState(0);
  const _p4Init = (() => {
    const saved = loadPersisted("integra_p4config", p4Initial);
    return {
      ...p4Initial,
      procsBase: saved.procsBase || null,
      customProcs: (saved.customProcs||[]).map(c=>({...c, _permanente:true, ativo:false})),
    };
  })();
  const [p4State, setP4State, desfazerP4, podeDesfazerP4] = useUndo(_p4Init);

  // Salvar configuração permanente dos procedimentos (não os itens do atendimento)
  useEffect(() => {
    savePersisted("integra_p4config", {
      procsBase: p4State.procsBase || null,
      customProcs: (p4State.customProcs||[]).map(c=>({...c, _permanente:true})),
    });
  }, [p4State.procsBase, p4State.customProcs]);

  // Salvar achados editáveis permanentes
  useEffect(() => {
    if(p2.achados) {
      savePersisted("integra_achados_config", p2.achados);
    }
  }, [p2.achados]);

  const previewProps = {p1, p2, p3, p4State};

  // Firebase Realtime Sync
  const fb = useFirebaseSync("", p1, p2, p3, p4State, setP1, _setP2Raw, setP3, setP4State);
  const [showFbModal, setShowFbModal] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [showGlobalPasta, setShowGlobalPasta] = useState(false);
  const [modalSalvar, setModalSalvar] = useState(null); // {msg, onSobrepor, onDuplicar, onCancelar}

  // Auto-conectar Firebase na sessão "1" ao iniciar
  const _fbAutoConectadoRef = React.useRef(false);
  React.useEffect(()=>{
    if(_fbAutoConectadoRef.current || fb.fbConectado) return;
    _fbAutoConectadoRef.current = true;
    const sessaoSalva = (() => { try { return localStorage.getItem("integra_fb_sessao") || "1"; } catch(e){ return "1"; } })();
    // Esperar Firebase ficar pronto e conectar
    onFirebaseReady(()=>{
      setTimeout(()=>fb.conectar(sessaoSalva), 500);
    });
  },[]);

  return (
    <div style={{paddingBottom:64,fontFamily:"'Outfit',system-ui,sans-serif",background:"#FDFAF4",minHeight:"100vh"}}>
      {pag!=="rel"&&<Header/>}
      <DriveAutoSync p1={p1} p2={p2} p3={p3} p4State={p4State} setP1={setP1} setP2={setP2} setP3={setP3} setP4State={setP4State}/>

      {/* Barra de ações globais — fixa em TODAS as abas */}
        <div className="no-print" style={{position:"fixed",top:0,left:0,right:0,zIndex:150,padding:"6px 12px",display:"flex",gap:5,alignItems:"center",justifyContent:"center",flexWrap:"wrap",background:CREAM,borderBottom:"1.5px solid "+BORDER,backdropFilter:"blur(8px)",boxShadow:"0 1px 4px rgba(0,0,0,0.06)"}}>

          {/* Pacientes em nuvem — principal */}
          {driveLogado&&(
            <div onClick={()=>setShowGlobalPasta(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"7px 14px",background:GOLD_DARK,color:"#fff",borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:700,boxShadow:"0 2px 6px rgba(122,96,32,0.25)"}}>
              ☁ Pacientes
            </div>
          )}

          {/* Salvar no Drive */}
          {driveLogado&&(
            <div onClick={async()=>{if(!_gdriveToken)return;try{const rel={id:Date.now(),data:new Date().toISOString(),paciente:p1.nome||"Sem nome",cpf:p1.cpf||"",telefone:p1.telefone||"",dataNasc:p1.dataNasc||"",responsavel:p1.responsavel||"",dataConsulta:p1.dataConsulta||"",valorTotal:parseFloat(p3.vb)||0,_p1:p1,_p2:p2,_p3:p3,_p4:p4State};const res=await gdriveSalvarAtendimento(rel,_driveFileId?"sobrepor":false);if(res&&res.precisaConfirmar){setModalSalvar({msg:"Já existe um arquivo para "+(p1.nome||"este paciente")+" no Google Drive.",onSobrepor:async()=>{setModalSalvar(null);await gdriveSalvarAtendimento(rel,true);},onDuplicar:async()=>{setModalSalvar(null);await gdriveSalvarAtendimento(rel,false);},onCancelar:()=>setModalSalvar(null)});}}catch(e){alert("Erro: "+e.message);}}} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",background:CREAM,border:"1px solid "+BORDER,color:GOLD_DARK,borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:600}}>
              ☁ Salvar
            </div>
          )}

          {/* Exportar PDF */}
          <div onClick={async()=>{const prev=pag;setPag("rel");setTimeout(async()=>{try{await gerarPDFRelatorio();}catch(e){console.error(e);alert("Erro ao gerar PDF: "+e.message);}setPag(prev);},1500);}} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",background:CREAM,border:"1px solid "+BORDER,color:GOLD_DARK,borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:600}}>
            📄 PDF
          </div>

          {/* Imprimir */}
          <div onClick={()=>{const prev=pag;setPag("rel");setTimeout(()=>window.print(),300);setTimeout(()=>setPag(prev),600);}} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",background:CREAM,border:"1px solid "+BORDER,color:GOLD_DARK,borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:600}}>
            🖨️ Imprimir
          </div>

          {/* Firebase Sync — integrado na barra */}
          <div onClick={()=>setShowFbModal(true)} style={{display:"flex",alignItems:"center",gap:5,padding:"6px 12px",background:CREAM,border:"1px solid "+(fb.fbConectado?"#4CAF50":BORDER),color:fb.fbConectado?"#2E7D32":GOLD_DARK,borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:600}}>
            <div style={{width:8,height:8,borderRadius:"50%",background:fb.fbConectado?"#4CAF50":"#ccc"}}/>
            {fb.fbConectado?("Rede "+fb.fbSessao):"📡 Rede"}
          </div>

          {/* Salvar local — discreto */}
          <div onClick={()=>{
            const dup = verificarDuplicata(p1);
            if(dup) {
              setModalSalvar({
                msg: "Já existe um atendimento salvo para este paciente.",
                onSobrepor: ()=>{ setModalSalvar(null); salvarRelatorio(p1,p2,p3,p4State,true); setRelatorioSalvo(true); setTimeout(()=>setRelatorioSalvo(false),3000); },
                onDuplicar: ()=>{ setModalSalvar(null); salvarRelatorio(p1,p2,p3,p4State,false); setRelatorioSalvo(true); setTimeout(()=>setRelatorioSalvo(false),3000); },
                onCancelar: ()=>setModalSalvar(null),
              });
            } else { salvarRelatorio(p1,p2,p3,p4State,false); setRelatorioSalvo(true); setTimeout(()=>setRelatorioSalvo(false),3000); }
          }} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 10px",background:relatorioSalvo?GOLD_DARK:CREAM,border:"1px solid "+BORDER,color:relatorioSalvo?"#fff":"#9A8060",borderRadius:20,cursor:"pointer",fontSize:9,fontWeight:500}}>
            {relatorioSalvo?"✓":"💾"}
          </div>

          {/* Separador + Conta Google */}
          <div style={{width:1,height:20,background:BORDER,margin:"0 2px"}}/>
          {driveLogado?(
            <div onClick={async()=>{_gdriveFolderId=null;try{await gdriveLogin(true);}catch(e){notifyDriveLogin();}}} style={{padding:"5px 8px",cursor:"pointer",fontSize:9,color:"#9A8060",borderRadius:20,border:"1px solid "+BORDER}}>
              Trocar conta
            </div>
          ):(
            <div onClick={async()=>{try{await gdriveEnsureScript();await gdriveLogin();}catch(e){alert(e.message.includes("cancelado")||e.message.includes("access_denied")?"Use: integratrindade@gmail.com, arthurarioli@hotmail.com ou arthurfloripa.aac@gmail.com":"Erro: "+e.message);}}} style={{display:"flex",alignItems:"center",gap:4,padding:"6px 12px",background:CREAM,border:"1px solid "+BORDER,borderRadius:20,cursor:"pointer",fontSize:10,fontWeight:600,color:GOLD_DARK}}>
              <svg width="12" height="12" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Google
            </div>
          )}
        </div>
      <div className="no-print" style={{height:44}}/>

      {/* Modal Pasta Drive Global */}
      {showGlobalPasta&&<DrivePastaModal onClose={()=>setShowGlobalPasta(false)} onCarregar={(dados)=>{
        if(dados._p1) setP1(dados._p1);
        if(dados._p2) setP2(sanitizeP2(dados._p2));
        if(dados._p3) setP3(prev=>({...prev,...dados._p3}));
        if(dados._p4) { const p4r=dados._p4; if(!p4r.procsBase) p4r.procsBase=null; setP4State(p4r); }
        setShowGlobalPasta(false);
      }}/>}

      {/* Modal Firebase Sync */}
      {showFbModal&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:600,display:"flex",alignItems:"center",justifyContent:"center",padding:16}} onClick={()=>setShowFbModal(false)}>
          <div onClick={e=>e.stopPropagation()} style={{background:"#fff",borderRadius:8,padding:24,maxWidth:400,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK}}>Sincronização em Tempo Real</div>
              <div onClick={()=>setShowFbModal(false)} style={{cursor:"pointer",fontSize:18,color:"#9A8060",padding:"2px 8px",lineHeight:1}}>✕</div>
            </div>
            <div style={{fontSize:11,color:"#9A8060",marginBottom:16,lineHeight:1.5}}>
              Conecte dois computadores na mesma sessão para sincronizar dados automaticamente. Tudo que for digitado em um aparece no outro em tempo real.
            </div>
            {fb.fbConectado?(
              <div>
                <div style={{padding:16,background:"#E8F5E9",border:"1px solid #4CAF50",borderRadius:8,marginBottom:12,textAlign:"center"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:12,marginBottom:8}}>
                    <div style={{width:12,height:12,borderRadius:"50%",background:"#4CAF50",boxShadow:"0 0 8px #4CAF50"}}/>
                    <div style={{width:40,height:2,background:"#4CAF50",borderRadius:1}}/>
                    <div style={{fontSize:20}}>🔗</div>
                    <div style={{width:40,height:2,background:"#4CAF50",borderRadius:1}}/>
                    <div style={{width:12,height:12,borderRadius:"50%",background:"#4CAF50",boxShadow:"0 0 8px #4CAF50"}}/>
                  </div>
                  <div style={{fontSize:13,fontWeight:700,color:"#2E7D32"}}>Conexão ativa</div>
                  <div style={{fontSize:16,fontWeight:700,color:"#1C1410",marginTop:4}}>{fb.fbSessao}</div>
                  {fb.fbUltimoSync&&<div style={{fontSize:10,color:"#9A8060",marginTop:6}}>Último sync: {fb.fbUltimoSync.toLocaleTimeString("pt-BR")}</div>}
                </div>
                <div style={{padding:"10px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:4,marginBottom:12,fontSize:11,color:GOLD_DARK,lineHeight:1.5,textAlign:"center"}}>
                  No outro computador, conecte com: <strong>{fb.fbSessao}</strong>
                </div>
                <div onClick={()=>{fb.desconectar();setShowFbModal(false);}} style={{padding:"10px",background:"#fff",border:"1px solid #E57373",borderRadius:4,cursor:"pointer",fontSize:12,color:"#C62828",textAlign:"center",fontWeight:600}}>
                  Desconectar
                </div>
              </div>
            ):(
              <div>
                <div style={{fontSize:10,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Nome da sessão</div>
                <input value={fb.fbSessao} onChange={e=>fb.setFbSessao(e.target.value.replace(/[^a-zA-Z0-9_-]/g,""))} placeholder="ex: consultorio-1" style={{width:"100%",padding:"10px 12px",border:"1px solid "+BORDER,borderRadius:3,fontSize:14,fontWeight:600,color:GOLD_DARK,outline:"none",boxSizing:"border-box",marginBottom:8}}/>
                <div style={{fontSize:10,color:"#9A8060",marginBottom:16,lineHeight:1.5}}>
                  Use o mesmo nome nos dois computadores. Ex: <strong>consultorio-1</strong> ou o nome do paciente.
                </div>
                <div style={{display:"flex",gap:8}}>
                  <div onClick={()=>{if(!fb.fbSessao.trim()){alert("Digite um nome para a sessão");return;}onFirebaseReady(()=>fb.conectar(fb.fbSessao));setShowFbModal(false);}} style={{flex:1,padding:"11px",background:GOLD_DARK,color:"#fff",borderRadius:4,cursor:"pointer",fontSize:12,fontWeight:700,textAlign:"center"}}>
                    Conectar
                  </div>
                  <div onClick={()=>setShowFbModal(false)} style={{padding:"11px 16px",background:"#fff",border:"1px solid "+BORDER,borderRadius:4,cursor:"pointer",fontSize:12,color:"#9A8060",textAlign:"center"}}>
                    Cancelar
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <CalculadoraFlutuante/>
      {/* Botão Preview flutuante */}
      {pag!=="rel"&&(
        <div className="no-print preview-btn" onClick={()=>setPreviewAberto(!previewAberto)} style={{
          position:"fixed",bottom:76,right:16,zIndex:200,
          background:previewAberto?"#3D1F4E":GOLD,color:"#fff",
          borderRadius:24,padding:"9px 14px",fontSize:10,fontWeight:700,
          cursor:"pointer",boxShadow:"0 3px 12px rgba(0,0,0,0.3)",
          display:"flex",alignItems:"center",gap:5,letterSpacing:1,
          textTransform:"uppercase",
        }}>
          {previewAberto?"✕ Fechar":"👁 Preview"}
        </div>
      )}

      {/* Painel de preview */}
      {previewAberto&&pag!=="rel"&&(
        <div className="no-print" style={{
          position:"fixed",top:0,right:0,width:"min(420px,90vw)",height:"100vh",
          background:"#fff",boxShadow:"-4px 0 24px rgba(0,0,0,0.15)",
          zIndex:190,overflowY:"auto",paddingBottom:80,
        }}>
          <div style={{padding:"12px 16px",background:"#3D1F4E",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <span style={{fontSize:11,color:GOLD_LIGHT,fontWeight:700,letterSpacing:2,textTransform:"uppercase"}}>Preview do Relatório</span>
            <span onClick={()=>setPreviewAberto(false)} style={{color:"#9A8060",cursor:"pointer",fontSize:16}}>✕</span>
          </div>
          <div style={{transform:"scale(0.72)",transformOrigin:"top left",width:"139%",pointerEvents:"none"}}>
            <Relatorio {...previewProps} isPreview={true} onSetModoRel={v=>sp3("modoRel",v)}/>
          </div>
        </div>
      )}

      {pag==="p1"&&<P1 data={p1} setData={setP1} onNovoPaciente={()=>{
  setP1(p1Initial);
  _setP2Raw({...p2Initial, achados: getAchadosInicial()});
  setP3(prev=>({...p3Initial, ds:prev.ds, ci:prev.ci, quemPaga:prev.quemPaga, plano:prev.plano}));
  setP4State(prev=>({...p4Initial, procsBase:prev.procsBase, customProcs:(prev.customProcs||[]).map(c=>({...c,ativo:false,dentes:[],obs:"",subtopics:[],proposta:null,valoresDente:{}}))}));
  _driveFileId=null; _driveFileName=null; _lastSyncHash="";
}} onImportarFormulario={(f)=>{
  setP1(prev=>({...prev, nome:f.nome, cpf:f.cpf, telefone:f.telefone, dataNasc:f.dataNasc, idade:f.idade, isMinor:f.isMinor, respNome:f.respNome, respCpf:f.respCpf, assinatura:f.assinatura||""}));
}}/>}
      {pag==="p2"&&<P2 data={p2} setData={setP2}/>}
      {pag==="p4"&&<P4 onTotalChange={(total) => { setP4Total(total); if(total > 0) sp3("vb", String(total)); else if(p3.vb === String(p4Total)) sp3("vb",""); }} p4State={p4State} setP4State={setP4State}/>}
      {pag==="p3"&&<P3
        vb={p3.vb || (p4Total > 0 ? String(p4Total) : "")} setVb={v=>sp3("vb",v)}
        ds={p3.ds} setDs={v=>sp3("ds",v)}
        dc={p3.dc} setDc={v=>sp3("dc",v)}
        fc={p3.fc} setFc={v=>sp3("fc",v)}
        fa={p3.fa} setFa={v=>sp3("fa",v)}
        bm={p3.bm} setBm={v=>sp3("bm",v)}
        bp={p3.bp} setBp={v=>sp3("bp",v)}
        bj={p3.bj} setBj={v=>sp3("bj",v)}
        bi={p3.bi} setBi={v=>sp3("bi",v)}
        ci={p3.ci} setCi={v=>sp3("ci",v)}
        cp={p3.cp} setCp={v=>sp3("cp",v)}
        tb={p3.tb} setTb={v=>sp3("tb",v)}
        entrada={p3.entrada} setEntrada={v=>sp3("entrada",v)}
        entradaTipo={p3.entradaTipo} setEntradaTipo={v=>sp3("entradaTipo",v)}
        entradaVal={p3.entradaVal} setEntradaVal={v=>sp3("entradaVal",v)}
        saldoTipo={p3.saldoTipo} setSaldoTipo={v=>sp3("saldoTipo",v)}
        ct={p3.ct!==false} setCt={v=>sp3("ct",v)} bt={p3.bt!==false} setBt={v=>sp3("bt",v)}
        planoExterno={p3.plano||"dias14"} setPlanoExterno={v=>sp3("plano",v)}
        p3QuemPaga={p3.quemPaga||"comprador"} setP3QuemPaga={v=>sp3("quemPaga",v)}
        boletoComDesconto={p3.boletoComDesconto||false} setBoletoComDesconto={v=>sp3("boletoComDesconto",v)}
        p4State={p4State}
        modoRel={p3.modoRel||"soma"} setModoRel={v=>sp3("modoRel",v)}
      />}
      {pag==="rel"&&<Relatorio p1={p1} p2={p2} p3={p3} p4State={p4State} onSetModoRel={v=>sp3("modoRel",v)} onSalvar={()=>{
  const dup = verificarDuplicata(p1);
  if(dup) {
    setModalSalvar({
      msg: "Já existe um atendimento salvo para este paciente.",
      onSobrepor: ()=>{ setModalSalvar(null); salvarRelatorio(p1,p2,p3,p4State,true); setRelatorioSalvo(true); setTimeout(()=>setRelatorioSalvo(false),3000); },
      onDuplicar: ()=>{ setModalSalvar(null); salvarRelatorio(p1,p2,p3,p4State,false); setRelatorioSalvo(true); setTimeout(()=>setRelatorioSalvo(false),3000); },
      onCancelar: ()=>setModalSalvar(null),
    });
  } else {
    salvarRelatorio(p1,p2,p3,p4State,false);
    setRelatorioSalvo(true);setTimeout(()=>setRelatorioSalvo(false),3000);
  }
}} salvoOk={relatorioSalvo} onCarregarDrive={(r)=>{
  if(r._p1) setP1(r._p1);
  if(r._p2) setP2(sanitizeP2(r._p2));
  if(r._p3) setP3({...p3Initial,...r._p3});
  if(r._p4) { const p4r=r._p4; if(!p4r.procsBase) p4r.procsBase=PROC_BASE.map(p=>({...p})); if(!p4r.itens) p4r.itens=p4r.procsBase.map(p=>({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],obs:"",subtopics:[],proposta:null,valoresDente:{}})); setP4State(p4r); }
  setPag("p1");
}}/>}
      {pag==="arq"&&<Arquivo onCarregar={(r)=>{
        if(r._p1) setP1(r._p1);
        if(r._p2) setP2(sanitizeP2(r._p2));
        if(r._p3) setP3({...p3Initial,...r._p3});
        if(r._p4) { const p4r=r._p4; if(!p4r.procsBase) p4r.procsBase=PROC_BASE.map(p=>({...p})); if(!p4r.itens) p4r.itens=p4r.procsBase.map(p=>({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],obs:"",subtopics:[],proposta:null,valoresDente:{}})); setP4State(p4r); }
        setPag("p1");
      }}/>}
      {/* Botão desfazer flutuante por aba */}
      {(()=>{
        const mapa = {p1:[desfazerP1,podeDesfazerP1],p2:[desfazerP2,podeDesfazerP2],p3:[desfazerP3,podeDesfazerP3],p4:[desfazerP4,podeDesfazerP4]};
        const [fn, pode] = mapa[pag]||[null,false];
        if(!fn||!pode) return null;
        return(
          <div className="no-print" onClick={fn} style={{
            position:"fixed",bottom:120,right:16,zIndex:200,
            background:"rgba(44,24,16,0.92)",color:GOLD_LIGHT,
            borderRadius:20,padding:"7px 13px",fontSize:10,fontWeight:600,
            cursor:"pointer",boxShadow:"0 2px 8px rgba(0,0,0,0.3)",
            display:"flex",alignItems:"center",gap:5,border:"1px solid "+GOLD_DARK,
          }}>↩ Desfazer</div>
        );
      })()}


      {/* Modal Sobrepor / Duplicar / Cancelar */}
      {modalSalvar&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.5)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:10,padding:28,maxWidth:380,width:"90%",boxShadow:"0 8px 32px rgba(0,0,0,0.3)"}}>
            <div style={{fontSize:15,fontWeight:700,color:GOLD_DARK,marginBottom:8}}>Arquivo já existe</div>
            <div style={{fontSize:12,color:"#5C4A2A",marginBottom:22,lineHeight:1.6}}>{modalSalvar.msg}</div>
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div onClick={modalSalvar.onSobrepor} style={{padding:"12px 16px",background:GOLD_DARK,color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700,textAlign:"center"}}>
                Sobrepor
              </div>
              <div onClick={modalSalvar.onDuplicar} style={{padding:"12px 16px",background:"#fff",color:GOLD_DARK,border:"1.5px solid "+GOLD,borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:600,textAlign:"center"}}>
                Duplicar (salvar como cópia)
              </div>
              <div onClick={modalSalvar.onCancelar} style={{padding:"12px 16px",background:"#fff",color:"#9A8060",border:"1px solid "+BORDER,borderRadius:6,cursor:"pointer",fontSize:12,textAlign:"center"}}>
                Cancelar
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Popup de boas-vindas — conectar Drive + status Firebase */}
      {showWelcome&&!driveLogado&&pag==="p1"&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,background:"rgba(0,0,0,0.6)",zIndex:700,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#fff",borderRadius:12,padding:28,maxWidth:380,width:"90%",textAlign:"center",boxShadow:"0 8px 40px rgba(0,0,0,0.3)"}}>
            <svg width="48" height="48" viewBox="0 0 40 52" fill="none" style={{margin:"0 auto 12px"}}>
              <ellipse cx="20" cy="26" rx="18" ry="24" stroke={GOLD} strokeWidth="1.5"/>
              <text x="20" y="32" textAnchor="middle" fontFamily="Georgia" fontSize="18" fontStyle="italic" fill={GOLD}>i</text>
            </svg>
            <div style={{fontFamily:"Georgia",fontSize:20,fontWeight:700,color:GOLD_DARK,letterSpacing:2,marginBottom:4}}>ÍNTEGRA</div>
            <div style={{fontSize:12,color:"#5C4A2A",lineHeight:1.6,marginBottom:16}}>Conecte sua conta Google para salvar atendimentos em nuvem com segurança.</div>

            {/* Status Firebase */}
            <div style={{padding:"10px 14px",background:fb.fbConectado?"#E8F5E9":"#FFF8E1",border:"1px solid "+(fb.fbConectado?"#4CAF50":"#FFB74D"),borderRadius:6,marginBottom:16,display:"flex",alignItems:"center",gap:8,justifyContent:"center"}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:fb.fbConectado?"#4CAF50":"#FFB74D",boxShadow:fb.fbConectado?"0 0 6px #4CAF50":"none"}}/>
              <span style={{fontSize:11,fontWeight:600,color:fb.fbConectado?"#2E7D32":"#E65100"}}>{fb.fbConectado?"Rede sincronizada: "+fb.fbSessao:"Conectando à rede..."}</span>
            </div>

            <div onClick={async()=>{try{await gdriveEnsureScript();await gdriveLogin();setShowWelcome(false);}catch(e){alert(e.message.includes("cancelado")||e.message.includes("access_denied")?"Use uma conta autorizada: integratrindade@gmail.com, arthurarioli@hotmail.com ou arthurfloripa.aac@gmail.com":"Erro: "+e.message);}}} style={{padding:"14px",background:GOLD_DARK,color:"#fff",borderRadius:6,cursor:"pointer",fontSize:13,fontWeight:700,marginBottom:10,display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
              <svg width="16" height="16" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>
              Conectar com Google
            </div>
            <div onClick={()=>setShowWelcome(false)} style={{padding:"10px",color:"#9A8060",cursor:"pointer",fontSize:11}}>
              Pular por agora →
            </div>
          </div>
        </div>
      )}
      {showConfigs&&<Configs onClose={()=>setShowConfigs(false)}/>}
      <nav className="no-print" style={{display:"flex",position:"fixed",bottom:0,left:0,right:0,background:CREAM,borderTop:"2px solid "+GOLD,zIndex:100,boxShadow:"0 -2px 12px rgba(0,0,0,0.1)"}}>
        {[
          {id:"p1",icon:"1",label:"Paciente"},
          {id:"p2",icon:"2",label:"Avaliação"},
          {id:"p4",icon:"3",label:"Plano"},
          {id:"p3",icon:"4",label:"Orçamento"},
          {id:"rel",icon:"5",label:"Relatório"},
          {id:"arq",icon:"📁",label:"Arquivo"},
        ].map(tab=>(
          <button key={tab.id} style={{flex:1,padding:"8px 2px 10px",border:"none",background:pag===tab.id?GOLD_DARK:"transparent",color:pag===tab.id?"#fff":GOLD_DARK,fontFamily:"inherit",fontSize:11,fontWeight:700,letterSpacing:"0.5px",textTransform:"uppercase",cursor:"pointer",borderTop:pag===tab.id?"3px solid "+GOLD:"3px solid transparent",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"all 0.15s"}} onClick={()=>setPag(tab.id)}>
            <span style={{fontSize:tab.icon.length>1?16:15,fontWeight:800,width:28,height:28,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",background:pag===tab.id?"#fff":GOLD_PALE,color:pag===tab.id?GOLD_DARK:GOLD_DARK,boxShadow:pag===tab.id?"0 2px 6px rgba(122,96,32,0.3)":"none"}}>{tab.icon}</span>
            <span style={{fontSize:10}}>{tab.label}</span>
          </button>
        ))}
        <button style={{padding:"8px 10px 10px",border:"none",background:"transparent",color:GOLD_DARK,fontFamily:"inherit",fontSize:18,cursor:"pointer",borderTop:"3px solid transparent"}} onClick={()=>setShowConfigs(true)}>⚙</button>
      </nav>
      <div className="no-print" style={{textAlign:"center",fontSize:8,color:"#ccc",padding:"2px 0"}}>v9.0</div>
    </div>
  );
}

export default App;
