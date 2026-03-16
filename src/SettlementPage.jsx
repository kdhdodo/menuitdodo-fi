import { useState, useEffect } from "react";
import { supabase } from "./supabase";

function pad(n) { return String(n).padStart(2, "0"); }

export default function SettlementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  // 손익 데이터 (분개장 기반)
  const [plData, setPlData] = useState({ revenue: [], expense: [], revTotal: 0, expTotal: 0 });
  // 부채 데이터
  const [liabilities, setLiabilities] = useState({ items: [], total: 0 });
  // 자산 데이터 (분개장 기반)
  const [assets, setAssets] = useState({ items: [], total: 0 });
  // 재고 (매입)
  const [stockIn, setStockIn] = useState(0);
  // 전기 이익잉여금 (1월~전월까지 누적 당기순이익)
  const [prevRetained, setPrevRetained] = useState(0);
  const [retainedLoading, setRetainedLoading] = useState(false);
  const [plLoading, setPlLoading] = useState(false);

  useEffect(() => { loadAll(); }, [year, month]);

  async function loadAll() {
    setPlLoading(true);
    setRetainedLoading(true);
    await Promise.all([loadPL(), loadPrevRetained()]);
    setPlLoading(false);
    setRetainedLoading(false);
  }

  // 1월~전월까지 누적 당기순이익 = 전기이익잉여금
  async function loadPrevRetained() {
    if (month === 1) { setPrevRetained(0); return; }
    const startDate = `${year}-01-01`;
    const endDate = `${year}-${pad(month - 1)}-${new Date(year, month - 1, 0).getDate()}`;
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("account_code, debit, credit")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    let rev = 0, exp = 0;
    all.forEach(r => {
      const prefix = r.account_code?.substring(0, 2);
      if (prefix === "04") rev += Number(r.credit) || 0;
      else if (prefix === "08") exp += Number(r.debit) || 0;
    });
    setPrevRetained(rev - exp);
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
    all.forEach(r => {
      const key = r.account_code + "_" + r.account_name;
      if (!acctMap[key]) acctMap[key] = { code: r.account_code, name: r.account_name, debit: 0, credit: 0 };
      acctMap[key].debit += Number(r.debit) || 0;
      acctMap[key].credit += Number(r.credit) || 0;
    });

    // 매출: 04로 시작하는 계정 (매출 계정)
    // 비용: 08로 시작하는 계정 (판관비 등)
    // 부채: 02로 시작하는 계정 (미지급금, 선수금, 부가세예수금 등)
    const revenue = [], expense = [], liabilityItems = [], assetItems = [];
    let stockInTotal = 0;
    Object.values(acctMap).forEach(a => {
      const prefix = a.code?.substring(0, 2);
      if (prefix === "04") revenue.push({ name: a.name, amount: a.credit });
      else if (prefix === "08") expense.push({ name: a.name, amount: a.debit });
      else if (a.code === "025300" || a.code === "025500" || a.code === "025900") liabilityItems.push({ name: a.name, amount: a.credit - a.debit });
      else if (a.code === "013100") assetItems.push({ name: a.name, amount: a.debit - a.credit });
      if (a.code === "014600") stockInTotal += a.debit;
    });

    const revTotal = revenue.reduce((s, r) => s + r.amount, 0);
    const expTotal = expense.reduce((s, r) => s + r.amount, 0);
    const liabTotal = liabilityItems.reduce((s, r) => s + r.amount, 0);
    const assetTotal = assetItems.reduce((s, r) => s + r.amount, 0);
    setPlData({ revenue, expense, revTotal, expTotal });
    setLiabilities({ items: liabilityItems.filter(l => l.amount !== 0), total: liabTotal });
    setAssets({ items: assetItems.filter(a => a.amount !== 0), total: assetTotal });
    setStockIn(stockInTotal);

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

        {/* 오른쪽 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* 재고 */}
          <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>재고</div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
              <span style={{ color: "#8a8ea0" }}>매입 (상품)</span>
              <span style={{ color: "#4a9eff", fontWeight: 600 }}>{plLoading ? "..." : (stockIn || 0).toLocaleString()}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
              <span style={{ color: "#8a8ea0" }}>출고</span>
              <span style={{ color: "#4a4d5e", fontSize: 11 }}>영업팀 업로드 예정</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
              <span style={{ color: "#f59e0b" }}>재고 잔량</span>
              <span style={{ color: "#f59e0b" }}>{plLoading ? "..." : (stockIn || 0).toLocaleString()}</span>
            </div>
          </div>

          {/* 자산·부채 */}
          <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>자산·부채</div>

            {/* 자산 */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#4a9eff", marginBottom: 8 }}>자산</div>
            {assets.items.map((a, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                <span style={{ color: "#8a8ea0" }}>{a.name}</span>
                <span style={{ color: "#4a9eff", fontWeight: 600 }}>{a.amount.toLocaleString()}</span>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
              <span style={{ color: "#8a8ea0" }}>잔고</span>
              <span style={{ color: "#4a4d5e", fontSize: 11 }}>잔고 탭에서 등록</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: "#4a9eff" }}>자산 합계</span>
              <span style={{ color: "#4a9eff" }}>{assets.total.toLocaleString()}</span>
            </div>

            {/* 부채 */}
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ff6b6b", marginBottom: 8, marginTop: 16 }}>부채</div>
            {liabilities.items.length === 0 ? (
              <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 12 }}>데이터 없음</div>
            ) : (
              liabilities.items.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                  <span style={{ color: "#8a8ea0" }}>{l.name}</span>
                  <span style={{ color: "#ff6b6b", fontWeight: 600 }}>{l.amount.toLocaleString()}</span>
                </div>
              ))
            )}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: "#ff6b6b" }}>부채 합계</span>
              <span style={{ color: "#ff6b6b" }}>{liabilities.total.toLocaleString()}</span>
            </div>

            {/* 순자산 */}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: "2px solid #1e2130", marginTop: 12, fontSize: 15, fontWeight: 800 }}>
              <span>순자산</span>
              <span style={{ color: (assets.total - liabilities.total) >= 0 ? "#4a9eff" : "#ff6b6b" }}>{(assets.total - liabilities.total).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* 대사 (이익잉여금 검증) */}
      {(() => {
        const currentRetained = prevRetained + netIncome;
        const bsResult = assets.total - liabilities.total + stockIn;
        const diff = Math.abs(currentRetained - bsResult);
        const isMatch = diff < 1;
        return (
          <div style={{ background: "#11141c", borderRadius: 12, border: `1px solid ${isMatch ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 16 }}>대사 (이익잉여금 검증)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
              {/* 왼쪽: 손익 기반 */}
              <div style={{ background: "#0d0f14", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 8 }}>손익 기반</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>전기이월 이익잉여금</span>
                  <span style={{ color: "#e8eaf0", fontWeight: 600 }}>{retainedLoading ? "..." : prevRetained.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>+ 당기순이익</span>
                  <span style={{ color: netIncome >= 0 ? "#4ecdc4" : "#ff6b6b", fontWeight: 600 }}>{netIncome.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
                  <span>이익잉여금</span>
                  <span style={{ color: "#7c5cfc" }}>{retainedLoading ? "..." : currentRetained.toLocaleString()}</span>
                </div>
              </div>

              {/* 가운데: = */}
              <div style={{ fontSize: 28, fontWeight: 800, color: isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {isMatch ? "=" : "≠"}
              </div>

              {/* 오른쪽: 재무상태 기반 */}
              <div style={{ background: "#0d0f14", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 8 }}>재무상태 기반</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>재고</span>
                  <span style={{ color: "#f59e0b", fontWeight: 600 }}>{stockIn.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>자산</span>
                  <span style={{ color: "#4a9eff", fontWeight: 600 }}>{assets.total.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>- 부채</span>
                  <span style={{ color: "#ff6b6b", fontWeight: 600 }}>{liabilities.total.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
                  <span>합계</span>
                  <span style={{ color: "#7c5cfc" }}>{bsResult.toLocaleString()}</span>
                </div>
              </div>
            </div>
            {/* 차이 블럭 */}
            <div style={{
              marginTop: 16, padding: "16px 24px", borderRadius: 10, textAlign: "center",
              background: isMatch ? "rgba(78,205,196,0.08)" : "rgba(255,107,107,0.08)",
              border: `1px solid ${isMatch ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`,
            }}>
              <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 4 }}>차이</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {isMatch ? "0" : diff.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {isMatch ? "정상 — 대사 완료" : "오차 발생"}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

const navBtn = {
  background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
  borderRadius: 7, padding: "6px 14px", fontSize: 18, cursor: "pointer", fontWeight: 700,
};
