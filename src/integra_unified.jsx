import React, { useState, useEffect, useMemo } from "react";
// v8.10 - Correção de quebra de página na impressão (tabela mestra thead/tfoot)

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
        _fbDb = window.firebase.database(app);
        _fbReady = true;
        while(_fbReadyCallbacks.length) _fbReadyCallbacks.shift()();
      } catch(e) { console.error("Firebase init error:", e); }
    };
    document.head.appendChild(s2);
  };
  document.head.appendChild(s1);
}

// ─── CONSTANTES & DICIONÁRIOS ──────────────────────
const DENTES_PERMANENTES = [
  18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28,
  48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38
];
const DENTES_DECIDUOS = [
  55,54,53,52,51, 61,62,63,64,65,
  85,84,83,82,81, 71,72,73,74,75
];

const PROCEDIMENTOS_PADRAO = [
  { id: "p1", nome: "Profilaxia", tipo: "boca", valor: 350 },
  { id: "p2", nome: "Clareamento Dental", tipo: "boca", valor: 800 },
  { id: "p3", nome: "Extração Dentária", tipo: "dente", valor: 400 },
  { id: "p4", nome: "Restauração em Resina", tipo: "dente", valor: 280 },
  { id: "p5", nome: "Tratamento Endodôntico (Canal)", tipo: "dente", valor: 950 },
  { id: "p6", nome: "Coroa Protocolo Cerâmico", tipo: "dente", valor: 3500 },
  { id: "p7", nome: "Implante Dentário", tipo: "dente", valor: 2800 },
  { id: "p8", nome: "Prótese Dentária", tipo: "regiao", valor: 1800 },
  { id: "p9", nome: "Ortodontia", tipo: "boca", valor: 3500 },
  { id: "p10", nome: "Placa de Bruxismo", tipo: "regiao", valor: 1500 }
];

const ESTILOS_IMPRESSAO = `
  @media print {
    @page {
      size: A4;
      margin: 0mm;
    }
    body {
      background: #fff !important;
      color: #000 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .no-print {
      display: none !important;
    }
    .print-only {
      display: block !important;
    }
    
    .print-table-wrapper {
      width: 100% !important;
      border-collapse: collapse !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    
    thead.print-header {
      display: table-header-group !important;
    }
    tfoot.print-footer {
      display: table-footer-group !important;
    }
    
    .print-header-padding {
      height: 48mm;
    }
    .print-footer-padding {
      height: 25mm;
    }
    
    .print-header-fixed {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      height: 42mm;
      background: #faf7f2 !important;
      border-bottom: 2px solid #B8962E !important;
      padding: 20px 40px;
      box-sizing: border-box;
      display: flex;
      justify-content: space-between;
      align-items: center;
      z-index: 9999;
    }
    
    .print-footer-fixed {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      height: 20mm;
      background: #faf7f2 !important;
      border-top: 1px solid #E0D7CD !important;
      display: flex;
      justify-content: center;
      align-items: center;
      z-index: 9999;
    }
    
    .print-main-content {
      padding: 20px 40px;
      box-sizing: border-box;
    }
    
    .avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    tr {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    
    .bloco-assinatura {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin-top: 40px;
    }
  }
  @media screen {
    .print-only { display: none !important; }
  }
`;

