import { useState, useRef } from "react";
import * as XLSX from "xlsx";

export default function BalancePage() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState(null);
  const fileRef = useRef();

  function handleFile(e) {
    const file = e.target.files[0];
    if (!file) return;
    setMessage(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (raw.length === 0) {
          setMessage("빈 파일입니다");
          return;
        }
        // 첫 번째 비어있지 않은 행을 헤더로
        let headerIdx = 0;
        for (let i = 0; i < Math.min(raw.length, 10); i++) {
          if (raw[i] && raw[i].filter(c => c != null && c !== "").length >= 3) {
            headerIdx = i;
            break;
          }
        }
        const h = raw[headerIdx].map((c, i) => c != null && c !== "" ? String(c).trim() : `열${i + 1}`);
        const data = [];
        for (let i = headerIdx + 1; i < raw.length; i++) {
          const r = raw[i];
          if (!r || r.every(c => c == null || c === "")) continue;
          const row = {};
          h.forEach((col, j) => {
            row[col] = r[j] != null ? r[j] : "";
          });
          data.push(row);
        }
        setHeaders(h);
        setRows(data);
        setMessage(`${file.name} — ${h.length}개 열, ${data.length}행 파싱 완료`);
      } catch (err) {
        setMessage(`파싱 실패: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  function handleClear() {
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMessage(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function formatCell(val) {
    if (val == null || val === "") return "";
    if (typeof val === "number") return val.toLocaleString();
    return String(val);
  }

  function isNumeric(col) {
    let numCount = 0, total = 0;
    for (const r of rows.slice(0, 50)) {
      if (r[col] != null && r[col] !== "") {
        total++;
        if (typeof r[col] === "number") numCount++;
      }
    }
    return total > 0 && numCount / total > 0.7;
  }

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* 업로드 영역 */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 20 }}>
        <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 16 }}>잔고</div>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff",
            borderRadius: 8, padding: "10px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer",
          }}>
            엑셀 파일 선택
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFile}
              style={{ display: "none" }}
            />
          </label>
          {fileName && (
            <>
              <span style={{ fontSize: 13, color: "#8a8ea0" }}>{fileName}</span>
              <button onClick={handleClear} style={{
                background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
                borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>초기화</button>
            </>
          )}
        </div>
        {message && (
          <div style={{ marginTop: 12, fontSize: 13, color: message.includes("실패") ? "#ff6b6b" : "#4ecdc4" }}>
            {message}
          </div>
        )}
      </div>

      {/* 데이터 테이블 */}
      {rows.length > 0 && (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, color: "#8a8ea0" }}>
              총 <span style={{ color: "#e8eaf0", fontWeight: 700 }}>{rows.length.toLocaleString()}</span>행
            </div>
          </div>
          <div style={{ maxHeight: 600, overflowY: "auto", overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #1e2130", position: "sticky", top: 0, background: "#11141c" }}>
                  <th style={{ padding: "8px 6px", textAlign: "center", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap", minWidth: 30 }}>#</th>
                  {headers.map(h => (
                    <th key={h} style={{
                      padding: "8px 6px",
                      textAlign: isNumeric(h) ? "right" : "left",
                      color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap",
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #1a1d2a" }}>
                    <td style={{ padding: "6px", textAlign: "center", color: "#4a4d5e", fontSize: 11 }}>{i + 1}</td>
                    {headers.map(h => (
                      <td key={h} style={{
                        padding: "6px",
                        textAlign: isNumeric(h) ? "right" : "left",
                        color: isNumeric(h) && typeof r[h] === "number" && r[h] < 0 ? "#ff6b6b" : "#e8eaf0",
                        whiteSpace: "nowrap",
                      }}>{formatCell(r[h])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 빈 상태 */}
      {rows.length === 0 && !fileName && (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
          <div style={{ fontSize: 14, color: "#4a4d5e" }}>엑셀 또는 CSV 파일을 업로드하면 여기에 표시됩니다</div>
        </div>
      )}
    </div>
  );
}
