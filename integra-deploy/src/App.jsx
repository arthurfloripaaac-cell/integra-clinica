import { useState, useEffect, useMemo } from "react";
// v2.1 - unified with relatorio

// ─── PALETA ───────────────────────────────────────
const GOLD = "#B8962E", GOLD_DARK = "#7A6020", GOLD_LIGHT = "#D4B96A";
const GOLD_PALE = "#F5EED8", CREAM = "#FDFAF4", BORDER = "#E8DCC8", PURPLE = "#5B2D8E";

const fmt = v => "R$ " + (v||0).toLocaleString("pt-BR", {minimumFractionDigits:2, maximumFractionDigits:2});
const parseMoeda = v => parseFloat(String(v).replace(/[^0-9,]/g,"").replace(",",".")) || 0;

// ─── NOMENCLATURA DENTAL ─────────────────────────
const NOMES_DENTES = {
  // Superior direito (Q1)
  18:"3º molar sup. dir.",  17:"2º molar sup. dir.",  16:"1º molar sup. dir.",
  15:"2º pré-molar sup. dir.", 14:"1º pré-molar sup. dir.",
  13:"canino sup. dir.", 12:"incisivo lat. sup. dir.", 11:"incisivo cent. sup. dir.",
  // Superior esquerdo (Q2)
  21:"incisivo cent. sup. esq.", 22:"incisivo lat. sup. esq.", 23:"canino sup. esq.",
  24:"1º pré-molar sup. esq.", 25:"2º pré-molar sup. esq.",
  26:"1º molar sup. esq.", 27:"2º molar sup. esq.", 28:"3º molar sup. esq.",
  // Inferior esquerdo (Q3)
  31:"incisivo cent. inf. esq.", 32:"incisivo lat. inf. esq.", 33:"canino inf. esq.",
  34:"1º pré-molar inf. esq.", 35:"2º pré-molar inf. esq.",
  36:"1º molar inf. esq.", 37:"2º molar inf. esq.", 38:"3º molar inf. esq.",
  // Inferior direito (Q4)
  48:"3º molar inf. dir.", 47:"2º molar inf. dir.", 46:"1º molar inf. dir.",
  45:"2º pré-molar inf. dir.", 44:"1º pré-molar inf. dir.",
  43:"canino inf. dir.", 42:"incisivo lat. inf. dir.", 41:"incisivo cent. inf. dir.",
  // Decíduos
  55:"2º molar dec. sup. dir.", 54:"1º molar dec. sup. dir.", 53:"canino dec. sup. dir.",
  52:"incisivo lat. dec. sup. dir.", 51:"incisivo cent. dec. sup. dir.",
  61:"incisivo cent. dec. sup. esq.", 62:"incisivo lat. dec. sup. esq.", 63:"canino dec. sup. esq.",
  64:"1º molar dec. sup. esq.", 65:"2º molar dec. sup. esq.",
  71:"incisivo cent. dec. inf. esq.", 72:"incisivo lat. dec. inf. esq.", 73:"canino dec. inf. esq.",
  74:"1º molar dec. inf. esq.", 75:"2º molar dec. inf. esq.",
  85:"2º molar dec. inf. dir.", 84:"1º molar dec. inf. dir.", 83:"canino dec. inf. dir.",
  82:"incisivo lat. dec. inf. dir.", 81:"incisivo cent. dec. inf. dir.",
};

// Formata lista de dentes de forma inteligente
function formatarDentes(dentes) {
  if(!dentes||dentes.length===0) return "";
  const sorted = [...dentes].sort((a,b)=>a-b);
  if(sorted.length === 1) {
    const d = sorted[0];
    return `${d} — ${NOMES_DENTES[d]||"dente "+d}`;
  }
  if(sorted.length <= 3) {
    return sorted.map(d=>`${d} (${NOMES_DENTES[d]||"dente "+d})`).join(", ");
  }

  // Verificar padrões de região — usando os dentes permanentes (11-48)
  const permanentesSup = [11,12,13,14,15,16,17,18,21,22,23,24,25,26,27,28];
  const permanentesInf = [31,32,33,34,35,36,37,38,41,42,43,44,45,46,47,48];
  const permanentes = [...permanentesSup,...permanentesInf];

  const filtrado = sorted.filter(d=>permanentes.includes(d));
  // Boca toda: todos os 32 permanentes marcados
  const bocaToda = permanentes.every(d=>sorted.includes(d));
  // Shortcut: se tem exatamente 32 dentes permanentes, é boca toda
  if(bocaToda || (filtrado.length===32 && sorted.length===32)) return "Boca toda";
  // Arcada só superior ou só inferior
  const todosSup = permanentesSup.every(d=>sorted.includes(d)) && sorted.filter(d=>permanentesInf.includes(d)).length===0;
  const todosInf = permanentesInf.every(d=>sorted.includes(d)) && sorted.filter(d=>permanentesSup.includes(d)).length===0;

  if(todosSup) return "Arcada superior";
  if(todosInf) return "Arcada inferior";

  // Grupos por tipo
  const molares = [16,17,18,26,27,28,36,37,38,46,47,48];
  const molaresInf = [36,37,38,46,47,48];
  const molaresSup = [16,17,18,26,27,28];
  const incisivos = [11,12,21,22,31,32,41,42];
  const incisivosSup = [11,12,21,22];
  const incisivosInf = [31,32,41,42];

  const todosMolares = sorted.every(d=>molares.includes(d));
  const todosMolaresSup = sorted.every(d=>molaresSup.includes(d));
  const todosMolaresInf = sorted.every(d=>molaresInf.includes(d));
  const todosIncisivosSup = sorted.every(d=>incisivosSup.includes(d));
  const todosIncisivosInf = sorted.every(d=>incisivosInf.includes(d));

  if(todosMolaresSup) return `${sorted.length} molares superiores (${sorted.join(", ")})`;
  if(todosMolaresInf) return `${sorted.length} molares inferiores (${sorted.join(", ")})`;
  if(todosMolares) return `${sorted.length} molares (${sorted.join(", ")})`;
  if(todosIncisivosSup) return `${sorted.length} incisivos superiores (${sorted.join(", ")})`;
  if(todosIncisivosInf) return `${sorted.length} incisivos inferiores (${sorted.join(", ")})`;
  if(filtrado.every(d=>permanentesSup.includes(d))) return `${sorted.length} dentes superiores (${sorted.join(", ")})`;
  if(filtrado.every(d=>permanentesInf.includes(d))) return `${sorted.length} dentes inferiores (${sorted.join(", ")})`;
  return `${sorted.length} dentes: ${sorted.join(", ")}`;
}

