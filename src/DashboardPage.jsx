import { useState, useEffect } from "react";
import { supabase } from "./supabase";

function pad(n) { return String(n).padStart(2, "0"); }

function getISOWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

function getWeekMonday(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}`;
}

export default function DashboardPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [weeklyData, setWeeklyData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadWeekly(); }, [year]);

  async function loadWeekly() {
    setLoading(true);
    const yearPrefix = `${year}-`;
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("sales")
        .select("row_data")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const weeks = {};
    all.forEach(r => {
      const d = r.row_data;
      if (!d) return;
      const dateStr = d["발주일자"] || "";
      if (!dateStr.startsWith(yearPrefix)) return;
      const dt = new Date(dateStr);
      if (isNaN(dt)) return;
      const weekNum = getISOWeek(dt);
      const weekKey = `W${pad(weekNum)}`;
      if (!weeks[weekKey]) weeks[weekKey] = { week: weekKey, weekNum, monday: getWeekMonday(dt), amount: 0, count: 0 };
      weeks[weekKey].amount += Number(d["금액"]) || 0;
      weeks[weekKey].count++;
    });

    const sorted = Object.values(weeks).sort((a, b) => a.weekNum - b.weekNum);
    setWeeklyData(sorted);
    setLoading(false);
  }

  const maxAmt = weeklyData.length > 0 ? Math.max(...weeklyData.map(w => w.amount)) : 0;
  const totalAmt = weeklyData.reduce((s, w) => s + w.amount, 0);
  const totalCnt = weeklyData.reduce((s, w) => s + w.count, 0);

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* 연도 선택 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 24 }}>
        <button onClick={() => setYear(y => y - 1)} style={navBtn}>&lt;</button>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{year}년</div>
        <button onClick={() => setYear(y => y + 1)} style={navBtn}>&gt;</button>
      </div>

      {/* 요약 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div style={summaryCard}>
          <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 4 }}>연간 매출</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#4ecdc4" }}>{totalAmt.toLocaleString()}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 4 }}>총 건수</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#e8eaf0" }}>{totalCnt.toLocaleString()}</div>
        </div>
        <div style={summaryCard}>
          <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 4 }}>주 평균</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: "#7c5cfc" }}>
            {weeklyData.length > 0 ? Math.round(totalAmt / weeklyData.length).toLocaleString() : "—"}
          </div>
        </div>
      </div>

      {/* 주차별 막대그래프 */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>주차별 매출현황</div>
        {loading ? (
          <div style={{ color: "#4a4d5e", fontSize: 13, padding: 40, textAlign: "center" }}>불러오는 중...</div>
        ) : weeklyData.length === 0 ? (
          <div style={{ color: "#4a4d5e", fontSize: 13, padding: 40, textAlign: "center" }}>데이터 없음</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", minWidth: weeklyData.length * 24, height: 220, padding: "0 4px" }}>
              {weeklyData.map((w, i) => {
                const pct = maxAmt > 0 ? (w.amount / maxAmt) * 100 : 0;
                const isHigh = w.amount === maxAmt;
                return (
                  <div key={i} style={{ flex: "0 0 auto", width: Math.max(16, Math.floor(900 / weeklyData.length)), display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }} title={`${w.week} (${w.monday}~)\n${w.amount.toLocaleString()}원\n${w.count}건`}>
                    <div style={{
                      width: "100%", borderRadius: "4px 4px 0 0",
                      height: `${Math.max(pct * 1.8, 3)}px`,
                      background: isHigh ? "linear-gradient(180deg, #ff6b9d, #ff6b6b)" : "linear-gradient(180deg, #7c5cfc, #4a9eff)",
                      transition: "height 0.3s",
                    }} />
                  </div>
                );
              })}
            </div>
            {/* X축 라벨 */}
            <div style={{ display: "flex", gap: 3, minWidth: weeklyData.length * 24, padding: "8px 4px 0" }}>
              {weeklyData.map((w, i) => {
                const barW = Math.max(16, Math.floor(900 / weeklyData.length));
                // 라벨 간격 조절: 너무 많으면 일부만 표시
                const showLabel = weeklyData.length <= 20 || i % Math.ceil(weeklyData.length / 20) === 0;
                return (
                  <div key={i} style={{ flex: "0 0 auto", width: barW, textAlign: "center" }}>
                    {showLabel && (
                      <>
                        <div style={{ fontSize: 9, color: "#4a4d5e" }}>{w.week}</div>
                        <div style={{ fontSize: 8, color: "#2a2d3e" }}>{w.monday}</div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {/* 범례 */}
            <div style={{ marginTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#4a4d5e" }}>
                <span>총 {weeklyData.length}주</span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: "linear-gradient(135deg, #ff6b9d, #ff6b6b)" }} /> 최고 매출
                </div>
              </div>
              <div style={{ fontSize: 13, color: "#8a8ea0" }}>
                합계: <span style={{ color: "#4ecdc4", fontWeight: 700 }}>{totalAmt.toLocaleString()}원</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const navBtn = {
  background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
  borderRadius: 7, padding: "6px 14px", fontSize: 18, cursor: "pointer", fontWeight: 700,
};

const summaryCard = {
  background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 20, textAlign: "center",
};
