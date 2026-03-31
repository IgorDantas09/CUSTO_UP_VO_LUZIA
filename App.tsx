import React, { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  LabelList,
} from "recharts";
import {
  Upload,
  Factory,
  Wheat,
  Filter,
  RefreshCcw,
  ChevronDown,
  ChartColumnBig,
} from "lucide-react";

type DataRow = {
  Origem?: string;
  "Acum. Até"?: string | number;
  Safra?: string;
  "Por área"?: string;
  Grupo_CC?: string;
  Sub_Grupo_CC?: string;
  Código?: string | number;
  "Centro de Custo"?: string;
  UP?: string;
  GRUPO_ET?: string;
  "GRUPO DE DESPESAS"?: string;
  GRUPO_ET_3?: string;
  GRUPO_ET_1?: string;
  "Conta Contábil"?: string | number;
  Conta?: string;
  Ver_Arq?: string;
  ANO_MÊS?: string | number;
  DATA?: string | number;
  GRUPO_APRES_GESTOR?: string;
  GESTOR?: string;
  GESTOR_DIR?: string;
  TIPO_PLANEJ?: string;
  Planejado?: number | string;
  Realizado?: number | string;
  "Desvio Real"?: number | string;
  [key: string]: unknown;
};

type AreaByCulture = Record<string, number>;

type WaterfallDatum = {
  name: string;
  start: number;
  delta: number;
  fill: string;
  labelValue: number;
  percent: number;
  baseValue: number;
};

type GroupCostItem = {
  name: string;
  planned: number;
  actual: number;
  variation: number;
  variationPct: number;
};

const NEUTRAL = "#8c8c8c";
const POSITIVE = "#d8454f";
const NEGATIVE = "#11b34c";
const BROWN = "#7c3a19";
const GOLD = "#efb300";
const OLIVE = "#556f26";
const GRID = "#ececec";
const TEXT = "#1f2937";
const SUBTEXT = "#6b7280";
const BRAND = "#eda66f";

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();
}

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

function fmtCurrency(value: number, digits = 0) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
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
    "Desvio Real": toNumber(row["Desvio Real"]),
  }));
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

function WaterfallValueLabel({ x, y, width, value }: any) {
  if (value === undefined || value === null) return null;
  const n = Number(value);
  const yy = n >= 0 ? y - 8 : y + 18;

  return (
    <text
      x={x + width / 2}
      y={yy}
      textAnchor="middle"
      fill="#777"
      fontSize={11}
      fontWeight={600}
    >
      {fmtNumber(n, 0)}
    </text>
  );
}

function WaterfallBottomLabel({ x, y, width, payload }: any) {
  if (!payload) return null;

  return (
    <g>
      <text
        x={x + width / 2}
        y={y + 18}
        textAnchor="middle"
        fill={SUBTEXT}
        fontSize={11}
      >
        {fmtPercent(payload.percent ?? 0, 1)}
      </text>
      <text
        x={x + width / 2}
        y={y + 34}
        textAnchor="middle"
        fill={SUBTEXT}
        fontSize={11}
      >
        {fmtNumber(payload.baseValue ?? 0, 0)}
      </text>
    </g>
  );
}

function ChartCard({
  title,
  subtitle,
  children,
  logo,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  logo?: string | null;
}) {
  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h2 className="card-title">{title}</h2>
          {subtitle ? <p className="card-subtitle">{subtitle}</p> : null}
        </div>
        {logo ? (
          <img src={logo} alt="Logo" className="logo" />
        ) : (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontWeight: 900, fontStyle: "italic" }}>SCHEFFER</div>
            <div className="muted">Mais vida na terra</div>
          </div>
        )}
      </div>
      <div>{children}</div>
    </section>
  );
}

