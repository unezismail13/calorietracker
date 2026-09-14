/**
 * ============================================================================
 * NourishPulse — Starter Codebase
 * ============================================================================
 * This single file is meant to be split across your Next.js repo like this:
 *
 *   tailwind.config.js          → see TAILWIND_CONFIG comment block below
 *   app/globals.css             → see GLOBAL_CSS comment block below
 *   lib/foodParser.js           → section [1] FOOD PARSER ENGINE
 *   lib/foodDatabase.js         → section [2] FALLBACK FOOD DATABASE
 *   components/ProgressRing.jsx → section [3]
 *   components/MacroPill.jsx    → section [4]
 *   components/MealFeed.jsx     → section [5]
 *   components/QuickInputBar.jsx→ section [6]
 *   components/BottomNav.jsx    → section [7]
 *   app/(tabs)/TodayTab.jsx     → section [8]
 *   lib/coachEngine.js          → section [9] (generateInsights + mock log + swap data)
 *   app/(tabs)/CoachTab.jsx     → section [9] (InsightCard, SwapCard, CoachTab)
 *   app/page.jsx                → section [10] (demo shell — wires everything up)
 *
 * Everything below is plain React + Tailwind utility classes + a small set of
 * CSS custom properties for the palette (kept in <GlobalStyles/> so this file
 * can run standalone). Drop the CSS vars into globals.css in your real repo.
 * ============================================================================
 */

import React, { useMemo, useState } from "react";
import {
  Mic,
  Send,
  Sun,
  Sunset,
  Moon,
  Cookie,
  Droplets,
  Flame,
  LayoutGrid,
  LineChart,
  Sparkles,
  UserRound,
  TrendingDown,
  TrendingUp,
  ArrowRight,
  CircleAlert,
} from "lucide-react";

/* ============================================================================
 * TAILWIND_CONFIG  (paste into tailwind.config.js)
 * ----------------------------------------------------------------------------
 * module.exports = {
 *   content: ["./app/**\/*.{js,jsx,ts,tsx}", "./components/**\/*.{js,jsx,ts,tsx}"],
 *   theme: {
 *     extend: {
 *       colors: {
 *         base: "#0B0F17",
 *         card: "#131A28",
 *         card2: "#1B2333",
 *         line: "rgba(255,255,255,0.08)",
 *         ink: "#F2F4F8",
 *         inkDim: "#8891A5",
 *         saffron: "#F4A94A",
 *         teal: "#3FBFA6",
 *         periwinkle: "#8B93F0",
 *         rose: "#E8748F",
 *         sage: "#93C572",
 *       },
 *       fontFamily: {
 *         display: ["Fraunces", "ui-serif", "Georgia", "serif"],
 *         body: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
 *       },
 *       spacing: {
 *         "safe-t": "env(safe-area-inset-top)",
 *         "safe-b": "env(safe-area-inset-bottom)",
 *       },
 *     },
 *   },
 *   plugins: [],
 * };
 * ============================================================================
 */

/* ============================================================================
 * GLOBAL_CSS  (paste into app/globals.css, below your Tailwind directives)
 * ----------------------------------------------------------------------------
 * @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Manrope:wght@400;500;600;700&display=swap');
 *
 * html, body { background: #0B0F17; overscroll-behavior: none; }
 * .pt-safe { padding-top: max(env(safe-area-inset-top), 16px); }
 * .pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
 * ::-webkit-scrollbar { display: none; }
 * ============================================================================
 */

