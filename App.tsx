import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import Plot from "react-plotly.js";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import {
  Upload,
  Wheat,
  Filter,
  RefreshCcw,
  ChevronDown,
  ChartColumnBig,
  Calendar,
} from "lucide-react";

type DataRow = {
  Safra?: string;
  ANO_MÊS?: string | number;
  DATA?: string | number | Date;
  "Centro de Custo"?: string;
  GRUPO_ET?: string;
  "GRUPO DE DESPESAS"?: string;
  "Por área"?: string;
  Sub_Grupo_CC?: string;
  Planejado?: number | string;
  Realizado?: number | string;
  [key: string]: unknown;
};

type AreaByCulture = Record<string, number>;

type WaterfallStep = {
  name: string;
  planned: number;
  actual: number;
  delta: number;
  percent: number;
  baseValue: number;
};

const NEUTRAL = "#8c8c8c";
const POSITIVE = "#d8454f";
const NEGATIVE = "#11b34c";
const BROWN = "#7c3a19";
const GOLD = "#efb300";
const OLIVE = "#556f26";
const TEXT = "#1f2937";
const SUBTEXT = "#6b7280";
const BRAND = "#eda66f";

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value).trim();
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
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

function sumBy(rows: DataRow[], field: string) {
  return rows.reduce((acc, row) => acc + toNumber(row[field]), 0);
}

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

function extractCultureName(centerCost: string) {
  const normalized = normalizeText(centerCost);
  if (normalized.includes("ALGOD")) return "ALGODÃO";
  if (normalized.includes("SOJA")) return "SOJA";
  if (normalized.includes("MILHO")) return "MILHO";
  return "";
}

function buildRows(json: unknown[]): DataRow[] {
  return (json as Record<string, unknown>[]).map((row) => ({
    ...row,
    Planejado: toNumber(row["Planejado"]),
    Realizado: toNumber(row["Realizado"]),
  }));
}

