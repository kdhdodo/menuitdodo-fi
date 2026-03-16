import { useState, useEffect } from "react";
import { supabase } from "./supabase";

function pad(n) { return String(n).padStart(2, "0"); }

export default function SettlementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // 손익 데이터 (분개장 기반)
  const [plData, setPlData] = useState({ revenue: [], expense: [], revTotal: 0, expTotal: 0 });
  // 일별 정산 목록
  const [dailyList, setDailyList] = useState([]);
  // 저장된 정산표
  const [settlements, setSettlements] = useState({});
  const [settling, setSettling] = useState(null);
  const [plLoading, setPlLoading] = useState(false);

  useEffect(() => { loadAll(); }, [year, month]);

  async function loadAll() {
    setPlLoading(true);
    await Promise.all([loadPL(), loadSettlements()]);
    setPlLoading(false);
  }

  async function loadPL() {
    const startDate = `${year}-${pad(month)}-01`;
    const endDate = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;

    // 분개장에서 해당 월 데이터 전부 가져오기
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("entry_date, account_code, account_name, debit, credit, division")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .order("entry_date")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    // 계정과목별 집계
    const acctMap = {};
    const dayMap = {};
    all.forEach(r => {
      const key = r.account_code + "_" + r.account_name;
      if (!acctMap[key]) acctMap[key] = { code: r.account_code, name: r.account_name, debit: 0, credit: 0 };
      acctMap[key].debit += Number(r.debit) || 0;
      acctMap[key].credit += Number(r.credit) || 0;

      // 일별 차변/대변 합계
      const d = r.entry_date;
      if (!dayMap[d]) dayMap[d] = { debit: 0, credit: 0 };
      dayMap[d].debit += Number(r.debit) || 0;
      dayMap[d].credit += Number(r.credit) || 0;
    });

    // 매출: 04로 시작하는 계정 (매출 계정)
    // 비용: 08로 시작하는 계정 (판관비 등)
    const revenue = [], expense = [];
    Object.values(acctMap).forEach(a => {
      const prefix = a.code?.substring(0, 2);
      if (prefix === "04") revenue.push({ name: a.name, amount: a.credit });
      else if (prefix === "08") expense.push({ name: a.name, amount: a.debit });
    });

    const revTotal = revenue.reduce((s, r) => s + r.amount, 0);
    const expTotal = expense.reduce((s, r) => s + r.amount, 0);
    setPlData({ revenue, expense, revTotal, expTotal });

    // 일별 리스트
    const days = Object.entries(dayMap)
      .map(([date, v]) => ({ date, debit: v.debit, credit: v.credit, diff: Math.abs(v.debit - v.credit) }))
      .sort((a, b) => a.date.localeCompare(b.date));
    setDailyList(days);
  }

  async function loadSettlements() {
    const startDate = `${year}-${pad(month)}-01`;
    const endDate = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
    const { data } = await supabase
      .from("settlements")
      .select("*")
      .gte("settlement_date", startDate)
      .lte("settlement_date", endDate);
    const map = {};
    (data || []).forEach(s => { map[s.settlement_date] = s; });
    setSettlements(map);
  }

  async function handleSettle(day) {
    setSettling(day.date);
    const status = day.diff === 0 ? "normal" : "error";
    const { error } = await supabase.from("settlements").upsert({
      settlement_date: day.date,
      total_debit: day.debit,
      total_credit: day.credit,
      diff: day.diff,
      status,
      settled_at: new Date().toISOString(),
    }, { onConflict: "settlement_date" });
    if (error) alert(`정산 실패: ${error.message}`);
    setSettling(null);
    loadSettlements();
  }

  const netIncome = plData.revTotal - plData.expTotal;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* 연도 선택 */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 20 }}>
        <button onClick={() => setYear(y => y - 1)} style={navBtn}>&lt;</button>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{year}년</div>
        <button onClick={() => setYear(y => y + 1)} style={navBtn}>&gt;</button>
      </div>

      {/* 월 선택 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(6,1fr)", gap: 8, marginBottom: 24 }}>
        {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
          <button key={m} onClick={() => setMonth(m)} style={{
            padding: "12px 0", borderRadius: 8, fontSize: 15, fontWeight: month === m ? 800 : 500, cursor: "pointer",
            border: month === m ? "none" : "1px solid #1e2130",
            background: month === m ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#11141c",
            color: month === m ? "#fff" : "#4a4d5e", transition: "all 0.15s",
          }}>{m}월</button>
        ))}
      </div>

      {/* 좌우 대칭: 손익 / 자산 */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        {/* 왼쪽: 손익계산서 */}
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>손익계산서</div>
          {plLoading ? <div style={{ color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div> : (
            <>
              {/* 매출 */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#4ecdc4", marginBottom: 8 }}>매출</div>
              {plData.revenue.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 12 }}>데이터 없음</div>
              ) : (
                plData.revenue.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: "#8a8ea0" }}>{r.name}</span>
                    <span style={{ color: "#4ecdc4", fontWeight: 600 }}>{r.amount.toLocaleString()}</span>
                  </div>
                ))
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: "#4ecdc4" }}>매출 합계</span>
                <span style={{ color: "#4ecdc4" }}>{plData.revTotal.toLocaleString()}</span>
              </div>

              {/* 비용 */}
              <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b9d", marginBottom: 8, marginTop: 16 }}>비용</div>
              {plData.expense.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 12 }}>데이터 없음</div>
              ) : (
                plData.expense.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                    <span style={{ color: "#8a8ea0" }}>{r.name}</span>
                    <span style={{ color: "#ff6b9d", fontWeight: 600 }}>{r.amount.toLocaleString()}</span>
                  </div>
                ))
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 13, fontWeight: 700 }}>
                <span style={{ color: "#ff6b9d" }}>비용 합계</span>
                <span style={{ color: "#ff6b9d" }}>{plData.expTotal.toLocaleString()}</span>
              </div>

              {/* 순이익 */}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #1e2130", marginTop: 12, fontSize: 15, fontWeight: 800 }}>
                <span>순이익</span>
                <span style={{ color: netIncome >= 0 ? "#4ecdc4" : "#ff6b6b" }}>{netIncome.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        {/* 오른쪽: 자산현황 */}
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
          <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>자산현황</div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#4a9eff", marginBottom: 8 }}>잔고</div>
          <div style={{ fontSize: 13, color: "#4a4d5e", padding: "12px 0", borderBottom: "1px solid #1e2130" }}>잔고 탭에서 데이터를 등록하세요</div>

          <div style={{ fontSize: 12, fontWeight: 700, color: "#f59e0b", marginBottom: 8, marginTop: 16 }}>재고</div>
          <div style={{ fontSize: 13, color: "#4a4d5e", padding: "12px 0", borderBottom: "1px solid #1e2130" }}>재고 탭에서 데이터를 등록하세요</div>

          <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #1e2130", marginTop: 12, fontSize: 15, fontWeight: 800 }}>
            <span>자산 합계</span>
            <span style={{ color: "#4a4d5e" }}>—</span>
          </div>
        </div>
      </div>

      {/* 하단: 정산표 */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>정산표</div>
        {dailyList.length === 0 ? (
          <div style={{ fontSize: 13, color: "#4a4d5e", textAlign: "center", padding: 20 }}>해당 월 분개장 데이터가 없습니다</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2130" }}>
                  {["날짜", "차변 합계", "대변 합계", "차이", "상태", ""].map(h => (
                    <th key={h} style={{ padding: "10px 8px", textAlign: h === "" ? "right" : "left", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dailyList.map(day => {
                  const settled = settlements[day.date];
                  const isOk = day.diff === 0;
                  return (
                    <tr key={day.date} style={{ borderBottom: "1px solid #1a1d2a" }}>
                      <td style={{ padding: "10px 8px", fontWeight: 600 }}>{day.date}</td>
                      <td style={{ padding: "10px 8px", color: "#4ecdc4" }}>{day.debit.toLocaleString()}</td>
                      <td style={{ padding: "10px 8px", color: "#ff6b9d" }}>{day.credit.toLocaleString()}</td>
                      <td style={{ padding: "10px 8px", color: isOk ? "#4a4d5e" : "#ff6b6b", fontWeight: isOk ? 400 : 700 }}>
                        {isOk ? "0" : day.diff.toLocaleString()}
                      </td>
                      <td style={{ padding: "10px 8px" }}>
                        {settled ? (
                          <span style={{
                            background: settled.status === "normal" ? "rgba(78,205,196,0.1)" : "rgba(255,107,107,0.1)",
                            color: settled.status === "normal" ? "#4ecdc4" : "#ff6b6b",
                            border: `1px solid ${settled.status === "normal" ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`,
                            borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 700,
                          }}>
                            {settled.status === "normal" ? "정산 완료" : "오차 있음"}
                          </span>
                        ) : (
                          <span style={{ color: "#4a4d5e", fontSize: 11 }}>미정산</span>
                        )}
                      </td>
                      <td style={{ padding: "10px 8px", textAlign: "right" }}>
                        {!settled ? (
                          <button
                            onClick={() => handleSettle(day)}
                            disabled={settling === day.date}
                            style={{
                              background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff",
                              borderRadius: 6, padding: "5px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer",
                              opacity: settling === day.date ? 0.5 : 1,
                            }}
                          >
                            {settling === day.date ? "..." : "정산"}
                          </button>
                        ) : (
                          <span style={{ fontSize: 11, color: "#4a4d5e" }}>
                            {new Date(settled.settled_at).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