function GlobalStyles() {
  // Inlined here only so this single file can run standalone in a preview.
  // In your real repo, delete this component and use globals.css instead.
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Manrope:wght@400;500;600;700&display=swap');
      .np-root {
        --bg: #0B0F17;
        --card: #131A28;
        --card2: #1B2333;
        --line: rgba(255,255,255,0.08);
        --ink: #F2F4F8;
        --ink-dim: #8891A5;
        --saffron: #F4A94A;
        --teal: #3FBFA6;
        --periwinkle: #8B93F0;
        --rose: #E8748F;
        --sage: #93C572;
        font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif;
        background: var(--bg);
        color: var(--ink);
      }
      .np-display { font-family: 'Fraunces', ui-serif, Georgia, serif; }
      .np-card {
        background: var(--card);
        border: 1px solid var(--line);
      }
      .np-glass {
        background: rgba(19, 26, 40, 0.72);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid var(--line);
      }
      .pt-safe { padding-top: max(env(safe-area-inset-top), 16px); }
      .pb-safe { padding-bottom: max(env(safe-area-inset-bottom), 16px); }
      .np-root ::-webkit-scrollbar { display: none; }
    `}</style>
  );
}

/* ============================================================================
 * [1] FOOD PARSER ENGINE — lib/foodParser.js
 * ----------------------------------------------------------------------------
 * Rule-based fallback that runs instantly offline. In production, call this
 * FIRST to attempt a local match; if confidence is low, send the raw text to
 * the AI endpoint below and merge the structured result back in.
 * ============================================================================
 */

// Indian household unit → grams/ml conversion table.
const UNIT_CONVERSIONS = {
  katori: 150, // ml, standard small bowl
  bowl: 200,
  cup: 240,
  tbsp: 15,
  tsp: 5,
  glass: 250,
  piece: 1, // resolved per-food (e.g. 1 roti ≈ 40g)
  g: 1,
  ml: 1,
};

// Per-piece weight overrides for common countable Indian items (grams).
const PIECE_WEIGHTS = {
  roti: 40,
  chapati: 40,
  idli: 35,
  dosa: 90,
  paratha: 60,
  puri: 25,
};

function parseQuantityToken(token) {
  // Handles things like "2", "100g", "1.5" from a pre-split phrase.
  const match = token.match(/^(\d+(?:\.\d+)?)/);
  return match ? parseFloat(match[1]) : 1;
}

/**
 * parseFoodEntry(rawText, foodDb)
 * Splits a natural-language sentence into discrete food items and resolves
 * each against the local database. Returns an array of structured entries
 * matching the shape the app stores and the shape the AI endpoint should
 * also return, so both paths are interchangeable downstream.
 *
 * Example:
 *   parseFoodEntry("2 rotis with ghee, 1 bowl dal tadka, 100g paneer bhurji")
 */
export function parseFoodEntry(rawText, foodDb = INDIAN_FOOD_DB) {
  const clauses = rawText
    .toLowerCase()
    .split(/,| and /)
    .map((c) => c.trim())
    .filter(Boolean);

  return clauses.map((clause) => {
    const qtyMatch = clause.match(
      /(\d+(?:\.\d+)?)\s*(katori|bowl|cup|tbsp|tsp|glass|g|ml)?/
    );
    const quantity = qtyMatch ? parseQuantityToken(qtyMatch[0]) : 1;
    const unit = (qtyMatch && qtyMatch[2]) || "piece";

    // Naive keyword match against the fallback DB — swap for a real search
    // index (Fuse.js, or a vector lookup) once the DB grows past a few
    // hundred entries.
    const matched =
      Object.keys(foodDb).find((key) => clause.includes(key)) || null;

    const base = matched ? foodDb[matched] : null;
    const gramWeight =
      unit === "piece"
        ? (PIECE_WEIGHTS[matched] || 50) * quantity
        : (UNIT_CONVERSIONS[unit] || 1) * quantity;

    const scale = base ? gramWeight / base.per_g : 0;

    return {
      food_item: matched || clause,
      quantity,
      unit,
      resolved: Boolean(base),
      calories: base ? Math.round(base.calories * scale) : null,
      protein_g: base ? +(base.protein_g * scale).toFixed(1) : null,
      carbs_g: base ? +(base.carbs_g * scale).toFixed(1) : null,
      fats_g: base ? +(base.fats_g * scale).toFixed(1) : null,
      fiber_g: base ? +(base.fiber_g * scale).toFixed(1) : null,
      key_micros: base ? base.key_micros : null,
    };
  });
}

/**
 * parseFoodEntryWithAI(rawText)
 * Production path: send raw text to Claude/OpenAI with a strict JSON-only
 * system prompt, used when the local match above has low confidence (e.g.
 * `resolved: false` on any clause) or for cuisines outside the local DB.
 *
 * Wire this to your own backend route (never call the model directly from
 * the client with a real API key).
 */
export async function parseFoodEntryWithAI(rawText) {
  const SYSTEM_PROMPT = `You convert a natural-language food log into JSON only.
Return an array of objects, one per distinct food item, with exactly these
keys: food_item, quantity, unit, calories, protein_g, carbs_g, fats_g,
fiber_g, key_micros (object of nutrient:amount_mg). Assume standard Indian
household units (katori = 150ml, 1 roti ≈ 40g) where units are implied.
No prose, no markdown fences — JSON only.`;

  const res = await fetch("/api/parse-food", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ system: SYSTEM_PROMPT, text: rawText }),
  });
  if (!res.ok) throw new Error("AI parse failed");
  return res.json();
}

/* ============================================================================
 * [2] FALLBACK FOOD DATABASE — lib/foodDatabase.js
 * Values are per `per_g` grams. Extend freely; this is a seed set.
 * ============================================================================
 */
export const INDIAN_FOOD_DB = {
  roti: { per_g: 40, calories: 120, protein_g: 3, carbs_g: 18, fats_g: 3.7, fiber_g: 2.2, key_micros: { iron_mg: 1.1 } },
  "dal tadka": { per_g: 200, calories: 180, protein_g: 9, carbs_g: 22, fats_g: 6, fiber_g: 5, key_micros: { iron_mg: 2.5, potassium_mg: 340 } },
  "paneer bhurji": { per_g: 100, calories: 265, protein_g: 15, carbs_g: 6, fats_g: 20, fiber_g: 1, key_micros: { calcium_mg: 280 } },
  "avocado toast": { per_g: 150, calories: 290, protein_g: 7, carbs_g: 28, fats_g: 17, fiber_g: 7, key_micros: { potassium_mg: 485 } },
  "poached egg": { per_g: 50, calories: 72, protein_g: 6.3, carbs_g: 0.4, fats_g: 4.8, fiber_g: 0, key_micros: { vitamin_b12_mcg: 0.6 } },
  "black coffee": { per_g: 240, calories: 2, protein_g: 0.3, carbs_g: 0, fats_g: 0, fiber_g: 0, key_micros: {} },
  biryani: { per_g: 250, calories: 420, protein_g: 14, carbs_g: 58, fats_g: 14, fiber_g: 3, key_micros: { iron_mg: 2.1 } },
  chole: { per_g: 200, calories: 270, protein_g: 11, carbs_g: 38, fats_g: 8, fiber_g: 9, key_micros: { iron_mg: 3.2 } },
  idli: { per_g: 35, calories: 39, protein_g: 1.5, carbs_g: 8, fats_g: 0.2, fiber_g: 0.5, key_micros: {} },
  dosa: { per_g: 90, calories: 168, protein_g: 3.9, carbs_g: 29, fats_g: 3.7, fiber_g: 1.2, key_micros: {} },
};

/* ============================================================================
 * [3] ProgressRing — components/ProgressRing.jsx
 * ============================================================================
 */
function ProgressRing({ value, target, size = 224, stroke = 14, color = "var(--saffron)" }) {
  const pct = Math.min(value / target, 1);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - pct);
  const remaining = Math.max(target - value, 0);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--card2)"
        strokeWidth={stroke}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        style={{ transition: "stroke-dashoffset 700ms cubic-bezier(.4,0,.2,1)" }}
      />
      <foreignObject x="0" y="0" width={size} height={size}>
        <div
          className="rotate-90 h-full w-full flex flex-col items-center justify-center"
          style={{ fontFamily: "inherit" }}
        >
          <span className="np-display text-[44px] leading-none" style={{ color: "var(--ink)" }}>
            {Math.round(remaining)}
          </span>
          <span className="text-[12px] tracking-wide mt-1" style={{ color: "var(--ink-dim)" }}>
            kcal left today
          </span>
        </div>
      </foreignObject>
    </svg>
  );
}

/* ============================================================================
 * [4] MacroPill — components/MacroPill.jsx
 * ============================================================================
 */
function MacroPill({ label, value, target, unit, color }) {
  const pct = Math.min(Math.round((value / target) * 100), 100);
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[13px]" style={{ color: "var(--ink-dim)" }}>{label}</span>
        <span className="text-[12px] np-display" style={{ color: "var(--ink)" }}>
          {value}
          <span style={{ color: "var(--ink-dim)" }}>/{target}{unit}</span>
        </span>
      </div>
      <div className="h-[6px] rounded-full overflow-hidden" style={{ background: "var(--card2)" }}>
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: color, transition: "width 500ms ease" }}
        />
      </div>
    </div>
  );
}

/* ============================================================================
 * [5] MealFeed — components/MealFeed.jsx
 * Vertical timeline, not repeated identical cards — each meal slot gets a
 * left accent bar keyed to time-of-day rather than a uniform border.
 * ============================================================================
 */
const MEAL_META = {
  breakfast: { icon: Sun, color: "var(--saffron)", label: "Breakfast" },
  lunch: { icon: Sunset, color: "var(--periwinkle)", label: "Lunch" },
  dinner: { icon: Moon, color: "var(--rose)", label: "Dinner" },
  snacks: { icon: Cookie, color: "var(--sage)", label: "Snacks" },
};

function MealFeed({ meals }) {
  return (
    <div className="space-y-5">
      {Object.entries(meals).map(([key, items]) => {
        const meta = MEAL_META[key];
        const Icon = meta.icon;
        const totalKcal = items.reduce((s, i) => s + (i.calories || 0), 0);

        return (
          <div key={key} className="flex gap-3">
            <div className="flex flex-col items-center pt-0.5">
              <div
                className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                style={{ background: "var(--card2)", border: `1px solid ${meta.color}55` }}
              >
                <Icon size={15} style={{ color: meta.color }} />
              </div>
              <div className="flex-1 w-px my-1" style={{ background: "var(--line)" }} />
            </div>

            <div className="flex-1 pb-1">
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-[15px] font-medium" style={{ color: "var(--ink)" }}>
                  {meta.label}
                </h3>
                <span className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                  {totalKcal} kcal
                </span>
              </div>

              {items.length === 0 ? (
                <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>
                  Nothing logged yet — add it above.
                </p>
              ) : (
                <ul className="space-y-2">
                  {items.map((item, idx) => (
                    <li
                      key={idx}
                      className="rounded-2xl px-3.5 py-3 np-card flex items-center justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-[14px] truncate" style={{ color: "var(--ink)" }}>
                          {item.food_item}
                        </p>
                        <p className="text-[12px]" style={{ color: "var(--ink-dim)" }}>
                          {item.quantity} {item.unit} · P{item.protein_g}g · C{item.carbs_g}g · F{item.fats_g}g
                        </p>
                      </div>
                      <span className="np-display text-[15px] pl-3 shrink-0" style={{ color: "var(--ink)" }}>
                        {item.calories}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
 * [6] QuickInputBar — components/QuickInputBar.jsx
 * ============================================================================
 */
function QuickInputBar({ onSubmit }) {
  const [text, setText] = useState("");

  const handleSubmit = () => {
    if (!text.trim()) return;
    onSubmit(text.trim());
    setText("");
  };

  return (
    <div className="np-glass rounded-full flex items-center gap-2 px-2 py-2">
      <button
        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center"
        style={{ background: "var(--card2)" }}
        aria-label="Speak your meal"
      >
        <Mic size={17} style={{ color: "var(--saffron)" }} />
      </button>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        placeholder="2 rotis, 1 katori dal, 100g paneer…"
        className="flex-1 bg-transparent outline-none text-[14px] placeholder:opacity-50 min-w-0"
        style={{ color: "var(--ink)" }}
      />
      <button
        onClick={handleSubmit}
        className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center"
        style={{ background: "var(--saffron)" }}
        aria-label="Log meal"
      >
        <Send size={16} style={{ color: "#0B0F17" }} />
      </button>
    </div>
  );
}

/* ============================================================================
 * [7] BottomNav — components/BottomNav.jsx
 * ============================================================================
 */
const TABS = [
  { key: "today", label: "Today", icon: LayoutGrid },
  { key: "analytics", label: "Analytics", icon: LineChart },
  { key: "coach", label: "AI Coach", icon: Sparkles },
  { key: "profile", label: "Profile", icon: UserRound },
];

function BottomNav({ active, onChange }) {
  return (
    <nav className="np-glass rounded-[28px] px-2 py-2 flex justify-between">
      {TABS.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.key;
        return (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className="flex-1 flex flex-col items-center gap-1 py-2 rounded-3xl"
            style={{ background: isActive ? "var(--card2)" : "transparent" }}
          >
            <Icon size={19} style={{ color: isActive ? "var(--saffron)" : "var(--ink-dim)" }} />
            <span
              className="text-[10.5px]"
              style={{ color: isActive ? "var(--ink)" : "var(--ink-dim)" }}
            >
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/* ============================================================================
 * [8] TodayTab — app/(tabs)/TodayTab.jsx
 * ============================================================================
 */
function TodayTab() {
  const CALORIE_TARGET = 2100;
  const TARGETS = { protein_g: 130, carbs_g: 240, fats_g: 65, fiber_g: 30 };

  const [meals, setMeals] = useState({
    breakfast: [
      { food_item: "avocado toast", quantity: 1, unit: "piece", calories: 290, protein_g: 7, carbs_g: 28, fats_g: 17, fiber_g: 7 },
      { food_item: "poached egg", quantity: 2, unit: "piece", calories: 144, protein_g: 12.6, carbs_g: 0.8, fats_g: 9.6, fiber_g: 0 },
    ],
    lunch: [
      { food_item: "dal tadka", quantity: 1, unit: "bowl", calories: 180, protein_g: 9, carbs_g: 22, fats_g: 6, fiber_g: 5 },
      { food_item: "roti", quantity: 2, unit: "piece", calories: 240, protein_g: 6, carbs_g: 36, fats_g: 7.4, fiber_g: 4.4 },
    ],
    dinner: [],
    snacks: [],
  });

  const totals = useMemo(() => {
    const all = Object.values(meals).flat();
    return all.reduce(
      (acc, i) => ({
        calories: acc.calories + (i.calories || 0),
        protein_g: acc.protein_g + (i.protein_g || 0),
        carbs_g: acc.carbs_g + (i.carbs_g || 0),
        fats_g: acc.fats_g + (i.fats_g || 0),
        fiber_g: acc.fiber_g + (i.fiber_g || 0),
      }),
      { calories: 0, protein_g: 0, carbs_g: 0, fats_g: 0, fiber_g: 0 }
    );
  }, [meals]);

  function handleLog(rawText) {
    const parsed = parseFoodEntry(rawText);
    // Naive routing: drop everything into "snacks" for the demo. In the real
    // app, infer the slot from current local time (or let the user pick).
    setMeals((prev) => ({ ...prev, snacks: [...prev.snacks, ...parsed] }));
  }

  return (
    <div className="space-y-6">
      {/* Hero ring card */}
      <div className="np-card rounded-[28px] p-6 flex flex-col items-center">
        <ProgressRing value={totals.calories} target={CALORIE_TARGET} />
        <div className="flex items-center gap-1.5 mt-1 mb-5">
          <Flame size={13} style={{ color: "var(--saffron)" }} />
          <span className="text-[12.5px]" style={{ color: "var(--ink-dim)" }}>
            {totals.calories} of {CALORIE_TARGET} kcal logged
          </span>
        </div>

        <div className="w-full flex gap-4">
          <MacroPill label="Protein" value={Math.round(totals.protein_g)} target={TARGETS.protein_g} unit="g" color="var(--teal)" />
          <MacroPill label="Carbs" value={Math.round(totals.carbs_g)} target={TARGETS.carbs_g} unit="g" color="var(--periwinkle)" />
        </div>
        <div className="w-full flex gap-4 mt-4">
          <MacroPill label="Fats" value={Math.round(totals.fats_g)} target={TARGETS.fats_g} unit="g" color="var(--rose)" />
          <MacroPill label="Fiber" value={Math.round(totals.fiber_g)} target={TARGETS.fiber_g} unit="g" color="var(--sage)" />
        </div>
      </div>

      {/* Water quick-glance */}
      <div className="np-card rounded-[28px] px-5 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <Droplets size={17} style={{ color: "var(--periwinkle)" }} />
          <span className="text-[13.5px]" style={{ color: "var(--ink)" }}>Water</span>
        </div>
        <span className="text-[13px]" style={{ color: "var(--ink-dim)" }}>1.2 / 2.5 L</span>
      </div>

      {/* Meal feed */}
      <MealFeed meals={meals} />

      <QuickInputBar onSubmit={handleLog} />
    </div>
  );
}

/* ============================================================================
 * [9] Pulse Coach engine + CoachTab — lib/coachEngine.js + app/(tabs)/CoachTab.jsx
 * ----------------------------------------------------------------------------
 * generateInsights() runs entirely on the client against locally stored
 * 7/30-day logs — no round trip needed for the pattern-matching rules below.
 * Swap in a model call only for the free-text "why" copy if you want more
 * variety than the templated strings here.
 * ============================================================================
 */

// Mock 7-day history — in the real app this comes from LocalStorage/DB.
const MOCK_WEEKLY_LOG = [
  { day: "Mon", isWeekend: false, calories: 2050, protein_g: 128, fiber_g: 26, iron_pct: 78 },
  { day: "Tue", isWeekend: false, calories: 2100, protein_g: 134, fiber_g: 29, iron_pct: 82 },
  { day: "Wed", isWeekend: false, calories: 1980, protein_g: 121, fiber_g: 24, iron_pct: 70 },
  { day: "Thu", isWeekend: false, calories: 2150, protein_g: 140, fiber_g: 31, iron_pct: 85 },
  { day: "Fri", isWeekend: false, calories: 2200, protein_g: 125, fiber_g: 22, iron_pct: 68 },
  { day: "Sat", isWeekend: true, calories: 2400, protein_g: 82, fiber_g: 14, iron_pct: 45 },
  { day: "Sun", isWeekend: true, calories: 2350, protein_g: 88, fiber_g: 16, iron_pct: 49 },
];

function average(nums) {
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * generateInsights(log)
 * Rule-based pattern detection over a rolling window. Each rule is
 * independent and returns null if it doesn't fire, so adding a new rule
 * never risks breaking an existing one.
 */
function generateInsights(log) {
  const insights = [];

  // Rule: weekend protein dip
  const weekdayProtein = average(log.filter((d) => !d.isWeekend).map((d) => d.protein_g));
  const weekendProtein = average(log.filter((d) => d.isWeekend).map((d) => d.protein_g));
  const proteinDipPct = Math.round(((weekdayProtein - weekendProtein) / weekdayProtein) * 100);
  if (proteinDipPct > 15) {
    insights.push({
      type: "trend",
      direction: "down",
      headline: `Protein dips ${proteinDipPct}% on weekends`,
      detail: `You average ${Math.round(weekdayProtein)}g on weekdays but only ${Math.round(weekendProtein)}g on Sat/Sun. Add a protein-forward breakfast to close the gap.`,
    });
  }

  // Rule: weekend iron / fiber dip (often tracks with skipped home-cooked meals)
  const weekendIron = average(log.filter((d) => d.isWeekend).map((d) => d.iron_pct));
  if (weekendIron < 60) {
    insights.push({
      type: "trend",
      direction: "down",
      headline: `Iron runs low on weekends`,
      detail: `You're averaging just ${Math.round(weekendIron)}% of your iron target on Sat/Sun, likely from lighter, less home-cooked meals.`,
    });
  }

  // Rule: calories trending up across the week
  const firstHalf = average(log.slice(0, 3).map((d) => d.calories));
  const secondHalf = average(log.slice(-3).map((d) => d.calories));
  if (secondHalf - firstHalf > 150) {
    insights.push({
      type: "trend",
      direction: "up",
      headline: `Calorie intake is climbing`,
      detail: `You've gone from ~${Math.round(firstHalf)} to ~${Math.round(secondHalf)} kcal/day this week. Worth checking if snacking has crept up.`,
    });
  }

  return insights;
}