function parseMonthKey(row: DataRow) {
  const raw = String(row["ANO_MÊS"] ?? "").trim();
  if (!raw) return "";

  const digits = raw.replace(/[^0-9]/g, "");

  if (digits.length === 6) {
    const first4 = Number(digits.slice(0, 4));
    const last2 = Number(digits.slice(4, 6));
    if (first4 >= 1900 && first4 <= 2100 && last2 >= 1 && last2 <= 12) {
      return `${digits.slice(0, 4)}-${digits.slice(4, 6)}`;
    }

    const first2 = Number(digits.slice(0, 2));
    const last4 = Number(digits.slice(2, 6));
    if (last4 >= 1900 && last4 <= 2100 && first2 >= 1 && first2 <= 12) {
      return `${digits.slice(2, 6)}-${digits.slice(0, 2).padStart(2, "0")}`;
    }
  }

  if (digits.length === 5) {
    const month = Number(digits.slice(0, 1));
    const year = Number(digits.slice(1, 5));
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 9) {
      return `${String(year)}-${String(month).padStart(2, "0")}`;
    }
  }

  const iso = raw.match(/^(\d{4})[-_/](\d{1,2})$/);
  if (iso) {
    const year = Number(iso[1]);
    const month = Number(iso[2]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${String(year)}-${String(month).padStart(2, "0")}`;
    }
  }

  const br = raw.match(/^(\d{1,2})\/(\d{4})$/);
  if (br) {
    const month = Number(br[1]);
    const year = Number(br[2]);
    if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12) {
      return `${String(year)}-${String(month).padStart(2, "0")}`;
    }
  }

  return "";
}

function monthLabel(monthKey: string) {
  if (!monthKey) return "";
  const [y, m] = monthKey.split("-");
  return `${m}/${y}`;
}

function groupRowsBy(rows: DataRow[], keyField: string) {
  const map = new Map<string, { planned: number; actual: number }>();
  rows.forEach((row) => {
    const key = String(row[keyField] ?? "").trim() || "Sem grupo";
    const current = map.get(key) ?? { planned: 0, actual: 0 };
    current.planned += toNumber(row.Planejado);
    current.actual += toNumber(row.Realizado);
    map.set(key, current);
  });
  return map;
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
            <button type="button" onClick={() => onChange(options)} style={miniBtnStyle}>Marcar tudo</button>
            <button type="button" onClick={() => onChange([])} style={miniBtnStyle}>Limpar</button>
          </div>

          <div style={{ display: "grid", gap: 8 }}>
            {options.map((option) => {
              const checked = selected.includes(option);
              return (
                <label key={option} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 8px" }}>
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

const miniBtnStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 12,
  padding: "8px 12px",
  cursor: "pointer",
  fontWeight: 700,
};

const cardStyle: React.CSSProperties = {
  background: "#fff",
  borderRadius: 24,
  padding: 20,
  border: "1px solid #e2e8f0",
};

const sectionTitleStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
  marginBottom: 16,
};

function buildWaterfall(params: {
  initialLabel: string;
  finalLabel: string;
  initialValue: number;
  finalValue: number;
  steps: WaterfallStep[];
}) {
  const { initialLabel, finalLabel, initialValue, finalValue, steps } = params;

  const x = [initialLabel, ...steps.map((s) => s.name), finalLabel];
  const measure: ("absolute" | "relative" | "total")[] = [
    "absolute",
    ...steps.map(() => "relative" as const),
    "total",
  ];
  const y = [initialValue, ...steps.map((s) => s.delta), finalValue];
  const text = [
    fmtNumber(initialValue, 0),
    ...steps.map((s) => fmtNumber(s.delta, 0)),
    fmtNumber(finalValue, 0),
  ];
  const customdata = [
    ["", fmtNumber(initialValue, 0)],
    ...steps.map((s) => [fmtPercent(s.percent, 1), fmtNumber(s.baseValue, 0)]),
    ["", fmtNumber(finalValue, 0)],
  ];

  return { x, measure, y, text, customdata };
}

function WaterfallPlot({
  title,
  initialLabel,
  finalLabel,
  initialValue,
  finalValue,
  steps,
  onBarClick,
}: {
  title?: string;
  initialLabel: string;
  finalLabel: string;
  initialValue: number;
  finalValue: number;
  steps: WaterfallStep[];
  onBarClick?: (label: string) => void;
}) {
  const data = useMemo(
    () => buildWaterfall({ initialLabel, finalLabel, initialValue, finalValue, steps }),
    [initialLabel, finalLabel, initialValue, finalValue, steps]
  );

  return (
    <div style={{ height: 560 }}>
      <Plot
        data={[
          {
            type: "waterfall",
            orientation: "v",
            x: data.x,
            measure: data.measure,
            y: data.y,
            text: data.text,
            textposition: "outside",
            customdata: data.customdata,
            connector: { line: { color: "#cbd5e1", width: 2 } },
            increasing: { marker: { color: POSITIVE } },
            decreasing: { marker: { color: NEGATIVE } },
            totals: { marker: { color: NEUTRAL } },
            hovertemplate:
              "<b>%{x}</b><br>Valor: %{text}<br>%{customdata[0]}<br>Base: %{customdata[1]}<extra></extra>",
          } as any,
        ]}
        layout={{
          title,
          autosize: true,
          paper_bgcolor: "#ffffff",
          plot_bgcolor: "#ffffff",
          margin: { l: 40, r: 20, t: 20, b: 130 },
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
            color: TEXT,
          },
        }}
        config={{ responsive: true, displayModeBar: false }}
        style={{ width: "100%", height: "100%" }}
        onClick={(event) => {
          const point = event.points?.[0];
          const label = String(point?.x ?? "");
          if (!label) return;
          if (label === initialLabel || label === finalLabel) return;
          onBarClick?.(label);
        }}
      />
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
  const [selectedCultures, setSelectedCultures] = useState<string[]>([]);
  const [selectedExpenseGroup, setSelectedExpenseGroup] = useState("");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [areaByCulture, setAreaByCulture] = useState<AreaByCulture>({});
  const [drillArea, setDrillArea] = useState("");

  const allSafras = useMemo(
    () => unique(rows.map((r) => String(r.Safra ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const allGrupoET = useMemo(
    () => unique(rows.map((r) => String(r.GRUPO_ET ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const allExpenseGroups = useMemo(
    () => unique(rows.map((r) => String(r["GRUPO DE DESPESAS"] ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const allMonths = useMemo(
    () => unique(rows.map((r) => parseMonthKey(r)).filter(Boolean)).sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  const detectedCultures = useMemo(
    () => unique(rows.map((r) => extractCultureName(String(r["Centro de Custo"] ?? ""))).filter(Boolean)).sort(),
    [rows]
  );

  const filteredBySafra = useMemo(() => {
    return rows.filter((row) => {
      const safra = String(row.Safra ?? "").trim();
      return selectedSafras.length === 0 || selectedSafras.includes(safra);
    });
  }, [rows, selectedSafras]);

  const accumulatedRows = useMemo(() => {
    return filteredBySafra.filter((row) => {
      if (!selectedMonth) return true;
      const key = parseMonthKey(row);
      if (!key) return false;
      return key <= selectedMonth;
    });
  }, [filteredBySafra, selectedMonth]);

  const graph1 = useMemo(() => {
    const plannedTotal = sumBy(accumulatedRows, "Planejado");
    const actualTotal = sumBy(accumulatedRows, "Realizado");
    const variation = actualTotal - plannedTotal;
    const variationPct = safeDivide(variation, plannedTotal) * 100;

    const grouped = groupRowsBy(accumulatedRows, "GRUPO_ET");
    const allItems = Array.from(grouped.entries()).map(([name, values]) => ({
      name,
      planned: values.planned,
      actual: values.actual,
      delta: values.actual - values.planned,
      percent: safeDivide(values.actual - values.planned, values.planned) * 100,
      baseValue: values.planned,
    }));

    const visibleItems = allItems.filter((item) => selectedGrupoET.includes(item.name));
    const hiddenItems = allItems.filter((item) => !selectedGrupoET.includes(item.name));

    const steps = [...visibleItems];
    if (showOthers && hiddenItems.length > 0) {
      const planned = hiddenItems.reduce((acc, item) => acc + item.planned, 0);
      const actual = hiddenItems.reduce((acc, item) => acc + item.actual, 0);
      const delta = actual - planned;
      steps.push({
        name: "Outros",
        planned,
        actual,
        delta,
        percent: safeDivide(delta, planned) * 100,
        baseValue: planned,
      });
    }

    steps.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return { plannedTotal, actualTotal, variation, variationPct, steps };
  }, [accumulatedRows, selectedGrupoET, showOthers]);

  const graph2Data = useMemo(() => {
    const plannedTotalRows = filteredBySafra.filter((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      return culture && (selectedCultures.length === 0 || selectedCultures.includes(culture));
    });

    const accumulatedCultureRows = accumulatedRows.filter((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      return culture && (selectedCultures.length === 0 || selectedCultures.includes(culture));
    });

    const grouped = new Map<string, { plannedTotal: number; plannedAccum: number; actualAccum: number }>();

    plannedTotalRows.forEach((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      if (!culture) return;
      const current = grouped.get(culture) ?? { plannedTotal: 0, plannedAccum: 0, actualAccum: 0 };
      current.plannedTotal += toNumber(row.Planejado);
      grouped.set(culture, current);
    });

    accumulatedCultureRows.forEach((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      if (!culture) return;
      const current = grouped.get(culture) ?? { plannedTotal: 0, plannedAccum: 0, actualAccum: 0 };
      current.plannedAccum += toNumber(row.Planejado);
      current.actualAccum += toNumber(row.Realizado);
      grouped.set(culture, current);
    });

    return Array.from(grouped.entries()).map(([culture, values]) => {
      const area = toNumber(areaByCulture[culture]);
      return {
        culture,
        area,
        plannedTotalHa: safeDivide(values.plannedTotal, area),
        plannedAccumHa: safeDivide(values.plannedAccum, area),
        actualAccumHa: safeDivide(values.actualAccum, area),
      };
    });
  }, [filteredBySafra, accumulatedRows, selectedCultures, areaByCulture]);

  const graph3 = useMemo(() => {
    if (!selectedExpenseGroup) {
      return { plannedTotal: 0, actualTotal: 0, variation: 0, variationPct: 0, steps: [] as WaterfallStep[] };
    }

    const baseRows = accumulatedRows.filter(
      (row) => String(row["GRUPO DE DESPESAS"] ?? "").trim() === selectedExpenseGroup
    );

    const plannedTotal = sumBy(baseRows, "Planejado");
    const actualTotal = sumBy(baseRows, "Realizado");
    const variation = actualTotal - plannedTotal;
    const variationPct = safeDivide(variation, plannedTotal) * 100;

    const grouped = groupRowsBy(baseRows, "Por área");
    const steps = Array.from(grouped.entries())
      .map(([name, values]) => ({
        name,
        planned: values.planned,
        actual: values.actual,
        delta: values.actual - values.planned,
        percent: safeDivide(values.actual - values.planned, values.planned) * 100,
        baseValue: values.planned,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return { plannedTotal, actualTotal, variation, variationPct, steps };
  }, [accumulatedRows, selectedExpenseGroup]);

  const graph4 = useMemo(() => {
    if (!selectedExpenseGroup || !drillArea) {
      return { plannedTotal: 0, actualTotal: 0, variation: 0, variationPct: 0, steps: [] as WaterfallStep[] };
    }

    const baseRows = accumulatedRows.filter((row) => {
      const expense = String(row["GRUPO DE DESPESAS"] ?? "").trim();
      const area = String(row["Por área"] ?? "").trim() || "Sem grupo";
      return expense === selectedExpenseGroup && area === drillArea;
    });

    const plannedTotal = sumBy(baseRows, "Planejado");
    const actualTotal = sumBy(baseRows, "Realizado");
    const variation = actualTotal - plannedTotal;
    const variationPct = safeDivide(variation, plannedTotal) * 100;

    const grouped = groupRowsBy(baseRows, "Sub_Grupo_CC");
    const steps = Array.from(grouped.entries())
      .map(([name, values]) => ({
        name,
        planned: values.planned,
        actual: values.actual,
        delta: values.actual - values.planned,
        percent: safeDivide(values.actual - values.planned, values.planned) * 100,
        baseValue: values.planned,
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return { plannedTotal, actualTotal, variation, variationPct, steps };
  }, [accumulatedRows, selectedExpenseGroup, drillArea]);

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

      const safras = unique(parsed.map((r) => String(r.Safra ?? "").trim()).filter(Boolean));
      const grupoET = unique(parsed.map((r) => String(r.GRUPO_ET ?? "").trim()).filter(Boolean));
      const cultures = unique(parsed.map((r) => extractCultureName(String(r["Centro de Custo"] ?? ""))).filter(Boolean));
      const months = unique(parsed.map((r) => parseMonthKey(r)).filter(Boolean)).sort();

      setSelectedSafras(safras.length ? [safras[safras.length - 1]] : []);
      setSelectedGrupoET(grupoET);
      setSelectedCultures(cultures);
      setSelectedMonth(months.length ? months[months.length - 1] : "");
      setSelectedExpenseGroup("");
      setDrillArea("");
      setAreaByCulture((prev) => {
        const next = { ...prev };
        cultures.forEach((culture) => {
          if (!(culture in next)) next[culture] = 0;
        });
        return next;
      });
    } catch (err) {
      console.error(err);
      setError("Não foi possível ler a planilha. Verifique se o arquivo Excel está correto.");
    }
  }

  function resetFilters() {
    setSelectedSafras(allSafras);
    setSelectedGrupoET(allGrupoET);
    setSelectedCultures(detectedCultures);
    setSelectedExpenseGroup("");
    setSelectedMonth(allMonths.length ? allMonths[allMonths.length - 1] : "");
    setDrillArea("");
    setShowOthers(true);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f1f5f9", padding: 24, fontFamily: "Inter, Arial, sans-serif" }}>
      <div style={{ maxWidth: 1480, margin: "0 auto", display: "grid", gap: 24 }}>
        <div style={{ ...cardStyle, background: "linear-gradient(90deg, #064e3b, #047857)", color: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: 0.9, fontSize: 14 }}>
            <ChartColumnBig size={18} />
            <span>Dashboard Web de Validação de Custos</span>
          </div>
          <h1 style={{ margin: "8px 0 0", fontSize: 38 }}>Orçado Acum. x Real Acum.</h1>
          <p style={{ maxWidth: 760, opacity: 0.95 }}>
            Faça upload da planilha Excel, informe hectares por cultura, selecione o mês acumulado e analise os custos com gráficos em cascata.
          </p>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr 1fr", gap: 16 }}>
          <div style={cardStyle}>
            <div style={sectionTitleStyle}><Upload size={18} /><h2 style={{ margin: 0 }}>Upload da base Excel</h2></div>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelUpload} />
            <div style={{ marginTop: 10, color: SUBTEXT, fontSize: 14 }}>{fileName || "Nenhum arquivo enviado"}</div>
            {error ? <div style={{ marginTop: 12, color: "#b91c1c" }}>{error}</div> : null}
          </div>

          <div style={cardStyle}>
            <div style={sectionTitleStyle}><Filter size={18} /><h2 style={{ margin: 0 }}>Filtros principais</h2></div>
            <div style={{ display: "grid", gap: 14 }}>
              <MultiSelect label="Safra" options={allSafras} selected={selectedSafras} onChange={setSelectedSafras} />
              <div>
                <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>Mês acumulado</label>
                <div style={{ position: "relative" }}>
                  <Calendar size={16} style={{ position: "absolute", left: 12, top: 14, color: SUBTEXT }} />
                  <select
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    style={{ width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 16, background: "#fff", padding: "10px 14px 10px 38px", appearance: "auto" }}
                  >
                    <option value="">Todos</option>
                    {allMonths.map((month) => (
                      <option key={month} value={month}>{monthLabel(month)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={showOthers} onChange={(e) => setShowOthers(e.target.checked)} />
                <span>Agrupar não selecionados como “Outros”</span>
              </label>
              <button type="button" onClick={resetFilters} style={{ ...miniBtnStyle, background: "#0f172a", color: "#fff", display: "inline-flex", alignItems: "center", gap: 8 }}>
                <RefreshCcw size={16} /> Resetar filtros
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionTitleStyle}><Wheat size={18} /><h2 style={{ margin: 0 }}>Área plantada por cultura</h2></div>
            <div style={{ display: "grid", gap: 12 }}>
              {detectedCultures.length === 0 ? (
                <div style={{ color: SUBTEXT }}>Após subir a planilha, as culturas detectadas aparecerão aqui.</div>
              ) : (
                detectedCultures.map((culture) => (
                  <div key={culture} style={{ border: "1px solid #e2e8f0", borderRadius: 16, padding: 12, background: "#f8fafc" }}>
                    <div style={{ fontWeight: 700, marginBottom: 8 }}>{culture}</div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={areaByCulture[culture] ?? ""}
                      onChange={(e) => setAreaByCulture((prev) => ({ ...prev, [culture]: Number(e.target.value || 0) }))}
                      placeholder="Área plantada (ha)"
                      style={{ width: "100%", minHeight: 42, border: "1px solid #cbd5e1", borderRadius: 14, padding: "10px 12px" }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <MultiSelect label="GRUPO_ET visível no gráfico 1" options={allGrupoET} selected={selectedGrupoET} onChange={setSelectedGrupoET} />
            <MultiSelect label="Culturas para o gráfico 2" options={detectedCultures} selected={selectedCultures} onChange={setSelectedCultures} />
            <div>
              <label style={{ display: "block", marginBottom: 8, fontWeight: 700 }}>GRUPO DE DESPESAS do gráfico 3</label>
              <select
                value={selectedExpenseGroup}
                onChange={(e) => {
                  setSelectedExpenseGroup(e.target.value);
                  setDrillArea("");
                }}
                style={{ width: "100%", minHeight: 44, border: "1px solid #cbd5e1", borderRadius: 16, background: "#fff", padding: "10px 14px" }}
              >
                <option value="">Selecione um grupo de despesas</option>
                {allExpenseGroups.map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Por Grupo de Custo</div>
          <div style={{ color: SUBTEXT, marginTop: 8 }}>
            <div>Sem arrendamento e sem desp. corporativa</div>
            <div>* Sem Pecuária</div>
            <div style={{ marginTop: 6, fontWeight: 600 }}>
              Acumulado até: {selectedMonth ? monthLabel(selectedMonth) : "Todos os meses"}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginTop: 20 }}>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, fontWeight: 900 }}>{fmtNumber(graph1.plannedTotal, 0)}</div><div style={{ color: SUBTEXT }}>Orçado Acum.</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, fontWeight: 900, color: graph1.variation >= 0 ? "#dc2626" : "#16a34a" }}>{fmtNumber(graph1.variation, 0)}</div><div style={{ color: SUBTEXT }}>Variação</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, fontWeight: 900, color: graph1.variationPct >= 0 ? "#dc2626" : "#16a34a" }}>{fmtPercent(graph1.variationPct, 1)}</div><div style={{ color: SUBTEXT }}>%</div></div>
            <div style={{ textAlign: "center" }}><div style={{ fontSize: 40, fontWeight: 900 }}>{fmtNumber(graph1.actualTotal, 0)}</div><div style={{ color: SUBTEXT }}>Real Acum.</div></div>
          </div>

          <div style={{ display: "flex", gap: 16, marginTop: 16, color: SUBTEXT }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 999, background: POSITIVE, display: "inline-block" }} />Aumento</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 12, height: 12, borderRadius: 999, background: NEGATIVE, display: "inline-block" }} />Diminuição</div>
          </div>

          <WaterfallPlot
            initialLabel="Orçado Acum."
            finalLabel="Real Acum."
            initialValue={graph1.plannedTotal}
            finalValue={graph1.actualTotal}
            steps={graph1.steps}
          />
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 28, fontWeight: 900, marginBottom: 12 }}>Gráfico 2 - Custo por Produção</div>
          <div style={{ color: SUBTEXT, marginBottom: 16 }}>Orçado Total Safra, Orçado Acumulado e Realizado Acumulado em R$/ha</div>
          <div style={{ height: 500 }}>
            <ResponsiveContainer>
              <BarChart data={graph2Data} margin={{ top: 30, right: 20, left: 10, bottom: 20 }} barGap={10}>
                <CartesianGrid stroke="#ececec" vertical={false} />
                <XAxis dataKey="culture" tick={{ fill: TEXT, fontSize: 13 }} />
                <YAxis tick={{ fill: SUBTEXT, fontSize: 12 }} tickFormatter={(v) => fmtNumber(v as number, 0)} />
                <Tooltip formatter={(value: any, name: string) => [fmtNumber(Number(value), 2), name]} />
                <Legend />
                <Bar dataKey="plannedTotalHa" name="Orçado Total Safra (R$/ha)" fill={BROWN}>
                  <LabelList dataKey="plannedTotalHa" position="top" formatter={(v: number) => fmtNumber(v, 0)} />
                </Bar>
                <Bar dataKey="plannedAccumHa" name="Orçado Acum. (R$/ha)" fill={GOLD}>
                  <LabelList dataKey="plannedAccumHa" position="top" formatter={(v: number) => fmtNumber(v, 0)} />
                </Bar>
                <Bar dataKey="actualAccumHa" name="Real Acum. (R$/ha)" fill={OLIVE}>
                  <LabelList dataKey="actualAccumHa" position="top" formatter={(v: number) => fmtNumber(v, 0)} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Gráfico 3 - Orçado x Realizado por Área</div>
          <div style={{ color: SUBTEXT, marginTop: 8 }}>Selecione um GRUPO DE DESPESAS para ver a cascata por Por área.</div>
          {selectedExpenseGroup ? (
            <>
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900 }}>{fmtNumber(graph3.plannedTotal, 0)}</div><div style={{ color: SUBTEXT }}>Orçado</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900, color: graph3.variation >= 0 ? "#dc2626" : "#16a34a" }}>{fmtNumber(graph3.variation, 0)}</div><div style={{ color: SUBTEXT }}>Variação</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900, color: graph3.variationPct >= 0 ? "#dc2626" : "#16a34a" }}>{fmtPercent(graph3.variationPct, 1)}</div><div style={{ color: SUBTEXT }}>%</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900 }}>{fmtNumber(graph3.actualTotal, 0)}</div><div style={{ color: SUBTEXT }}>Realizado</div></div>
              </div>
              <WaterfallPlot
                initialLabel="Orçado"
                finalLabel="Realizado"
                initialValue={graph3.plannedTotal}
                finalValue={graph3.actualTotal}
                steps={graph3.steps}
                onBarClick={(label) => setDrillArea(label)}
              />
            </>
          ) : (
            <div style={{ marginTop: 16, color: SUBTEXT }}>Selecione um grupo de despesas no filtro superior.</div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ fontSize: 28, fontWeight: 900 }}>Gráfico 4 - Detalhamento por Sub_Grupo_CC</div>
          <div style={{ color: SUBTEXT, marginTop: 8 }}>
            {drillArea ? `Área selecionada no gráfico 3: ${drillArea}` : "Clique em uma barra do gráfico 3 para abrir o detalhamento."}
          </div>
          {drillArea ? (
            <>
              <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900 }}>{fmtNumber(graph4.plannedTotal, 0)}</div><div style={{ color: SUBTEXT }}>Orçado</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900, color: graph4.variation >= 0 ? "#dc2626" : "#16a34a" }}>{fmtNumber(graph4.variation, 0)}</div><div style={{ color: SUBTEXT }}>Variação</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900, color: graph4.variationPct >= 0 ? "#dc2626" : "#16a34a" }}>{fmtPercent(graph4.variationPct, 1)}</div><div style={{ color: SUBTEXT }}>%</div></div>
                <div style={{ textAlign: "center" }}><div style={{ fontSize: 34, fontWeight: 900 }}>{fmtNumber(graph4.actualTotal, 0)}</div><div style={{ color: SUBTEXT }}>Realizado</div></div>
              </div>
              <WaterfallPlot
                initialLabel="Orçado"
                finalLabel="Realizado"
                initialValue={graph4.plannedTotal}
                finalValue={graph4.actualTotal}
                steps={graph4.steps}
              />
            </>
          ) : (
            <div style={{ marginTop: 16, color: SUBTEXT }}>Nenhuma área selecionada ainda.</div>
          )}
        </div>
      </div>
    </div>
  );
}
