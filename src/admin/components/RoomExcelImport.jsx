import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { collection, addDoc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/firebase';

const C = {
  dark:       '#1a3a1a',
  accent:     '#c8f06e',
  accentSoft: '#f0f7e6',
  border:     '#e5e7eb',
  muted:      '#9ca3af',
  text:       '#111827',
  error:      '#ef4444',
  errorBg:    '#fef2f2',
  warn:       '#f59e0b',
  warnBg:     '#fffbeb',
  success:    '#22c55e',
  successBg:  '#f0fdf4',
};

// Expected columns in the Excel file
const REQUIRED_COLS = ['roomNumber', 'type', 'price', 'capacity', 'status'];
const OPTIONAL_COLS = ['amenities', 'description', 'floor'];
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];

const STATUS_OPTIONS = ['available', 'occupied', 'maintenance', 'not ready', 'vacant'];
const TYPE_OPTIONS   = ['Standard', 'Deluxe', 'Suite', 'Family', 'Single', 'Double', 'Twin'];

function Badge({ color, bg, children }) {
  return (
    <span style={{
      background: bg, color, borderRadius: '999px',
      fontSize: '10px', fontWeight: '600',
      padding: '2px 8px', whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

function DownloadTemplate() {
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
      background: C.dark, color: C.accent,
      border: 'none', borderRadius: '8px',
      padding: '8px 16px', fontSize: '12px', fontWeight: '600',
      cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
    }}>
      ⬇ Download Template
    </button>
  );
}

function validateRow(row, idx) {
  const errors = [];
  if (!row.roomNumber) errors.push('Room number is required');
  if (!row.type) errors.push('Type is required');
  if (!row.price || isNaN(Number(row.price))) errors.push('Price must be a number');
  if (!row.capacity || isNaN(Number(row.capacity))) errors.push('Capacity must be a number');
  if (!row.status) errors.push('Status is required');
  if (row.status && !STATUS_OPTIONS.includes(String(row.status).toLowerCase()))
    errors.push(`Status must be one of: ${STATUS_OPTIONS.join(', ')}`);
  return errors;
}

export default function RoomExcelImport({ onImportComplete }) {
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
        const e = validateRow(row, i);
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
          type:        row.type,
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
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: C.text, margin: 0 }}>Import Rooms from Excel</h2>
          <p style={{ fontSize: '12px', color: C.muted, margin: '4px 0 0' }}>
            Upload an .xlsx file to bulk-add rooms. Duplicates are skipped automatically.
          </p>
        </div>
        <DownloadTemplate />
      </div>

      {/* Column guide */}
      <div style={{ background: C.accentSoft, borderRadius: '10px', padding: '12px 16px', marginBottom: '20px', fontSize: '11px' }}>
        <div style={{ fontWeight: '600', color: C.dark, marginBottom: '6px' }}>📋 Expected Columns</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {REQUIRED_COLS.map(c => (
            <span key={c} style={{ background: C.dark, color: C.accent, borderRadius: '6px', padding: '2px 8px', fontWeight: '600' }}>{c} *</span>
          ))}
          {OPTIONAL_COLS.map(c => (
            <span key={c} style={{ background: '#e5e7eb', color: '#374151', borderRadius: '6px', padding: '2px 8px' }}>{c}</span>
          ))}
        </div>
        <div style={{ color: C.muted, marginTop: '6px' }}>
          Status values: <strong>vacant · available · occupied · maintenance · not ready</strong>

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
            border: `2px dashed ${dragOver ? C.dark : C.border}`,
            borderRadius: '14px',
            padding: '48px',
            textAlign: 'center',
            cursor: 'pointer',
            background: dragOver ? C.accentSoft : '#fafafa',
            transition: 'all 0.2s',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>📂</div>
          <div style={{ fontWeight: '600', fontSize: '14px', color: C.text, marginBottom: '4px' }}>
            Drop your Excel file here
          </div>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '16px' }}>
            or click to browse — .xlsx, .xls, .csv supported
          </div>
          <span style={{
            background: C.dark, color: C.accent,
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
            <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: C.text }}>{rows.length}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Total rows</div>
            </div>
            <div style={{ background: C.successBg, border: '1px solid #bbf7d0', borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: C.success }}>{validCount}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Ready to import</div>
            </div>
            <div style={{ background: C.errorBg, border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '120px' }}>
              <div style={{ fontSize: '22px', fontWeight: '700', color: C.error }}>{invalidCount}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Rows with errors</div>
            </div>
            <div style={{ background: '#f9fafb', border: `1px solid ${C.border}`, borderRadius: '10px', padding: '12px 20px', flex: 1, minWidth: '160px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '20px' }}>📄</div>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '600', color: C.text, wordBreak: 'break-all' }}>{fileName}</div>
                <div style={{ fontSize: '10px', color: C.muted }}>Uploaded file</div>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
            <div style={{ overflowX: 'auto', maxHeight: '380px', overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', position: 'sticky', top: 0, zIndex: 1 }}>
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: C.muted, fontWeight: '600', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>#</th>
                    {ALL_COLS.map(c => (
                      <th key={c} style={{ padding: '10px 12px', textAlign: 'left', color: C.muted, fontWeight: '600', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap' }}>
                        {c}{REQUIRED_COLS.includes(c) ? ' *' : ''}
                      </th>
                    ))}
                    <th style={{ padding: '10px 12px', textAlign: 'left', color: C.muted, fontWeight: '600', borderBottom: `1px solid ${C.border}` }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const errs = rowErrors[i];
                    return (
                      <tr key={i} style={{ background: errs ? C.errorBg : (i % 2 === 0 ? '#fff' : '#fafafa') }}>
                        <td style={{ padding: '9px 12px', color: C.muted, borderBottom: `1px solid #f3f4f6` }}>{i + 1}</td>
                        {ALL_COLS.map(c => (
                          <td key={c} style={{ padding: '9px 12px', color: C.text, borderBottom: `1px solid #f3f4f6`, whiteSpace: 'nowrap', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {row[c] || <span style={{ color: C.muted }}>—</span>}
                          </td>
                        ))}
                        <td style={{ padding: '9px 12px', borderBottom: `1px solid #f3f4f6` }}>
                          {errs
                            ? <Badge color={C.error} bg={C.errorBg}>⚠ {errs[0]}</Badge>
                            : <Badge color={C.success} bg={C.successBg}>✓ Valid</Badge>
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
            <div style={{ background: C.warnBg, border: '1px solid #fde68a', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '12px', color: '#92400e' }}>
              ⚠ <strong>{invalidCount} row{invalidCount > 1 ? 's' : ''}</strong> have errors and will be skipped during import. Fix the Excel file and re-upload to include them.
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={reset} style={{
              padding: '10px 20px', borderRadius: '8px', border: `1px solid ${C.border}`,
              background: '#fff', color: C.text, fontSize: '13px', fontWeight: '500',
              cursor: 'pointer', fontFamily: "'Poppins', sans-serif",
            }}>
              ← Back
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0}
              style={{
                padding: '10px 24px', borderRadius: '8px', border: 'none',
                background: validCount === 0 ? '#e5e7eb' : C.dark,
                color: validCount === 0 ? C.muted : C.accent,
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
          <div style={{ fontWeight: '700', fontSize: '16px', color: C.text, marginBottom: '8px' }}>
            Importing rooms...
          </div>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '24px' }}>
            Please don't close this page.
          </div>
          <div style={{ background: '#e5e7eb', borderRadius: '999px', height: '8px', maxWidth: '320px', margin: '0 auto' }}>
            <div style={{
              background: C.dark, height: '8px', borderRadius: '999px',
              width: `${progress}%`, transition: 'width 0.3s ease',
            }} />
          </div>
          <div style={{ fontSize: '13px', fontWeight: '600', color: C.dark, marginTop: '10px' }}>{progress}%</div>
        </div>
      )}

      {/* STEP: done */}
      {step === 'done' && (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{ width: '64px', height: '64px', background: C.accentSoft, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '28px' }}>✅</div>
          <div style={{ fontWeight: '700', fontSize: '18px', color: C.text, marginBottom: '6px' }}>Import Complete</div>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '28px' }}>Here's a summary of what happened:</div>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginBottom: '28px', flexWrap: 'wrap' }}>
            <div style={{ background: C.successBg, border: '1px solid #bbf7d0', borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: C.success }}>{results.success}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Rooms added</div>
            </div>
            <div style={{ background: C.warnBg, border: '1px solid #fde68a', borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: C.warn }}>{results.skipped}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Duplicates skipped</div>
            </div>
            <div style={{ background: C.errorBg, border: '1px solid #fecaca', borderRadius: '12px', padding: '16px 28px' }}>
              <div style={{ fontSize: '28px', fontWeight: '700', color: C.error }}>{results.failed}</div>
              <div style={{ fontSize: '11px', color: C.muted }}>Failed</div>
            </div>
          </div>

          <button onClick={reset} style={{
            background: C.dark, color: C.accent, border: 'none',
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