import { useState, useEffect, useRef } from "react";
import { supabase } from "./supabase";
import * as XLSX from "xlsx";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function getCalendarDays(year, month) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  const days = [];
  for (let i = 0; i < first.getDay(); i++) days.push(null);
  for (let d = 1; d <= last.getDate(); d++) days.push(d);
  return days;
}

function pad(n) { return String(n).padStart(2, "0"); }

export default function SalesPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [uploadedDates, setUploadedDates] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [records, setRecords] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState(null);
  const [viewData, setViewData] = useState([]);
  const [viewHeaders, setViewHeaders] = useState([]);
  const [viewLoading, setViewLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const fileRef = useRef();

  const days = getCalendarDays(year, month);

  useEffect(() => { loadMonth(); }, [year, month]);

  async function loadMonth() {
    const startDate = `${year}-${pad(month + 1)}-01`;
    const endDate = `${year}-${pad(month + 1)}-${new Date(year, month + 1, 0).getDate()}`;
    const map = {};
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("sales")
        .select("upload_date, batch_id, file_name")
        .gte("upload_date", startDate)
        .lte("upload_date", endDate)
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      data.forEach(r => {
        const d = r.upload_date;
        if (!map[d]) map[d] = { count: 0, batch_id: r.batch_id, file_name: r.file_name };
        map[d].count++;
      });
      if (data.length < 1000) break;
      from += 1000;
    }
    setUploadedDates(map);
  }

  function handleDayClick(day) {
    if (!day) return;
    const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
    setSelectedDate(dateStr);
    setRecords([]);
    setHeaders([]);
    setFileName("");
    setMessage(null);
    if (fileRef.current) fileRef.current.value = "";
    if (uploadedDates[dateStr]) {
      loadDayData(dateStr);
    } else {
      setViewData([]);
      setViewHeaders([]);
    }
  }

  async function loadDayData(dateStr) {
    setViewLoading(true);
    let all = [], from = 0;
    while (true) {
      const { data } = await supabase
        .from("sales")
        .select("*")
        .eq("upload_date", dateStr)
        .order("id")
        .range(from, from + 999);
      if (!data || data.length === 0) break;
      all = all.concat(data);
      if (data.length < 1000) break;
      from += 1000;
    }
    if (all.length > 0 && all[0].row_data) {
      const h = Object.keys(all[0].row_data);
      setViewHeaders(h);
    }
    setViewData(all);
    setViewLoading(false);
  }

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
        if (raw.length === 0) { setMessage("빈 파일입니다"); return; }

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
          h.forEach((col, j) => { row[col] = r[j] != null ? r[j] : ""; });
          data.push(row);
        }
        setHeaders(h);
        setRecords(data);
        setMessage(`${data.length}건 파싱 완료`);
      } catch (err) {
        setMessage(`파싱 실패: ${err.message}`);
      }
    };
    reader.readAsArrayBuffer(file);
  }

  async function handleUpload() {
    if (records.length === 0 || !selectedDate) return;
    setUploading(true);
    setMessage("업로드 중...");

    const batchId = `${selectedDate}_${Date.now()}`;
    const batch = records.map(r => ({ upload_date: selectedDate, batch_id: batchId, file_name: fileName, row_data: r }));

    let total = 0;
    for (let i = 0; i < batch.length; i += 500) {
      const chunk = batch.slice(i, i + 500);
      const { error } = await supabase.from("sales").insert(chunk);
      if (error) {
        setMessage(`업로드 실패: ${error.message}`);
        setUploading(false);
        return;
      }
      total += chunk.length;
      setMessage(`업로드 중... ${total}/${batch.length}건`);
    }

    setMessage(`${total}건 업로드 완료!`);
    setRecords([]);
    setHeaders([]);
    setFileName("");
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    loadMonth();
    loadDayData(selectedDate);
  }

  async function handleDelete() {
    if (!selectedDate) return;
    if (!confirm(`${selectedDate} 영업 데이터를 삭제하시겠습니까?`)) return;
    setDeleting(true);
    while (true) {
      const { data, error } = await supabase
        .from("sales")
        .delete()
        .eq("upload_date", selectedDate)
        .select("id")
        .limit(1000);
      if (error) { alert(`삭제 실패: ${error.message}`); break; }
      if (!data || data.length === 0) break;
    }
    setDeleting(false);
    setViewData([]);
    setViewHeaders([]);
    loadMonth();
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelectedDate(null); setViewData([]); setRecords([]);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelectedDate(null); setViewData([]); setRecords([]);
  }

  function formatCell(val) {
    if (val == null || val === "") return "";
    if (typeof val === "number") return val.toLocaleString();
    return String(val);
  }

  function isNumeric(col) {
    const sample = (viewData.length > 0 ? viewData : records).slice(0, 50);
    let numCount = 0, total = 0;
    for (const r of sample) {
      const v = viewData.length > 0 ? r.row_data?.[col] : r[col];
      if (v != null && v !== "") { total++; if (typeof v === "number") numCount++; }
    }
    return total > 0 && numCount / total > 0.7;
  }

  const hasData = selectedDate && uploadedDates[selectedDate];
  const todayStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const displayHeaders = viewHeaders.length > 0 ? viewHeaders : headers;

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "32px 24px" }}>
      {/* 달력 */}
      <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={prevMonth} style={navBtn}>&lt;</button>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{year}년 {month + 1}월</div>
          <button onClick={nextMonth} style={navBtn}>&gt;</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4, marginBottom: 4 }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: i === 0 ? "#ff6b6b" : i === 6 ? "#4a9eff" : "#4a4d5e", padding: "6px 0" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 4 }}>
          {days.map((day, i) => {
            if (!day) return <div key={`e${i}`} />;
            const dateStr = `${year}-${pad(month + 1)}-${pad(day)}`;
            const isSelected = selectedDate === dateStr;
            const isToday = dateStr === todayStr;
            const hasUpload = !!uploadedDates[dateStr];
            const dayOfWeek = (i) % 7;
            return (
              <div
                key={i}
                onClick={() => handleDayClick(day)}
                style={{
                  position: "relative", textAlign: "center", padding: "10px 0", borderRadius: 8, cursor: "pointer", fontSize: 14,
                  fontWeight: isSelected ? 800 : 500,
                  background: isSelected ? "linear-gradient(135deg,#7c5cfc,#4a9eff)" : isToday ? "rgba(124,92,252,0.1)" : "transparent",
                  color: isSelected ? "#fff" : dayOfWeek === 0 ? "#ff6b6b" : dayOfWeek === 6 ? "#4a9eff" : "#e8eaf0",
                  border: isToday && !isSelected ? "1px solid #7c5cfc" : "1px solid transparent",
                  transition: "all 0.15s",
                }}
              >
                {day}
                {hasUpload && (
                  <div style={{
                    position: "absolute", bottom: 3, left: "50%", transform: "translateX(-50%)",
                    width: 6, height: 6, borderRadius: "50%",
                    background: isSelected ? "#fff" : "#4ecdc4",
                  }} />
                )}
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 11, color: "#4a4d5e" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ecdc4" }} /> 업로드 완료
          </div>
        </div>
      </div>

      {/* 영업 패널 */}
      {!selectedDate ? (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 48, textAlign: "center" }}>
          <div style={{ fontSize: 14, color: "#4a4d5e" }}>날짜를 선택하세요</div>
        </div>
      ) : (
        <div style={{ background: "#11141c", borderRadius: 12, border: "1px solid #1e2130", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 18, fontWeight: 800 }}>{selectedDate}</div>
            {hasData && (
              <button onClick={handleDelete} disabled={deleting} style={{
                background: "transparent", border: "1px solid #ff6b6b", color: "#ff6b6b",
                borderRadius: 7, padding: "6px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer",
                opacity: deleting ? 0.5 : 1,
              }}>
                {deleting ? "삭제 중..." : "영업 삭제"}
              </button>
            )}
          </div>

          {hasData ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, padding: "10px 14px", background: "rgba(78,205,196,0.08)", borderRadius: 8, border: "1px solid rgba(78,205,196,0.2)" }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#4ecdc4" }} />
                <span style={{ fontSize: 13, color: "#4ecdc4", fontWeight: 600 }}>
                  {uploadedDates[selectedDate].file_name || "파일명 없음"} — {uploadedDates[selectedDate].count.toLocaleString()}건
                </span>
              </div>
              {viewLoading ? (
                <div style={{ color: "#4a4d5e", fontSize: 13, padding: 20, textAlign: "center" }}>불러오는 중...</div>
              ) : (
                <div style={{ maxHeight: 500, overflowY: "auto", overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2130", position: "sticky", top: 0, background: "#11141c" }}>
                        <th style={{ padding: "8px 6px", textAlign: "center", color: "#4a4d5e", fontWeight: 600, minWidth: 30 }}>#</th>
                        {viewHeaders.map(h => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: isNumeric(h) ? "right" : "left", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {viewData.map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1a1d2a" }}>
                          <td style={{ padding: "6px", textAlign: "center", color: "#4a4d5e", fontSize: 11 }}>{i + 1}</td>
                          {viewHeaders.map(h => (
                            <td key={h} style={{
                              padding: "6px", textAlign: isNumeric(h) ? "right" : "left",
                              color: isNumeric(h) && typeof r.row_data?.[h] === "number" && r.row_data[h] < 0 ? "#ff6b6b" : "#e8eaf0",
                              whiteSpace: "nowrap",
                            }}>{formatCell(r.row_data?.[h])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : (
            <>
              <div style={{ fontSize: 13, color: "#4a4d5e", marginBottom: 12 }}>이 날짜에 영업 데이터가 없습니다. 엑셀 파일을 업로드하세요.</div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFile}
                  style={{ fontSize: 13, color: "#8a8ea0" }}
                />
                <button
                  onClick={handleUpload}
                  disabled={uploading || records.length === 0}
                  style={{
                    background: "linear-gradient(135deg,#7c5cfc,#4a9eff)", border: "none", color: "#fff",
                    borderRadius: 8, padding: "10px 24px", fontSize: 14, fontWeight: 700, cursor: "pointer",
                    opacity: uploading || records.length === 0 ? 0.5 : 1,
                  }}
                >
                  {uploading ? "업로드 중..." : `업로드 (${records.length}건)`}
                </button>
              </div>
              {message && (
                <div style={{ marginTop: 12, fontSize: 13, color: message.includes("실패") ? "#ff6b6b" : "#4ecdc4" }}>
                  {message}
                </div>
              )}
              {records.length > 0 && (
                <div style={{ marginTop: 16, overflowX: "auto" }}>
                  <div style={{ fontSize: 12, color: "#4a4d5e", marginBottom: 8 }}>미리보기 (상위 10건)</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid #1e2130" }}>
                        {headers.map(h => (
                          <th key={h} style={{ padding: "8px 6px", textAlign: isNumeric(h) ? "right" : "left", color: "#4a4d5e", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.slice(0, 10).map((r, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #1a1d2a" }}>
                          {headers.map(h => (
                            <td key={h} style={{
                              padding: "6px", textAlign: isNumeric(h) ? "right" : "left",
                              color: isNumeric(h) && typeof r[h] === "number" && r[h] < 0 ? "#ff6b6b" : "#e8eaf0",
                              whiteSpace: "nowrap",
                            }}>{formatCell(r[h])}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const navBtn = {
  background: "transparent", border: "1px solid #1e2130", color: "#8a8ea0",
  borderRadius: 7, padding: "6px 12px", fontSize: 16, cursor: "pointer", fontWeight: 700,
};