function KPI({
  title,
  value,
  accent = "",
}: {
  title: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="kpi">
      <div className={`kpi-value ${accent}`}>{value}</div>
      <div className="muted">{title}</div>
    </div>
  );
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
    <div className="relative">
      <label className="label">{label}</label>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="input-like"
      >
        <span className="truncate">
          {selected.length === 0
            ? "Nenhum selecionado"
            : allSelected
            ? "Todos selecionados"
            : `${selected.length} selecionado(s)`}
        </span>
        <ChevronDown size={16} />
      </button>

      {open ? (
        <div className="dropdown">
          <div className="dropdown-actions">
            <button
              type="button"
              className="mini-btn"
              onClick={() => onChange(options)}
            >
              Marcar tudo
            </button>
            <button
              type="button"
              className="mini-btn"
              onClick={() => onChange([])}
            >
              Limpar
            </button>
          </div>

          <div className="dropdown-list">
            {options.map((option) => {
              const checked = selected.includes(option);
              return (
                <label key={option} className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      if (e.target.checked) onChange([...selected, option]);
                      else
                        onChange(selected.filter((item) => item !== option));
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
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);

  const [selectedSafras, setSelectedSafras] = useState<string[]>([]);
  const [selectedCenterCosts, setSelectedCenterCosts] = useState<string[]>([]);
  const [selectedGrupoET, setSelectedGrupoET] = useState<string[]>([]);
  const [showOthersGrupoET, setShowOthersGrupoET] = useState(true);
  const [selectedCultures, setSelectedCultures] = useState<string[]>([]);
  const [selectedExpenseGroup, setSelectedExpenseGroup] = useState("");
  const [drillArea, setDrillArea] = useState("");
  const [areaByCulture, setAreaByCulture] = useState<AreaByCulture>({});

  const allSafras = useMemo(
    () =>
      unique(
        rows.map((r) => String(r.Safra ?? "").trim()).filter(Boolean)
      ).sort(),
    [rows]
  );

  const allCenterCosts = useMemo(
    () =>
      unique(
        rows.map((r) => String(r["Centro de Custo"] ?? "").trim()).filter(Boolean)
      ).sort(),
    [rows]
  );

  const allGrupoET = useMemo(
    () =>
      unique(rows.map((r) => String(r.GRUPO_ET ?? "").trim()).filter(Boolean)).sort(),
    [rows]
  );

  const allExpenseGroups = useMemo(
    () =>
      unique(
        rows
          .map((r) => String(r["GRUPO DE DESPESAS"] ?? "").trim())
          .filter(Boolean)
      ).sort(),
    [rows]
  );

  const detectedCultures = useMemo(() => {
    return unique(
      rows
        .map((r) => extractCultureName(String(r["Centro de Custo"] ?? "")))
        .filter(Boolean)
    ).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      const safra = String(row.Safra ?? "").trim();
      const centerCost = String(row["Centro de Custo"] ?? "").trim();

      const passSafra =
        selectedSafras.length === 0 || selectedSafras.includes(safra);
      const passCenter =
        selectedCenterCosts.length === 0 ||
        selectedCenterCosts.includes(centerCost);

      return passSafra && passCenter;
    });
  }, [rows, selectedSafras, selectedCenterCosts]);

  // =========================
  // GRÁFICO 1 - WATERFALL
  // =========================
  const graph1Summary = useMemo(() => {
    const plannedTotal = sumBy(filteredRows, "Planejado");
    const actualTotal = sumBy(filteredRows, "Realizado");
    const variation = actualTotal - plannedTotal;
    const variationPct = safeDivide(variation, plannedTotal) * 100;

    const grouped = groupRowsBy(filteredRows, "GRUPO_ET");
    const allItems = Array.from(grouped.entries()).map(([name, values]) => ({
      name,
      planned: values.planned,
      actual: values.actual,
      delta: values.actual - values.planned,
    }));

    const visibleItems = allItems.filter((item) =>
      selectedGrupoET.includes(item.name)
    );
    const hiddenItems = allItems.filter(
      (item) => !selectedGrupoET.includes(item.name)
    );

    const prepared = [...visibleItems];

    if (showOthersGrupoET && hiddenItems.length > 0) {
      prepared.push({
        name: "Outros",
        planned: hiddenItems.reduce((acc, item) => acc + item.planned, 0),
        actual: hiddenItems.reduce((acc, item) => acc + item.actual, 0),
        delta: hiddenItems.reduce((acc, item) => acc + item.delta, 0),
      });
    }

    prepared.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    let running = plannedTotal;

    const middle: WaterfallDatum[] = prepared.map((item) => {
      const start = running;
      running += item.delta;

      return {
        name: item.name,
        start,
        delta: item.delta,
        fill: item.delta >= 0 ? POSITIVE : NEGATIVE,
        labelValue: item.delta,
        percent: safeDivide(item.delta, item.planned) * 100,
        baseValue: item.planned,
      };
    });

    const chartData: WaterfallDatum[] = [
      {
        name: "Orçado Acum.",
        start: 0,
        delta: plannedTotal,
        fill: NEUTRAL,
        labelValue: plannedTotal,
        percent: 0,
        baseValue: plannedTotal,
      },
      ...middle,
      {
        name: "Real Acum.",
        start: 0,
        delta: actualTotal,
        fill: NEUTRAL,
        labelValue: actualTotal,
        percent: 0,
        baseValue: actualTotal,
      },
    ];

    const minVal = Math.min(
      0,
      ...chartData.map((d) => Math.min(d.start, d.start + d.delta))
    );
    const maxVal = Math.max(
      0,
      ...chartData.map((d) => Math.max(d.start, d.start + d.delta))
    );

    return {
      plannedTotal,
      actualTotal,
      variation,
      variationPct,
      notes: ["Sem arrendamento e sem desp. corporativa", "* Sem Pecuária"],
      chartData,
      domain: [Math.min(minVal * 1.18, 0), maxVal * 1.15] as [number, number],
    };
  }, [filteredRows, selectedGrupoET, showOthersGrupoET]);

  // =========================
  // GRÁFICO 2
  // =========================
  const graph2Data = useMemo(() => {
    const sourceRows = filteredRows.filter((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      if (!culture) return false;
      if (selectedCultures.length === 0) return true;
      return selectedCultures.includes(culture);
    });

    const grouped = new Map<
      string,
      { plannedTotal: number; plannedAccum: number; actualAccum: number }
    >();

    sourceRows.forEach((row) => {
      const culture = extractCultureName(String(row["Centro de Custo"] ?? ""));
      if (!culture) return;

      const current = grouped.get(culture) ?? {
        plannedTotal: 0,
        plannedAccum: 0,
        actualAccum: 0,
      };

      current.plannedTotal += toNumber(row.Planejado);
      current.plannedAccum += toNumber(row.Planejado);
      current.actualAccum += toNumber(row.Realizado);

      grouped.set(culture, current);
    });

    return Array.from(grouped.entries()).map(([culture, values]) => {
      const area = toNumber(areaByCulture[culture]);
      const plannedTotalHa = safeDivide(values.plannedTotal, area);
      const plannedAccumHa = safeDivide(values.plannedAccum, area);
      const actualAccumHa = safeDivide(values.actualAccum, area);
      const variation = actualAccumHa - plannedAccumHa;
      const variationPct = safeDivide(variation, plannedAccumHa) * 100;

      return {
        culture,
        area,
        ...values,
        plannedTotalHa,
        plannedAccumHa,
        actualAccumHa,
        variation,
        variationPct,
      };
    });
  }, [filteredRows, selectedCultures, areaByCulture]);

  // =========================
  // GRÁFICO 3
  // =========================
  const graph3Data = useMemo(() => {
    if (!selectedExpenseGroup) {
      return {
        plannedTotal: 0,
        actualTotal: 0,
        variation: 0,
        variationPct: 0,
        chartData: [] as WaterfallDatum[],
        domain: [0, 0] as [number, number],
      };
    }

    const baseRows = filteredRows.filter(
      (row) =>
        String(row["GRUPO DE DESPESAS"] ?? "").trim() === selectedExpenseGroup
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
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    let running = plannedTotal;

    const middle: WaterfallDatum[] = steps.map((item) => {
      const start = running;
      running += item.delta;

      return {
        name: item.name,
        start,
        delta: item.delta,
        fill: item.delta >= 0 ? "#ff0d0d" : "#10b319",
        labelValue: item.delta,
        percent: item.percent,
        baseValue: item.actual,
      };
    });

    const chartData: WaterfallDatum[] = [
      {
        name: "Orçado",
        start: 0,
        delta: plannedTotal,
        fill: BROWN,
        labelValue: plannedTotal,
        percent: 0,
        baseValue: plannedTotal,
      },
      ...middle,
      {
        name: "Realizado",
        start: 0,
        delta: actualTotal,
        fill: BROWN,
        labelValue: actualTotal,
        percent: 0,
        baseValue: actualTotal,
      },
    ];

    const minVal = Math.min(
      0,
      ...chartData.map((d) => Math.min(d.start, d.start + d.delta))
    );
    const maxVal = Math.max(
      0,
      ...chartData.map((d) => Math.max(d.start, d.start + d.delta))
    );

    return {
      plannedTotal,
      actualTotal,
      variation,
      variationPct,
      chartData,
      domain: [Math.min(minVal * 1.18, 0), maxVal * 1.18] as [number, number],
    };
  }, [filteredRows, selectedExpenseGroup]);

  // =========================
  // GRÁFICO 4
  // =========================
  const graph4Data = useMemo(() => {
    if (!selectedExpenseGroup || !drillArea) return [] as GroupCostItem[];

    const baseRows = filteredRows.filter((row) => {
      const expense = String(row["GRUPO DE DESPESAS"] ?? "").trim();
      const area = String(row["Por área"] ?? "").trim() || "Sem grupo";
      return expense === selectedExpenseGroup && area === drillArea;
    });

    const grouped = groupRowsBy(baseRows, "Sub_Grupo_CC");

    return Array.from(grouped.entries())
      .map(([name, values]) => {
        const variation = values.actual - values.planned;
        return {
          name,
          planned: values.planned,
          actual: values.actual,
          variation,
          variationPct: safeDivide(variation, values.planned) * 100,
        };
      })
      .sort((a, b) => b.actual - a.actual);
  }, [filteredRows, selectedExpenseGroup, drillArea]);

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
      const cultures = unique(
        parsed
          .map((r) => extractCultureName(String(r["Centro de Custo"] ?? "")))
          .filter(Boolean)
      );

      setSelectedSafras(safras.length ? [safras[safras.length - 1]] : []);
      setSelectedCenterCosts([]);
      setSelectedGrupoET(grupoET);
      setSelectedCultures(cultures);
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

  async function handleLogoUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => setLogoDataUrl(String(reader.result || ""));
    reader.readAsDataURL(file);
  }

  function resetFilters() {
    setSelectedSafras(allSafras);
    setSelectedCenterCosts([]);
    setSelectedGrupoET(allGrupoET);
    setSelectedCultures(detectedCultures);
    setSelectedExpenseGroup("");
    setDrillArea("");
    setShowOthersGrupoET(true);
  }

  return (
    <div className="page">
      <div className="container">
        <div className="hero">
          <div className="hero-row">
            <div>
              <div className="hero-mini">
                <ChartColumnBig size={18} />
                <span>Dashboard Web de Validação de Custos</span>
              </div>
              <h1 className="hero-title">
                Unidade de Produção - Orçado x Realizado
              </h1>
              <p className="hero-text">
                Faça upload da planilha Excel, informe a área plantada por cultura
                e analise os custos com filtros interativos e visão em cascata.
              </p>
            </div>

            <div className="hero-file">
              <div className="hero-file-label">Arquivo atual</div>
              <div>{fileName || "Nenhum arquivo enviado"}</div>
            </div>
          </div>
        </div>

        <div className="grid-3">
          <div className="card span-2">
            <div className="section-title">
              <Upload size={18} />
              <h2>Upload da base Excel</h2>
            </div>

            <div className="grid-2">
              <label className="upload-box">
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={handleExcelUpload}
                />
                <Upload size={28} />
                <span>Enviar planilha Excel</span>
                <small>.xlsx ou .xls</small>
              </label>

              <label className="upload-box">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleLogoUpload}
                />
                <Factory size={28} />
                <span>Enviar logo da Scheffer</span>
                <small>Opcional</small>
              </label>
            </div>

            {error ? <div className="error-box">{error}</div> : null}
          </div>

          <div className="card">
            <div className="section-title">
              <Wheat size={18} />
              <h2>Área plantada por cultura</h2>
            </div>

            <div className="stack">
              {detectedCultures.length === 0 ? (
                <div className="muted-box">
                  Após subir a planilha, as culturas detectadas aparecerão aqui.
                </div>
              ) : (
                detectedCultures.map((culture) => (
                  <div key={culture} className="input-card">
                    <div className="label">{culture}</div>
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={areaByCulture[culture] ?? ""}
                      onChange={(e) =>
                        setAreaByCulture((prev) => ({
                          ...prev,
                          [culture]: Number(e.target.value || 0),
                        }))
                      }
                      placeholder="Informe a área em ha"
                      className="text-input"
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="card mt">
          <div className="section-title">
            <Filter size={18} />
            <h2>Filtros gerais</h2>
          </div>

          <div className="grid-4">
            <MultiSelect
              label="Safra"
              options={allSafras}
              selected={selectedSafras}
              onChange={setSelectedSafras}
            />

            <MultiSelect
              label="Centro de Custo"
              options={allCenterCosts}
              selected={selectedCenterCosts}
              onChange={setSelectedCenterCosts}
            />

            <MultiSelect
              label="GRUPO_ET visível no gráfico 1"
              options={allGrupoET}
              selected={selectedGrupoET}
              onChange={setSelectedGrupoET}
            />

            <div>
              <label className="label">Mostrar grupo “Outros”</label>
              <div className="input-like">
                <input
                  type="checkbox"
                  checked={showOthersGrupoET}
                  onChange={(e) => setShowOthersGrupoET(e.target.checked)}
                />
                <span style={{ marginLeft: 8 }}>
                  Agrupar não selecionados como “Outros”
                </span>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <button type="button" onClick={resetFilters} className="primary-btn">
              <RefreshCcw size={16} />
              Resetar filtros
            </button>
          </div>
        </div>

        <div className="grid-4 mt">
          <KPI title="Orçado acumulado" value={fmtCurrency(graph1Summary.plannedTotal, 0)} />
          <KPI
            title="Variação"
            value={fmtCurrency(graph1Summary.variation, 0)}
            accent={graph1Summary.variation >= 0 ? "accent-red" : "accent-green"}
          />
          <KPI
            title="Variação %"
            value={fmtPercent(graph1Summary.variationPct, 1)}
            accent={graph1Summary.variationPct >= 0 ? "accent-red" : "accent-green"}
          />
          <KPI title="Real acumulado" value={fmtCurrency(graph1Summary.actualTotal, 0)} />
        </div>

        <div className="stack mt">
          <ChartCard
            title="Orçado Acum. x Real Acum."
            subtitle="Safra selecionada • em milhares de Reais"
            logo={logoDataUrl}
          >
            <div style={{ padding: "0 8px 8px" }}>
              <div style={{ fontSize: 28, fontWeight: 900 }}>Por Grupo de Custo</div>
              <div className="muted" style={{ marginTop: 8 }}>
                {graph1Summary.notes.map((note) => (
                  <div key={note}>{note}</div>
                ))}
              </div>
            </div>

            <div className="grid-4" style={{ padding: "16px 8px" }}>
              <div className="center-box">
                <div className="big-number">{fmtNumber(graph1Summary.plannedTotal, 0)}</div>
                <div className="muted">Orçado Acum.</div>
              </div>

              <div className="center-box">
                <div
                  className={`big-number ${
                    graph1Summary.variation >= 0 ? "accent-red" : "accent-green"
                  }`}
                >
                  {fmtNumber(graph1Summary.variation, 0)}
                </div>
                <div className="muted">Variação</div>
              </div>

              <div className="center-box">
                <div
                  className={`big-number ${
                    graph1Summary.variationPct >= 0 ? "accent-red" : "accent-green"
                  }`}
                >
                  {fmtPercent(graph1Summary.variationPct, 1)}
                </div>
                <div className="muted">%</div>
              </div>

              <div className="center-box">
                <div className="big-number">{fmtNumber(graph1Summary.actualTotal, 0)}</div>
                <div className="muted">Real Acum.</div>
              </div>
            </div>

            <div className="legend-row">
              <div className="legend-item">
                <span className="dot" style={{ background: POSITIVE }} />
                Aumento
              </div>
              <div className="legend-item">
                <span className="dot" style={{ background: NEGATIVE }} />
                Diminuição
              </div>
            </div>

            <div style={{ height: 520 }}>
              <ResponsiveContainer>
                <ComposedChart
                  data={graph1Summary.chartData}
                  margin={{ top: 35, right: 10, left: 10, bottom: 80 }}
                >
                  <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="0" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11, fill: "#6b7280" }}
                    interval={0}
                    angle={0}
                    height={72}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis hide domain={graph1Summary.domain} />
                  <Tooltip formatter={(value: any) => fmtCurrency(Number(value), 0)} />
                  <Bar dataKey="start" stackId="a" fill="transparent" />
                  <Bar dataKey="delta" stackId="a" maxBarSize={126}>
                    {graph1Summary.chartData.map((entry, index) => (
                      <Cell key={`g1-${index}`} fill={entry.fill} />
                    ))}
                    <LabelList dataKey="labelValue" content={<WaterfallValueLabel />} />
                    <LabelList content={<WaterfallBottomLabel />} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title="Gráfico 2 - Custo por Produção"
            subtitle="Orçado Total Safra, Orçado Acumulado e Realizado Acumulado em R$/ha"
            logo={logoDataUrl}
          >
            <div className="grid-prod">
              <MultiSelect
                label="Culturas para análise"
                options={detectedCultures}
                selected={selectedCultures}
                onChange={setSelectedCultures}
              />
              <div className="muted-box">
                O cálculo por hectare usa a área plantada informada para cada cultura.
              </div>
            </div>

            <div style={{ height: 500 }}>
              <ResponsiveContainer>
                <BarChart
                  data={graph2Data}
                  margin={{ top: 40, right: 20, left: 10, bottom: 20 }}
                  barGap={10}
                >
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="culture"
                    tick={{ fontSize: 14, fill: TEXT, fontWeight: 600 }}
                  />
                  <YAxis
                    tickFormatter={(v) => fmtNumber(v as number, 0)}
                    tick={{ fontSize: 12, fill: SUBTEXT }}
                  />
                  <Tooltip
                    formatter={(value: any, name: string) => [
                      fmtNumber(Number(value), 2),
                      name,
                    ]}
                    labelFormatter={(label) => `Cultura: ${label}`}
                  />
                  <Legend />
                  <Bar dataKey="plannedTotalHa" name="Orçado 25-26 (R$/ha)" fill={BROWN}>
                    <LabelList
                      dataKey="plannedTotalHa"
                      position="top"
                      formatter={(v: number) => fmtNumber(v, 0)}
                    />
                  </Bar>
                  <Bar dataKey="plannedAccumHa" name="Orçado Acum. (R$/ha)" fill={GOLD}>
                    <LabelList
                      dataKey="plannedAccumHa"
                      position="top"
                      formatter={(v: number) => fmtNumber(v, 0)}
                    />
                  </Bar>
                  <Bar dataKey="actualAccumHa" name="Real Acum. (R$/ha)" fill={OLIVE}>
                    <LabelList
                      dataKey="actualAccumHa"
                      position="top"
                      formatter={(v: number) => fmtNumber(v, 0)}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          <ChartCard
            title={selectedExpenseGroup || "Gráfico 3 - Orçado x Realizado por Área"}
            subtitle="Cálculo por GRUPO DE DESPESAS com divisões pela coluna Por área"
            logo={logoDataUrl}
          >
            <div className="grid-prod">
              <div>
                <label className="label">GRUPO DE DESPESAS</label>
                <select
                  value={selectedExpenseGroup}
                  onChange={(e) => {
                    setSelectedExpenseGroup(e.target.value);
                    setDrillArea("");
                  }}
                  className="text-input"
                >
                  <option value="">Selecione um grupo de despesas</option>
                  {allExpenseGroups.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="muted-box">
                O gráfico mostra um único <strong>GRUPO DE DESPESAS</strong> por vez.
                As barras intermediárias são geradas pela coluna <strong>Por área</strong>.
                Clique em uma barra para abrir o detalhamento do Gráfico 4 por{" "}
                <strong>Sub_Grupo_CC</strong>.
              </div>
            </div>

            {selectedExpenseGroup ? (
              <>
                <div style={{ padding: "0 8px" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: BRAND }}>
                    Scheffer
                  </div>
                </div>

                <div className="legend-row">
                  <div className="legend-item">
                    <span className="dot" style={{ background: "#ff0d0d" }} />
                    Aumento
                  </div>
                  <div className="legend-item">
                    <span className="dot" style={{ background: "#10b319" }} />
                    Diminuição
                  </div>
                  <div className="muted">em R$/mil</div>
                </div>

                <div style={{ height: 560, position: "relative" }}>
                  <ResponsiveContainer>
                    <ComposedChart
                      data={graph3Data.chartData}
                      margin={{ top: 35, right: 10, left: 10, bottom: 90 }}
                    >
                      <CartesianGrid stroke={GRID} vertical={false} strokeDasharray="0" />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "#444" }}
                        interval={0}
                        angle={0}
                        height={78}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis hide domain={graph3Data.domain} />
                      <Tooltip formatter={(value: any) => fmtCurrency(Number(value), 0)} />
                      <Bar dataKey="start" stackId="a" fill="transparent" />
                      <Bar dataKey="delta" stackId="a" maxBarSize={130}>
                        {graph3Data.chartData.map((entry, index) => (
                          <Cell
                            key={`g3-${index}`}
                            fill={entry.fill}
                            cursor={
                              entry.name !== "Orçado" && entry.name !== "Realizado"
                                ? "pointer"
                                : "default"
                            }
                            onClick={() => {
                              if (
                                entry.name !== "Orçado" &&
                                entry.name !== "Realizado"
                              ) {
                                setDrillArea(entry.name);
                              }
                            }}
                          />
                        ))}
                        <LabelList dataKey="labelValue" content={<WaterfallValueLabel />} />
                        <LabelList content={<WaterfallBottomLabel />} />
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>

                  <div className="center-overlay">
                    <div
                      className={`overlay-number ${
                        graph3Data.variation >= 0 ? "accent-red" : "accent-green"
                      }`}
                    >
                      {fmtNumber(graph3Data.variation, 0)}{" "}
                      {fmtPercent(graph3Data.variationPct, 0)}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="muted-box center" style={{ padding: 24 }}>
                Selecione um <strong>GRUPO DE DESPESAS</strong> para visualizar o gráfico
                com as divisões por <strong>Por área</strong>.
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Gráfico 4 - Drilldown por Sub_Grupo_CC"
            subtitle={
              drillArea
                ? `Detalhamento da área: ${drillArea}`
                : "Selecione uma barra do gráfico 3 para abrir o detalhamento"
            }
            logo={logoDataUrl}
          >
            {drillArea ? (
              <div style={{ height: 500 }}>
                <ResponsiveContainer>
                  <BarChart
                    data={graph4Data}
                    margin={{ top: 20, right: 20, left: 10, bottom: 90 }}
                    barGap={8}
                  >
                    <CartesianGrid stroke={GRID} vertical={false} />
                    <XAxis
                      dataKey="name"
                      interval={0}
                      angle={0}
                      height={90}
                      tick={{ fontSize: 12, fill: TEXT }}
                    />
                    <YAxis
                      tickFormatter={(v) => fmtNumber(v as number, 0)}
                      tick={{ fontSize: 12, fill: SUBTEXT }}
                    />
                    <Tooltip formatter={(value: any) => fmtCurrency(Number(value), 0)} />
                    <Legend />
                    <Bar dataKey="planned" name="Orçado Acum." fill={GOLD}>
                      <LabelList
                        dataKey="planned"
                        position="top"
                        formatter={(v: number) => fmtNumber(v, 0)}
                      />
                    </Bar>
                    <Bar dataKey="actual" name="Real Acum." fill={OLIVE}>
                      <LabelList
                        dataKey="actual"
                        position="top"
                        formatter={(v: number) => fmtNumber(v, 0)}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="muted-box center" style={{ padding: 24 }}>
                Nenhuma área selecionada ainda. Clique em uma barra do gráfico 3.
              </div>
            )}
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
