import { useState, useEffect, useCallback } from "react";

// ============================================================
//  CONFIGURAÇÃO SUPABASE — troque pelos seus valores
// ============================================================
const SUPABASE_URL = "https://jtxlmtelavnjzykiuxxy.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp0eGxtdGVsYXZuanp5a2l1eHh5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3NTU1MDQsImV4cCI6MjA4ODMzMTUwNH0.xxRkCUU5MlMTaMOMI8e6djHHjzPXQwWVQBS27iWyO9c";

async function sbFetch(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer !== undefined ? opts.prefer : "return=representation",
    },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  const text = await res.text();
  return text ? JSON.parse(text) : [];
}

const db = {
  list: (table, filters = "") => sbFetch(`/${table}?order=data.asc${filters}`),
  insert: (table, row) => sbFetch(`/${table}`, { method: "POST", body: JSON.stringify(row) }),
  update: (table, id, row) => sbFetch(`/${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(row) }),
  remove: (table, id) => sbFetch(`/${table}?id=eq.${id}`, { method: "DELETE", prefer: "" }),
  upsertBudget: (row) => sbFetch(`/budgets`, { method: "POST", body: JSON.stringify(row), prefer: "resolution=merge-duplicates,return=representation" }),
  getBudgets: () => sbFetch(`/budgets`),
};

// ============================================================

const MESES_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MESES = ["JAN","FEV","MAR","ABR","MAI","JUN","JUL","AGO","SET","OUT","NOV","DEZ"];
const PLANOS_DESPESA = ["Moradia","Alimentação","Transporte","Investimentos","Saúde","Educação","Estudo","Social","Lazer","Tarifas / Impostos","Diversos","Beleza","Pet"];
const FONTES_RECEITA = ["Salário","Comissão","1/3 Férias / 13 Salário","Bônus / Prêmios","Rendimentos","Auxílio","Outras Fontes"];
const FORMAS_PAGAMENTO = ["Dinheiro","Prazo","Depósito"];
const TIPOS_LANCAMENTO = ["Rendimentos","Tarifas","Depósito","Saque","Pagamentos","Transferência Saída","Transferência Entrada"];

const fmt = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

export default function AdmBolso() {
  const [tab, setTab] = useState("dashboard");
  const [mesSel, setMesSel] = useState(new Date().getMonth());
  const ano = new Date().getFullYear();
  const [receitas, setReceitas] = useState([]);
  const [despesas, setDespesas] = useState([]);
  const [lancamentos, setLancamentos] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);
  const [modalType, setModalType] = useState(null);
  const [form, setForm] = useState({});
  const [editId, setEditId] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true); setErro(null);
    try {
      const f = `&mes=eq.${mesSel + 1}&ano=eq.${ano}`;
      const [r, d, l, b] = await Promise.all([db.list("receitas", f), db.list("despesas", f), db.list("lancamentos", f), db.getBudgets()]);
      setReceitas(r); setDespesas(d); setLancamentos(l);
      const bMap = {}; b.forEach((row) => { bMap[row.chave] = row.valor; }); setBudgets(bMap);
    } catch { setErro("Erro ao conectar com o banco. Verifique as configurações do Supabase."); }
    finally { setLoading(false); }
  }, [mesSel, ano]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const totalReceitas = receitas.reduce((a, r) => a + Number(r.valor || 0), 0);
  const totalDespesas = despesas.reduce((a, d) => a + Number(d.valor || 0), 0);
  const saldo = totalReceitas - totalDespesas;

  const gastosPorPlano = PLANOS_DESPESA.map((p) => ({
    plano: p,
    gasto: despesas.filter((d) => d.plano === p).reduce((a, d) => a + Number(d.valor || 0), 0),
    planejado: budgets[`despesa_${p}`] || 0,
  }));

  const receitasPorFonte = FONTES_RECEITA.map((f) => ({
    fonte: f,
    recebido: receitas.filter((r) => r.plano === f).reduce((a, r) => a + Number(r.valor || 0), 0),
    planejado: budgets[`receita_${f}`] || 0,
  }));

  function openModal(type, item = null) {
    setModalType(type); setEditId(item?.id || null);
    const today = new Date().toISOString().slice(0, 10);
    if (item) { setForm({ ...item }); return; }
    if (type === "receita") setForm({ data: today, plano: FONTES_RECEITA[0], descricao: "", pagamento: FORMAS_PAGAMENTO[0], valor: "", recebeu: "Sim" });
    else if (type === "despesa") setForm({ data: today, plano: PLANOS_DESPESA[0], descricao: "", pagamento: FORMAS_PAGAMENTO[0], valor: "", pagou: "Sim" });
    else setForm({ data: today, tipo: TIPOS_LANCAMENTO[0], descricao: "", valor: "" });
  }

  async function saveItem() {
    setSaving(true);
    try {
      const table = modalType === "receita" ? "receitas" : modalType === "despesa" ? "despesas" : "lancamentos";
      const row = { ...form, valor: Number(form.valor) || 0, mes: mesSel + 1, ano };
      if (editId) await db.update(table, editId, row); else await db.insert(table, row);
      await loadAll(); setModalType(null);
    } catch (e) { alert("Erro ao salvar: " + e.message); }
    finally { setSaving(false); }
  }

  async function deleteItem(table, id) {
    if (!confirm("Excluir este registro?")) return;
    setSaving(true);
    try { await db.remove(table, id); await loadAll(); }
    catch { alert("Erro ao excluir."); }
    finally { setSaving(false); }
  }

  async function updateBudget(chave, valor) {
    setBudgets((b) => ({ ...b, [chave]: Number(valor) || 0 }));
    try { await db.upsertBudget({ chave, valor: Number(valor) || 0 }); }
    catch (e) { console.error("Erro ao salvar orçamento", e); }
  }

  const s = (style) => style; // passthrough helper

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(135deg,#0a0a14 0%,#0d1629 50%,#0a0a14 100%)", fontFamily: "'Segoe UI',system-ui,sans-serif", color: "#e2e8f0" }}>
      {/* Header */}
      <div style={{ background: "rgba(15,20,40,0.95)", borderBottom: "1px solid rgba(99,179,237,0.2)", padding: "0 24px", display: "flex", alignItems: "center", gap: 16, height: 64, backdropFilter: "blur(10px)", position: "sticky", top: 0, zIndex: 100, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 900 }}>₿</div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>AdmBolso</span>
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[["dashboard","📊 Dashboard"],["receitas","📥 Receitas"],["despesas","📤 Despesas"],["lancamentos","🏦 Lançamentos"],["orcamento","🎯 Orçamento"],["anual","📅 Anual"]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: "6px 12px", borderRadius: 8, border: "none", background: tab === id ? "linear-gradient(135deg,#3b82f6,#8b5cf6)" : "transparent", color: tab === id ? "#fff" : "#94a3b8", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>{label}</button>
          ))}
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {saving && <span style={{ fontSize: 12, color: "#93c5fd" }}>💾 Salvando...</span>}
          <select value={mesSel} onChange={(e) => setMesSel(Number(e.target.value))} style={{ background: "rgba(30,40,70,0.8)", border: "1px solid rgba(99,179,237,0.3)", color: "#e2e8f0", padding: "6px 12px", borderRadius: 8, fontSize: 14, cursor: "pointer" }}>
            {MESES_FULL.map((m, i) => <option key={i} value={i}>{m} {ano}</option>)}
          </select>
        </div>
      </div>

      <div style={{ padding: 24, maxWidth: 1400, margin: "0 auto" }}>
        {erro && (
          <div style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", borderRadius: 12, padding: "16px 20px", marginBottom: 24, color: "#fca5a5" }}>
            ⚠️ {erro} <button onClick={loadAll} style={{ marginLeft: 12, padding: "4px 12px", borderRadius: 6, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer", fontSize: 13 }}>Tentar novamente</button>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 80, color: "#475569" }}><div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>Carregando dados...</div>
        ) : <>
          {/* DASHBOARD */}
          {tab === "dashboard" && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#fff" }}>Dashboard — {MESES_FULL[mesSel]} {ano}</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 16, marginBottom: 24 }}>
                {[[totalReceitas,"Receitas","#10b981","↑","rgba(16,185,129,0.1)"],[totalDespesas,"Despesas","#ef4444","↓","rgba(239,68,68,0.1)"],[saldo,"Saldo",saldo>=0?"#3b82f6":"#f97316","=",saldo>=0?"rgba(59,130,246,0.1)":"rgba(249,115,22,0.1)"]].map(([val,label,color,icon,bg]) => (
                  <div key={label} style={{ background: bg, border: `1px solid ${color}30`, borderRadius: 16, padding: "20px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 13, color: "#94a3b8", marginBottom: 6 }}>{label}</div>
                      <div style={{ fontSize: 26, fontWeight: 900, color }}>{fmt(val)}</div>
                    </div>
                    <div style={{ width: 52, height: 52, borderRadius: 14, background: `${color}20`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color, fontWeight: 900 }}>{icon}</div>
                  </div>
                ))}
              </div>

              <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, padding: 24, marginBottom: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "#93c5fd" }}>Gastos por Categoria</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  {gastosPorPlano.filter((g) => g.gasto > 0 || g.planejado > 0).map((g) => {
                    const over = g.planejado > 0 && g.gasto > g.planejado;
                    const ratio = g.planejado > 0 ? Math.min(g.gasto / g.planejado, 1) : (g.gasto > 0 ? 1 : 0);
                    return (
                      <div key={g.plano} style={{ background: "rgba(30,40,70,0.5)", borderRadius: 12, padding: "14px 16px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>{g.plano}</span>
                          <span style={{ fontSize: 12, color: over ? "#ef4444" : "#94a3b8" }}>{fmt(g.gasto)} / {fmt(g.planejado)}</span>
                        </div>
                        <div style={{ height: 6, background: "rgba(255,255,255,0.1)", borderRadius: 3 }}>
                          <div style={{ height: "100%", borderRadius: 3, width: `${ratio * 100}%`, background: over ? "#ef4444" : "linear-gradient(90deg,#3b82f6,#8b5cf6)" }} />
                        </div>
                      </div>
                    );
                  })}
                  {gastosPorPlano.filter((g) => g.gasto > 0 || g.planejado > 0).length === 0 && (
                    <div style={{ gridColumn: "span 2", textAlign: "center", color: "#475569", padding: 40 }}>Nenhuma despesa registrada ainda.</div>
                  )}
                </div>
              </div>

              <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, padding: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "#6ee7b7" }}>Receitas por Fonte</h3>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12 }}>
                  {receitasPorFonte.filter((r) => r.recebido > 0 || r.planejado > 0).map((r) => (
                    <div key={r.fonte} style={{ background: "rgba(16,185,129,0.08)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: 12, padding: "12px 16px" }}>
                      <div style={{ fontSize: 12, color: "#6ee7b7", marginBottom: 4 }}>{r.fonte}</div>
                      <div style={{ fontSize: 18, fontWeight: 800, color: "#10b981" }}>{fmt(r.recebido)}</div>
                      {r.planejado > 0 && <div style={{ fontSize: 11, color: "#64748b" }}>Planejado: {fmt(r.planejado)}</div>}
                    </div>
                  ))}
                  {receitasPorFonte.filter((r) => r.recebido > 0).length === 0 && (
                    <div style={{ gridColumn: "span 3", textAlign: "center", color: "#475569", padding: 32 }}>Nenhuma receita registrada ainda.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === "receitas" && <TabLancamentos title="Receitas" mes={MESES_FULL[mesSel]} items={receitas} total={totalReceitas} totalLabel="Total Recebido" totalColor="#10b981" columns={["Data","Fonte","Descrição","Pagamento","Valor","Recebeu"]} renderRow={(r) => [r.data, r.plano, r.descricao, r.pagamento, fmt(r.valor), r.recebeu]} onAdd={() => openModal("receita")} onEdit={(item) => openModal("receita", item)} onDelete={(id) => deleteItem("receitas", id)} />}
          {tab === "despesas" && <TabLancamentos title="Despesas" mes={MESES_FULL[mesSel]} items={despesas} total={totalDespesas} totalLabel="Total Gasto" totalColor="#ef4444" columns={["Data","Categoria","Descrição","Pagamento","Valor","Pagou"]} renderRow={(d) => [d.data, d.plano, d.descricao, d.pagamento, fmt(d.valor), d.pagou]} onAdd={() => openModal("despesa")} onEdit={(item) => openModal("despesa", item)} onDelete={(id) => deleteItem("despesas", id)} />}
          {tab === "lancamentos" && <TabLancamentos title="Lançamentos Bancários" mes={MESES_FULL[mesSel]} items={lancamentos} total={lancamentos.filter((l) => ["Rendimentos","Depósito","Transferência Entrada"].includes(l.tipo)).reduce((a,l)=>a+Number(l.valor||0),0) - lancamentos.filter((l) => ["Tarifas","Saque","Pagamentos","Transferência Saída"].includes(l.tipo)).reduce((a,l)=>a+Number(l.valor||0),0)} totalLabel="Saldo Bancário" totalColor="#3b82f6" columns={["Data","Tipo","Descrição","Valor"]} renderRow={(l) => [l.data, l.tipo, l.descricao, fmt(l.valor)]} onAdd={() => openModal("lancamento")} onEdit={(item) => openModal("lancamento", item)} onDelete={(id) => deleteItem("lancamentos", id)} />}

          {tab === "orcamento" && (
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#fff" }}>🎯 Planejamento de Orçamento</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
                <BudgetSection title="📥 Entradas Planejadas" prefix="receita" items={FONTES_RECEITA} budgets={budgets} onUpdate={updateBudget} color="#10b981" />
                <BudgetSection title="📤 Saídas Planejadas" prefix="despesa" items={PLANOS_DESPESA} budgets={budgets} onUpdate={updateBudget} color="#ef4444" />
              </div>
            </div>
          )}

          {tab === "anual" && <AbaAnual ano={ano} mesSel={mesSel} onMes={(i) => { setMesSel(i); setTab("dashboard"); }} />}
        </>}
      </div>

      {/* Modal */}
      {modalType && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, backdropFilter: "blur(4px)" }} onClick={(e) => e.target === e.currentTarget && setModalType(null)}>
          <div style={{ background: "#0d1629", border: "1px solid rgba(99,179,237,0.3)", borderRadius: 20, padding: 32, width: 460, maxWidth: "90vw" }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 24, color: "#fff" }}>{editId ? "Editar" : "Novo"} {modalType === "receita" ? "Receita" : modalType === "despesa" ? "Despesa" : "Lançamento"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <FormField label="Data" type="date" value={form.data || ""} onChange={(v) => setForm((f) => ({ ...f, data: v }))} />
              {modalType === "receita" && <>
                <FormSelect label="Fonte" value={form.plano} options={FONTES_RECEITA} onChange={(v) => setForm((f) => ({ ...f, plano: v }))} />
                <FormField label="Descrição" value={form.descricao || ""} onChange={(v) => setForm((f) => ({ ...f, descricao: v }))} />
                <FormSelect label="Pagamento" value={form.pagamento} options={FORMAS_PAGAMENTO} onChange={(v) => setForm((f) => ({ ...f, pagamento: v }))} />
                <FormField label="Valor (R$)" type="number" value={form.valor || ""} onChange={(v) => setForm((f) => ({ ...f, valor: v }))} />
                <FormSelect label="Recebeu?" value={form.recebeu} options={["Sim","Não"]} onChange={(v) => setForm((f) => ({ ...f, recebeu: v }))} />
              </>}
              {modalType === "despesa" && <>
                <FormSelect label="Categoria" value={form.plano} options={PLANOS_DESPESA} onChange={(v) => setForm((f) => ({ ...f, plano: v }))} />
                <FormField label="Descrição" value={form.descricao || ""} onChange={(v) => setForm((f) => ({ ...f, descricao: v }))} />
                <FormSelect label="Pagamento" value={form.pagamento} options={FORMAS_PAGAMENTO} onChange={(v) => setForm((f) => ({ ...f, pagamento: v }))} />
                <FormField label="Valor (R$)" type="number" value={form.valor || ""} onChange={(v) => setForm((f) => ({ ...f, valor: v }))} />
                <FormSelect label="Pagou?" value={form.pagou} options={["Sim","Não"]} onChange={(v) => setForm((f) => ({ ...f, pagou: v }))} />
              </>}
              {modalType === "lancamento" && <>
                <FormSelect label="Tipo" value={form.tipo} options={TIPOS_LANCAMENTO} onChange={(v) => setForm((f) => ({ ...f, tipo: v }))} />
                <FormField label="Descrição" value={form.descricao || ""} onChange={(v) => setForm((f) => ({ ...f, descricao: v }))} />
                <FormField label="Valor (R$)" type="number" value={form.valor || ""} onChange={(v) => setForm((f) => ({ ...f, valor: v }))} />
              </>}
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
              <button onClick={() => setModalType(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid rgba(99,179,237,0.3)", background: "transparent", color: "#94a3b8", cursor: "pointer", fontSize: 14, fontWeight: 600 }}>Cancelar</button>
              <button onClick={saveItem} disabled={saving} style={{ flex: 2, padding: 12, borderRadius: 10, border: "none", background: saving ? "#334155" : "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: 14, fontWeight: 700 }}>{saving ? "Salvando..." : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TabLancamentos({ title, mes, items, total, totalLabel, totalColor, columns, renderRow, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: "#fff" }}>{title} — {mes}</h2>
          <div style={{ fontSize: 15, color: totalColor, fontWeight: 700, marginTop: 4 }}>{totalLabel}: {fmt(total)}</div>
        </div>
        <button onClick={onAdd} style={{ padding: "10px 20px", borderRadius: 12, border: "none", background: "linear-gradient(135deg,#3b82f6,#8b5cf6)", color: "#fff", cursor: "pointer", fontSize: 14, fontWeight: 700 }}>+ Adicionar</button>
      </div>
      <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, overflow: "hidden" }}>
        {items.length === 0 ? (
          <div style={{ padding: 60, textAlign: "center", color: "#475569" }}>Nenhum registro. Clique em "+ Adicionar" para começar.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "rgba(30,40,80,0.6)" }}>
                {columns.map((c) => <th key={c} style={{ padding: "12px 16px", textAlign: "left", color: "#64748b", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>{c}</th>)}
                <th style={{ padding: "12px 16px", textAlign: "center", color: "#64748b", fontSize: 12 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} style={{ borderTop: "1px solid rgba(99,179,237,0.08)" }}>
                  {renderRow(item).map((cell, ci) => <td key={ci} style={{ padding: "12px 16px", color: "#e2e8f0" }}>{cell}</td>)}
                  <td style={{ padding: "12px 16px", textAlign: "center" }}>
                    <button onClick={() => onEdit(item)} style={{ padding: "4px 10px", marginRight: 6, borderRadius: 6, border: "none", background: "rgba(59,130,246,0.2)", color: "#93c5fd", cursor: "pointer", fontSize: 12 }}>✏️</button>
                    <button onClick={() => onDelete(item.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "rgba(239,68,68,0.2)", color: "#fca5a5", cursor: "pointer", fontSize: 12 }}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function BudgetSection({ title, prefix, items, budgets, onUpdate, color }) {
  const total = items.reduce((a, i) => a + (budgets[`${prefix}_${i}`] || 0), 0);
  return (
    <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, padding: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, color: "#fff" }}>{title}</h3>
      <div style={{ fontSize: 13, color, marginBottom: 20, fontWeight: 700 }}>Total: {fmt(total)}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {items.map((item) => (
          <div key={item} style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <label style={{ flex: 1, fontSize: 13, color: "#cbd5e1" }}>{item}</label>
            <input type="number" value={budgets[`${prefix}_${item}`] || ""} onChange={(e) => onUpdate(`${prefix}_${item}`, e.target.value)} placeholder="0,00"
              style={{ width: 120, padding: "6px 10px", borderRadius: 8, border: "1px solid rgba(99,179,237,0.3)", background: "rgba(30,40,70,0.8)", color: "#e2e8f0", fontSize: 13, textAlign: "right" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function AbaAnual({ ano, mesSel, onMes }) {
  const [dados, setDados] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [r, d] = await Promise.all([db.list("receitas", `&ano=eq.${ano}`), db.list("despesas", `&ano=eq.${ano}`)]);
        setDados(MESES_FULL.map((m, i) => {
          const rec = r.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.valor || 0), 0);
          const des = d.filter((x) => x.mes === i + 1).reduce((a, x) => a + Number(x.valor || 0), 0);
          return { mes: m, rec, des, sal: rec - des };
        }));
      } finally { setLoading(false); }
    }
    load();
  }, [ano]);

  const totR = dados.reduce((a, d) => a + d.rec, 0);
  const totD = dados.reduce((a, d) => a + d.des, 0);
  const maxV = Math.max(...dados.map((d) => Math.max(d.rec, d.des)), 1);
  if (loading) return <div style={{ color: "#475569", padding: 60, textAlign: "center" }}>Carregando...</div>;

  return (
    <div>
      <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24, color: "#fff" }}>📅 Resumo Anual {ano}</h2>
      <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, padding: 24, marginBottom: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
          <thead>
            <tr>
              {[["Mês","left","#64748b"],["Receitas","right","#10b981"],["Despesas","right","#ef4444"],["Saldo","right","#3b82f6"]].map(([h,a,c]) => (
                <th key={h} style={{ textAlign: a, padding: "10px 12px", color: c, fontWeight: 600 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dados.map((d, i) => (
              <tr key={d.mes} style={{ background: i % 2 === 0 ? "rgba(30,40,70,0.3)" : "transparent", cursor: "pointer" }} onClick={() => onMes(i)}>
                <td style={{ padding: "10px 12px", fontWeight: mesSel === i ? 800 : 400, color: mesSel === i ? "#93c5fd" : "#e2e8f0" }}>{d.mes}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#10b981" }}>{fmt(d.rec)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", color: "#ef4444" }}>{fmt(d.des)}</td>
                <td style={{ padding: "10px 12px", textAlign: "right", fontWeight: 700, color: d.sal >= 0 ? "#3b82f6" : "#f97316" }}>{fmt(d.sal)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid rgba(99,179,237,0.3)", fontWeight: 800 }}>
              <td style={{ padding: "12px", color: "#fff" }}>TOTAL</td>
              <td style={{ padding: "12px", textAlign: "right", color: "#10b981" }}>{fmt(totR)}</td>
              <td style={{ padding: "12px", textAlign: "right", color: "#ef4444" }}>{fmt(totD)}</td>
              <td style={{ padding: "12px", textAlign: "right", color: "#3b82f6" }}>{fmt(totR - totD)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ background: "rgba(15,20,40,0.8)", border: "1px solid rgba(99,179,237,0.15)", borderRadius: 16, padding: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 20, color: "#93c5fd" }}>Fluxo de Caixa</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 140 }}>
          {dados.map((d, i) => (
            <div key={d.mes} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }} onClick={() => onMes(i)}>
              <div style={{ display: "flex", gap: 2, alignItems: "flex-end" }}>
                <div style={{ width: 10, height: Math.max((d.rec / maxV) * 120, 2), background: "#10b981", borderRadius: "3px 3px 0 0" }} />
                <div style={{ width: 10, height: Math.max((d.des / maxV) * 120, 2), background: "#ef4444", borderRadius: "3px 3px 0 0" }} />
              </div>
              <div style={{ fontSize: 10, color: "#475569" }}>{MESES[i]}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
          <span style={{ fontSize: 12, color: "#10b981" }}>■ Receitas</span>
          <span style={{ fontSize: 12, color: "#ef4444" }}>■ Despesas</span>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, type = "text", value, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, boxSizing: "border-box", border: "1px solid rgba(99,179,237,0.3)", background: "rgba(30,40,70,0.8)", color: "#e2e8f0", fontSize: 14 }} />
    </div>
  );
}

function FormSelect({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{ fontSize: 13, color: "#94a3b8", display: "block", marginBottom: 6 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ width: "100%", padding: "10px 12px", borderRadius: 10, boxSizing: "border-box", border: "1px solid rgba(99,179,237,0.3)", background: "rgba(30,40,70,0.8)", color: "#e2e8f0", fontSize: 14, cursor: "pointer" }}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
