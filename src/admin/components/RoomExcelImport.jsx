import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';
import { useSettings } from './SettingsContext';

// Expected columns in the Excel file
const REQUIRED_COLS = ['roomNumber', 'type', 'price', 'capacity', 'status'];
const OPTIONAL_COLS = ['amenities', 'description', 'floor'];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

const STATUS_OPTIONS = ['available', 'occupied', 'maintenance', 'not ready', 'vacant'];
const TYPE_OPTIONS   = ['Standard', 'Deluxe', 'Suite', 'Family', 'Single', 'Double', 'Twin'];

// Given any-case input, return the canonically-cased Type from TYPE_OPTIONS
// (e.g. "deluxe" / "DELUXE" / "Deluxe" all resolve to "Deluxe"). Falls back
// to the raw value if nothing matches, so validation can still flag it.
function normalizeType(rawType) {
  const match = TYPE_OPTIONS.find(t => t.toLowerCase() === String(rawType).trim().toLowerCase());
  return match || String(rawType).trim();
}

function Badge({ color, bg, children }) {
  return (
    <span style={{
      background: bg, color, borderRadius: '999px',
      fontSize: '10px', fontWeight: '600',
      padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function DownloadTemplate({ darkBtnBg, accent }) {
  const handleDownload = () => {
    const wb = XLSX.utils.book_new();
    const sampleData = [
      ALL_COLS,
      ['101', 'Standard', '2500', '2', 'available', 'AC, TV, WiFi', 'Cozy standard room', '1'],
      ['102', 'Deluxe',   '3500', '3', 'available', 'AC, TV, WiFi, Bathtub', 'Spacious deluxe room', '1'],
      ['201', 'Suite',    '5000', '4', 'maintenance', 'AC, TV, WiFi, Kitchen, Balcony', 'Premium suite', '2'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    ws['!cols'] = ALL_COLS.map((_, i) => ({ wch: i < 5 ? 14 : 28 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Rooms');
    XLSX.writeFile(wb, 'room_import_template.xlsx');
  };

  return (
    <button onClick={handleDownload} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px',
      background: darkBtnBg, color: accent,
      border: 'none', borderRadius: '8px',
      padding: '8px 16px', fontSize: '12px', fontWeight: '600',
      cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
    }}>
      ⬇ Download Template
    </button>
  );
}

function validateRow(row) {
  const errors = [];
  if (!row.roomNumber) errors.push('Room number is required');

  if (!row.type) {
    errors.push('Type is required');
  } else if (!TYPE_OPTIONS.some(t => t.toLowerCase() === String(row.type).toLowerCase())) {
    errors.push(`Type must be one of: ${TYPE_OPTIONS.join(', ')} (any capitalization is fine)`);
  }

  if (!row.price || isNaN(Number(row.price))) errors.push('Price must be a number');
  if (!row.capacity || isNaN(Number(row.capacity))) errors.push('Capacity must be a number');

  if (!row.status) {
    errors.push('Status is required');
  } else if (!STATUS_OPTIONS.includes(String(row.status).toLowerCase())) {
    errors.push(`Status must be one of: ${STATUS_OPTIONS.join(', ')}`);
  }

  return errors;
}

export default function RoomExcelImport({ onImportComplete }) {
  const { settings } = useSettings();
  const dark = settings?.darkMode;

  // ── Theme tokens (mirrors the rest of the admin panel's light/dark palette) ──
  const ACCENT       = settings?.accentColor || '#9cb56f';
  const DARKBTN_BG   = dark ? '#282827' : '#1a3a1a';
  const CARD         = dark ? '#1c1c1c' : '#ffffff';
  const CARD2        = dark ? '#282827' : '#f9fafb';
  const GUIDE_BG      = dark ? 'rgba(200,240,110,0.08)' : '#f0f7e6';
  const BORDER        = dark ? '#2a2a28' : '#e5e7eb';
  const CELL_BORDER   = dark ? '#242422' : '#f3f4f6';
  const TEXT          = dark ? '#f0f0f0' : '#111827';
  const MUTED         = dark ? '#9ca3af' : '#9ca3af';
  const ROW_ALT        = dark ? '#202020' : '#fafafa';
  const DROPZONE_BG    = dark ? '#141414' : '#fafafa';
  const DROPZONE_HOVER = dark ? 'rgba(200,240,110,0.06)' : '#f0f7e6';

  const ERROR         = '#ef4444';
  const ERROR_BG       = dark ? 'rgba(239,68,68,0.12)' : '#fef2f2';
  const ERROR_BORDER   = dark ? 'rgba(239,68,68,0.35)' : '#fecaca';
  const WARN           = '#f59e0b';
  const WARN_TEXT       = dark ? '#fbbf24' : '#92400e';
  const WARN_BG        = dark ? 'rgba(245,158,11,0.12)' : '#fffbeb';
  const WARN_BORDER     = dark ? 'rgba(245,158,11,0.35)' : '#fde68a';
  const SUCCESS        = dark ? '#4ade80' : '#22c55e';
  const SUCCESS_BG      = dark ? 'rgba(34,197,94,0.12)' : '#f0fdf4';
  const SUCCESS_BORDER  = dark ? 'rgba(34,197,94,0.35)' : '#bbf7d0';

  const [step, setStep]           = useState('idle'); // idle | preview | importing | done
  const [rows, setRows]           = useState([]);
  const [rowErrors, setRowErrors] = useState({});
  const [fileName, setFileName]   = useState('');
  const [progress, setProgress]   = useState(0);
  const [results, setResults]     = useState({ success: 0, skipped: 0, failed: 0 });
  const [dragOver, setDragOver]   = useState(false);
  const fileRef = useRef();

  const parseFile = (file) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const wb = XLSX.read(e.target.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (raw.length === 0) return alert('The file is empty.');

      // Normalize keys (trim + lowercase for matching)
      const normalized = raw.map(r => {
        const obj = {};
        Object.keys(r).forEach(k => { obj[k.trim()] = String(r[k]).trim(); });
        return obj;
      });

      // Validate each row
      const errs = {};
      normalized.forEach((row, i) => {
        const e = validateRow(row);
        if (e.length) errs[i] = e;
      });

      setRows(normalized);
      setRowErrors(errs);
      setStep('preview');
    };
    reader.readAsBinaryString(file);
  };

  const handleFile = (file) => {
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext))
      return alert('Please upload an .xlsx, .xls, or .csv file.');
    parseFile(file);
  };

  const handleImport = async () => {
    setStep('importing');
    let success = 0, skipped = 0, failed = 0;
    const total = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (rowErrors[i]) { failed++; setProgress(Math.round(((i + 1) / total) * 100)); continue; }

      try {
        // Check for duplicate room number
        const q = query(collection(db, 'rooms'), where('roomNumber', '==', row.roomNumber));
        const snap = await getDocs(q);
        if (!snap.empty) { skipped++; setProgress(Math.round(((i + 1) / total) * 100)); continue; }

        await addDoc(collection(db, 'rooms'), {
          roomNumber:  row.roomNumber,
          // Normalized to canonical Title Case regardless of how it was typed
          // in the spreadsheet, so category matching elsewhere never breaks.
          type:        normalizeType(row.type),
          price:       Number(row.price),
          capacity:    Number(row.capacity),
          status:      String(row.status).toLowerCase(),
          amenities:   row.amenities  || '',
          description: row.description || '',
          floor:       row.floor       || '',
          createdAt:   serverTimestamp(),
          source:      'excel_import',
        });
        success++;
      } catch (err) {
        console.error('Import error row', i, err);
        failed++;
      }

      setProgress(Math.round(((i + 1) / total) * 100));
    }

    setResults({ success, skipped, failed });
    setStep('done');
    if (onImportComplete) onImportComplete();
  };

  const reset = () => {
    setStep('idle'); setRows([]); setRowErrors({});
    setFileName(''); setProgress(0); setResults({ success: 0, skipped: 0, failed: 0 });
  };

  const validCount   = rows.filter((_, i) => !rowErrors[i]).length;
  const invalidCount = Object.keys(rowErrors).length;

  return (
    <div style={{ fontFamily: "'Poppins', sans-serif", maxWidth: '900px' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: TEXT, margin: 0 }}>Import Rooms from Excel</h2>
          <p style={{ fontSize: '12px', color: MUTED, margin: '4px 0 0' }}>
            Upload an .xlsx file to bulk-add rooms. Duplicates are skipped automatically.
          </p>
        </div>
        <DownloadTemplate darkBtnBg={DARKBTN_BG} accent={ACCENT} />
      </div>

      {/* Column guide */}
      <div style={{ background: GUIDE_BG, borderRadius: '10px', padding: '12px 16px', marginBottom: '12px', fontSize: '11px' }}>
        <div style={{ fontWeight: '600', color: dark ? ACCENT : DARKBTN_BG, marginBottom: '6px' }}>📋 Expected Columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {REQUIRED_COLS.map(c => (
            <span key={c} style={{ background: DARKBTN_BG, color: ACCENT, borderRadius: '6px', padding: '2px 8px', fontWeight: '600' }}>{c} *</span>
          ))}
          {OPTIONAL_COLS.map(c => (
            <span key={c} style={{ background: CARD2, color: dark ? '#c7c7c0' : '#374151', borderRadius: '6px', padding: '2px 8px' }}>{c}</span>
          ))}
        </div>
        <div style={{ color: MUTED, marginTop: '6px' }}>
          Status values: <strong style={{ color: TEXT }}>vacant · available · occupied · maintenance · not ready</strong>
        </div>
      </div>

      {/* Capitalization rules */}
      <div style={{ background: GUIDE_BG, borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '11px' }}>
        <div style={{ fontWeight: '600', color: dark ? ACCENT : DARKBTN_BG, marginBottom: '6px' }}>🔤 Capitalization Rules</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', color: MUTED }}>
          <div>
            <strong style={{ color: TEXT }}>Type</strong> — capitalization doesn't matter. <em>deluxe</em>, <em>Deluxe</em>, and <em>DELUXE</em> all work and are automatically saved as <strong style={{ color: TEXT }}>Deluxe</strong>. Must match one of: {TYPE_OPTIONS.join(', ')}.
          </div>
          <div>
            <strong style={{ color: TEXT }}>Status</strong> — also not case-sensitive. Always saved in lowercase automatically.
          </div>
          <div>
            <strong style={{ color: TEXT }}>Room Number, Amenities, Description</strong> — saved exactly as typed, so capitalize these however you want guests to see them.
          </div>
        </div>
      </div>

      {/* STEP: idle — dropzone */}
      {step === 'idle' && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current.click()}
          style={{
            border: `2px dashed ${dragOver ? DARKBTN_BG : BORDER}`,
            borderRadius: '14px',
            padding: '48px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? DROPZONE_HOVER : DROPZONE_BG,
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <div style={{ fontWeight: '600', fontSize: '14px', color: TEXT, marginBottom: '4px' }}>
            Drop your Excel file here
          </div>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '16px' }}>
            or click to browse — .xlsx, .xls, .csv supported
          </div>
          <span style={{
            background: DARKBTN_BG, color: ACCENT,
            borderRadius: '8px', padding: '8px 20px',
            fontSize: '12px', fontWeight: '600',
          }}>
            Choose File
          </span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => handleFile(e.target.files[0])} />
        </div>
      )}

      {/* STEP: preview */}
      {step === 'preview' && (
        <div>
          {/* Summary bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: TEXT }}>{rows.length}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Total rows</div>
            </div>
            <div style={{ background: SUCCESS_BG, border: `1px solid ${SUCCESS_BORDER}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: SUCCESS }}>{validCount}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Ready to import</div>
            </div>
            <div style={{ background: ERROR_BG, border: `1px solid ${ERROR_BORDER}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: ERROR }}>{invalidCount}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Rows with errors</div>
            </div>
            <div style={{ background: CARD2, border: `1px solid ${BORDER}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '20px' }}>📄</div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: TEXT, wordBreak: 'break-all' }}>{fileName}</div>
                <div style={{ fontSize: '10px', color: MUTED }}>Uploaded file</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: CARD2, position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: MUTED, fontWeight: '600', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>#</th>
                    {ALL_COLS.map(c => (
                      <th key={c} style={{ padding: '10px 12px', textAlign: 'left', color: MUTED, fontWeight: '600', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap' }}>
                        {c}{REQUIRED_COLS.includes(c) ? ' *' : ''}
                      </th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: MUTED, fontWeight: '600', borderBottom: `1px solid ${BORDER}` }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const errs = rowErrors[i];
                    return (
                      <tr key={i} style={{ background: errs ? ERROR_BG : (i % 2 === 0 ? CARD : ROW_ALT) }}>
                        <td style={{ padding: '9px 12px', color: MUTED, borderBottom: `1px solid ${CELL_BORDER}` }}>{i + 1}</td>
                        {ALL_COLS.map(c => (
                          <td key={c} style={{ padding: '9px 12px', color: TEXT, borderBottom: `1px solid ${CELL_BORDER}`, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[c] || <span style={{ color: MUTED }}>—</span>}
                          </td>
                        ))}
                        <td style={{ padding: '9px 12px', borderBottom: `1px solid ${CELL_BORDER}` }}>
                          {errs
                            ? <Badge color={ERROR} bg={ERROR_BG}>⚠ {errs[0]}</Badge>
                            : <Badge color={SUCCESS} bg={SUCCESS_BG}>✓ Valid</Badge>
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {invalidCount > 0 && (
            <div style={{ background: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: WARN_TEXT }}>
              ⚠ <strong>{invalidCount} row{invalidCount > 1 ? 's' : ''}</strong> have errors and will be skipped during import. Fix the Excel file and re-upload to include them.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={reset} style={{
              padding: '10px 20px', borderRadius: '8px', border: `1px solid ${BORDER}`,
              background: CARD, color: TEXT, fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
            }}>
              ← Back
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: validCount === 0 ? BORDER : DARKBTN_BG,
                color: validCount === 0 ? MUTED : ACCENT,
                fontSize: '13px', fontWeight: '700',
                cursor: validCount === 0 ? 'not-allowed' : 'pointer',
                fontFamily: "'Poppins', sans-serif",
              }}>
              Import {validCount} Room{validCount !== 1 ? 's' : ''} →
            </button>
          </div>
        </div>
      )}

      {/* STEP: importing */}
      {step === 'importing' && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⏳</div>
          <div style={{ fontWeight: '700', fontSize: '16px', color: TEXT, marginBottom: '8px' }}>
            Importing rooms...
          </div>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '24px' }}>
            Please don't close this page.
          </div>
          <div style={{ background: BORDER, borderRadius: '999px', height: '8px', maxWidth: '320px', margin: '0 auto' }}>
            <div style={{
              background: DARKBTN_BG, height: '8px', borderRadius: '999px',
              width: `${progress}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: dark ? ACCENT : DARKBTN_BG, marginTop: '10px' }}>{progress}%</div>
        </div>
      )}

      {/* STEP: done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ width: '64px', height: '64px', background: GUIDE_BG, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px' }}>✅</div>
          <div style={{ fontWeight: '700', fontSize: '18px', color: TEXT, marginBottom: '6px' }}>Import Complete</div>
          <div style={{ fontSize: '12px', color: MUTED, marginBottom: '28px' }}>Here's a summary of what happened:</div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '28px', flexWrap: 'wrap' }}>
            <div style={{ background: SUCCESS_BG, border: `1px solid ${SUCCESS_BORDER}`, borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: SUCCESS }}>{results.success}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Rooms added</div>
            </div>
            <div style={{ background: WARN_BG, border: `1px solid ${WARN_BORDER}`, borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: WARN }}>{results.skipped}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Duplicates skipped</div>
            </div>
            <div style={{ background: ERROR_BG, border: `1px solid ${ERROR_BORDER}`, borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: ERROR }}>{results.failed}</div>
              <div style={{ fontSize: '11px', color: MUTED }}>Failed</div>
            </div>
          </div>

          <button onClick={reset} style={{
            background: DARKBTN_BG, color: ACCENT, border: 'none',
            borderRadius: '10px', padding: '12px 28px',
            fontSize: '13px', fontWeight: '700',
            cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
          }}>
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}