// Contextual, localized swap suggestions — keyed to whatever the insight
// engine flags as the weak point (protein/fiber/iron/refined snacking).
const SWAP_SUGGESTIONS = [
  {
    from: "Refined evening snack (chips, biscuits)",
    to: "Roasted makhana (1 katori)",
    reason: "Similar crunch, ~120 fewer kcal, and adds 3.5g fiber.",
    tag: "Weekend snacking",
    color: "var(--saffron)",
  },
  {
    from: "Sunday breakfast (toast + jam only)",
    to: "Sattu shake with 1 banana",
    reason: "Adds ~18g protein and iron in one glass — no cooking needed.",
    tag: "Weekend protein dip",
    color: "var(--teal)",
  },
  {
    from: "White rice, large portion",
    to: "Half rice + boiled sprouts on the side",
    reason: "Keeps the meal filling while adding 6g fiber and folate.",
    tag: "Low fiber days",
    color: "var(--sage)",
  },
];

function InsightCard({ insight }) {
  const isDown = insight.direction === "down";
  const Icon = isDown ? TrendingDown : TrendingUp;
  const color = isDown ? "var(--rose)" : "var(--saffron)";

  return (
    <div className="np-card rounded-[24px] p-4 flex gap-3">
      <div
        className="h-9 w-9 rounded-full flex items-center justify-center shrink-0"
        style={{ background: "var(--card2)" }}
      >
        <Icon size={16} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-medium mb-1" style={{ color: "var(--ink)" }}>
          {insight.headline}
        </p>
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
          {insight.detail}
        </p>
      </div>
    </div>
  );
}