export default function IntegraUnifiedApp() {
  // ─── ESTADOS PRINCIPAIS ──────────────────────────
  const [chaveSessao, setChaveSessao] = useState("");
  const [conectadoFb, setConectadoFb] = useState(false);
  const [pag, setPag] = useState("p1"); // p1: Paciente, p2: Plano, p3: Orçamento, rel: Relatório, arq: Arquivos
  const [popupBoasVindas, setPopupBoasVindas] = useState(true);

  // Dados do Paciente
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [telefone, setTelefone] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [respClinico, setRespClinico] = useState("Dr. Arthur A. Cheade");
  const [dataConsulta, setDataConsulta] = useState(new Date().toISOString().split("T")[0]);

  // Avaliação Clínica
  const [achados, setAchados] = useState({
    carie: false,
    suspeita: false,
    perdaOssea: false,
    fratura: false,
    tartaro: false,
    mobilidade: false,
  });
  const [observacoes, setObservacoes] = useState("");

  // Itens Selecionados no Orçamento
  const [itensOrcamento, setItensOrcamento] = useState([]);

  // Assinatura Digital
  const [assinaturaBase64, setAssinaturaBase64] = useState("");

  // Injetar estilos de impressão
  useEffect(() => {
    const styleTag = document.createElement("style");
    styleTag.innerHTML = ESTILOS_IMPRESSAO;
    document.head.appendChild(styleTag);
    return () => document.head.removeChild(styleTag);
  }, []);

  // ─── SINCRONIZAÇÃO FIREBASE ─────────────────────
  useEffect(() => {
    if (!chaveSessao) return;
    
    const carregarDados = () => {
      onFirebaseReady(() => {
        if (!_fbDb) return;
        const ref = _fbDb.ref("sessoes/" + chaveSessao);
        ref.on("value", (snapshot) => {
          const dados = snapshot.val();
          if (dados) {
            if (dados.nome !== undefined) setNome(dados.nome);
            if (dados.cpf !== undefined) setCpf(dados.cpf);
            if (dados.telefone !== undefined) setTelefone(dados.telefone);
            if (dados.nascimento !== undefined) setNascimento(dados.nascimento);
            if (dados.respClinico !== undefined) setRespClinico(dados.respClinico);
            if (dados.dataConsulta !== undefined) setDataConsulta(dados.dataConsulta);
            if (dados.achados !== undefined) setAchados(dados.achados);
            if (dados.observacoes !== undefined) setObservacoes(dados.observacoes);
            if (dados.itensOrcamento !== undefined) setItensOrcamento(dados.itensOrcamento || []);
            if (dados.assinaturaBase64 !== undefined) setAssinaturaBase64(dados.assinaturaBase64);
            setConectadoFb(true);
          }
        });
      });
    };

    carregarDados();
    return () => {
      if (_fbDb) _fbDb.ref("sessoes/" + chaveSessao).off();
    };
  }, [chaveSessao]);

  const salvarNoFirebase = (novosDados) => {
    if (!chaveSessao || !_fbDb) return;
    _fbDb.ref("sessoes/" + chaveSessao).update(novosDados);
  };

  // ─── LÓGICA DE PRODUTOS ──────────────────────────
  const adicionarItemOrcamento = (proc, dentes, regiao) => {
    const novoItem = {
      idUnico: Date.now() + Math.random().toString(36).substr(2, 9),
      procedimento: proc,
      dentes: dentes || [],
      regiao: regiao || "Boca Toda",
      valorCalculado: proc.valor
    };
    const listaAtualizada = [...itensOrcamento, novoItem];
    setItensOrcamento(listaAtualizada);
    salvarNoFirebase({ itensOrcamento: listaAtualizada });
  };

  const removerItemOrcamento = (idUnico) => {
    const listaAtualizada = itensOrcamento.filter(item => item.idUnico !== idUnico);
    setItensOrcamento(listaAtualizada);
    salvarNoFirebase({ itensOrcamento: listaAtualizada });
  };

  const valorTotalGeral = useMemo(() => {
    return itensOrcamento.reduce((acc, curr) => acc + curr.valorCalculado, 0);
  }, [itensOrcamento]);

  // Cabeçalho e Rodapé de Impressão Estáticos
  const ElementoCabecalho = () => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
      <div>
        <h1 style={{ margin: 0, fontSize: "28px", color: "#B8962E", fontFamily: "Georgia, serif", letterSpacing: "2px" }}>ÍNTEGRA</h1>
        <p style={{ margin: "2px 0 0 0", fontSize: "10px", color: "#9A8060", letterSpacing: "3px", textTransform: "uppercase" }}>Clínica Odontológica</p>
      </div>
      <div style={{ textAlign: "right", fontSize: "11px", color: "#655340", lineHeight: "1.4" }}>
        <strong>{respClinico}</strong><br />
        Responsável Clínico<br />
        Florianópolis - SC
      </div>
    </div>
  );

  const ElementoRodape = () => (
    <div style={{ width: "100%", textAlign: "center", fontSize: "11px", color: "#9A8060" }}>
      <p style={{ margin: 0 }}>Íntegra Clínica Odontológica - Desde 1996 | Excelência em Saúde Bucal</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#fcfaf7", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif", color: "#4A3E3D", margin: 0, padding: 0 }}>
      
      {/* ─── INTERFACE DE LOGIN ─────────────────────── */}
      {popupBoasVindas && (
        <div className="no-print" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(36,28,21,0.95)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 9999 }}>
          <div style={{ background: "#fcfaf7", padding: "40px", borderRadius: "12px", maxWidth: "450px", width: "100%", border: "1px solid #E0D7CD", textAlign: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.2)" }}>
            <h2 style={{ fontFamily: "Georgia, serif", color: "#B8962E", marginBottom: "15px" }}>Painel Integrado Íntegra</h2>
            <input 
              type="text" 
              placeholder="Chave da Sessão (Ex: integra-hoje)" 
              value={chaveSessao} 
              onChange={(e) => setChaveSessao(e.target.value.toLowerCase().trim())} 
              style={{ width: "100%", padding: "14px", borderRadius: "6px", border: "1px solid #C4B4A3", fontSize: "16px", textAlign: "center", marginBottom: "20px" }}
            />
            <button 
              onClick={() => { if(chaveSessao) setPopupBoasVindas(false); }}
              disabled={!chaveSessao}
              style={{ width: "100%", padding: "14px", background: chaveSessao ? "#B8962E" : "#C4B4A3", color: "#fff", border: "none", borderRadius: "6px", fontSize: "16px", fontWeight: "600", cursor: "pointer" }}
            >
              Conectar Sistema
            </button>
          </div>
        </div>
      )}

      {/* ─── PAINEL VISUAL (WEB SCREEN) ──────────────── */}
      <div className="no-print" style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "20px", borderBottom: "1px solid #E0D7CD", marginBottom: "25px" }}>
          <div>
            <h1 style={{ margin: 0, fontFamily: "Georgia, serif", color: "#B8962E" }}>ÍNTEGRA</h1>
            <span style={{ fontSize: "12px", color: "#9A8060" }}>Conexão Ativa: {chaveSessao || "Nenhuma"}</span>
          </div>
          <button onClick={() => window.print()} style={{ padding: "10px 20px", background: "#B8962E", color: "#fff", border: "none", borderRadius: "6px", cursor: "pointer", fontWeight: "600" }}>🖨️ Gerar Impressão</button>
        </header>

        <nav style={{ display: "flex", background: "#f2ede6", borderRadius: "8px", padding: "6px", marginBottom: "25px", gap: "5px" }}>
          <button onClick={() => setPag("p1")} style={{ flex: 1, padding: "12px", border: "none", borderRadius: "6px", background: pag === "p1" ? "#fff" : "transparent", color: "#B8962E", fontWeight: "600", cursor: "pointer" }}>👤 Paciente</button>
          <button onClick={() => setPag("p2")} style={{ flex: 1, padding: "12px", border: "none", borderRadius: "6px", background: pag === "p2" ? "#fff" : "transparent", color: "#B8962E", fontWeight: "600", cursor: "pointer" }}>📋 Diagnóstico</button>
          <button onClick={() => setPag("p3")} style={{ flex: 1, padding: "12px", border: "none", borderRadius: "6px", background: pag === "p3" ? "#fff" : "transparent", color: "#B8962E", fontWeight: "600", cursor: "pointer" }}>💰 Orçamento ({itensOrcamento.length})</button>
        </nav>

        {pag === "p1" && (
          <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", border: "1px solid #E0D7CD" }}>
            <h3 style={{ marginTop: 0, color: "#655340", fontFamily: "Georgia, serif" }}>Cadastro Inicial</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginTop: "20px" }}>
              <input type="text" placeholder="Nome Completo" value={nome} onChange={(e) => { setNome(e.target.value); salvarNoFirebase({ nome: e.target.value }); }} style={{ padding: "12px", borderRadius: "6px", border: "1px solid #E0D7CD" }} />
              <input type="text" placeholder="CPF" value={cpf} onChange={(e) => { setCpf(e.target.value); salvarNoFirebase({ cpf: e.target.value }); }} style={{ padding: "12px", borderRadius: "6px", border: "1px solid #E0D7CD" }} />
              <input type="text" placeholder="Telefone" value={telefone} onChange={(e) => { setTelefone(e.target.value); salvarNoFirebase({ telefone: e.target.value }); }} style={{ padding: "12px", borderRadius: "6px", border: "1px solid #E0D7CD" }} />
              <input type="date" value={nascimento} onChange={(e) => { setNascimento(e.target.value); salvarNoFirebase({ nascimento: e.target.value }); }} style={{ padding: "12px", borderRadius: "6px", border: "1px solid #E0D7CD" }} />
            </div>
          </div>
        )}

        {pag === "p2" && (
          <div style={{ background: "#fff", padding: "30px", borderRadius: "12px", border: "1px solid #E0D7CD" }}>
            <h3 style={{ marginTop: 0, color: "#655340", fontFamily: "Georgia, serif" }}>Ficha Clínica</h3>
            <div style={{ display: "flex", gap: "20px", margin: "20px 0" }}>
              {Object.keys(achados).map(key => (
                <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <input type="checkbox" checked={achados[key]} onChange={(e) => { const n = { ...achados, [key]: e.target.checked }; setAchados(n); salvarNoFirebase({ achados: n }); }} />
                  <span style={{ textTransform: "capitalize" }}>{key}</span>
                </label>
              ))}
            </div>
            <textarea placeholder="Observações..." value={observacoes} onChange={(e) => { setObservacoes(e.target.value); salvarNoFirebase({ observacoes: e.target.value }); }} rows={4} style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #E0D7CD" }} />
          </div>
        )}

        {pag === "p3" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #E0D7CD" }}>
              <h3 style={{ marginTop: 0 }}>Procedimentos</h3>
              {PROCEDIMENTOS_PADRAO.map(p => (
                <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid #f2ede6" }}>
                  <span>{p.nome}</span>
                  <button onClick={() => adicionarItemOrcamento(p, [], "Boca Toda")} style={{ background: "none", border: "1px solid #B8962E", color: "#B8962E", padding: "4px 8px", borderRadius: "4px", cursor: "pointer" }}>+ Add</button>
                </div>
              ))}
            </div>
            <div style={{ background: "#fff", padding: "20px", borderRadius: "12px", border: "1px solid #E0D7CD" }}>
              <h3 style={{ marginTop: 0 }}>Resumo</h3>
              {itensOrcamento.map(i => (
                <div key={i.idUnico} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0" }}>
                  <span>{i.procedimento.nome}</span>
                  <button onClick={() => removerItemOrcamento(i.idUnico)} style={{ color: "red", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                </div>
              ))}
              <h4 style={{ borderTop: "2px solid #B8962E", paddingTop: "15px", marginTop: "15px", textAlign: "right" }}>Total: R$ {valorTotalGeral.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</h4>
            </div>
          </div>
        )}
      </div>

      {/* ─── LAYOUT DE IMPRESSÃO PROFISSIONAL (A4) ───── */}
      <div className="print-only">
        <table className="print-table-wrapper">
          <thead className="print-header">
            <tr>
              <td>
                <div className="print-header-padding" />
                <div className="print-header-fixed">
                  <ElementoCabecalho />
                </div>
              </td>
            </tr>
          </thead>

          <tbody>
            <tr>
              <td>
                <div className="print-main-content">
                  
                  {/* Paciente */}
                  <div className="avoid-break" style={{ marginBottom: "25px", background: "#fcfaf7", padding: "20px", borderRadius: "6px", border: "1px solid #E0D7CD" }}>
                    <h3 style={{ margin: "0 0 15px 0", fontSize: "14px", textTransform: "uppercase", color: "#B8962E", borderBottom: "1px solid #E0D7CD", paddingBottom: "5px" }}>Identificação do Paciente</h3>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 20px", fontSize: "13px" }}>
                      <div><strong>Paciente:</strong> {nome || "Não preenchido"}</div>
                      <div><strong>CPF:</strong> {cpf || "Não preenchido"}</div>
                      <div><strong>WhatsApp:</strong> {telefone || "Não preenchido"}</div>
                      <div><strong>Data Consulta:</strong> {dataConsulta ? new Date(dataConsulta).toLocaleDateString("pt-BR") : "---"}</div>
                    </div>
                  </div>

                  {/* Diagnóstico */}
                  <div className="avoid-break" style={{ marginBottom: "25px" }}>
                    <h3 style={{ margin
