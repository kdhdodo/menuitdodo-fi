import { useState, useEffect } from "react";
import { supabase } from "./supabase";

function pad(n) { return String(n).padStart(2, "0"); }

export default function SettlementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [plData, setPlData] = useState({ revenue: [], cogs: [], expense: [], revTotal: 0, cogsTotal: 0, grossProfit: 0, expTotal: 0 });
  const [prevRetained, setPrevRetained] = useState(0);
  const [balanceTotal, setBalanceTotal] = useState(null);
  const [balanceDetail, setBalanceDetail] = useState([]);
  const [liabilityTotal, setLiabilityTotal] = useState(0);
  const [liabilityDetail, setLiabilityDetail] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => { loadAll(); }, [year, month]);

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadPL(), loadPrevRetained(), loadBalance(), loadLiabilities()]);
    setLoading(false);
  }

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
    let rev = 0, cogs = 0, exp = 0;
    all.forEach(r => {
      const code = r.account_code || "";
      const prefix = code.substring(0, 2);
      if (code === "045100") cogs += Number(r.debit) || 0;
      else if (prefix === "04") rev += Number(r.credit) || 0;
      else if (prefix === "08") exp += Number(r.debit) || 0;
    });
    setPrevRetained(rev - cogs - exp);
  }

  async function loadPL() {
    const startDate = `${year}-${pad(month)}-01`;
    const endDate = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("account_code, account_name, debit, credit")
        .gte("entry_date", startDate)
        .lte("entry_date", endDate)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }

    const acctMap = {};
    all.forEach(r => {
      const key = r.account_code + "_" + r.account_name;
      if (!acctMap[key]) acctMap[key] = { code: r.account_code, name: r.account_name, debit: 0, credit: 0 };
      acctMap[key].debit += Number(r.debit) || 0;
      acctMap[key].credit += Number(r.credit) || 0;
    });

    const revenue = [], cogs = [], expense = [];
    Object.values(acctMap).forEach(a => {
      const prefix = a.code?.substring(0, 2);
      if (a.code === "045100") cogs.push({ name: a.name, amount: a.debit });
      else if (prefix === "04") revenue.push({ name: a.name, amount: a.credit });
      else if (prefix === "08") expense.push({ name: a.name, amount: a.debit });
    });

    const revTotal = revenue.reduce((s, r) => s + r.amount, 0);
    const cogsTotal = cogs.reduce((s, r) => s + r.amount, 0);
    const grossProfit = revTotal - cogsTotal;
    const expTotal = expense.reduce((s, r) => s + r.amount, 0);
    setPlData({ revenue, cogs, expense, revTotal, cogsTotal, grossProfit, expTotal });
  }

  async function loadBalance() {
    // tx_date 형식: "2026/01/02-11:38:13" → 월 prefix로 필터
    const monthPrefix = `${year}/${pad(month)}`;
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("bank_transactions")
        .select("bank, account_no, balance, tx_date, id")
        .like("tx_date", `${monthPrefix}%`)
        .order("id", { ascending: false })
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    if (all.length === 0) {
      setBalanceTotal(null);
      setBalanceDetail([]);
      return;
    }
    // 계좌별 마지막 잔액 (가장 큰 id = 가장 마지막 거래)
    const acctMap = {};
    all.forEach(r => {
      const key = (r.bank || "") + "_" + (r.account_no || "default");
      if (!acctMap[key]) acctMap[key] = { bank: r.bank || "기타", account_no: r.account_no || "", balance: Number(r.balance) || 0 };
    });
    const details = Object.values(acctMap);
    const total = details.reduce((s, d) => s + d.balance, 0);
    setBalanceDetail(details);
    setBalanceTotal(total);
  }

  async function loadLiabilities() {
    // 부채는 누적 잔액 (기초~해당월말)
    const endDate = `${year}-${pad(month)}-${new Date(year, month, 0).getDate()}`;
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("journals")
        .select("account_code, account_name, debit, credit")
        .like("account_code", "02%")
        .lte("entry_date", endDate)
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    if (all.length === 0) {
      setLiabilityTotal(0);
      setLiabilityDetail([]);
      return;
    }
    const acctMap = {};
    all.forEach(r => {
      const key = r.account_code + "_" + r.account_name;
      if (!acctMap[key]) acctMap[key] = { code: r.account_code, name: r.account_name, amount: 0 };
      // 부채는 대변 증가, 차변 감소
      acctMap[key].amount += (Number(r.credit) || 0) - (Number(r.debit) || 0);
    });
    const EXCLUDE = ["임차보증금"];
    const details = Object.values(acctMap).filter(a => Math.abs(a.amount) >= 1 && !EXCLUDE.some(ex => a.name.includes(ex))).sort((a, b) => b.amount - a.amount);
    const total = details.reduce((s, d) => s + d.amount, 0);
    setLiabilityDetail(details);
    setLiabilityTotal(total);
  }

  const netIncome = plData.grossProfit - plData.expTotal;
  const currentRetained = prevRetained + netIncome;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
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

      {/* 손익계산서 */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 24 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>손익계산서</div>
        {loading ? <div style={{ color: "#4a4d5e", fontSize: 13 }}>불러오는 중...</div> : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
            {/* 매출 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#4ecdc4", marginBottom: 10 }}>매출</div>
              {plData.revenue.length === 0 && plData.cogs.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4a4d5e" }}>데이터 없음</div>
              ) : (
                <>
                  {plData.revenue.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                      <span style={{ color: "#8a8ea0" }}>{r.name}</span>
                      <span style={{ color: "#4ecdc4", fontWeight: 600 }}>{r.amount.toLocaleString()}</span>
                    </div>
                  ))}
                  {plData.cogs.map((r, i) => (
                    <div key={`c${i}`} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                      <span style={{ color: "#8a8ea0" }}>{r.name}</span>
                      <span style={{ color: "#ff6b6b", fontWeight: 600 }}>-{Math.abs(r.amount).toLocaleString()}</span>
                    </div>
                  ))}
                </>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: "#4ecdc4" }}>Gross Profit</span>
                <span style={{ color: "#4ecdc4" }}>{plData.grossProfit.toLocaleString()}</span>
              </div>
            </div>

            {/* 비용 */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ff6b9d", marginBottom: 10 }}>비용</div>
              {plData.expense.length === 0 ? (
                <div style={{ fontSize: 12, color: "#4a4d5e" }}>데이터 없음</div>
              ) : (
                plData.expense.map((r, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                    <span style={{ color: "#8a8ea0" }}>{r.name}</span>
                    <span style={{ color: "#ff6b9d", fontWeight: 600 }}>{r.amount.toLocaleString()}</span>
                  </div>
                ))
              )}
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 14, fontWeight: 800 }}>
                <span style={{ color: "#ff6b9d" }}>비용 합계</span>
                <span style={{ color: "#ff6b9d" }}>{plData.expTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* 당기순이익 */}
        <div style={{ display: "flex", justifyContent: "space-between", padding: "16px 0", borderTop: "2px solid #1e2130", marginTop: 16, fontSize: 18, fontWeight: 800 }}>
          <span>당기순이익</span>
          <span style={{ color: netIncome >= 0 ? "#4ecdc4" : "#ff6b6b" }}>{netIncome.toLocaleString()}</span>
        </div>
      </div>

      {/* 정산 */}
      {(() => {
        const hasBalance = balanceTotal != null;
        const hasLiability = liabilityDetail.length > 0;
        const bsResult = 0 + (balanceTotal || 0) - liabilityTotal; // 재고 + 잔고 - 부채
        const diff = Math.abs(currentRetained - bsResult);
        const hasBsData = hasBalance || hasLiability;
        const isMatch = hasBsData && diff < 1;
        return (
          <div style={{ background: "#11141c", borderRadius: 12, border: `1px solid ${!hasBsData ? "#1e2130" : isMatch ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`, padding: 24 }}>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 20 }}>정산</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 16, alignItems: "center" }}>
              {/* 왼쪽: 이익잉여금 */}
              <div style={{ background: "#0d0f14", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 10 }}>이익잉여금</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>전기이월</span>
                  <span style={{ color: "#e8eaf0", fontWeight: 600 }}>{loading ? "..." : prevRetained.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>+ 당기순이익</span>
                  <span style={{ color: netIncome >= 0 ? "#4ecdc4" : "#ff6b6b", fontWeight: 600 }}>{netIncome.toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 15, fontWeight: 800 }}>
                  <span>합계</span>
                  <span style={{ color: "#7c5cfc" }}>{loading ? "..." : currentRetained.toLocaleString()}</span>
                </div>
              </div>

              {/* 가운데 */}
              <div style={{ fontSize: 28, fontWeight: 800, color: !hasBsData ? "#4a4d5e" : isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {!hasBsData ? "=" : isMatch ? "=" : "≠"}
              </div>

              {/* 오른쪽: 재고 + 잔고 - 부채 */}
              <div style={{ background: "#0d0f14", borderRadius: 8, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 10 }}>재무상태</div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13 }}>
                  <span style={{ color: "#8a8ea0" }}>재고</span>
                  <span style={{ color: "#4a4d5e", fontSize: 11 }}>재고 탭에서 등록</span>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: "1px solid #1a1d2a" }}>
                  <span style={{ color: "#8a8ea0" }}>잔고</span>
                  {hasBalance ? (
                    <span style={{ color: "#4ecdc4", fontWeight: 600 }}>{balanceTotal.toLocaleString()}</span>
                  ) : (
                    <span style={{ color: "#4a4d5e", fontSize: 11 }}>잔고 탭에서 등록</span>
                  )}
                </div>
                {hasBalance && balanceDetail.length > 0 && balanceDetail.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 12px", fontSize: 11 }}>
                    <span style={{ color: "#4a4d5e" }}>{d.bank}{d.account_no ? ` ${d.account_no}` : ""}</span>
                    <span style={{ color: "#8a8ea0" }}>{d.balance.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 13, borderBottom: hasLiability ? "1px solid #1a1d2a" : "none" }}>
                  <span style={{ color: "#8a8ea0" }}>- 부채</span>
                  {hasLiability ? (
                    <span style={{ color: "#ff6b9d", fontWeight: 600 }}>{liabilityTotal.toLocaleString()}</span>
                  ) : (
                    <span style={{ color: "#4a4d5e", fontSize: 11 }}>—</span>
                  )}
                </div>
                {hasLiability && liabilityDetail.map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0 3px 12px", fontSize: 11 }}>
                    <span style={{ color: "#4a4d5e" }}>{d.name}</span>
                    <span style={{ color: "#8a8ea0" }}>{d.amount.toLocaleString()}</span>
                  </div>
                ))}
                <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderTop: "1px solid #1e2130", marginTop: 4, fontSize: 15, fontWeight: 800 }}>
                  <span>합계</span>
                  <span style={{ color: hasBsData ? "#7c5cfc" : "#4a4d5e" }}>{hasBsData ? bsResult.toLocaleString() : "—"}</span>
                </div>
              </div>
            </div>

            {/* 차이 블럭 */}
            <div style={{
              marginTop: 16, padding: "16px 24px", borderRadius: 10, textAlign: "center",
              background: !hasBsData ? "rgba(74,77,94,0.08)" : isMatch ? "rgba(78,205,196,0.08)" : "rgba(255,107,107,0.08)",
              border: `1px solid ${!hasBsData ? "rgba(74,77,94,0.2)" : isMatch ? "rgba(78,205,196,0.3)" : "rgba(255,107,107,0.3)"}`,
            }}>
              <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 4 }}>차이</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: !hasBsData ? "#4a4d5e" : isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {!hasBsData ? "—" : isMatch ? "0" : diff.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4, color: !hasBsData ? "#4a4d5e" : isMatch ? "#4ecdc4" : "#ff6b6b" }}>
                {!hasBsData ? "재고/잔고 데이터 입력 시 정산 가능" : isMatch ? "정상 — 정산 완료" : "오차 발생"}
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