function SwapCard({ swap }) {
  return (
    <div className="np-card rounded-[24px] p-4">
      <span
        className="text-[11px] px-2 py-0.5 rounded-full inline-block mb-3"
        style={{ background: "var(--card2)", color: swap.color }}
      >
        {swap.tag}
      </span>
      <div className="flex items-center gap-2 mb-2">
        <p className="text-[13.5px] flex-1 min-w-0" style={{ color: "var(--ink-dim)" }}>
          {swap.from}
        </p>
        <ArrowRight size={14} style={{ color: "var(--ink-dim)" }} className="shrink-0" />
        <p className="text-[13.5px] flex-1 min-w-0 font-medium" style={{ color: "var(--ink)" }}>
          {swap.to}
        </p>
      </div>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--ink-dim)" }}>
        {swap.reason}
      </p>
    </div>
  );
}

function CoachTab() {
  const insights = useMemo(() => generateInsights(MOCK_WEEKLY_LOG), []);

  return (
    <div className="space-y-6">
      <div className="np-card rounded-[28px] p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles size={16} style={{ color: "var(--saffron)" }} />
          <h2 className="np-display text-[17px]" style={{ color: "var(--ink)" }}>
            Pulse Coach
          </h2>
        </div>
        <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>
          Based on your last 7 days of logs.
        </p>
      </div>

      <section>
        <h3 className="text-[13px] mb-3" style={{ color: "var(--ink-dim)" }}>
          What's changed
        </h3>
        {insights.length === 0 ? (
          <div className="np-card rounded-[24px] p-4 flex gap-3">
            <CircleAlert size={16} style={{ color: "var(--ink-dim)" }} />
            <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>
              Nothing unusual this week — keep it up.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {insights.map((insight, idx) => (
              <InsightCard key={idx} insight={insight} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="text-[13px] mb-3" style={{ color: "var(--ink-dim)" }}>
          Try swapping
        </h3>
        <div className="space-y-3">
          {SWAP_SUGGESTIONS.map((swap, idx) => (
            <SwapCard key={idx} swap={swap} />
          ))}
        </div>
      </section>
    </div>
  );
}

/* ============================================================================
 * [10] App shell — app/page.jsx (demo wiring; replace with real routing)
 * ============================================================================
 */
export default function App() {
  const [tab, setTab] = useState("today");

  return (
    <div className="np-root min-h-screen w-full flex justify-center">
      <GlobalStyles />
      <div className="relative w-full max-w-[393px] min-h-screen flex flex-col">
        <header className="pt-safe px-5 pb-3">
          <p className="text-[13px]" style={{ color: "var(--ink-dim)" }}>Tuesday, 14 Sep</p>
          <h1 className="np-display text-[22px]" style={{ color: "var(--ink)" }}>Good morning, Aarav</h1>
        </header>

        <main className="flex-1 px-5 overflow-y-auto pb-40">
          {tab === "today" && <TodayTab />}
          {tab === "coach" && <CoachTab />}
          {tab !== "today" && tab !== "coach" && (
            <div className="np-card rounded-[28px] p-8 text-center mt-4">
              <p className="text-[14px]" style={{ color: "var(--ink-dim)" }}>
                {TABS.find((t) => t.key === tab)?.label} view goes here.
              </p>
            </div>
          )}
        </main>

        <div className="fixed bottom-0 w-full max-w-[393px] px-4 pb-safe">
          <BottomNav active={tab} onChange={setTab} />
        </div>
      </div>
    </div>
  );
}