// ─── COMPONENTES COMUNS ───────────────────────────
function Header() {
  return (
    <div style={{background:"linear-gradient(135deg,#2C1810 0%,#1A0F08 100%)", padding:"16px 20px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
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

const inp = {width:"100%", padding:"10px 12px", border:"1px solid "+BORDER, borderRadius:2, fontSize:13, color:"#1C1410", background:"#fff", outline:"none", fontFamily:"inherit"};
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

function P1({data, setData}) {
  const {nome,cpf,telefone,dataNasc,idade,isMinor,respNome,respCpf,dataConsulta,responsavel} = data;

  const [equipe, setEquipe] = useState(EQUIPE);
  const [gerenciandoEquipe, setGerenciandoEquipe] = useState(false);
  const [novoMembro, setNovoMembro] = useState({nome:"", area:""});
  const [adicionandoMembro, setAdicionandoMembro] = useState(false);

  // Carregar equipe persistente
  useEffect(()=>{
    (async()=>{
      try{
        const r = await window.storage.get("equipe_clinica");
        if(r?.value){
          const saved = JSON.parse(r.value);
          if(saved.length>0) setEquipe(saved);
        }
      }catch(e){}
    })();
  },[]);

  const salvarEquipe = async(novaEquipe) => {
    setEquipe(novaEquipe);
    try{ await window.storage.set("equipe_clinica", JSON.stringify(novaEquipe)); }catch(e){}
  };

  const adicionarMembro = () => {
    if(!novoMembro.nome.trim()) return;
    const nova = [...equipe, {nome:novoMembro.nome.trim(), area:novoMembro.area.trim()||"Clínica Geral"}];
    salvarEquipe(nova);
    setNovoMembro({nome:"", area:""});
    setAdicionandoMembro(false);
    setData(p=>({...p, responsavel:novoMembro.nome.trim()}));
  };

  const removerMembro = (nome) => {
    const nova = equipe.filter(p=>p.nome!==nome);
    salvarEquipe(nova);
    if(responsavel===nome) setData(p=>({...p, responsavel:nova[0]?.nome||""}));
  };

  const editarMembro = (idx, campo, valor) => {
    const nova = equipe.map((p,i)=>i===idx?{...p,[campo]:valor}:p);
    salvarEquipe(nova);
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
        <SectionTitle>Dados do Paciente</SectionTitle>
        <div style={{marginBottom:12}}>
          <Field label="Nome completo"><input style={inp} value={nome} onChange={e=>set("nome",e.target.value)} placeholder="Nome completo"/></Field>
        </div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
          <Field label="CPF"><input style={inp} value={cpf} onChange={e=>set("cpf",formatCpf(e.target.value))} placeholder="000.000.000-00"/></Field>
          <Field label="Telefone / WhatsApp"><input style={inp} value={telefone} onChange={e=>set("telefone",e.target.value)} placeholder="(48) 99999-9999"/></Field>
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
              <Field label="Nome do responsável"><input style={inp} value={respNome} onChange={e=>set("respNome",e.target.value)} placeholder="Nome completo"/></Field>
            </div>
            <Field label="CPF do responsável"><input style={inp} value={respCpf} onChange={e=>set("respCpf",formatCpf(e.target.value))} placeholder="000.000.000-00"/></Field>
          </div>
        )}
        <div style={{borderTop:"1px solid "+BORDER, marginTop:4, paddingTop:16}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <div style={{fontSize:9, letterSpacing:2, textTransform:"uppercase", color:GOLD_DARK, fontWeight:700}}>Dados da Consulta</div>
          </div>
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12}}>
            <Field label="Data da consulta"><input style={inp} type="date" value={dataConsulta} onChange={e=>set("dataConsulta",e.target.value)}/></Field>
            <Field label="Responsável clínico">
              <select style={sel} value={responsavel} onChange={e=>set("responsavel",e.target.value)}>
                {equipe.map(p=><option key={p.nome} value={p.nome}>{p.nome} — {p.area}</option>)}
              </select>
            </Field>
          </div>

          {/* Gerenciar equipe */}
          <div style={{marginTop:4}}>
            <div onClick={()=>{setGerenciandoEquipe(!gerenciandoEquipe);setAdicionandoMembro(false);}}
              style={{fontSize:10,color:gerenciandoEquipe?GOLD_DARK:"#9A8060",cursor:"pointer",display:"inline-flex",alignItems:"center",gap:5,padding:"3px 10px",border:"1px solid "+(gerenciandoEquipe?GOLD:BORDER),borderRadius:20}}>
              ✎ {gerenciandoEquipe?"Fechar equipe":"Gerenciar equipe clínica"}
            </div>

            {gerenciandoEquipe&&(
              <div style={{marginTop:10,padding:"12px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                  <div style={{fontSize:10,fontWeight:700,color:GOLD_DARK}}>Equipe clínica ({equipe.length} profissionais)</div>
                  <div onClick={()=>setAdicionandoMembro(!adicionandoMembro)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700}}>+ Novo membro</div>
                </div>

                {adicionandoMembro&&(
                  <div style={{padding:"10px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,marginBottom:10}}>
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      <input style={{...inp,marginBottom:0}} placeholder="Nome completo (ex: Dr. João Silva)" value={novoMembro.nome} onChange={e=>setNovoMembro(p=>({...p,nome:e.target.value}))} autoFocus/>
                      <input style={{...inp,marginBottom:0}} placeholder="Especialidade (ex: Ortodontia)" value={novoMembro.area} onChange={e=>setNovoMembro(p=>({...p,area:e.target.value}))}
                        onKeyDown={e=>e.key==="Enter"&&adicionarMembro()}/>
                      <div style={{display:"flex",gap:6}}>
                        <div onClick={adicionarMembro} style={{flex:1,padding:"7px",borderRadius:2,background:GOLD,color:"#fff",fontWeight:700,fontSize:11,cursor:"pointer",textAlign:"center"}}>+ Adicionar</div>
                        <div onClick={()=>setAdicionandoMembro(false)} style={{padding:"7px 12px",borderRadius:2,border:"1px solid "+BORDER,color:"#9A8060",fontSize:11,cursor:"pointer"}}>✕</div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{display:"flex",flexDirection:"column",gap:6}}>
                  {equipe.map((p,i)=>(
                    <div key={i} style={{background:"#fff",borderRadius:3,border:"1px solid "+BORDER,padding:"8px 10px"}}>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr auto",gap:6,alignItems:"center"}}>
                        <input style={{...inp,marginBottom:0,fontSize:11,fontWeight:600}} value={p.nome}
                          onChange={e=>editarMembro(i,"nome",e.target.value)}
                          onBlur={()=>{ if(responsavel===equipe[i]?.nome) set("responsavel",p.nome); }}/>
                        <input style={{...inp,marginBottom:0,fontSize:11}} value={p.area}
                          onChange={e=>editarMembro(i,"area",e.target.value)} placeholder="Especialidade"/>
                        <div onClick={()=>removerMembro(p.nome)} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid #E57373",color:"#E57373",flexShrink:0}}>✕</div>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:9,color:"#9A8060",marginTop:8}}>✦ Alterações salvas automaticamente e persistem entre sessões.</div>
              </div>
            )}
          </div>
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

function Dente({numero, achadoAtivo, achadosDente, achadosList, onClick}) {
  const tipo=tipoDente(numero), size=tipo==="molar"?28:tipo==="premolar"?24:22;
  const achados=Object.entries(achadosDente[numero]||{}).filter(([,v])=>v);
  const tem=achados.length>0;
  const cor=tem?achadosList.find(a=>a.id===achados[0][0])?.cor:null;
  const marcado=achadoAtivo&&achadosDente[numero]?.[achadoAtivo];
  return (
    <div onClick={()=>onClick(numero)} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3,cursor:"pointer"}}>
      <div style={{width:size,height:size,borderRadius:tipo==="anterior"?"50%":4,border:"2px solid "+(marcado?GOLD_DARK:tem?cor:BORDER),background:tem?cor+"33":achadoAtivo?GOLD_PALE:"#fff",position:"relative",transition:"all 0.12s",boxShadow:marcado?"0 0 0 2px "+GOLD_PALE:"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
        {marcado&&<span style={{fontSize:9,color:GOLD_DARK,fontWeight:900}}>✓</span>}
        {!achadoAtivo&&achados.length>1&&<div style={{position:"absolute",top:-4,right:-4,width:10,height:10,borderRadius:"50%",background:achadosList.find(a=>a.id===achados[1][0])?.cor,border:"1px solid #fff"}}/>}
      </div>
      <span style={{fontSize:8,color:marcado?GOLD_DARK:tem?cor:"#B0A090",fontWeight:tem||marcado?700:400}}>{numero}</span>
    </div>
  );
}

function descreverRegiao(dentes) {
  if(!dentes||dentes.length===0) return "";
  const todos = Object.values(QUADRANTES).flat();
  const sup = [...QUADRANTES.q1,...QUADRANTES.q2];
  const inf = [...QUADRANTES.q3,...QUADRANTES.q4];
  const temTodos = todos.every(d=>dentes.includes(d));
  if(temTodos) return "Boca toda";
  const temSup = sup.every(d=>dentes.includes(d)) && inf.every(d=>!dentes.includes(d));
  if(temSup) return "Arcada superior";
  const temInf = inf.every(d=>dentes.includes(d)) && sup.every(d=>!dentes.includes(d));
  if(temInf) return "Arcada inferior";
  if(dentes.length<=4) return "Dentes: "+dentes.join(", ");
  return dentes.length+"x dentes";
}

function P2({data, setData}) {
  const {achadosDente, achadoAtivo, segAtivo, arcadaAtiva, obsTexto, obsCorrigido} = data;
  const ACHADOS = data.achados || ACHADOS_DEFAULT;
  const [editandoAchados, setEditandoAchados] = useState(false);
  const [novoAchado, setNovoAchado] = useState({label:"", cor:"#4CAF50"});
  const [adicionando, setAdicionando] = useState(false);
  const [corrigindo, setCorrigindo] = useState(false);
  const [abaCatalogo, setAbaCatalogo] = useState(false);
  const [catalogoAchados, setCatalogoAchados] = useState([]);
  const [editandoCatIdx, setEditandoCatIdx] = useState(null);
  const [catNomeEdit, setCatNomeEdit] = useState("");
  const set = (k,v) => setData(p=>({...p,[k]:v}));

  // Carregar catálogo de achados persistente
  React.useEffect(()=>{
    (async()=>{
      try{const r=await window.storage.get("catalogo_achados");if(r?.value)setCatalogoAchados(JSON.parse(r.value));}catch(e){}
    })();
  },[]);

  const salvarCatalogoAchados = async(novo) => {
    setCatalogoAchados(novo);
    try{await window.storage.set("catalogo_achados",JSON.stringify(novo));}catch(e){}
  };

  // Salvar achado ativo no catálogo
  const salvarAchadoNoCatalogo = () => {
    if(!achadoAtivo) return;
    const achado = ACHADOS.find(a=>a.id===achadoAtivo);
    if(!achado) return;
    const dentesAtivos = Object.entries(achadosDente).filter(([,v])=>v[achadoAtivo]).map(([d])=>parseInt(d));
    const sufixo = dentesAtivos.length>0 ? ` — ${dentesAtivos.length}x dentes` : "";
    const novo = {
      id:"cat_"+Date.now(), nome:achado.label+sufixo,
      achado:{...achado}, dentes:dentesAtivos,
      criadoEm:new Date().toLocaleDateString("pt-BR")
    };
    salvarCatalogoAchados([...catalogoAchados, novo]);
  };

  const aplicarAchadoCatalogo = (item) => {
    // Garante que o achado existe na lista
    const jaExiste = ACHADOS.find(a=>a.id===item.achado.id);
    if(!jaExiste) set("achados",[...ACHADOS, item.achado]);
    // Aplica os dentes salvos
    const novosDentes = {...achadosDente};
    item.dentes.forEach(d=>{novosDentes[d]={...(novosDentes[d]||{}),[item.achado.id]:true};});
    setData(p=>({...p, achadosDente:novosDentes, achadoAtivo:item.achado.id,
      achados:jaExiste?p.achados||ACHADOS_DEFAULT:[...ACHADOS,item.achado]}));
    setAbaCatalogo(false);
  };

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

  const corrigir = async () => {
    if(!obsTexto.trim()) return;
    setCorrigindo(true);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json","anthropic-dangerous-direct-browser-access":"true"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:500,system:"Corrija APENAS erros de ortografia e digitação. Não altere o texto, não reescreva. Retorne SOMENTE o texto corrigido.",messages:[{role:"user",content:obsTexto}]})});
      const d = await res.json();
      set("obsCorrigido", d.content.map(i=>i.text||"").join("").trim());
    } catch(e){set("obsCorrigido",obsTexto);}
    finally{setCorrigindo(false);}
  };

  const resumo = ACHADOS.map(a=>({...a,dentes:Object.entries(achadosDente).filter(([,v])=>v[a.id]).map(([d])=>parseInt(d)).sort((x,y)=>x-y)})).filter(a=>a.dentes.length>0);
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
              <div onClick={()=>{setAbaCatalogo(!abaCatalogo);setAdicionando(false);}} style={{fontSize:10,color:abaCatalogo?GOLD_DARK:"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(abaCatalogo?GOLD:BORDER),borderRadius:20}}>⭐ Salvos</div>
              <div onClick={()=>{setAdicionando(!adicionando);setAbaCatalogo(false);}} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20}}>+ Novo</div>
              <div onClick={()=>setEditandoAchados(!editandoAchados)} style={{fontSize:10,color:editandoAchados?"#E57373":"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(editandoAchados?"#E57373":BORDER),borderRadius:20}}>{editandoAchados?"✓ Concluir":"✎ Editar"}</div>
            </div>
          </div>

          {/* Painel catálogo */}
          {abaCatalogo&&(
            <div style={{marginBottom:10,padding:"12px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:GOLD_DARK}}>⭐ Catálogo de achados</div>
                  <div style={{fontSize:9,color:"#9A8060",marginTop:2}}>{catalogoAchados.length} item(s) salvos</div>
                </div>
                {achadoAtivo&&<div onClick={salvarAchadoNoCatalogo} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700}}>⭐ Salvar atual</div>}
              </div>
              {catalogoAchados.length===0&&<div style={{fontSize:11,color:"#9A8060",fontStyle:"italic",padding:"6px 0"}}>Nenhum achado salvo. Selecione um achado + dentes e clique "⭐ Salvar atual".</div>}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {catalogoAchados.map((item,i)=>(
                  <div key={item.id} style={{background:"#fff",borderRadius:3,border:"1px solid "+BORDER,overflow:"hidden"}}>
                    {editandoCatIdx===i?(
                      <div style={{display:"flex",gap:6,padding:"8px 10px",alignItems:"center"}}>
                        <input autoFocus style={{flex:1,padding:"5px 8px",border:"1px solid "+GOLD,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}}
                          value={catNomeEdit} onChange={e=>setCatNomeEdit(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter"){const n=catalogoAchados.map((t,j)=>j===i?{...t,nome:catNomeEdit}:t);salvarCatalogoAchados(n);setEditandoCatIdx(null);}if(e.key==="Escape")setEditandoCatIdx(null);}}/>
                        <div onClick={()=>{const n=catalogoAchados.map((t,j)=>j===i?{...t,nome:catNomeEdit}:t);salvarCatalogoAchados(n);setEditandoCatIdx(null);}} style={{padding:"4px 10px",background:GOLD,color:"#fff",borderRadius:2,fontSize:10,fontWeight:700,cursor:"pointer"}}>✓</div>
                        <div onClick={()=>setEditandoCatIdx(null)} style={{padding:"4px 8px",border:"1px solid "+BORDER,color:"#9A8060",borderRadius:2,fontSize:10,cursor:"pointer"}}>✕</div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",padding:"8px 10px",gap:6}}>
                        <div style={{width:10,height:10,borderRadius:"50%",background:item.achado.cor,flexShrink:0}}/>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:"#1C1410",fontWeight:600}}>{item.nome}</div>
                          {item.criadoEm&&<div style={{fontSize:9,color:"#C0B090"}}>Salvo em {item.criadoEm}</div>}
                        </div>
                        <div onClick={()=>aplicarAchadoCatalogo(item)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700,flexShrink:0}}>Aplicar</div>
                        <div onClick={()=>{setEditandoCatIdx(i);setCatNomeEdit(item.nome);}} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid "+BORDER,color:"#5C4A2A",flexShrink:0}}>✎</div>
                        <div onClick={()=>salvarCatalogoAchados(catalogoAchados.filter((_,j)=>j!==i))} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid #E57373",color:"#E57373",flexShrink:0}}>✕</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

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
              const ativo=achadoAtivo===a.id,qtd=Object.values(achadosDente).filter(v=>v[a.id]).length;
              return(<div key={a.id} style={{position:"relative",display:"flex",alignItems:"center"}}>
                {editandoAchados&&<div onClick={()=>{set("achados",ACHADOS.filter(x=>x.id!==a.id));}} style={{position:"absolute",top:-4,right:-4,width:14,height:14,borderRadius:"50%",background:"#E57373",color:"#fff",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:10,lineHeight:1}}>✕</div>}
                <div onClick={()=>set("achadoAtivo",ativo?null:a.id)} style={{padding:"5px 12px",borderRadius:20,fontSize:11,cursor:"pointer",border:"2px solid "+(ativo?a.cor:qtd>0?a.cor+"88":BORDER),background:ativo?a.cor:qtd>0?a.cor+"11":"#fff",color:ativo?"#fff":qtd>0?a.cor:"#5C4A2A",fontWeight:ativo||qtd>0?700:400,display:"flex",alignItems:"center",gap:5}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:ativo?"#fff":a.cor}}/>
                {a.label}
                {qtd>0&&<span style={{fontSize:9,background:ativo?"rgba(255,255,255,0.3)":a.cor,color:"#fff",borderRadius:10,padding:"1px 5px"}}>{qtd}</span>}
              </div>
              </div>);
            })}
          </div>
          {achadoAtivo&&<div style={{marginTop:10,padding:"8px 12px",background:aObj.cor+"15",border:"1.5px solid "+aObj.cor,borderRadius:3,fontSize:11,color:aObj.cor,fontWeight:600,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <span>Marcando: {aObj.label}</span>
            <div style={{display:"flex",gap:8,alignItems:"center"}}>
              <div onClick={salvarAchadoNoCatalogo} style={{fontSize:10,cursor:"pointer",padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20,color:GOLD_DARK,background:GOLD_PALE,fontWeight:600}}>⭐ Salvar no catálogo</div>
              <span onClick={()=>set("achadoAtivo",null)} style={{cursor:"pointer",opacity:0.7}}>✕</span>
            </div>
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
              {QUADRANTES.q1.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
            </div>
            <div style={{display:"flex",gap:3,paddingLeft:8}}>
              {QUADRANTES.q2.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
            </div>
          </div>
          <div style={{borderTop:"1px dashed "+BORDER,margin:"4px 0"}}/>
          <div style={{display:"flex",justifyContent:"center",gap:3,marginTop:8}}>
            <div style={{display:"flex",gap:3,paddingRight:8,borderRight:"1px dashed "+BORDER}}>
              {[...QUADRANTES.q4].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
            </div>
            <div style={{display:"flex",gap:3,paddingLeft:8}}>
              {[...QUADRANTES.q3].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
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
                {DECIDUOS.d1.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
              </div>
              <div style={{display:"flex",gap:2,paddingLeft:5}}>
                {DECIDUOS.d2.map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
              </div>
            </div>
            <div style={{borderTop:"1px dashed "+BORDER,margin:"3px 0"}}/>
            <div style={{display:"flex",justifyContent:"center",gap:2,marginTop:4}}>
              <div style={{display:"flex",gap:2,paddingRight:5,borderRight:"1px dashed "+BORDER}}>
                {[...DECIDUOS.d3].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
              </div>
              <div style={{display:"flex",gap:2,paddingLeft:5}}>
                {[...DECIDUOS.d4].reverse().map(n=><Dente key={n} numero={n} achadoAtivo={achadoAtivo} achadosDente={achadosDente} achadosList={ACHADOS} onClick={toggleDente}/>)}
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
                    <span style={{fontSize:11,color:"#9A8060"}}>{descreverRegiao(a.dentes)}</span>
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
        <textarea value={obsTexto} onChange={e=>{set("obsTexto",e.target.value);set("obsCorrigido","");}} placeholder="Digite informações clínicas adicionais..." style={{...inp,minHeight:90,resize:"vertical",lineHeight:1.6,width:"100%"}}/>
        {obsTexto.trim()&&(
          <div style={{marginTop:8,display:"flex",alignItems:"center",gap:8}}>
            <div onClick={corrigir} style={{padding:"6px 14px",borderRadius:20,background:corrigindo?"#ccc":GOLD,color:"#fff",fontSize:11,fontWeight:700,cursor:corrigindo?"default":"pointer"}}>
              {corrigindo?"Corrigindo...":"✓ Corrigir ortografia"}
            </div>
            {obsCorrigido&&obsCorrigido!==obsTexto&&(
              <div onClick={()=>{set("obsTexto",obsCorrigido);set("obsCorrigido","");}} style={{padding:"6px 14px",borderRadius:20,border:"1px solid "+GOLD,color:GOLD_DARK,fontSize:11,cursor:"pointer"}}>Aplicar correção</div>
            )}
          </div>
        )}
        {obsCorrigido&&<div style={{marginTop:10,padding:"10px 12px",background:"#fff",border:"1px solid "+GOLD,borderRadius:2,fontSize:13,color:"#1C1410",lineHeight:1.6}}>
          <div style={{fontSize:8.5,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:6}}>Texto corrigido</div>
          {obsCorrigido}
        </div>}
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

// ─── PLANOS PAGSEGURO ────────────────────────────
// Atualizado em: 27/04/2026 — conferido no app PagBank (simulador)
const PLANOS_PAGSEGURO = {
  hora: {
    label: "Na hora",
    descricao: "Recebimento imediato",
    taxaVista: 4.99,
    taxaParc: 5.59,
    jurosMes: 3.49,
    clientePagaJuros: false,
    cor: "#E57373",
    badge: "Antecipado",
  },
  dias14: {
    label: "14 dias",
    descricao: "Plano atual da clínica",
    taxaVista: 3.99,
    taxaParc: 4.59,
    jurosMes: 2.99,
    clientePagaJuros: true,
    cor: "#4CAF50",
    badge: "Plano atual",
  },
};

// Tabela real extraída do simulador PagBank para R$ 1.000,00 (plano 14 dias)
// Fator = parcela_cliente / 1000 — escala linearmente para qualquer valor
const TABELA_14DIAS = {
  1:  { fatorParcela: 1.04156, fatorTotal: 1.04156 }, // à vista: +4,156% cliente
  2:  { fatorParcela: 0.54891, fatorTotal: 1.09782 },
  3:  { fatorParcela: 0.37157, fatorTotal: 1.11471 },
  4:  { fatorParcela: 0.28294, fatorTotal: 1.13174 },
  5:  { fatorParcela: 0.22981, fatorTotal: 1.14903 },
  6:  { fatorParcela: 0.19441, fatorTotal: 1.16646 },
  7:  { fatorParcela: 0.16916, fatorTotal: 1.18414 },
  8:  { fatorParcela: 0.15026, fatorTotal: 1.20208 },
  9:  { fatorParcela: 0.13557, fatorTotal: 1.22011 },
  10: { fatorParcela: 0.12382, fatorTotal: 1.23824 },
  11: { fatorParcela: 0.11425, fatorTotal: 1.25676 },
  12: { fatorParcela: 0.10628, fatorTotal: 1.27535 },
  18: { fatorParcela: 0.07729, fatorTotal: 1.39121 },
};

// Interpola para parcelas não listadas na tabela
function fatorParcelado14dias(n) {
  if(TABELA_14DIAS[n]) return TABELA_14DIAS[n];
  const keys = Object.keys(TABELA_14DIAS).map(Number).sort((a,b)=>a-b);
  const low = keys.filter(k=>k<n).pop();
  const high = keys.filter(k=>k>n)[0];
  if(!low) return TABELA_14DIAS[high];
  if(!high) return TABELA_14DIAS[low];
  const t = (n-low)/(high-low);
  return {
    fatorParcela: TABELA_14DIAS[low].fatorParcela*(1-t) + TABELA_14DIAS[high].fatorParcela*t,
    fatorTotal: TABELA_14DIAS[low].fatorTotal*(1-t) + TABELA_14DIAS[high].fatorTotal*t,
  };
}

// Plano "Na hora" — você absorve todos os juros, recebe tudo de uma vez
function calcCreditoHora(valor, n) {
  const taxa = valor * 0.0499, liq = valor - taxa;
  if(n===1) return {parcela:valor, total:valor, totalCliente:valor, liquido:liq, taxa, juros:0};
  const i=0.0349, pmt=valor*i/(1-Math.pow(1+i,-n)), total=pmt*n;
  return {parcela:pmt, total, totalCliente:total, liquido:liq, taxa, juros:total-valor};
}

// Plano "14 dias" — cliente paga os juros, você paga só 4,59% de intermediação
function calcCredito14dias(valor, n) {
  const taxaInt = valor * 0.0459;
  const liq = valor - taxaInt;
  const f = fatorParcelado14dias(n);
  const parcela = valor * f.fatorParcela;
  const total = valor * f.fatorTotal;
  return {parcela, total, totalCliente:total, liquido:liq, taxa:taxaInt, juros:total-valor};
}

function calcCredito(valor, n, plano="hora") {
  return plano==="hora" ? calcCreditoHora(valor,n) : calcCredito14dias(valor,n);
}

// ─── SIMULADOR CRÉDITO (estilo PagBank) ──────────
const TAXA_INT   = 5.59;  // % intermediação — você sempre paga
const TAXA_JUROS = 3.49;  // % ao mês — juros do parcelamento

// Comprador paga os juros: você cobra X, recebe X*(1-5,59%), cliente paga X + juros
function calcComprador(valorCobrado, n) {
  const taxaInt = valorCobrado * TAXA_INT / 100;
  const liqClinica = valorCobrado - taxaInt;
  if(n===1) return {cobrado:valorCobrado, liqClinica, taxaInt, totalCliente:valorCobrado, parcCliente:valorCobrado, jurosCliente:0};
  const i = TAXA_JUROS/100;
  const pmt = valorCobrado * i / (1 - Math.pow(1+i,-n));
  const totalCliente = pmt * n;
  return {cobrado:valorCobrado, liqClinica, taxaInt, totalCliente, parcCliente:pmt, jurosCliente:totalCliente-valorCobrado};
}

// Vendedor paga os juros: você absorve tudo, cliente paga só o valor cobrado
function calcVendedor(valorCobrado, n) {
  const taxaInt = valorCobrado * TAXA_INT / 100;
  if(n===1) {
    return {cobrado:valorCobrado, liqClinica:valorCobrado-taxaInt, taxaInt, totalCliente:valorCobrado, parcCliente:valorCobrado, jurosCliente:0, taxaJuros:0};
  }
  const i = TAXA_JUROS/100;
  const pmt = valorCobrado * i / (1 - Math.pow(1+i,-n));
  const totalPago = pmt * n;
  const juros = totalPago - valorCobrado;
  const liqClinica = valorCobrado - taxaInt - juros;
  return {cobrado:valorCobrado, liqClinica, taxaInt, totalCliente:valorCobrado, parcCliente:valorCobrado/n, jurosCliente:0, taxaJuros:juros};
}

function calcInverso(liqDesejado, n, quemPaga) {
  if(quemPaga==="comprador") {
    const cobrado = liqDesejado / (1 - TAXA_INT/100);
    return calcComprador(cobrado, n);
  } else {
    // vendedor absorve juros: liq = cobrado*(1-taxaInt%) - juros
    // aproximação iterativa
    const i = TAXA_JUROS/100;
    const fatorJuros = n>1 ? (i*n/(1-Math.pow(1+i,-n)) - 1) : 0;
    const cobrado = liqDesejado / (1 - TAXA_INT/100 - fatorJuros);
    return calcVendedor(cobrado, n);
  }
}

function SimuladorCredito({creditoBase, creditoParc, setCreditoParc}) {
  const [modo, setModo] = useState("cobrar");
  const [quemPaga, setQuemPaga] = useState("comprador");
  const [valorInput, setValorInput] = useState("");

  const fmtSimples = v => v>0 ? v.toFixed(2).replace(".",",") : "";
  const val = parseFloat(String(valorInput).replace(",","."))||0;

  // Usa creditoParc como estado único para sincronizar bolinhas e tabela
  const nParc = creditoParc || 1;
  const setNParc = n => setCreditoParc(creditoParc===n ? null : n);

  const calc = quemPaga==="comprador" ? calcComprador : calcVendedor;

  const resultado = val>0 ? (
    modo==="cobrar" ? calc(val, nParc) : calcInverso(val, nParc, quemPaga)
  ) : null;

  // Tabela: modo cobrar → base é o valor digitado ou orçamento
  //         modo receber → base é o que cobrar para receber cada parcela
  const baseTabela = modo==="cobrar"
    ? (val>0 ? val : creditoBase>0 ? creditoBase : 0)
    : (val>0 ? calcInverso(val, 1, quemPaga).cobrado : creditoBase>0 ? creditoBase : 0);

  const tabelaCompleta = baseTabela>0
    ? [1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>({n,...calc(baseTabela,n)}))
    : [];

  // No modo receber, recalcula cada linha com o inverso para manter liq fixo
  const tabelaReceber = modo==="receber" && val>0
    ? [1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>({n,...calcInverso(val,n,quemPaga)}))
    : null;

  const tabela = tabelaReceber || tabelaCompleta;

  return(
    <div style={{marginTop:14,border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
      {/* Header */}
      <div style={{background:"#2C1810",padding:"12px 16px"}}>
        <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,fontWeight:700,marginBottom:4}}>
          Simulador Cartão de Crédito · Na hora
        </div>
        <div style={{fontSize:9,color:"rgba(255,255,255,0.5)"}}>
          Intermediação {TAXA_INT}% (você paga sempre) · Juros parcelamento {TAXA_JUROS}%/mês
        </div>
      </div>

      {/* Toggle modo */}
      <div style={{display:"flex",borderBottom:"1px solid "+BORDER}}>
        {[["cobrar","Quanto quer cobrar?"],["receber","Quanto quer receber?"]].map(([m,l])=>(
          <div key={m} onClick={()=>{setModo(m);setValorInput("");}} style={{flex:1,padding:"11px",textAlign:"center",fontSize:11,fontWeight:700,cursor:"pointer",borderBottom:"3px solid "+(modo===m?GOLD:"transparent"),color:modo===m?GOLD_DARK:"#9A8060",background:modo===m?GOLD_PALE:"#fff",transition:"all 0.15s"}}>
            {l}
          </div>
        ))}
      </div>

      <div style={{padding:"16px"}}>

        {/* Toggle quem paga juros */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Juros do parcelamento pagos por</div>
          <div style={{display:"flex",gap:8}}>
            {[["comprador","Paciente","Cliente paga os juros — você recebe sempre o mesmo"],["vendedor","Clínica","Você absorve os juros — cliente paga valor fixo"]].map(([k,label,desc])=>(
              <div key={k} onClick={()=>setQuemPaga(k)} style={{flex:1,padding:"10px 12px",borderRadius:3,cursor:"pointer",border:"2px solid "+(quemPaga===k?GOLD_DARK:BORDER),background:quemPaga===k?GOLD_PALE:"#fff",transition:"all 0.15s"}}>
                <div style={{fontSize:12,fontWeight:700,color:quemPaga===k?GOLD_DARK:"#5C4A2A",marginBottom:3}}>{label}</div>
                <div style={{fontSize:9,color:"#9A8060",lineHeight:1.4}}>{desc}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Input */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#9A8060",marginBottom:6}}>
            {modo==="cobrar"?"Valor que vai cobrar do paciente":"Valor líquido que precisa receber na hora"}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,borderBottom:"2px solid "+GOLD,paddingBottom:4}}>
            <span style={{fontSize:16,color:GOLD_DARK,fontWeight:700}}>R$</span>
            <input
              style={{fontSize:22,fontWeight:700,color:GOLD_DARK,border:"none",outline:"none",background:"transparent",width:"100%"}}
              value={valorInput}
              onChange={e=>setValorInput(e.target.value.replace(/[^0-9,.]/g,""))}
              placeholder="0,00"
            />
            {valorInput&&<div onClick={()=>setValorInput("")} style={{fontSize:18,color:"#C0B090",cursor:"pointer"}}>×</div>}
          </div>
          {modo==="cobrar" && creditoBase>0 && !valorInput&&(
            <div onClick={()=>setValorInput(fmtSimples(creditoBase))} style={{fontSize:10,color:GOLD_DARK,marginTop:6,cursor:"pointer",textDecoration:"underline"}}>
              Usar valor do orçamento: {fmt(creditoBase)}
            </div>
          )}
        </div>

        {/* Seletor parcelas */}
        <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Número de parcelas</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:16}}>
          {[1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>(
            <div key={n} onClick={()=>setNParc(n)} style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(nParc===n?GOLD_DARK:BORDER),background:nParc===n?GOLD:"#fff",color:nParc===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer",fontWeight:nParc===n?700:400}}>
              {n===1?"Av.":n+"x"}
            </div>
          ))}
        </div>

        {/* Resultado — estilo PagBank */}
        {resultado&&(
          <div style={{marginBottom:16}}>
            {modo==="receber"?(
              /* "Quanto quer receber" — formato PagBank limpo */
              <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                <div style={{padding:"20px 20px 16px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:6}}>
                    <span style={{fontSize:20}}>💰</span>
                    <div>
                      <div style={{fontSize:11,color:"#9A8060"}}>Você receberá <strong>Na hora</strong></div>
                      <div style={{fontFamily:"Georgia",fontSize:32,fontWeight:700,color:"#1C1410",lineHeight:1.1}}>{fmt(resultado.liqClinica)}</div>
                    </div>
                  </div>
                </div>
                <div style={{borderTop:"1px solid "+BORDER,padding:"16px 20px"}}>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <span style={{fontSize:20}}>💳</span>
                    <div>
                      <div style={{fontSize:11,color:"#9A8060"}}>Se cobrar{nParc>1?` (${nParc}x de ${fmt(resultado.parcCliente)})`:""}</div>
                      <div style={{fontFamily:"Georgia",fontSize:28,fontWeight:700,color:GOLD_DARK,lineHeight:1.1}}>{fmt(resultado.cobrado)}</div>
                    </div>
                  </div>
                </div>
                {nParc>1&&quemPaga==="comprador"&&(
                  <div style={{borderTop:"1px solid "+BORDER,padding:"10px 20px",background:CREAM,fontSize:10,color:"#9A8060"}}>
                    Total pago pelo paciente: {fmt(resultado.totalCliente)} · Juros: +{fmt(resultado.jurosCliente)} (conta do paciente)
                  </div>
                )}
                {nParc>1&&quemPaga==="vendedor"&&(
                  <div style={{borderTop:"1px solid "+BORDER,padding:"10px 20px",background:CREAM,fontSize:10,color:"#9A8060"}}>
                    Paciente paga {fmt(resultado.parcCliente)}/mês · Total: {fmt(resultado.totalCliente)} · Juros descontados do seu líquido
                  </div>
                )}
              </div>
            ):(
              /* "Quanto quer cobrar" — resumo escuro */
              <div style={{background:"#2C1810",borderRadius:3,padding:"16px"}}>
                <div style={{display:"flex",flexDirection:"column",gap:5}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <div>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Você recebe na hora</div>
                      <div style={{fontFamily:"Georgia",fontSize:26,fontWeight:700,color:GOLD_LIGHT}}>{fmt(resultado.liqClinica)}</div>
                    </div>
                    {nParc>1&&<div style={{textAlign:"right"}}>
                      <div style={{fontSize:9,color:"rgba(255,255,255,0.5)",letterSpacing:1,textTransform:"uppercase",marginBottom:4}}>Parcela paciente</div>
                      <div style={{fontFamily:"Georgia",fontSize:18,fontWeight:700,color:"#fff"}}>{fmt(resultado.parcCliente)}/mês</div>
                    </div>}
                  </div>
                  <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:10,display:"flex",flexDirection:"column",gap:4}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:"rgba(255,255,255,0.6)"}}>Intermediação {TAXA_INT}%</span>
                      <span style={{color:"#E57373"}}>−{fmt(resultado.taxaInt)}</span>
                    </div>
                    {quemPaga==="vendedor"&&nParc>1&&(
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                        <span style={{color:"rgba(255,255,255,0.6)"}}>Juros parcelamento</span>
                        <span style={{color:"#E57373"}}>−{fmt(resultado.taxaJuros)}</span>
                      </div>
                    )}
                    {quemPaga==="comprador"&&nParc>1&&(
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11}}>
                        <span style={{color:"rgba(255,255,255,0.6)"}}>Juros paciente (+{fmt(resultado.jurosCliente)})</span>
                        <span style={{color:"#81C784"}}>dele</span>
                      </div>
                    )}
                    {nParc>1&&(
                      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginTop:2}}>
                        <span style={{color:"rgba(255,255,255,0.6)"}}>Total paciente</span>
                        <span style={{color:"#fff",fontWeight:600}}>{fmt(resultado.totalCliente)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tabela completa */}
        {tabela.length>0&&(
          <>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:6}}>
              {modo==="receber"&&val>0
                ? `Para receber ${fmt(val)} líquido — o que cobrar em cada parcela`
                : `Tabela completa · ${fmt(baseTabela)}${baseTabela===creditoBase?" (orçamento)":""}`}
            </div>
            {quemPaga==="comprador"&&<div style={{fontSize:10,color:"#9A8060",marginBottom:8}}>✦ "Você recebe" é fixo — juros variam no total do paciente.</div>}
            {quemPaga==="vendedor"&&<div style={{fontSize:10,color:"#9A8060",marginBottom:8}}>✦ Cliente paga valor fixo — seu líquido diminui conforme as parcelas aumentam.</div>}
            <div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
              <div style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr 1fr",background:"#2C1810",padding:"8px 10px"}}>
                {["Parc.", quemPaga==="comprador"?"Paciente/mês":"Cliente/mês", quemPaga==="comprador"?"Total paciente":"Total fixo","Você recebe"].map((h,i)=>(
                  <div key={i} style={{fontSize:8,letterSpacing:1,textTransform:"uppercase",color:GOLD_LIGHT,fontWeight:600,textAlign:i>0?"center":"left"}}>{h}</div>
                ))}
              </div>
              {tabela.map((r,i)=>{
                const sel = creditoParc===r.n;
                return(
                  <div key={r.n} onClick={()=>setCreditoParc(sel?null:r.n)}
                    style={{display:"grid",gridTemplateColumns:"44px 1fr 1fr 1fr",padding:"9px 10px",cursor:"pointer",background:sel?GOLD_PALE:i%2===0?"#fff":CREAM,borderLeft:"3px solid "+(sel?GOLD:"transparent"),borderBottom:i<tabela.length-1?"1px solid "+BORDER:"none"}}>
                    <span style={{fontSize:12,fontWeight:700,color:sel?GOLD_DARK:"#1C1410"}}>{r.n===1?"Av.":r.n+"x"}{r.n===18?" *":""}</span>
                    <span style={{fontSize:11,color:sel?GOLD_DARK:"#1C1410",fontWeight:600,textAlign:"center"}}>{r.n===1?"—":fmt(r.parcCliente)}</span>
                    <span style={{fontSize:11,color:"#9A8060",textAlign:"center"}}>{fmt(r.totalCliente)}</span>
                    <span style={{fontSize:12,color:GOLD_DARK,fontWeight:700,textAlign:"center"}}>{fmt(r.liqClinica)}</span>
                  </div>
                );
              })}
              <div style={{padding:"6px 10px",fontSize:8.5,color:"#9A8060",background:"#fff"}}>
                * 18x apenas Visa PagBank · Clique numa linha para fixar no relatório
              </div>
            </div>
          </>
        )}

        <VerificadorTaxas/>
      </div>
    </div>
  );
}


// ─── CALCULADORA INVERSA ─────────────────────────
function CalculadoraInversa() {
  const [liqDesejado, setLiqDesejado] = useState("");
  const [nInverso, setNInverso] = useState(1);
  const liq = parseFloat(String(liqDesejado).replace(",","."))||0;

  // Inverso: valor a cobrar = líquido desejado / (1 - taxa%)
  const cobrarHora = liq>0 ? liq/(1-PLANOS_PAGSEGURO.hora.taxaParc/100) : 0;
  const cobrar14   = liq>0 ? liq/(1-PLANOS_PAGSEGURO.dias14.taxaParc/100) : 0;

  // Total que o paciente paga em cada plano
  const iHora = PLANOS_PAGSEGURO.hora.jurosMes/100;
  const totalPacHora = nInverso>1 ? cobrarHora*iHora/(1-Math.pow(1+iHora,-nInverso))*nInverso : cobrarHora;
  const parcPacHora  = nInverso>1 ? totalPacHora/nInverso : totalPacHora;

  const i14 = PLANOS_PAGSEGURO.dias14.jurosMes/100;
  const totalPac14 = nInverso>1 ? cobrar14*(1+i14*nInverso) : cobrar14*(1+PLANOS_PAGSEGURO.dias14.taxaVista/100);
  const parcPac14  = nInverso>1 ? totalPac14/nInverso : totalPac14;

  return(
    <div style={{marginTop:16,padding:"14px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3}}>
      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:12}}>
        Quanto cobrar para receber exatamente...
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <span style={{fontSize:14,color:GOLD_DARK,fontWeight:700,flexShrink:0}}>R$</span>
        <input
          style={{fontSize:20,fontWeight:700,color:GOLD_DARK,border:"none",borderBottom:"2px solid "+GOLD,borderRadius:0,padding:"2px 0",width:"100%",outline:"none",background:"transparent"}}
          value={liqDesejado}
          onChange={e=>setLiqDesejado(e.target.value.replace(/[^0-9,.]/g,""))}
          placeholder="valor que preciso receber"
        />
      </div>

      <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Em quantas parcelas?</div>
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:liq>0?14:4}}>
        {[1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>(
          <div key={n} onClick={()=>setNInverso(n)} style={{width:34,height:34,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1.5px solid "+(nInverso===n?GOLD_DARK:BORDER),background:nInverso===n?GOLD:"#fff",color:nInverso===n?"#fff":"#5C4A2A",fontSize:11,cursor:"pointer",fontWeight:nInverso===n?700:400}}>{n===1?"Av.":n+"x"}</div>
        ))}
      </div>

      {liq>0&&(
        <div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",background:"#2C1810"}}>
            <div style={{padding:"8px 10px",fontSize:9,color:"rgba(255,255,255,0.5)",textTransform:"uppercase"}}></div>
            <div style={{padding:"8px 10px",fontSize:9,color:"#E57373",textTransform:"uppercase",fontWeight:700,textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.08)"}}>Na hora</div>
            <div style={{padding:"8px 10px",fontSize:9,color:"#81C784",textTransform:"uppercase",fontWeight:700,textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.08)"}}>14 dias ✦</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderBottom:"1px solid "+BORDER,background:GOLD_PALE}}>
            <div style={{padding:"10px",fontSize:10,color:GOLD_DARK,fontWeight:700}}>Cobrar do paciente</div>
            <div style={{padding:"10px",textAlign:"center",borderLeft:"1px solid "+BORDER}}>
              <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK}}>{fmt(cobrarHora)}</div>
            </div>
            <div style={{padding:"10px",textAlign:"center",borderLeft:"1px solid "+BORDER}}>
              <div style={{fontSize:14,fontWeight:700,color:GOLD_DARK}}>{fmt(cobrar14)}</div>
            </div>
          </div>

          {nInverso>1&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderBottom:"1px solid "+BORDER}}>
            <div style={{padding:"8px 10px",fontSize:10,color:"#5C4A2A"}}>Parcela paciente</div>
            <div style={{padding:"8px 10px",textAlign:"center",borderLeft:"1px solid "+BORDER}}>
              <div style={{fontSize:11,color:"#1C1410",fontWeight:600}}>{fmt(parcPacHora)}/mês</div>
              <div style={{fontSize:9,color:"#9A8060"}}>total {fmt(totalPacHora)}</div>
            </div>
            <div style={{padding:"8px 10px",textAlign:"center",borderLeft:"1px solid "+BORDER}}>
              <div style={{fontSize:11,color:"#1C1410",fontWeight:600}}>{fmt(parcPac14)}/mês</div>
              <div style={{fontSize:9,color:"#9A8060"}}>total {fmt(totalPac14)}</div>
            </div>
          </div>}

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",borderBottom:"1px solid "+BORDER}}>
            <div style={{padding:"8px 10px",fontSize:10,color:"#5C4A2A"}}>Taxa PagBank</div>
            <div style={{padding:"8px 10px",fontSize:10,color:"#E57373",textAlign:"center",borderLeft:"1px solid "+BORDER}}>−{fmt(cobrarHora*PLANOS_PAGSEGURO.hora.taxaParc/100)}</div>
            <div style={{padding:"8px 10px",fontSize:10,color:"#E57373",textAlign:"center",borderLeft:"1px solid "+BORDER}}>−{fmt(cobrar14*PLANOS_PAGSEGURO.dias14.taxaParc/100)}</div>
          </div>

          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",background:"#2C1810"}}>
            <div style={{padding:"10px",fontSize:10,color:GOLD_LIGHT,fontWeight:700}}>✦ Você recebe</div>
            <div style={{padding:"10px",textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontFamily:"Georgia",fontSize:15,fontWeight:700,color:GOLD_LIGHT}}>{fmt(liq)}</div>
            </div>
            <div style={{padding:"10px",textAlign:"center",borderLeft:"1px solid rgba(255,255,255,0.08)"}}>
              <div style={{fontFamily:"Georgia",fontSize:15,fontWeight:700,color:"#81C784"}}>{fmt(liq)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── VERIFICADOR DE TAXAS ────────────────────────
function VerificadorTaxas() {
  const [editando, setEditando] = useState(false);
  const [horaVista, setHoraVista] = useState(String(PLANOS_PAGSEGURO.hora.taxaVista));
  const [horaParc, setHoraParc] = useState(String(PLANOS_PAGSEGURO.hora.taxaParc));
  const [d14Vista, setD14Vista] = useState(String(PLANOS_PAGSEGURO.dias14.taxaVista));
  const [d14Parc, setD14Parc] = useState(String(PLANOS_PAGSEGURO.dias14.taxaParc));
  const [d14Juros, setD14Juros] = useState(String(PLANOS_PAGSEGURO.dias14.jurosMes));
  const [salvo, setSalvo] = useState(false);

  const salvar = () => {
    PLANOS_PAGSEGURO.hora.taxaVista = parseFloat(horaVista)||4.99;
    PLANOS_PAGSEGURO.hora.taxaParc  = parseFloat(horaParc)||5.59;
    PLANOS_PAGSEGURO.dias14.taxaVista = parseFloat(d14Vista)||3.99;
    PLANOS_PAGSEGURO.dias14.taxaParc  = parseFloat(d14Parc)||4.59;
    PLANOS_PAGSEGURO.dias14.jurosMes  = parseFloat(d14Juros)||2.99;
    setSalvo(true); setEditando(false);
    setTimeout(()=>setSalvo(false), 3000);
  };

  return (
    <div style={{marginTop:14,padding:"12px 14px",background:salvo?"rgba(76,175,80,0.06)":CREAM,border:"1px solid "+(salvo?"rgba(76,175,80,0.4)":BORDER),borderRadius:3,transition:"all 0.3s"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap",marginBottom:8}}>
        <div>
          <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Taxas PagBank</div>
          {salvo&&<div style={{fontSize:10,color:"#4CAF50",marginTop:2,fontWeight:600}}>✓ Taxas atualizadas!</div>}
        </div>
        <div style={{display:"flex",gap:6}}>
          <div onClick={()=>window.open("https://www.pagbank.com.br/","_blank")} style={{padding:"5px 10px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid "+BORDER,color:"#5C4A2A",background:"#fff"}}>🔗 Abrir PagBank</div>
          <div onClick={()=>setEditando(!editando)} style={{padding:"5px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:editando?GOLD_DARK:GOLD,color:"#fff",fontWeight:700}}>{editando?"✕ Cancelar":"✎ Atualizar taxas"}</div>
        </div>
      </div>

      {/* Taxas atuais em uso */}
      {!editando&&(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
          <div style={{padding:"8px 10px",background:"rgba(229,115,115,0.07)",borderRadius:3,border:"1px solid rgba(229,115,115,0.2)"}}>
            <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:"#C62828",fontWeight:700,marginBottom:4}}>Na hora</div>
            <div style={{fontSize:11,color:"#1C1410"}}>À vista: <strong>{PLANOS_PAGSEGURO.hora.taxaVista}%</strong></div>
            <div style={{fontSize:11,color:"#1C1410"}}>Parcelado: <strong>{PLANOS_PAGSEGURO.hora.taxaParc}%</strong></div>
          </div>
          <div style={{padding:"8px 10px",background:"rgba(76,175,80,0.07)",borderRadius:3,border:"1px solid rgba(76,175,80,0.2)"}}>
            <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:"#2E7D32",fontWeight:700,marginBottom:4}}>14 dias ✦ Atual</div>
            <div style={{fontSize:11,color:"#1C1410"}}>À vista: <strong>{PLANOS_PAGSEGURO.dias14.taxaVista}%</strong></div>
            <div style={{fontSize:11,color:"#1C1410"}}>Parcelado: <strong>{PLANOS_PAGSEGURO.dias14.taxaParc}%</strong> + <strong>{PLANOS_PAGSEGURO.dias14.jurosMes}%</strong>/mês cliente</div>
          </div>
        </div>
      )}

      {/* Formulário de edição */}
      {editando&&(
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          <div style={{fontSize:10,color:"#9A8060",padding:"6px 10px",background:"#FFF8DC",borderRadius:3,border:"1px solid #FFD700"}}>
            💡 Consulte o app PagBank → Vendas → Simulador de Vendas → Alterar Recebimento para ver as taxas atuais do seu plano.
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div style={{padding:"10px",background:"rgba(229,115,115,0.06)",borderRadius:3,border:"1px solid rgba(229,115,115,0.2)"}}>
              <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:"#C62828",fontWeight:700,marginBottom:8}}>Na hora</div>
              {[["À vista %",horaVista,setHoraVista],["Parcelado %",horaParc,setHoraParc]].map(([l,v,s])=>(
                <div key={l} style={{marginBottom:6}}>
                  <div style={{fontSize:9,color:"#9A8060",marginBottom:3}}>{l}</div>
                  <input style={{width:"100%",padding:"5px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:13,fontWeight:600,color:GOLD_DARK,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
                    value={v} onChange={e=>s(e.target.value.replace(/[^0-9.]/g,""))}/>
                </div>
              ))}
            </div>
            <div style={{padding:"10px",background:"rgba(76,175,80,0.06)",borderRadius:3,border:"1px solid rgba(76,175,80,0.2)"}}>
              <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:"#2E7D32",fontWeight:700,marginBottom:8}}>14 dias</div>
              {[["À vista %",d14Vista,setD14Vista],["Parcelado %",d14Parc,setD14Parc],["Juros cliente %/mês",d14Juros,setD14Juros]].map(([l,v,s])=>(
                <div key={l} style={{marginBottom:6}}>
                  <div style={{fontSize:9,color:"#9A8060",marginBottom:3}}>{l}</div>
                  <input style={{width:"100%",padding:"5px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:13,fontWeight:600,color:GOLD_DARK,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
                    value={v} onChange={e=>s(e.target.value.replace(/[^0-9.]/g,""))}/>
                </div>
              ))}
            </div>
          </div>
          <div onClick={salvar} style={{padding:"9px",borderRadius:3,background:GOLD,color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",textAlign:"center"}}>
            ✓ Salvar e aplicar taxas
          </div>
        </div>
      )}
    </div>
  );
}

function P3({vb:valorBruto,setVb:setValorBruto,ds:descSel,setDs:setDescSel,dc:descCustom,setDc:setDescCustom,fc:formasChecked,setFc:setFormasChecked,fa:formaAtiva,setFa:setFormaAtiva,bm:boletoModo,setBm:setBoletoModo,bp:boletoParc,setBp:setBoletoParc,bj:boletoJuros,setBj:setBoletoJuros,bi:boletoIsento,setBi:setBoletoIsento,ci:creditoIsento,setCi:setCreditoIsento,cp:creditoParc,setCp:setCreditoParc,tb:tab,setTb:setTab,entrada,setEntrada,entradaTipo,setEntradaTipo,entradaVal,setEntradaVal,saldoTipo,setSaldoTipo,showTotal,setShowTotal}) {

  const [plano, setPlano] = useState("dias14"); // "hora" | "dias14"
  const planoInfo = PLANOS_PAGSEGURO[plano];

  const descPct=descSel===-1?(parseFloat(descCustom)||0):descSel;
  const valorBase=parseFloat(String(valorBruto).replace(",","."))||0;
  const descVal=valorBase*descPct/100;
  const valorFinal=valorBase-descVal;
  const nBoleto=parseInt(boletoParc)||1;
  const nIsentoCredito=parseInt(creditoIsento)||0;

  // Entrada calculations
  const entradaPct = entradaTipo === "pct" ? (parseFloat(entradaVal)||0) : 0;
  const entradaFixo = entradaTipo === "fixo" ? (parseFloat(String(entradaVal).replace(",","."))||0) : 0;
  // Entrada sempre sobre valor cheio (sem desconto)
  const entradaValor = entrada ? (entradaTipo === "pct" ? valorBase * entradaPct / 100 : entradaFixo) : 0;
  const saldo = entrada ? Math.max(0, valorBase - entradaValor) : valorBase;

  // Cartão nunca recebe desconto à vista — usa valorBase
  const creditoBase=(entrada&&entradaValor>0&&saldoTipo==="parcelado")?saldo:valorBase;
  const tabelaCredito=useMemo(()=>{
    if(creditoBase<=0) return[];
    return[1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>({n,...calcCredito(creditoBase,n,plano)}));
  },[creditoBase,plano]);

  const creditoParcObj=creditoParc?tabelaCredito.find(r=>r.n===creditoParc):null;

  const toggleForma=id=>{
    const wasChecked = formasChecked.includes(id);
    const wasAtiva = formaAtiva===id;
    if(wasChecked) {
      // já marcada: se painel aberto, só fecha o painel; se fechado, desmarca
      if(wasAtiva) setFormaAtiva(null);
      else setFormasChecked(formasChecked.filter(x=>x!==id));
    } else {
      // não marcada: marca e abre painel
      setFormasChecked([...formasChecked, id]);
      setFormaAtiva(id);
    }
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


  return(
    <div style={{maxWidth:620,margin:"0 auto",padding:"20px 16px 40px"}}>
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
              <div style={{marginTop:10,padding:"10px 14px",background:"#2C1810",borderRadius:3}}>
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
              return(<div key={f.id} onClick={()=>toggleForma(f.id)} style={{padding:"12px 16px",borderRadius:3,cursor:"pointer",border:"1.5px solid "+(ativo?GOLD_DARK:checked?GOLD_LIGHT:BORDER),background:ativo?GOLD_PALE:checked?"#FFFDF7":"#fff",display:"flex",alignItems:"center",justifyContent:"space-between",transition:"all 0.15s"}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:18}}>{f.icon}</span>
                  <span style={{fontSize:13,fontWeight:checked?700:500,color:checked?GOLD_DARK:"#1C1410"}}>{f.label}</span>
                  {f.id==="debito"&&<span style={{fontSize:10,color:"#9A8060"}}>taxa {f.taxa}% PagBank</span>}
                  {f.id==="credito"&&<span style={{fontSize:10,color:"#9A8060"}}>4,99% + juros 3,49% a.m.</span>}
                </div>
                {checked&&<span style={{color:GOLD_DARK,fontWeight:700}}>✓</span>}
              </div>);
            })}
          </div>

          {/* Toggle mostrar total no relatório */}
          <div style={{marginTop:12,padding:"12px 14px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:11,fontWeight:700,color:GOLD_DARK}}>Mostrar total no relatório</div>
              <div style={{fontSize:9,color:"#9A8060",marginTop:2}}>
                {showTotal?"Tabela exibe parcela + total pago pelo paciente":"Tabela exibe apenas o valor da parcela"}
              </div>
            </div>
            <div onClick={()=>setShowTotal(!showTotal)} style={{width:44,height:24,borderRadius:12,background:showTotal?GOLD:"#C0B090",cursor:"pointer",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{position:"absolute",top:3,left:showTotal?22:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left 0.2s",boxShadow:"0 1px 3px rgba(0,0,0,0.2)"}}/>
            </div>
          </div>
          {formaAtiva==="boleto"&&(
            <div style={{marginTop:14,padding:"14px 16px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                {[["avista","À vista"],["parcelado","Parcelado"]].map(([m,l])=>(
                  <div key={m} onClick={()=>setBoletoModo(m)} style={{padding:"6px 16px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(boletoModo===m?GOLD_DARK:BORDER),background:boletoModo===m?GOLD_PALE:"#fff",color:boletoModo===m?GOLD_DARK:"#5C4A2A",fontWeight:boletoModo===m?700:400}}>{l}</div>
                ))}
              </div>
              {boletoModo==="avista"&&valorFinal>0&&(
                <div style={{background:"#2C1810",borderRadius:3,padding:"14px 16px"}}>
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
                {valorFinal>0&&nBoleto>0&&(()=>{
                  const b=calcBoleto();
                  const desc=boletoJuros==="sem_juros"?"Sem juros":boletoJuros==="com_juros"?"Juros 1,2% a.m.":"Primeiras "+boletoIsento+"x sem juros";
                  return(<div style={{background:"#2C1810",borderRadius:3,padding:"14px 16px"}}>
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
            <SimuladorCredito creditoBase={creditoBase} creditoParc={creditoParc} setCreditoParc={setCreditoParc}/>
          )}
          {formaAtiva&&!["boleto","credito"].includes(formaAtiva)&&valorFinal>0&&(
            <div style={{marginTop:14,background:"#2C1810",borderRadius:3,padding:"14px 16px"}}>
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
    </div>
  );
}

// ─── APP PRINCIPAL ────────────────────────────────
const p1Initial = {
  nome:"João da Silva",
  cpf:"000.000.000-00",
  telefone:"(48) 99999-9999",
  dataNasc:"1985-06-15",
  idade:"",
  isMinor:false,
  respNome:"",
  respCpf:"",
  dataConsulta:"",
  responsavel:"Dr. Arthur A. Cheade"
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
const p2Initial = {achadosDente:{},achadoAtivo:null,segAtivo:null,arcadaAtiva:null,obsTexto:"",obsCorrigido:"",achados:ACHADOS_DEFAULT};



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
    modo: "nenhum",
    valorPadrao: 1200,
    subtipos: [
      { id: "avaliacao", label: "Avaliação específica", valorPadrao: 300 },
      { id: "placa", label: "Placa oclusal", valorPadrao: 1200 },
      { id: "dor", label: "Tratamento para dor", valorPadrao: 800 },
      { id: "outro", label: "Outro", valorPadrao: 0, campoTexto: true },
    ],
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

function ProcedimentoItem({ proc, item, onChange, onRemove }) {
  const [expandido, setExpandido] = useState(false);
  const subtotal = proc.modo === "dente"
    ? (item.dentes?.length || 0) * parseMoeda(item.valor)
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
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: item.ativo ? "#1C1410" : "#9A8060" }}>
                {proc.nome}
              </div>
              {item.ativo && (
                <div style={{ marginTop: 4 }}>
                  {proc.subtipos
                    ? <span style={{fontSize:10,color:"#9A8060"}}>{Object.keys(item.subtipos || {}).map(id => proc.subtipos.find(s=>s.id===id)?.label).filter(Boolean).join(" + ") || "Selecione o tipo"}</span>
                    : proc.modo === "dente"
                    ? <span style={{fontSize:10,color:"#9A8060"}}>{descricaoDentes()}</span>
                    : proc.modo === "regiao"
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
                {proc.modo === "dente" && item.dentes?.length > 1 && (
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

          {/* Valor unitário - hide for subtipos */}
          {!proc.subtipos && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 6 }}>
              Valor {proc.modo === "dente" ? "por dente" : ""}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 13, color: GOLD_DARK, fontWeight: 600 }}>R$</span>
              <input
                style={{
                  width: 120, padding: "8px 10px", border: "1px solid " + BORDER,
                  borderRadius: 2, fontSize: 14, fontWeight: 600, color: GOLD_DARK,
                  background: "#fff", outline: "none", fontFamily: "inherit",
                }}
                value={item.valor}
                onChange={e => onChange({ ...item, valor: e.target.value.replace(/[^0-9,]/g, "") })}
                placeholder="0,00"
              />
            </div>
          </div>}

          {/* Seleção por região */}
          {proc.modo === "regiao" && proc.modo !== "livre" && (
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", color: GOLD_DARK, fontWeight: 700, marginBottom: 8 }}>Região</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {[["boca", "Boca toda"], ["sup", "Arcada superior"], ["inf", "Arcada inferior"]].map(([k, l]) => (
                  <div key={k} onClick={() => toggleRegiao(k)} style={{
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
          {proc.modo === "dente" && proc.modo !== "livre" && (
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
        </div>
      )}
    </div>
  );
}


function P4({onTotalChange, p4State, setP4State}) {
  const defaultItens = PROC_BASE.map(p => ({
    id: p.id, ativo: false,
    valor: String(p.valorPadrao).replace(".", ","),
    dentes: [], subtipos: {},
    regiao: p.id === "profilaxia" ? "boca" : p.id === "clareamento" ? "boca" : null,
    qtd: 1, obs: "",
  }));
  const itens = p4State.itens || defaultItens;
  const setItens = (val) => setP4State(prev => ({ ...prev, itens: typeof val === "function" ? val(prev.itens || defaultItens) : val }));
  const customProcs = p4State.customProcs || [];
  const setCustomProcs = (val) => setP4State(prev => ({ ...prev, customProcs: typeof val === "function" ? val(prev.customProcs || []) : val }));

  // Templates persistentes via storage
  const [catalogo, setCatalogo] = useState([]);
  const [storageOk, setStorageOk] = useState(false);

  // Carregar catálogo ao montar
  React.useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get("catalogo_procedimentos");
        if (res?.value) setCatalogo(JSON.parse(res.value));
        setStorageOk(true);
      } catch(e) {
        setStorageOk(false);
      }
    })();
  }, []);

  const salvarCatalogo = async (novosCatalogo) => {
    setCatalogo(novosCatalogo);
    try {
      await window.storage.set("catalogo_procedimentos", JSON.stringify(novosCatalogo));
    } catch(e) { console.error("Erro ao salvar catálogo:", e); }
  };

  const [procAtivo, setProcAtivo] = useState(null);
  const [editando, setEditando] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoValor, setNovoValor] = useState("");
  const [novoModo, setNovoModo] = useState("dente");
  const [abaConfig, setAbaConfig] = useState(false);
  const [editandoTplIdx, setEditandoTplIdx] = useState(null);
  const [tplNomeEdit, setTplNomeEdit] = useState("");

  const atualizarItem = (idx, novo) => setItens(prev => prev.map((it, i) => i === idx ? novo : it));
  const atualizarCustom = (idx, novo) => setCustomProcs(prev => prev.map((it, i) => i === idx ? novo : it));

  const adicionarCustom = () => {
    if (!novoNome.trim()) return;
    const id = "custom_" + Date.now();
    setCustomProcs(prev => [...prev, { id, nome: novoNome.trim(), modo: novoModo, ativo: true, valor: novoValor || "0", dentes: [], regiao: novoModo === "regiao" ? "boca" : null, qtd: 1, obs: "" }]);
    setNovoNome(""); setNovoValor(""); setAdicionando(false); setProcAtivo(id);
  };

  const salvarTemplate = () => {
    if (!procAtivo) return;
    const baseIdx = PROC_BASE.findIndex(p => p.id === procAtivo);
    let proc, item;
    if (baseIdx >= 0) { proc = PROC_BASE[baseIdx]; item = itens[baseIdx]; }
    else { const ci = customProcs.findIndex(p => p.id === procAtivo); if (ci < 0) return; item = customProcs[ci]; proc = {nome: item.nome, modo: item.modo}; }
    const sufixo = item.dentes?.length>0 ? " — "+item.dentes.length+"x dentes" : item.regiao ? " — "+(item.regiao==="boca"?"Boca toda":item.regiao==="sup"?"Sup.":"Inf.") : "";
    const nome = proc.nome + sufixo;
    const novo = { id: "tpl_"+Date.now(), nome, procId: procAtivo, snapshot: {...item}, criadoEm: new Date().toLocaleDateString("pt-BR") };
    salvarCatalogo([...catalogo, novo]);
  };

  const excluirTemplate = (id) => salvarCatalogo(catalogo.filter(t => t.id !== id));

  const renomearTemplate = (idx, novoNome) => {
    const novo = catalogo.map((t,i) => i===idx ? {...t, nome: novoNome} : t);
    salvarCatalogo(novo);
    setEditandoTplIdx(null);
  };

  const aplicarTemplate = (tpl) => {
    const baseIdx = PROC_BASE.findIndex(p => p.id === tpl.procId);
    if (baseIdx >= 0) { atualizarItem(baseIdx, {...tpl.snapshot, ativo:true}); setProcAtivo(tpl.procId); }
    else {
      const ci = customProcs.findIndex(p => p.id === tpl.procId);
      if (ci >= 0) { atualizarCustom(ci, {...tpl.snapshot, ativo:true}); setProcAtivo(tpl.procId); }
      else { const id="custom_"+Date.now(); setCustomProcs(prev=>[...prev,{...tpl.snapshot,id,ativo:true}]); setProcAtivo(id); }
    }
    setAbaConfig(false);
  };

  const calcSubtotal = (item, proc) => {
    if (!item.ativo) return 0;
    if (proc.subtipos) return Object.values(item.subtipos||{}).reduce((acc,st)=>acc+parseMoeda(st.valor||"0"),0);
    const v = parseMoeda(item.valor);
    if (proc.modo==="dente") return (item.dentes?.length||0)*v;
    return v*(item.qtd||1);
  };

  const totalGeral = [
    ...itens.map((it,i)=>calcSubtotal(it,PROC_BASE[i])),
    ...customProcs.map(it=>{if(!it.ativo)return 0;const v=parseMoeda(it.valor);return it.modo==="dente"?(it.dentes?.length||0)*v:v;}),
  ].reduce((a,b)=>a+b,0);

  React.useEffect(()=>{if(onTotalChange)onTotalChange(totalGeral);},[totalGeral]);

  const CORES_PROC = {profilaxia:"#4CAF50",clareamento:"#FFC107",restauracao:"#2196F3",extracao:"#E57373",endodontia:"#9C27B0",implante:"#B8962E",protese:"#795548",dtm:"#FF5722",ortodontia:"#00BCD4"};
  const getCorProc = (id) => CORES_PROC[id] || GOLD;

  const renderChip = (proc, item, onChange, idx, isCustom=false) => {
    const cor=getCorProc(proc.id), ativo=item.ativo, aberto=procAtivo===proc.id, subtotal=calcSubtotal(item,proc);
    return(
      <div key={proc.id} style={{position:"relative",display:"inline-flex",alignItems:"center"}}>
        {editando&&<div onClick={()=>{if(isCustom)setCustomProcs(prev=>prev.filter((_,i)=>i!==idx));else onChange({...item,ativo:false});if(procAtivo===proc.id)setProcAtivo(null);}} style={{position:"absolute",top:-5,right:-5,width:16,height:16,borderRadius:"50%",background:"#E57373",color:"#fff",fontSize:9,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",zIndex:10}}>✕</div>}
        <div onClick={()=>{if(!ativo)onChange({...item,ativo:true});setProcAtivo(aberto?null:proc.id);}} style={{padding:"6px 14px",borderRadius:20,fontSize:12,cursor:"pointer",border:"2px solid "+(ativo?cor:BORDER),background:ativo?cor+"18":"#fff",color:ativo?cor:"#5C4A2A",fontWeight:ativo?700:400,display:"flex",alignItems:"center",gap:6,transition:"all 0.15s"}}>
          <div style={{width:8,height:8,borderRadius:"50%",background:ativo?cor:BORDER,flexShrink:0}}/>
          {proc.nome}
          {ativo&&subtotal>0&&<span style={{fontSize:10,background:cor,color:"#fff",borderRadius:10,padding:"1px 6px",fontWeight:700}}>{fmt(subtotal)}</span>}
          {ativo&&<span style={{fontSize:11,opacity:0.7}}>{aberto?"▲":"▼"}</span>}
        </div>
      </div>
    );
  };

  const renderPainel = () => {
    if (!procAtivo) return null;
    let proc, item, onChange;
    const baseIdx=PROC_BASE.findIndex(p=>p.id===procAtivo);
    if(baseIdx>=0){proc=PROC_BASE[baseIdx];item=itens[baseIdx];onChange=novo=>atualizarItem(baseIdx,novo);}
    else{const ci=customProcs.findIndex(p=>p.id===procAtivo);if(ci<0)return null;item=customProcs[ci];proc={id:item.id,nome:item.nome,modo:item.modo,subtipos:item.subtipos};onChange=novo=>atualizarCustom(ci,novo);}
    const cor=getCorProc(proc.id), subtotal=calcSubtotal(item,proc);
    const toggleDente=(n)=>{const a=item.dentes||[];onChange({...item,dentes:a.includes(n)?a.filter(x=>x!==n):[...a,n]});};
    const toggleRegiao=(r)=>{let d=r==="boca"?TODOS:r==="sup"?SUP:INF;onChange({...item,regiao:r,dentes:d});};

    return(
      <div style={{marginTop:14,border:"2px solid "+cor,borderRadius:4,overflow:"hidden"}}>
        <div style={{background:cor+"18",padding:"12px 16px",display:"flex",alignItems:"center",justifyContent:"space-between",borderBottom:"1px solid "+cor+"44"}}>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:cor}}/>
            <span style={{fontSize:13,fontWeight:700,color:cor}}>{proc.nome}</span>
            {subtotal>0&&<span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{fmt(subtotal)}</span>}
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <div onClick={salvarTemplate} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid "+GOLD,color:GOLD_DARK,fontWeight:600}}>⭐ Salvar no catálogo</div>
            <div onClick={()=>onChange({...item,ativo:!item.ativo})} style={{padding:"4px 12px",borderRadius:20,fontSize:10,cursor:"pointer",fontWeight:700,border:"1.5px solid "+(item.ativo?cor:BORDER),background:item.ativo?cor:"#fff",color:item.ativo?"#fff":"#9A8060"}}>{item.ativo?"✓ Ativo":"Inativo"}</div>
            <div onClick={()=>setProcAtivo(null)} style={{fontSize:18,color:"#9A8060",cursor:"pointer",lineHeight:1}}>×</div>
          </div>
        </div>

        <div style={{padding:"14px 16px",background:"#fff",display:"flex",flexDirection:"column",gap:14}}>
          {!proc.subtipos&&(
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Valor {proc.modo==="dente"?"por dente":""}</div>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{fontSize:13,color:GOLD_DARK,fontWeight:600}}>R$</span>
                <input style={{width:130,padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:14,fontWeight:600,color:GOLD_DARK,outline:"none",fontFamily:"inherit"}} value={item.valor} onChange={e=>onChange({...item,valor:e.target.value.replace(/[^0-9,]/g,"")})} placeholder="0,00"/>
              </div>
            </div>
          )}

          {proc.subtipos&&(
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Tipo de tratamento</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {proc.subtipos.map(st=>{
                  const sAtivos=item.subtipos||{},sAtivo=!!sAtivos[st.id];
                  return(<div key={st.id}>
                    <div onClick={()=>{const novo={...sAtivos};sAtivo?delete novo[st.id]:novo[st.id]={valor:String(st.valorPadrao).replace(".",","),descricao:""};onChange({...item,subtipos:novo});}}
                      style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:3,cursor:"pointer",border:"1.5px solid "+(sAtivo?GOLD_DARK:BORDER),background:sAtivo?GOLD_PALE:"#fff"}}>
                      <div style={{width:18,height:18,borderRadius:3,border:"2px solid "+(sAtivo?GOLD_DARK:BORDER),background:sAtivo?GOLD:"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                        {sAtivo&&<span style={{fontSize:9,color:"#fff",fontWeight:900}}>✓</span>}
                      </div>
                      <span style={{fontSize:12,fontWeight:sAtivo?700:400,color:sAtivo?GOLD_DARK:"#1C1410",flex:1}}>
                        {st.campoTexto&&sAtivo&&sAtivos[st.id]?.descricao?sAtivos[st.id].descricao:st.label}
                      </span>
                      {sAtivo&&<span style={{fontSize:12,fontWeight:600,color:GOLD_DARK}}>{fmt(parseMoeda(sAtivos[st.id]?.valor||"0"))}</span>}
                    </div>
                    {sAtivo&&(
                      <div style={{padding:"8px 12px",background:CREAM,border:"1px solid "+BORDER,borderTop:"none",borderRadius:"0 0 3px 3px",display:"flex",flexDirection:"column",gap:6}}>
                        {st.campoTexto&&(
                          <input style={{padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",color:"#1C1410"}}
                            value={sAtivos[st.id]?.descricao||""} placeholder="Descreva o procedimento..."
                            onChange={e=>{const novo={...sAtivos,[st.id]:{...sAtivos[st.id],descricao:e.target.value}};onChange({...item,subtipos:novo});}}/>
                        )}
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:11,color:GOLD_DARK}}>R$</span>
                          <input style={{width:110,padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:13,fontWeight:600,color:GOLD_DARK,outline:"none",fontFamily:"inherit"}}
                            value={sAtivos[st.id]?.valor||""} onChange={e=>{const novo={...sAtivos,[st.id]:{...sAtivos[st.id],valor:e.target.value.replace(/[^0-9,]/g,"")}};onChange({...item,subtipos:novo});}} placeholder="0,00"/>
                          <span style={{fontSize:10,color:"#9A8060"}}>por sessão</span>
                        </div>
                      </div>
                    )}
                  </div>);
                })}
              </div>
            </div>
          )}

          {proc.modo==="regiao"&&(
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Região</div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                {[["boca","Boca toda"],["sup","Arcada superior"],["inf","Arcada inferior"]].map(([k,l])=>(
                  <div key={k} onClick={()=>toggleRegiao(k)} style={{padding:"6px 14px",borderRadius:20,fontSize:11,cursor:"pointer",border:"1.5px solid "+(item.regiao===k?GOLD_DARK:BORDER),background:item.regiao===k?GOLD_PALE:"#fff",color:item.regiao===k?GOLD_DARK:"#5C4A2A",fontWeight:item.regiao===k?700:400}}>{l}</div>
                ))}
              </div>
            </div>
          )}

          {proc.modo==="dente"&&(
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Dentes ({item.dentes?.length||0} selecionado{item.dentes?.length!==1?"s":""})</div>
              <OdontogramaMini selecionados={item.dentes||[]} onToggle={toggleDente}/>
              {item.dentes?.length>0&&<div onClick={()=>onChange({...item,dentes:[]})} style={{marginTop:6,fontSize:10,color:"#E57373",cursor:"pointer",textAlign:"right"}}>✕ Limpar</div>}
            </div>
          )}

          <div>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:6}}>Observação / ajuste</div>
            <textarea style={{width:"100%",padding:"8px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",resize:"vertical",minHeight:60,color:"#1C1410",boxSizing:"border-box"}}
              value={item.obs||""} placeholder="Anotações, ajustes de valor, condições específicas..."
              onChange={e=>onChange({...item,obs:e.target.value})}/>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div style={{fontFamily:"'Outfit',system-ui,sans-serif",background:CREAM,minHeight:"100vh",paddingBottom:40}}>
      <div style={{background:"linear-gradient(135deg,#2C1810 0%,#1A0F08 100%)",padding:"16px 20px",display:"flex",alignItems:"center",gap:12}}>
        <svg width="30" height="40" viewBox="0 0 40 52" fill="none"><ellipse cx="20" cy="26" rx="18" ry="24" stroke="#B8962E" strokeWidth="1.5"/><text x="20" y="32" textAnchor="middle" fontFamily="Georgia" fontSize="18" fontStyle="italic" fill="#B8962E">i</text></svg>
        <div><div style={{fontFamily:"Georgia,serif",fontSize:17,fontWeight:700,color:"#fff",letterSpacing:3,textTransform:"uppercase"}}>Íntegra</div><div style={{fontSize:7,letterSpacing:2.5,color:GOLD_LIGHT,textTransform:"uppercase"}}>Clínica Odontológica</div></div>
      </div>
      <div style={{maxWidth:620,margin:"0 auto",padding:"20px 16px"}}>
        {totalGeral>0&&(
          <div style={{background:"linear-gradient(135deg,#2C1810,#1A0F08)",borderRadius:4,padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
            <div>
              <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_LIGHT,marginBottom:3}}>Total do Tratamento</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.5)"}}>{[...itens.filter(it=>it.ativo),...customProcs.filter(it=>it.ativo)].length} procedimento(s)</div>
            </div>
            <div style={{fontFamily:"Georgia,serif",fontSize:28,fontWeight:700,color:"#fff"}}>{fmt(totalGeral)}</div>
          </div>
        )}
        <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,padding:18,marginBottom:14}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Plano de Procedimentos</div>
            <div style={{display:"flex",gap:6}}>
              <div onClick={()=>{setAbaConfig(!abaConfig);setAdicionando(false);setProcAtivo(null);}} style={{fontSize:10,color:abaConfig?GOLD_DARK:"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(abaConfig?GOLD:BORDER),borderRadius:20}}>⭐ Salvos</div>
              <div onClick={()=>{setAdicionando(!adicionando);setEditando(false);setAbaConfig(false);}} style={{fontSize:10,color:GOLD_DARK,cursor:"pointer",padding:"2px 8px",border:"1px solid "+GOLD,borderRadius:20}}>+ Novo</div>
              <div onClick={()=>{setEditando(!editando);setAdicionando(false);}} style={{fontSize:10,color:editando?"#E57373":"#9A8060",cursor:"pointer",padding:"2px 8px",border:"1px solid "+(editando?"#E57373":BORDER),borderRadius:20}}>{editando?"✓ Concluir":"✎ Editar"}</div>
            </div>
          </div>
          {abaConfig&&(
            <div style={{marginBottom:14,padding:"12px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontSize:10,fontWeight:700,color:GOLD_DARK}}>⭐ Catálogo de procedimentos</div>
                  <div style={{fontSize:9,color:"#9A8060",marginTop:2}}>{storageOk?"Salvo permanentemente":"⚠️ Storage indisponível — salvamento temporário"}</div>
                </div>
                {catalogo.length>0&&<div style={{fontSize:9,color:"#9A8060"}}>{catalogo.length} item(s)</div>}
              </div>
              {catalogo.length===0&&<div style={{fontSize:11,color:"#9A8060",fontStyle:"italic",padding:"8px 0"}}>Nenhum procedimento no catálogo ainda. Abra um procedimento, configure e clique em "⭐ Salvar no catálogo".</div>}
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {catalogo.map((tpl,i)=>(
                  <div key={tpl.id} style={{background:"#fff",borderRadius:3,border:"1px solid "+BORDER,overflow:"hidden"}}>
                    {editandoTplIdx===i?(
                      <div style={{display:"flex",gap:6,padding:"8px 10px",alignItems:"center"}}>
                        <input autoFocus style={{flex:1,padding:"5px 8px",border:"1px solid "+GOLD,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}}
                          value={tplNomeEdit} onChange={e=>setTplNomeEdit(e.target.value)}
                          onKeyDown={e=>{if(e.key==="Enter")renomearTemplate(i,tplNomeEdit);if(e.key==="Escape")setEditandoTplIdx(null);}}/>
                        <div onClick={()=>renomearTemplate(i,tplNomeEdit)} style={{padding:"4px 10px",background:GOLD,color:"#fff",borderRadius:2,fontSize:10,fontWeight:700,cursor:"pointer"}}>✓</div>
                        <div onClick={()=>setEditandoTplIdx(null)} style={{padding:"4px 8px",border:"1px solid "+BORDER,color:"#9A8060",borderRadius:2,fontSize:10,cursor:"pointer"}}>✕</div>
                      </div>
                    ):(
                      <div style={{display:"flex",alignItems:"center",padding:"8px 10px",gap:6}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:11,color:"#1C1410",fontWeight:600}}>{tpl.nome}</div>
                          {tpl.criadoEm&&<div style={{fontSize:9,color:"#C0B090"}}>Salvo em {tpl.criadoEm}</div>}
                        </div>
                        <div onClick={()=>aplicarTemplate(tpl)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700,flexShrink:0}}>Aplicar</div>
                        <div onClick={()=>{setEditandoTplIdx(i);setTplNomeEdit(tpl.nome);}} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid "+BORDER,color:"#5C4A2A",flexShrink:0}}>✎</div>
                        <div onClick={()=>excluirTemplate(tpl.id)} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid #E57373",color:"#E57373",flexShrink:0}}>✕</div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {adicionando&&(
            <div style={{padding:"10px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:14}}>
              <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                <input style={{flex:1,padding:"6px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit",minWidth:120}}
                  placeholder="Nome do procedimento" value={novoNome} onChange={e=>setNovoNome(e.target.value)} autoFocus/>
                <input style={{width:90,padding:"6px 10px",border:"1px solid "+BORDER,borderRadius:2,fontSize:12,outline:"none",fontFamily:"inherit"}}
                  placeholder="R$ valor" value={novoValor} onChange={e=>setNovoValor(e.target.value.replace(/[^0-9,]/g,""))}/>
                <select style={{padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,outline:"none",fontFamily:"inherit",cursor:"pointer"}}
                  value={novoModo} onChange={e=>setNovoModo(e.target.value)}>
                  <option value="dente">Por dente</option>
                  <option value="regiao">Por região</option>
                  <option value="livre">Valor livre</option>
                </select>
                <div onClick={adicionarCustom} style={{padding:"6px 12px",background:GOLD,color:"#fff",borderRadius:2,fontSize:11,fontWeight:700,cursor:"pointer"}}>+ Adicionar</div>
                <div onClick={()=>setAdicionando(false)} style={{padding:"6px 10px",border:"1px solid "+BORDER,color:"#9A8060",borderRadius:2,fontSize:11,cursor:"pointer"}}>✕</div>
              </div>
            </div>
          )}
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:procAtivo?0:4}}>
            {PROC_BASE.map((proc,i)=>renderChip(proc,itens[i],novo=>atualizarItem(i,novo),i,false))}
            {customProcs.map((item,i)=>{const proc={id:item.id,nome:item.nome,modo:item.modo};return renderChip(proc,item,novo=>atualizarCustom(i,novo),i,true);})}
          </div>
          {renderPainel()}
        </div>
        {[...itens.filter(it=>it.ativo),...customProcs.filter(it=>it.ativo)].length>0&&(
          <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,padding:18}}>
            <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:12}}>Resumo do Plano</div>
            <div style={{display:"flex",flexDirection:"column",gap:6}}>
              {itens.map((it,i)=>{
                if(!it.ativo)return null;
                const proc=PROC_BASE[i],sub=calcSubtotal(it,proc);
                const detalhe=proc.modo==="dente"?formatarDentes(it.dentes):proc.modo==="regiao"?(it.regiao==="boca"?"Boca toda":it.regiao==="sup"?"Arcada superior":"Arcada inferior"):"";
                return(<div key={proc.id} style={{borderLeft:"3px solid "+getCorProc(proc.id),padding:"8px 10px",background:CREAM,borderRadius:3}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div><div style={{fontSize:12,fontWeight:600,color:"#1C1410"}}>{proc.nome}</div>{detalhe&&<div style={{fontSize:10,color:"#9A8060"}}>{detalhe}</div>}{it.obs&&<div style={{fontSize:10,color:GOLD_DARK,marginTop:2}}>"{it.obs}"</div>}</div>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD_DARK,flexShrink:0,marginLeft:8}}>{fmt(sub)}</div>
                  </div>
                </div>);
              })}
              {customProcs.filter(it=>it.ativo).map(it=>{
                const v=parseMoeda(it.valor),sub=it.modo==="dente"?(it.dentes?.length||0)*v:v;
                return(<div key={it.id} style={{borderLeft:"3px solid "+GOLD,padding:"8px 10px",background:CREAM,borderRadius:3}}>
                  <div style={{display:"flex",justifyContent:"space-between"}}>
                    <div><div style={{fontSize:12,fontWeight:600,color:"#1C1410"}}>{it.nome}</div>{it.obs&&<div style={{fontSize:10,color:GOLD_DARK}}>"{it.obs}"</div>}</div>
                    <div style={{fontSize:13,fontWeight:700,color:GOLD_DARK,marginLeft:8}}>{fmt(sub)}</div>
                  </div>
                </div>);
              })}
              <div style={{display:"flex",justifyContent:"space-between",padding:"10px 10px 0",borderTop:"1px solid "+BORDER,marginTop:4}}>
                <span style={{fontSize:12,fontWeight:700,color:GOLD_DARK}}>Total</span>
                <span style={{fontFamily:"Georgia,serif",fontSize:18,fontWeight:700,color:GOLD_DARK}}>{fmt(totalGeral)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Relatorio({p1,p2,p3,p4State}) {
  const {nome,cpf,telefone,dataNasc,idade,isMinor,respNome,respCpf,dataConsulta,responsavel} = p1;
  const {achadosDente={},obsTexto=""} = p2;
  const {vb,ds,dc,fc,bm,bp,bj,bi,ci,entrada=false,entradaTipo="pct",entradaVal="0",saldoTipo="parcelado"} = p3;
  const vB2=parseFloat(vb)||0;
  const ds2=ds===4?parseFloat(dc)||0:ds;
  const vF2=ds2>0&&ds2<4?vB2*(1-ds2/100):vB2;
  const entradaValor2=entrada?(entradaTipo==="pct"?vF2*(parseFloat(entradaVal)||0)/100:(parseFloat(String(entradaVal).replace(",","."))||0)):0;
  const saldo2=entrada?Math.max(0,vF2-entradaValor2):vF2;

  const defaultItensRel = PROC_BASE.map(p => ({id:p.id,ativo:false,valor:String(p.valorPadrao).replace(".",","),dentes:[],subtipos:{},regiao:p.id==="profilaxia"?"boca":p.id==="clareamento"?"boca":null,qtd:1}));
  const p4Itens = (p4State?.itens || defaultItensRel).filter(it => it.ativo);
  const p4Custom = (p4State?.customProcs || []).filter(it => it.ativo);
  const temPlano = p4Itens.length > 0 || p4Custom.length > 0;

  const dp = ds===-1?(parseFloat(dc)||0):ds;
  const vB = parseFloat(String(vb).replace(",","."))||0;
  const dv = vB*dp/100, vF = vB-dv;
  const nb = parseInt(bp)||1, nic = parseInt(ci)||0;
  // Entrada sempre sobre valor cheio (vB) — desconto é só para pagamento à vista
  const entradaValorRel = entrada?(entradaTipo==="pct"?vB*(parseFloat(entradaVal)||0)/100:(parseFloat(String(entradaVal).replace(",","."))||0)):0;
  const saldoRel = entrada?Math.max(0,vB-entradaValorRel):vB;
  // Cartão não recebe desconto — usa vB; com entrada usa saldo sobre vB
  const creditoBaseRel = (entrada&&entradaValorRel>0&&saldoTipo==="parcelado")?saldoRel:vB;
  const tC = creditoBaseRel>0?[1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>({n,...calcCredito(creditoBaseRel,n)})):[];

  // Helper: describe dente set as regions instead of numbers


  const achadosList = p2.achados || ACHADOS_DEFAULT;
  const resumoAch = achadosList.map(a => ({
    id: a.id, lb: a.label, cor: a.cor,
    dentes: Object.entries(achadosDente).filter(([,v])=>v[a.id]).map(([d])=>parseInt(d)).sort((a,b)=>a-b)
  })).filter(a=>a.dentes.length>0);

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
    <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 40px"}}>
      <div style={{marginBottom:14,display:"flex",justifyContent:"flex-end"}}>
        <div onClick={()=>window.print()} style={{
          display:"flex",alignItems:"center",gap:8,padding:"10px 20px",
          background:"linear-gradient(135deg,#2C1810,#1A0F08)",
          color:"#fff",borderRadius:3,cursor:"pointer",fontSize:12,fontWeight:600,
          boxShadow:"0 2px 8px rgba(0,0,0,0.2)",
        }}>
          🖨️ Imprimir / Salvar PDF
        </div>
      </div>
      <div style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,overflow:"hidden"}}>

        {/* Cabeçalho */}
        <div style={{background:"linear-gradient(135deg,#2C1810,#1A0F08)",padding:"20px 24px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <svg width="32" height="42" viewBox="0 0 40 52" fill="none"><ellipse cx="20" cy="26" rx="18" ry="24" stroke={GOLD} strokeWidth="1.5"/><text x="20" y="32" textAnchor="middle" fontFamily="Georgia" fontSize="18" fontStyle="italic" fill={GOLD}>i</text></svg>
            <div><div style={{fontFamily:"Georgia",fontSize:18,fontWeight:700,color:"#fff",letterSpacing:3,textTransform:"uppercase"}}>Íntegra</div><div style={{fontSize:7,letterSpacing:2.5,color:GOLD_LIGHT,textTransform:"uppercase"}}>Clínica Odontológica · Desde 1996</div></div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:9,color:GOLD_LIGHT,letterSpacing:1,marginBottom:4}}>PRONTUÁRIO DE ATENDIMENTO</div>
            <div style={{fontSize:11,color:"rgba(255,255,255,0.7)"}}>{dataFmt(dataConsulta)}</div>
          </div>
        </div>

        <div style={{padding:"22px 24px"}}>

          {/* Dados do Paciente */}
          {temDados && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
              <span style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Dados do Paciente</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:8}}>
              {[
                ["Paciente",nome||"—"],
                ["CPF",cpf||"—"],
                ["Telefone",telefone||"—"],
                ["Data de nascimento",dataNasc?dataFmt(dataNasc)+(idade?" ("+idade+")":""):"—"],
                ["Responsável clínico",responsavel||"—"],
                ["Data da consulta",dataFmt(dataConsulta)],
              ].map(([l,v])=>(
                <div key={l} style={{padding:"9px 12px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3}}>
                  <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:12,color:"#1C1410",fontWeight:500}}>{v}</div>
                </div>
              ))}
            </div>
            {isMinor && respNome && (
              <div style={{padding:"9px 12px",background:"rgba(91,45,142,0.05)",border:"1px solid rgba(91,45,142,0.2)",borderRadius:3,marginBottom:8}}>
                <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:PURPLE,fontWeight:600,marginBottom:3}}>Responsável Legal</div>
                <div style={{fontSize:12,color:"#1C1410"}}>{respNome} {respCpf?"· CPF: "+respCpf:""}</div>
              </div>
            )}
          </>}

          {/* Avaliação Clínica */}
          {temAval && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Avaliação Clínica</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            {resumoAch.length>0 && <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:12}}>
              {resumoAch.map(a=>(
                <div key={a.id} style={{display:"flex",alignItems:"stretch",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{width:4,background:GOLD,flexShrink:0}}/>
                  <div style={{flex:1,padding:"10px 14px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:GOLD_DARK,flexShrink:0}}/>
                      <span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{a.lb}</span>
                    </div>
                    <span style={{fontSize:11,color:"#9A8060"}}>{formatarDentes(a.dentes)}</span>
                  </div>
                </div>
              ))}
            </div>}
            {obsTexto && <div style={{padding:"12px 14px",background:CREAM,border:"1px solid "+BORDER,borderRadius:3,fontSize:12,color:"#1C1410",lineHeight:1.7}}>
              <div style={{fontSize:8,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:6}}>Informações Clínicas</div>
              {obsTexto}
            </div>}
          </>}

          {/* Plano de Procedimentos */}
          {temPlano && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Plano de Procedimentos</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:0}}>
              {[...p4Itens.map(it => {
                const proc = PROC_BASE.find(p=>p.id===it.id);
                if(!proc) return null;
                const v = parseMoeda(it.valor);
                const sub = proc.subtipos
                  ? Object.values(it.subtipos||{}).reduce((a,s)=>a+parseMoeda(s.valor||"0"),0)
                  : proc.modo==="dente"?(it.dentes?.length||0)*v:v;
                const desc = proc.subtipos
                  ? Object.keys(it.subtipos||{}).map(id=>{ const st=proc.subtipos.find(s=>s.id===id); return st?.campoTexto&&it.subtipos[id]?.descricao ? it.subtipos[id].descricao : st?.label; }).filter(Boolean).join(" + ")||"—"
                  : proc.modo==="dente" ? formatarDentes(it.dentes)
                  : (it.regiao==="boca"?"Boca toda":it.regiao==="sup"?"Arcada superior":"Arcada inferior");
                return (<div key={it.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
                  <div><div style={{fontSize:12,fontWeight:600,color:"#1C1410"}}>{proc.nome}</div><div style={{fontSize:10,color:"#9A8060",marginTop:1}}>{desc}</div></div>
                  <div style={{fontSize:13,fontWeight:700,color:GOLD_DARK,flexShrink:0,marginLeft:12}}>{fmt2(sub)}</div>
                </div>)
              }),
              ...p4Custom.map(it => {
                const v = parseMoeda(it.valor);
                const sub = it.modo==="dente" && it.dentes?.length > 0 ? it.dentes.length*v : v;
                const desc = it.modo==="livre" ? "" : it.modo==="dente" ? formatarDentes(it.dentes) : (it.regiao==="boca"?"Boca toda":it.regiao==="sup"?"Arcada superior":it.regiao==="inf"?"Arcada inferior":"—");
                return (<div key={it.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"8px 0",borderBottom:"1px solid "+BORDER}}>
                  <div><div style={{fontSize:12,fontWeight:600,color:"#1C1410"}}>{it.nome}</div><div style={{fontSize:10,color:"#9A8060",marginTop:1}}>{desc}</div></div>
                  <div style={{fontSize:13,fontWeight:700,color:GOLD_DARK,flexShrink:0,marginLeft:12}}>{fmt2(sub)}</div>
                </div>)
              })].filter(Boolean)}
            </div>
          </>}

          {/* Proposta Financeira */}
          {temOrc && <>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14,marginTop:20}}>
              <span style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Proposta de Investimento</span>
              <div style={{flex:1,height:1,background:BORDER}}/>
            </div>
            {/* Valor total — aparece uma única vez */}
            <div style={{padding:"12px 14px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:10}}>
              {dp>0?(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:2}}>Valor do tratamento</div>
                    <div style={{fontSize:11,color:"#9A8060"}}>{fmt2(vB)}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:GOLD_DARK,marginBottom:2}}>Com {dp}% de desconto{(fc.includes("pix")||fc.includes("dinheiro"))?" — PIX · Dinheiro":""}</div>
                    <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:GOLD_DARK}}>{fmt2(vF)}</div>
                  </div>
                </div>
              ):(
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>Valor do tratamento</div>
                  <div style={{fontFamily:"Georgia,serif",fontSize:20,fontWeight:700,color:GOLD_DARK}}>{fmt2(vB)}</div>
                </div>
              )}
            </div>

            {/* Condições de pagamento */}
            {entrada && entradaValor2 > 0 && (
              <div style={{padding:"12px 14px",background:"#fff",border:"1px solid "+BORDER,borderRadius:3,marginBottom:10}}>
                <div style={{fontSize:9,letterSpacing:2,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,marginBottom:8}}>Condições de Pagamento</div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4}}>
                  <span style={{color:GOLD_DARK,fontWeight:700}}>Entrada</span>
                  <span style={{color:GOLD_DARK,fontWeight:700}}>{fmt2(entradaValor2)}{entradaTipo==="pct"?" ("+entradaVal+"%)":""}</span>
                </div>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12}}>
                  <span style={{color:"#5C4A2A"}}>{saldoTipo==="entrega"?"Saldo na entrega do trabalho":"Valor remanescente"}</span>
                  <span style={{color:"#1C1410",fontWeight:600}}>{fmt2(saldo2)}</span>
                </div>
              </div>
            )}

            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              {/* Grupo à vista — PIX, Dinheiro, Débito, Boleto à vista */}
              {(()=>{
                const tP=fc.includes("pix"),tD=fc.includes("dinheiro"),tBA=fc.includes("boleto")&&bm==="avista",tDe=fc.includes("debito");
                if(!tP&&!tD&&!tBA&&!tDe) return null;

                // Se há desconto e só tem PIX/Dinheiro (sem débito/boleto), já está no bloco acima — não mostra
                const pixDin = [tP&&{ic:"⚡",lb:"PIX"},tD&&{ic:"💵",lb:"Dinheiro"}].filter(Boolean);
                const outros = [tBA&&{ic:"📄",lb:"Boleto"},tDe&&{ic:"💳",lb:"Débito"}].filter(Boolean);
                if(dp>0 && pixDin.length>0 && outros.length===0) return null; // tudo já foi dito acima

                const grupos = dp>0
                  ? outros // com desconto: PIX/Dinheiro já explicados acima, mostra só os outros
                  : (pixDin.length>0
                    ? [{ic:pixDin.map(x=>x.ic).join(""),lb:pixDin.map(x=>x.lb).join(" · "), isPixDin:true}, ...outros]
                    : outros);

                if(!grupos.length) return null;

                return(<div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{borderLeft:"4px solid "+GOLD}}>
                    {grupos.map((item,i)=>(
                      <div key={item.lb} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",borderBottom:i<grupos.length-1?"1px solid "+BORDER:"none",background:"#fff"}}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{fontSize:14}}>{item.ic}</span>
                          <span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>{item.lb}</span>
                        </div>
                        <span style={{fontSize:12,fontWeight:600,color:GOLD_DARK}}>{fmt2(vF)} à vista</span>
                      </div>
                    ))}
                  </div>
                </div>);
              })()}
              {/* Crédito */}
              {fc.includes("credito")&&(()=>{
                const cp3=p3.cp;
                const st=p3.showTotal!==false;
                const todasLinhas=[1,2,3,4,5,6,7,8,9,10,11,12,18].map(n=>({n,...calcComprador(creditoBaseRel,n)}));
                const linhasRel=cp3?todasLinhas.filter(r=>r.n<=cp3):todasLinhas;
                // Divide em 2 colunas
                const metade=Math.ceil(linhasRel.length/2);
                const col1=linhasRel.slice(0,metade);
                const col2=linhasRel.slice(metade);
                return(<div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{borderLeft:"4px solid "+GOLD}}>
                    <div style={{padding:"9px 14px 7px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:7,background:"#fff"}}>
                      <span style={{fontSize:13}}>💳</span><span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>Cartão de crédito</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:"#fff"}}>
                      <div style={{borderRight:"1px solid "+BORDER}}>
                        {col1.map((r,i)=>(
                          <div key={r.n} style={{display:"grid",gridTemplateColumns:"36px 1fr"+(st?" 1fr":""),padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:i<col1.length-1?"1px solid "+BORDER:"none"}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#1C1410"}}>{r.n===1?"Av.":r.n+"x"}{r.n===18?"*":""}</span>
                            <span style={{fontSize:10,color:GOLD_DARK,fontWeight:600}}>{r.n===1?fmt2(r.totalCliente):fmt2(r.parcCliente)}</span>
                            {st&&<span style={{fontSize:9,color:"#9A8060"}}>{r.n===1?"":fmt2(r.totalCliente)}</span>}
                          </div>
                        ))}
                      </div>
                      <div>
                        {col2.map((r,i)=>(
                          <div key={r.n} style={{display:"grid",gridTemplateColumns:"36px 1fr"+(st?" 1fr":""),padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:i<col2.length-1?"1px solid "+BORDER:"none"}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#1C1410"}}>{r.n===1?"Av.":r.n+"x"}{r.n===18?"*":""}</span>
                            <span style={{fontSize:10,color:GOLD_DARK,fontWeight:600}}>{r.n===1?fmt2(r.totalCliente):fmt2(r.parcCliente)}</span>
                            {st&&<span style={{fontSize:9,color:"#9A8060"}}>{r.n===1?"":fmt2(r.totalCliente)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                    {(!cp3||cp3===18)&&<div style={{padding:"4px 14px",fontSize:8,color:"#9A8060",background:"#fff",borderTop:"1px solid "+BORDER}}>* 18x apenas Visa PagBank</div>}
                  </div>
                </div>);
              })()}
              {/* Boleto parcelado */}
              {fc.includes("boleto")&&bm==="parcelado"&&(()=>{
                const bBaseRel=(entrada&&entradaValorRel>0&&saldoTipo==="parcelado")?saldoRel:vF;
                const nl=bj==="sem_juros"?nb:bj==="com_juros"?0:parseInt(bi)||0;
                const st=p3.showTotal!==false;
                const ls=Array.from({length:nb},(_,i)=>{const n=i+1,sj=n<=nl,pc=bj==="combinado"?Math.max(0,n-nl):sj?0:n,t=sj?bBaseRel:bBaseRel*(1+0.012*pc);return{n,p:n===1?bBaseRel:t/n,sj,t:n===1?bBaseRel:t};});
                const metade=Math.ceil(ls.length/2);
                const col1=ls.slice(0,metade);
                const col2=ls.slice(metade);
                return(<div style={{border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                  <div style={{borderLeft:"4px solid "+GOLD}}>
                    <div style={{padding:"9px 14px 7px",borderBottom:"1px solid "+BORDER,display:"flex",alignItems:"center",gap:7,background:"#fff"}}>
                      <span style={{fontSize:13}}>📄</span><span style={{fontSize:12,fontWeight:700,color:"#1C1410"}}>Boleto parcelado</span>
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",background:"#fff"}}>
                      <div style={{borderRight:"1px solid "+BORDER}}>
                        {col1.map((l,i)=>(
                          <div key={l.n} style={{display:"grid",gridTemplateColumns:"36px 1fr"+(st?" 1fr":""),padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:i<col1.length-1?"1px solid "+BORDER:"none"}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#1C1410"}}>{l.n===1?"Av.":l.n+"x"}</span>
                            <span style={{fontSize:10,color:GOLD_DARK,fontWeight:600}}>{fmt2(l.n===1?bBaseRel:l.p)}</span>
                            {st&&<span style={{fontSize:9,color:l.sj||bj==="sem_juros"?"#4CAF50":"#9A8060"}}>{l.n===1?"":l.sj||bj==="sem_juros"?"s/juros":fmt2(l.t)}</span>}
                          </div>
                        ))}
                      </div>
                      <div>
                        {col2.map((l,i)=>(
                          <div key={l.n} style={{display:"grid",gridTemplateColumns:"36px 1fr"+(st?" 1fr":""),padding:"5px 10px",background:i%2===0?"#fff":CREAM,borderBottom:i<col2.length-1?"1px solid "+BORDER:"none"}}>
                            <span style={{fontSize:10,fontWeight:700,color:"#1C1410"}}>{l.n===1?"Av.":l.n+"x"}</span>
                            <span style={{fontSize:10,color:GOLD_DARK,fontWeight:600}}>{fmt2(l.n===1?bBaseRel:l.p)}</span>
                            {st&&<span style={{fontSize:9,color:l.sj||bj==="sem_juros"?"#4CAF50":"#9A8060"}}>{l.n===1?"":l.sj||bj==="sem_juros"?"s/juros":fmt2(l.t)}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>);
              })()}

                    {FORMAS.filter(f=>fc.includes(f.id)).map(f=>{
                      if(f.id==="credito") return null;
                      const mav=[fc.includes("pix"),fc.includes("dinheiro"),fc.includes("boleto")&&bm==="avista",fc.includes("debito")].filter(Boolean).length>=2;
                      if(mav&&(f.id==="pix"||f.id==="dinheiro"||f.id==="debito")) return null;
                      if(mav&&f.id==="boleto"&&bm==="avista") return null;
                      if(f.id==="boleto"&&bm==="parcelado") return null;
                      let l1="",l2="";
                      if(f.id==="dinheiro"||f.id==="pix"){l1=dp>0?fmt2(vB)+" à vista":fmt2(vF)+" à vista";if(dp>0)l2="Com "+dp+"% de desconto: "+fmt2(vF);}
                      else if(f.id==="debito"){l1=dp>0?fmt2(vB)+" à vista":fmt2(vF)+" à vista";l2=(dp>0?"Com "+dp+"% de desconto: "+fmt2(vF)+" · ":"")+"Taxa "+f.taxa+"% PagBank";}
                      else if(f.id==="boleto"&&bm==="avista"){l1=dp>0?fmt2(vB)+" à vista":fmt2(vF)+" à vista";if(dp>0)l2="Com "+dp+"% de desconto: "+fmt2(vF);}
                      if(!l1) return null;
                      return(<div key={f.id} style={{display:"flex",alignItems:"stretch",border:"1px solid "+BORDER,borderRadius:3,overflow:"hidden"}}>
                        <div style={{width:4,background:GOLD,flexShrink:0}}/>
                        <div style={{flex:1,padding:"11px 14px"}}>
                          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:3}}>
                            <span style={{fontSize:14}}>{f.icon}</span>
                            <span style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{f.label}</span>
                          </div>
                          {dp>0&&l2&&!l2.includes("Taxa")?<><div style={{fontSize:12,color:"#9A8060"}}>{l1}</div><div style={{fontSize:12,fontWeight:700,color:GOLD_DARK}}>{l2}</div></>
                          :<><div style={{fontSize:13,fontWeight:600,color:GOLD_DARK}}>{l1}</div>{l2&&<div style={{fontSize:10,color:"#9A8060",marginTop:2}}>{l2}</div>}</>}
                        </div>
                      </div>);
                    })}
            </div>
          </>}

          {/* Rodapé */}
          <div style={{borderTop:"1px solid "+BORDER,marginTop:22,paddingTop:14,fontSize:10,color:"#9A8060",fontStyle:"italic",textAlign:"center"}}>
            Íntegra Clínica Odontológica · (48) 3234-1002 · Rua Lauro Linhares, 1849 — Trindade, Florianópolis/SC
          </div>
        </div>
      </div>
    </div>
  );
}

const p4Initial = {
  itens: null, // null = use PROC_BASE defaults on first render
  customProcs: [],
};

const p3Initial = {vb:"",ds:0,dc:"",fc:[],fa:null,bm:"avista",bp:"6",bj:"sem_juros",bi:"3",ci:"3",cp:null,tb:"calc",entrada:false,entradaTipo:"pct",entradaVal:"30",saldoTipo:"parcelado",showTotal:true};

// ─── PRONTUÁRIOS ──────────────────────────────────
function Prontuarios({onCarregar, onNovo}) {
  const [prontuarios, setProntuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtros, setFiltros] = useState({proc:"", achado:"", responsavel:"", dataInicio:"", dataFim:""});
  const [verFiltros, setVerFiltros] = useState(false);
  const [pacienteSel, setPacienteSel] = useState(null);
  const [confirmExcluir, setConfirmExcluir] = useState(null);
  const [modoMarketing, setModoMarketing] = useState(false);
  const [exportMsg, setExportMsg] = useState("");

  const [erroStorage, setErroStorage] = useState("");

  useEffect(()=>{
    (async()=>{
      setCarregando(true);
      try {
        const r = await window.storage.get("prontuarios");
        if(r?.value) {
          const parsed = JSON.parse(r.value);
          setProntuarios(parsed);
        }
      } catch(e){
        setErroStorage("Erro ao carregar: "+e.message);
      }
      setCarregando(false);
    })();
  },[]);

  const excluirConsulta = async(cpf, consultaId) => {
    const novo = prontuarios.map(p=>{
      if(p.cpf!==cpf) return p;
      const consultas = p.consultas.filter(c=>c.id!==consultaId);
      return {...p, consultas};
    }).filter(p=>p.consultas.length>0);
    setProntuarios(novo);
    try{ await window.storage.set("prontuarios", JSON.stringify(novo)); }catch(e){}
    setConfirmExcluir(null);
  };

  // Agrupa por paciente e filtra
  const temFiltroAtivo = busca || Object.values(filtros).some(v=>v);
  const pacientes = prontuarios.map(p=>({
    ...p,
    consultas: p.consultas.filter(c=>{
      const bOk = !busca || p.nome?.toLowerCase().includes(busca.toLowerCase()) || p.cpf?.includes(busca);
      const procOk = !filtros.proc || c.procedimentos?.some(pr=>pr.toLowerCase().includes(filtros.proc.toLowerCase()));
      const achadoOk = !filtros.achado || c.achados?.some(a=>a.toLowerCase().includes(filtros.achado.toLowerCase()));
      const respOk = !filtros.responsavel || c.responsavel?.toLowerCase().includes(filtros.responsavel.toLowerCase());
      const dataOk = (!filtros.dataInicio || c.data >= filtros.dataInicio) && (!filtros.dataFim || c.data <= filtros.dataFim);
      return bOk && procOk && achadoOk && respOk && dataOk;
    })
  })).filter(p=>p.consultas.length>0 || (!temFiltroAtivo));

  const pacienteFiltrado = pacienteSel ? pacientes.find(p=>p.cpf===pacienteSel) : null;
  const lista = pacienteSel ? (pacienteFiltrado?[pacienteFiltrado]:[]) : pacientes;

  // Dados de contato dos pacientes filtrados (para marketing)
  const listaMarketing = lista.map(p=>({
    nome: p.nome||"",
    cpf: p.cpf||"",
    telefone: p.consultas[0]?.snapshot?.p1?.telefone||"",
    dataNasc: p.nascimento||"",
    ultimaConsulta: p.consultas[0]?.data||"",
    procedimentos: [...new Set(p.consultas.flatMap(c=>c.procedimentos||[]))].join(", "),
    achados: [...new Set(p.consultas.flatMap(c=>c.achados||[]))].join(", "),
    responsavel: p.consultas[0]?.responsavel||"",
  }));

  const copiarLista = () => {
    const linhas = ["Nome\tTelefone\tCPF\tData Nasc.\tÚlt. Consulta\tProcedimentos\tAchados\tResponsável",
      ...listaMarketing.map(p=>[p.nome,p.telefone,p.cpf,p.dataNasc,p.ultimaConsulta,p.procedimentos,p.achados,p.responsavel].join("\t"))
    ].join("\n");
    navigator.clipboard.writeText(linhas).then(()=>{setExportMsg("✓ Copiado!");setTimeout(()=>setExportMsg(""),3000);}).catch(()=>{setExportMsg("Erro ao copiar");});
  };

  const copiarWhatsApps = () => {
    const nums = listaMarketing.map(p=>p.telefone).filter(Boolean).join("\n");
    navigator.clipboard.writeText(nums).then(()=>{setExportMsg("✓ "+listaMarketing.filter(p=>p.telefone).length+" número(s) copiados!");setTimeout(()=>setExportMsg(""),3000);}).catch(()=>{});
  };

  return(
    <div style={{maxWidth:680,margin:"0 auto",padding:"20px 16px 40px",fontFamily:"'Outfit',system-ui,sans-serif"}}>

      {/* Header */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
        <div style={{fontSize:9,letterSpacing:2.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700}}>
          📁 Prontuários — {prontuarios.length} paciente(s)
        </div>
        <div onClick={onNovo} style={{padding:"6px 14px",borderRadius:20,fontSize:11,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700}}>
          + Novo atendimento
        </div>
      </div>

      {/* Busca */}
      <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input style={{flex:1,padding:"9px 12px",border:"1px solid "+BORDER,borderRadius:3,fontSize:13,outline:"none",fontFamily:"inherit",background:"#fff"}}
          placeholder="Buscar por nome ou CPF..." value={busca} onChange={e=>setBusca(e.target.value)}/>
        <div onClick={()=>setVerFiltros(!verFiltros)} style={{padding:"9px 14px",borderRadius:3,fontSize:11,cursor:"pointer",border:"1px solid "+(verFiltros?GOLD:BORDER),background:verFiltros?GOLD_PALE:"#fff",color:verFiltros?GOLD_DARK:"#5C4A2A",fontWeight:600}}>
          ⚙ Filtros {Object.values(filtros).some(v=>v)?"●":""}
        </div>
        {pacienteSel&&<div onClick={()=>setPacienteSel(null)} style={{padding:"9px 12px",borderRadius:3,fontSize:11,cursor:"pointer",border:"1px solid #E57373",color:"#E57373"}}>✕ Voltar</div>}
      </div>

      {/* Painel filtros */}
      {verFiltros&&(
        <div style={{padding:"12px",background:GOLD_PALE,border:"1px solid "+GOLD,borderRadius:3,marginBottom:12,display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
          {[["Procedimento",filtros.proc,v=>setFiltros(f=>({...f,proc:v}))],
            ["Achado clínico",filtros.achado,v=>setFiltros(f=>({...f,achado:v}))],
            ["Responsável",filtros.responsavel,v=>setFiltros(f=>({...f,responsavel:v}))],
          ].map(([l,v,s])=>(
            <div key={l}>
              <div style={{fontSize:9,color:GOLD_DARK,fontWeight:600,marginBottom:4}}>{l}</div>
              <input style={{width:"100%",padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
                placeholder={"Filtrar por "+l.toLowerCase()} value={v} onChange={e=>s(e.target.value)}/>
            </div>
          ))}
          <div>
            <div style={{fontSize:9,color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Data início</div>
            <input type="date" style={{width:"100%",padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
              value={filtros.dataInicio} onChange={e=>setFiltros(f=>({...f,dataInicio:e.target.value}))}/>
          </div>
          <div>
            <div style={{fontSize:9,color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Data fim</div>
            <input type="date" style={{width:"100%",padding:"6px 8px",border:"1px solid "+BORDER,borderRadius:2,fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}
              value={filtros.dataFim} onChange={e=>setFiltros(f=>({...f,dataFim:e.target.value}))}/>
          </div>
          <div style={{gridColumn:"1/-1",textAlign:"right"}}>
            <div onClick={()=>setFiltros({proc:"",achado:"",responsavel:"",dataInicio:"",dataFim:""})} style={{fontSize:10,color:"#E57373",cursor:"pointer"}}>✕ Limpar filtros</div>
          </div>
        </div>
      )}

      {carregando&&<div style={{textAlign:"center",padding:40,color:"#9A8060",fontSize:13}}>Carregando prontuários...</div>}
      {erroStorage&&<div style={{margin:"12px 16px",padding:"10px 14px",background:"rgba(229,115,115,0.1)",border:"1px solid #E57373",borderRadius:3,fontSize:11,color:"#C62828"}}>{erroStorage}</div>}

      {/* Painel Marketing */}
      {!carregando&&lista.length>0&&(
        <div style={{marginBottom:12}}>
          <div onClick={()=>setModoMarketing(!modoMarketing)}
            style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",background:modoMarketing?"#1C1410":CREAM,border:"1px solid "+(modoMarketing?GOLD:BORDER),borderRadius:3,cursor:"pointer",transition:"all 0.2s"}}>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <span style={{fontSize:14}}>📣</span>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:modoMarketing?"#fff":GOLD_DARK}}>Lista para campanha</div>
                <div style={{fontSize:9,color:modoMarketing?GOLD_LIGHT:"#9A8060"}}>{lista.length} paciente(s) {temFiltroAtivo?"com os filtros aplicados":"no total"}</div>
              </div>
            </div>
            <span style={{color:modoMarketing?GOLD:"#9A8060",fontSize:14}}>{modoMarketing?"▲":"▼"}</span>
          </div>

          {modoMarketing&&(
            <div style={{border:"1px solid "+GOLD,borderTop:"none",borderRadius:"0 0 3px 3px",overflow:"hidden"}}>
              {/* Ações de exportação */}
              <div style={{padding:"12px 14px",background:"#2C1810",display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
                <div onClick={copiarLista} style={{padding:"7px 14px",borderRadius:20,fontSize:11,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700}}>📋 Copiar tabela completa</div>
                <div onClick={copiarWhatsApps} style={{padding:"7px 14px",borderRadius:20,fontSize:11,cursor:"pointer",background:"#25D366",color:"#fff",fontWeight:700}}>📱 Copiar números WhatsApp</div>
                {exportMsg&&<span style={{fontSize:11,color:"#81C784",fontWeight:600}}>{exportMsg}</span>}
              </div>
              {!temFiltroAtivo&&<div style={{padding:"8px 14px",background:"rgba(184,150,46,0.1)",fontSize:10,color:GOLD_DARK,borderBottom:"1px solid "+BORDER}}>
                💡 Use os filtros acima para segmentar — ex: filtrar por "Placa oclusal" no último ano para campanha de DTM.
              </div>}
              {/* Tabela de contatos */}
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
                  <thead>
                    <tr style={{background:CREAM,borderBottom:"1px solid "+BORDER}}>
                      {["Nome","Telefone","Data Nasc.","Últ. Consulta","Procedimentos"].map(h=>(
                        <th key={h} style={{padding:"8px 10px",textAlign:"left",fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:700,whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {listaMarketing.map((p,i)=>(
                      <tr key={i} style={{borderBottom:"1px solid "+BORDER,background:i%2===0?"#fff":CREAM}}>
                        <td style={{padding:"8px 10px",fontWeight:600,color:"#1C1410",whiteSpace:"nowrap"}}>{p.nome||"—"}</td>
                        <td style={{padding:"8px 10px",color:"#25D366",fontWeight:600,whiteSpace:"nowrap"}}>{p.telefone||<span style={{color:"#C0B090"}}>—</span>}</td>
                        <td style={{padding:"8px 10px",color:"#5C4A2A",whiteSpace:"nowrap"}}>{p.dataNasc||"—"}</td>
                        <td style={{padding:"8px 10px",color:"#9A8060",whiteSpace:"nowrap"}}>{p.ultimaConsulta||"—"}</td>
                        <td style={{padding:"8px 10px",color:GOLD_DARK,maxWidth:200}}>
                          <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                            {p.procedimentos?p.procedimentos.split(", ").map((pr,j)=>(
                              <span key={j} style={{fontSize:9,padding:"1px 6px",background:GOLD_PALE,color:GOLD_DARK,borderRadius:8,whiteSpace:"nowrap"}}>{pr}</span>
                            )):<span style={{color:"#C0B090"}}>—</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {!carregando&&prontuarios.length===0&&(
        <div style={{textAlign:"center",padding:40,color:"#9A8060"}}>
          <div style={{fontSize:32,marginBottom:12}}>📁</div>
          <div style={{fontSize:14,fontWeight:600,marginBottom:6}}>Nenhum prontuário ainda</div>
          <div style={{fontSize:12}}>Preencha um atendimento e salve o prontuário na aba Relatório.</div>
        </div>
      )}

      {!carregando&&prontuarios.length>0&&lista.length===0&&(
        <div style={{textAlign:"center",padding:30,color:"#9A8060",fontSize:12}}>Nenhum resultado encontrado para os filtros aplicados.</div>
      )}

      {/* Lista de pacientes */}
      {lista.map(pac=>(
        <div key={pac.cpf} style={{background:"#fff",border:"1px solid "+BORDER,borderRadius:4,marginBottom:12,overflow:"hidden"}}>
          {/* Cabeçalho paciente */}
          <div onClick={()=>setPacienteSel(pacienteSel===pac.cpf?null:pac.cpf)}
            style={{padding:"14px 16px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"space-between",background:pacienteSel===pac.cpf?GOLD_PALE:"#fff",borderBottom:pacienteSel===pac.cpf?"1px solid "+BORDER:"none"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:GOLD_PALE,border:"2px solid "+GOLD,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,color:GOLD_DARK,flexShrink:0}}>
                {pac.nome?.charAt(0)||"?"}
              </div>
              <div>
                <div style={{fontSize:13,fontWeight:700,color:"#1C1410"}}>{pac.nome||"Sem nome"}</div>
                <div style={{fontSize:10,color:"#9A8060",marginTop:2}}>
                  {pac.cpf&&<span>CPF: {pac.cpf} · </span>}
                  {pac.nascimento&&<span>{pac.nascimento} · </span>}
                  <span>{pac.consultas.length} consulta(s)</span>
                </div>
              </div>
            </div>
            <div style={{fontSize:18,color:GOLD_DARK}}>{pacienteSel===pac.cpf?"▲":"▼"}</div>
          </div>

          {/* Consultas do paciente */}
          {pacienteSel===pac.cpf&&pac.consultas.map((c,ci)=>(
            <div key={c.id} style={{borderTop:"1px solid "+BORDER,padding:"14px 16px",background:ci%2===0?"#fff":CREAM}}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{fontSize:12,fontWeight:700,color:GOLD_DARK}}>📅 {c.data} — {c.responsavel}</div>
                  {c.total>0&&<div style={{fontSize:11,color:GOLD_DARK,fontWeight:600,marginTop:2}}>Total: {fmt(c.total)}</div>}
                </div>
                <div style={{display:"flex",gap:6}}>
                  <div onClick={()=>onCarregar(c.snapshot)} style={{padding:"4px 10px",borderRadius:20,fontSize:10,cursor:"pointer",background:GOLD,color:"#fff",fontWeight:700}}>Carregar</div>
                  <div onClick={()=>setConfirmExcluir({cpf:pac.cpf,id:c.id,nome:pac.nome,data:c.data})} style={{padding:"4px 8px",borderRadius:20,fontSize:10,cursor:"pointer",border:"1px solid #E57373",color:"#E57373"}}>✕</div>
                </div>
              </div>
              {c.procedimentos?.length>0&&(
                <div style={{marginBottom:6}}>
                  <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Procedimentos</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {c.procedimentos.map((p,i)=><span key={i} style={{fontSize:10,padding:"2px 8px",background:GOLD_PALE,color:GOLD_DARK,borderRadius:10,border:"1px solid "+GOLD_LIGHT}}>{p}</span>)}
                  </div>
                </div>
              )}
              {c.achados?.length>0&&(
                <div>
                  <div style={{fontSize:9,letterSpacing:1.5,textTransform:"uppercase",color:GOLD_DARK,fontWeight:600,marginBottom:4}}>Achados clínicos</div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                    {c.achados.map((a,i)=><span key={i} style={{fontSize:10,padding:"2px 8px",background:"rgba(76,175,80,0.08)",color:"#2E7D32",borderRadius:10,border:"1px solid rgba(76,175,80,0.3)"}}>{a}</span>)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ))}

      {/* Modal confirmação exclusão */}
      {confirmExcluir&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:20}}>
          <div style={{background:"#fff",borderRadius:4,padding:24,maxWidth:320,width:"100%"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#1C1410",marginBottom:8}}>Excluir consulta?</div>
            <div style={{fontSize:12,color:"#5C4A2A",marginBottom:16}}>Consulta de {confirmExcluir.nome} em {confirmExcluir.data}. Esta ação não pode ser desfeita.</div>
            <div style={{display:"flex",gap:8}}>
              <div onClick={()=>excluirConsulta(confirmExcluir.cpf,confirmExcluir.id)} style={{flex:1,padding:"9px",borderRadius:3,background:"#E57373",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",textAlign:"center"}}>Excluir</div>
              <div onClick={()=>setConfirmExcluir(null)} style={{flex:1,padding:"9px",borderRadius:3,border:"1px solid "+BORDER,color:"#5C4A2A",fontSize:12,cursor:"pointer",textAlign:"center"}}>Cancelar</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function App() {
  const [pag, setPag] = useState("p1");
  const [p1, setP1] = useState(p1Initial);
  const [p2, setP2] = useState(p2Initial);
  const [p3, setP3] = useState(p3Initial);
  const sp3 = (k,v) => setP3(prev=>({...prev,[k]:v}));
  const [p4Total, setP4Total] = useState(0);
  const [p4State, setP4State] = useState(p4Initial);
  const [salvandoPront, setSalvandoPront] = useState(false);
  const [prontSalvo, setProntSalvo] = useState(false);

  const [prontKey, setProntKey] = useState(0);

  const salvarProntuario = async () => {
    setSalvandoPront(true);
    try {
      let todos = [];
      try {
        const r = await window.storage.get("prontuarios");
        if(r?.value) todos = JSON.parse(r.value);
      } catch(e) { todos = []; }

      const procedimentos = [
        ...(p4State.itens||[]).filter(it=>it.ativo).map(it=>PROC_BASE.find(p=>p.id===it.id)?.nome).filter(Boolean),
        ...(p4State.customProcs||[]).filter(it=>it.ativo).map(it=>it.nome),
      ];
      const achadosRaw = p2.achados || ACHADOS_DEFAULT;
      const achados = achadosRaw.map(a=>({...a, dentes:Object.entries(p2.achadosDente||{}).filter(([,v])=>v[a.id]).map(([d])=>parseInt(d))})).filter(a=>a.dentes.length>0).map(a=>a.label);
      const total = (p4State.itens||[]).reduce((acc,it,i)=>{
        if(!it.ativo) return acc;
        const proc=PROC_BASE[i]; if(!proc) return acc;
        const v=parseMoeda(it.valor);
        return acc+(proc.subtipos?Object.values(it.subtipos||{}).reduce((s,st)=>s+parseMoeda(st.valor||"0"),0):proc.modo==="dente"?(it.dentes?.length||0)*v:v);
      },0);

      const consulta = {
        id: "c_"+Date.now(),
        data: p1.dataConsulta || new Date().toISOString().split("T")[0],
        responsavel: p1.responsavel || "",
        procedimentos, achados, total,
        snapshot: { p1:{...p1}, p2:{...p2}, p3:{...p3}, p4State:{...p4State} }
      };

      const cpf = p1.cpf?.replace(/\D/g,"") || "sem_cpf_"+Date.now();
      const idx = todos.findIndex(p=>p.cpf===cpf);
      if(idx>=0) {
        todos[idx].consultas.unshift(consulta);
        todos[idx].nome = p1.nome;
        todos[idx].nascimento = p1.dataNasc;
      } else {
        todos.unshift({ cpf, nome:p1.nome||"Paciente sem nome", nascimento:p1.dataNasc, consultas:[consulta] });
      }

      await window.storage.set("prontuarios", JSON.stringify(todos));
      setProntSalvo(true);
      setProntKey(k=>k+1); // força recarregamento do componente Prontuarios
      setTimeout(()=>setProntSalvo(false), 4000);
    } catch(e) {
      alert("Erro ao salvar prontuário: "+e.message);
      console.error(e);
    }
    setSalvandoPront(false);
  };

  const carregarProntuario = (snapshot) => {
    setP1(snapshot.p1||p1Initial);
    setP2(snapshot.p2||p2Initial);
    setP3(snapshot.p3||p3Initial);
    setP4State(snapshot.p4State||p4Initial);
    setPag("p1");
  };

  const novoAtendimento = () => {
    setP1(p1Initial); setP2(p2Initial); setP3(p3Initial); setP4State(p4Initial);
    setPag("p1");
  };

  const navBtn = (id, label, active) => (
    <button style={{flex:1,padding:"12px 4px 14px",border:"none",background:"transparent",color:active?"#B8962E":"#9A8060",fontFamily:"inherit",fontSize:9,fontWeight:600,letterSpacing:"1px",textTransform:"uppercase",cursor:"pointer",borderTop:active?"2px solid #B8962E":"2px solid transparent"}}
      onClick={()=>setPag(id)}>{label}</button>
  );

  return (
    <div style={{paddingBottom:64,fontFamily:"'Outfit',system-ui,sans-serif",background:"#FDFAF4",minHeight:"100vh"}}>
      <Header/>

      {pag==="pront"&&<Prontuarios key={prontKey} onCarregar={carregarProntuario} onNovo={novoAtendimento}/>}
      {pag==="p1"&&<P1 data={p1} setData={setP1}/>}
      {pag==="p2"&&<P2 data={p2} setData={setP2}/>}
      {pag==="p4"&&<P4 onTotalChange={(total)=>{setP4Total(total);if(total>0)sp3("vb",String(total));else if(p3.vb===String(p4Total))sp3("vb","");}} p4State={p4State} setP4State={setP4State}/>}
      {pag==="p3"&&<P3
        vb={p3.vb||(p4Total>0?String(p4Total):"")} setVb={v=>sp3("vb",v)}
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
        showTotal={p3.showTotal!==false} setShowTotal={v=>sp3("showTotal",v)}
      />}
      {pag==="rel"&&(
        <div>
          <Relatorio p1={p1} p2={p2} p3={p3} p4State={p4State}/>
          {/* Botão salvar prontuário */}
          <div style={{maxWidth:680,margin:"0 auto",padding:"0 16px 16px"}}>
            <div onClick={salvandoPront?null:salvarProntuario} style={{
              padding:"14px",borderRadius:4,textAlign:"center",cursor:salvandoPront?"default":"pointer",
              background:prontSalvo?"rgba(76,175,80,0.1)":salvandoPront?"#D0C8B8":"#2C1810",
              border:"2px solid "+(prontSalvo?"#4CAF50":salvandoPront?BORDER:GOLD),
              color:prontSalvo?"#2E7D32":salvandoPront?"#9A8060":"#fff",
              fontWeight:700,fontSize:13,transition:"all 0.2s"
            }}>
              {prontSalvo?"✓ Prontuário salvo com sucesso!":salvandoPront?"Salvando...":"💾 Salvar no prontuário do paciente"}
            </div>
          </div>
        </div>
      )}

      <nav style={{display:"flex",position:"fixed",bottom:0,left:0,right:0,background:"#1A0F08",borderTop:"2px solid #2C1810",zIndex:100}}>
        {navBtn("pront","📁 Pront.",pag==="pront")}
        {navBtn("p1","👤 Paciente",pag==="p1")}
        {navBtn("p2","🦷 Aval.",pag==="p2")}
        {navBtn("p4","🗒️ Plano",pag==="p4")}
        {navBtn("p3","💰 Orç.",pag==="p3")}
        {navBtn("rel","📋 Rel.",pag==="rel")}
      </nav>
    </div>
  );
}

export default App;
