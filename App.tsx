import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import { Upload, Filter, ChevronDown, RefreshCcw } from "lucide-react";

type DataRow = {
  Safra?: string;
  GRUPO_ET?: string;
  Planejado?: number | string;
  Realizado?: number | string;
  [key: string]: unknown;
};

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;

  const raw = String(value).trim();
  if (!raw) return 0;

  const normalized = raw.includes(",")
    ? raw.replace(/\./g, "").replace(",", ".")
    : raw;

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value || 0);
}

function fmtPercent(value: number, digits = 1) {
  return `${fmtNumber(value, digits)}%`;
}

function safeDivide(a: number, b: number) {
  return b === 0 ? 0 : a / b;
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function buildRows(json: unknown[]): DataRow[] {
  return (json as Record<string, unknown>[]).map((row) => ({
    ...row,
    Planejado: toNumber(row["Planejado"]),
    Realizado: toNumber(row["Realizado"]),
  }));
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const allSelected = options.length > 0 && selected.length === options.length;

  return (
    <div style={{ position: "relative" }}>
      <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>{label}</label>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        style={{
          width: "100%",
          minHeight: 44,
          border: "1px solid #cbd5e1",
          borderRadius: 16,
          background: "#fff",
          padding: "10px 14px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
        }}
      >
        <span>
          {selected.length === 0
            ? "Nenhum selecionado"
            : allSelected
            ? "Todos selecionados"
            : `${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            zIndex: 20,
            marginTop: 8,
            width: "100%",
            maxHeight: 280,
            overflow: "auto",
            borderRadius: 16,
            border: "1px solid #cbd5e1",
            background: "#fff",
            padding: 12,
            boxShadow: "0 12px 30px rgba(0,0,0,.12)",
          }}
        >
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => onChange(options)}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Marcar tudo
            </button>
            <button
              type="button"
              onClick={() => onChange([])}
              style={{
                border: 0,
                borderRadius: 12,
                padding: "8px 12px",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              Limpar
            </button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {options.map((option) => {
              const checked = selected.includes(option);
              return (
                <label
                  key={option}
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    padding: "6px 8px",
                    borderRadius: 10,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) onChange([...selected, option]);
                      else onChange(selected.filter((item) => item !== option));
                    }}
                  />
                  <span>{option}</span>
                </label>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function App() {
  const [rows, setRows] = useState<DataRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");

  const [selectedSafras, setSelectedSafras] = useState<string[]>([]);
  const [selectedGrupoET, setSelectedGrupoET] = useState<string[]>([]);
  const [showOthers, setShowOthers] = useState(true);

  const allSafras = useMemo(
    () => unique(rows.map((r) => String(r.Safra ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const allGrupoET = useMemo(
    () => unique(rows.map((r) => String(r.GRUPO_ET ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const safra = String(row.Safra ?? "").trim();
      return selectedSafras.length === 0 || selectedSafras.includes(safra);
    });
  }, [rows, selectedSafras]);

  const graph1 = useMemo(() => {
    const plannedTotal = filteredRows.reduce((acc, row) => acc + toNumber(row.Planejado), 0);
    const actualTotal = filteredRows.reduce((acc, row) => acc + toNumber(row.Realizado), 0);
    const variation = actualTotal - plannedTotal;
    const variationPct = safeDivide(variation, plannedTotal) * 100;

    const grouped = new Map<string, { planned: number; actual: number }>();

    filteredRows.forEach((row) => {
      const key = String(row.GRUPO_ET ?? "").trim() || "Sem grupo";
      const current = grouped.get(key) ?? { planned: 0, actual: 0 };
      current.planned += toNumber(row.Planejado);
      current.actual += toNumber(row.Realizado);
      grouped.set(key, current);
    });

    const allItems = Array.from(grouped.entries()).map(([name, values]) => ({
      name,
      planned: values.planned,
      actual: values.actual,
      delta: values.actual - values.planned,
      percent: safeDivide(values.actual - values.planned, values.planned) * 100,
    }));

    const visibleItems = allItems.filter((item) => selectedGrupoET.includes(item.name));
    const hiddenItems = allItems.filter((item) => !selectedGrupoET.includes(item.name));

    const prepared = [...visibleItems];

    if (showOthers && hiddenItems.length > 0) {
      prepared.push({
        name: "Outros",
        planned: hiddenItems.reduce((acc, item) => acc + item.planned, 0),
        actual: hiddenItems.reduce((acc, item) => acc + item.actual, 0),
        delta: hiddenItems.reduce((acc, item) => acc + item.delta, 0),
        percent: safeDivide(
          hiddenItems.reduce((acc, item) => acc + item.delta, 0),
          hiddenItems.reduce((acc, item) => acc + item.planned, 0)
        ) * 100,
      });
    }

    prepared.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const x = ["Orçado Acum.", ...prepared.map((item) => item.name), "Real Acum."];
    const measure: ("absolute" | "relative" | "total")[] = [
      "absolute",
      ...prepared.map(() => "relative" as const),
      "total",
    ];

    const y = [
      plannedTotal,
      ...prepared.map((item) => item.delta),
      actualTotal,
    ];

    const text = [
      fmtNumber(plannedTotal, 0),
      ...prepared.map((item) => fmtNumber(item.delta, 0)),
      fmtNumber(actualTotal, 0),
    ];

    const customdata = [
      ["", plannedTotal],
      ...prepared.map((item) => [fmtPercent(item.percent, 1), fmtNumber(item.planned, 0)]),
      ["", actualTotal],
    ];

    return {
      plannedTotal,
      actualTotal,
      variation,
      variationPct,
      x,
      measure,
      y,
      text,
      customdata,
    };
  }, [filteredRows, selectedGrupoET, showOthers]);

  async function handleExcelUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheet = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheet];
      const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = buildRows(json as unknown[]);

      setRows(parsed);

      const safras = unique(
        parsed.map((r) => String(r.Safra ?? "").trim()).filter(Boolean)
      );

      const grupoET = unique(
        parsed.map((r) => String(r.GRUPO_ET ?? "").trim()).filter(Boolean)
      );

      setSelectedSafras(safras.length ? [safras[safras.length - 1]] : []);
      setSelectedGrupoET(grupoET);
    } catch (err) {
      console.error(err);
      setError("Não foi possível ler a planilha. Verifique se o arquivo Excel está correto.");
    }
  }

  function resetFilters() {
    setSelectedSafras(allSafras);
    setSelectedGrupoET(allGrupoET);
    setShowOthers(true);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f1f5f9",
        padding: 24,
        fontFamily: "Inter, Arial, sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 24,
          padding: 24,
          border: "1px solid #e2e8f0",
        }}
      >
        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 36 }}>Orçado Acum. x Real Acum.</h1>
          <div style={{ color: "#64748b", marginTop: 8 }}>
            Safra selecionada • em milhares de Reais
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr 1fr",
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div
            style={{
              border: "2px dashed #cbd5e1",
              borderRadius: 20,
              padding: 20,
              background: "#f8fafc",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Upload size={18} />
              <strong>Upload Excel</strong>
            </div>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
            <div style={{ marginTop: 10, color: "#64748b", fontSize: 14 }}>
              {fileName || "Nenhum arquivo enviado"}
            </div>
            {error ? (
              <div style={{ marginTop: 12, color: "#b91c1c" }}>{error}</div>
            ) : null}
          </div>

          <MultiSelect
            label="Safra"
            options={allSafras}
            selected={selectedSafras}
            onChange={setSelectedSafras}
          />

          <MultiSelect
            label="GRUPO_ET visível no gráfico"
            options={allGrupoET}
            selected={selectedGrupoET}
            onChange={setSelectedGrupoET}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={showOthers}
              onChange={(e) => setShowOthers(e.target.checked)}
            />
            <span>Agrupar não selecionados como “Outros”</span>
          </label>
        </div>

        <div style={{ marginBottom: 24 }}>
          <button
            type="button"
            onClick={resetFilters}
            style={{
              border: 0,
              borderRadius: 12,
              padding: "10px 14px",
              background: "#0f172a",
              color: "#fff",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <RefreshCcw size={16} />
            Resetar filtros
          </button>
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Por Grupo de Custo</div>
          <div style={{ color: "#64748b", marginTop: 8 }}>
            <div>Sem arrendamento e sem desp. corporativa</div>
            <div>* Sem Pecuária</div>
          </div>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 900 }}>
              {fmtNumber(graph1.plannedTotal, 0)}
            </div>
            <div style={{ color: "#64748b" }}>Orçado Acum.</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: graph1.variation >= 0 ? "#dc2626" : "#16a34a",
              }}
            >
              {fmtNumber(graph1.variation, 0)}
            </div>
            <div style={{ color: "#64748b" }}>Variação</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div
              style={{
                fontSize: 40,
                fontWeight: 900,
                color: graph1.variationPct >= 0 ? "#dc2626" : "#16a34a",
              }}
            >
              {fmtPercent(graph1.variationPct, 1)}
            </div>
            <div style={{ color: "#64748b" }}>%</div>
          </div>

          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, fontWeight: 900 }}>
              {fmtNumber(graph1.actualTotal, 0)}
            </div>
            <div style={{ color: "#64748b" }}>Real Acum.</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, marginBottom: 12, color: "#64748b" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#d8454f",
                display: "inline-block",
              }}
            />
            Aumento
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#11b34c",
                display: "inline-block",
              }}
            />
            Diminuição
          </div>
        </div>

        <div style={{ height: 560 }}>
          <Plot
            data={[
              {
                type: "waterfall",
                orientation: "v",
                x: graph1.x,
                measure: graph1.measure,
                y: graph1.y,
                text: graph1.text,
                textposition: "outside",
                customdata: graph1.customdata,
                connector: {
                  line: {
                    color: "#cbd5e1",
                    width: 2,
                  },
                },
                increasing: {
                  marker: { color: "#d8454f" },
                },
                decreasing: {
                  marker: { color: "#11b34c" },
                },
                totals: {
                  marker: { color: "#8c8c8c" },
                },
                hovertemplate:
                  "<b>%{x}</b><br>" +
                  "Valor: %{text}<br>" +
                  "%{customdata[0]}<br>" +
                  "Base: %{customdata[1]}<extra></extra>",
              } as any,
            ]}
            layout={{
              autosize: true,
              paper_bgcolor: "#ffffff",
              plot_bgcolor: "#ffffff",
              margin: { l: 40, r: 20, t: 20, b: 120 },
              showlegend: false,
              xaxis: {
                tickangle: 0,
                automargin: true,
                tickfont: { size: 12, color: "#475569" },
              },
              yaxis: {
                visible: false,
                showgrid: true,
                gridcolor: "#e5e7eb",
                zeroline: false,
              },
              font: {
                family: "Inter, Arial, sans-serif",
                color: "#0f172a",
              },
            }}
            config={{
              responsive: true,
              displayModeBar: false,
            }}
            style={{ width: "100%", height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
}
