import { useState } from "react";

export default function SettlementPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

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
          <button
            key={m}
            onClick={() => setMonth(m)}
            style={{
              padding: "12px 0",
              borderRadius: 8,
              fontSize: 15,
              fontWeight: month === m ? 800 : 500,
              cursor: "pointer",
              border: month === m ? "none" : "1px solid #1e2130",
              background: month === m ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : "#11141c",
              color: month === m ? "#fff" : "#4a4d5e",
              transition: "all 0.15s",
            }}
          >
            {m}월
          </button>
        ))}
      </div>

      {/* 정산 내용 영역 (좌우 대칭) */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, minHeight: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#4ecdc4", marginBottom: 12 }}>차변 (자산/비용)</div>
          <div style={{ fontSize: 13, color: "#4a4d5e" }}>{year}년 {month}월 데이터</div>
        </div>
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, minHeight: 200 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#ff6b9d", marginBottom: 12 }}>대변 (부채/매출)</div>
          <div style={{ fontSize: 13, color: "#4a4d5e" }}>{year}년 {month}월 데이터</div>
        </div>
      </div>
    </div>
  );
}

const navBtn = {
  background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
  borderRadius: 7, padding: "6px 14px", fontSize: 18, cursor: "pointer", fontWeight: 700,
};
