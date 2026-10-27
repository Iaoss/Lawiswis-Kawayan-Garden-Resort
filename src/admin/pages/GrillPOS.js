import React, { useEffect, useMemo, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, serverTimestamp, updateDoc, where, writeBatch,
} from 'firebase/firestore';
import { auth, db } from '../../firebase/firebase';
import PageLayout from '../components/PageLayout';
import { useSettings } from '../components/SettingsContext';
import { useStaffAccess } from '../lib/useStaffAccess';
import {
  IDENTIFIER_TAGS, MAX_IDENTIFIER_LENGTH, SAMPLE_MENU, addItem, changeQty, dayKey, formatPeso,
  hasTag, itemCount, lineTotal, orderTotal, salesSummary, toggleTag, validateOrder,
} from '../../lib/grillPos';
import './grill-pos.css';

const emptyDraft = () => ({ id: null, orderNo: null, items: [], identifier: '', status: 'unpaid', note: '' });
const emptyProduct = { name: '', price: '', category: 'Ihaw' };

const toDate = value => (value?.toDate ? value.toDate() : value ? new Date(value) : null);
const timeLabel = value => {
  const date = toDate(value);
  return date ? date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }) : '';
};

export default function GrillPOS() {
  const { settings } = useSettings();
  const access = useStaffAccess();
  const isAdmin = String(access.user?.role || '').toLowerCase() === 'admin';
  const dark = settings?.darkMode;
  const C = {
    bg: dark ? '#020b09' : '#f4f6f4',
    card: dark ? '#1c1c1c' : '#fff',
    card2: dark ? '#282827' : '#f9fafb',
    border: dark ? '#2a2a28' : '#e5e7eb',
    text: dark ? '#f0f0f0' : '#111827',
    muted: dark ? '#9ca3af' : '#6b7280',
    accent: settings?.accentColor || '#9cb56f',
    paid: '#15803d', paidBg: dark ? '#0f2e1a' : '#dcfce7',
    unpaid: '#b45309', unpaidBg: dark ? '#3a2408' : '#fef3c7',
  };

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(emptyDraft);
  const [category, setCategory] = useState('All');
  const [orderFilter, setOrderFilter] = useState('unpaid');
  const [notice, setNotice] = useState(null);
  const [saving, setSaving] = useState(false);
  const [managing, setManaging] = useState(false);
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProductId, setEditingProductId] = useState(null);
  const today = dayKey();

  // Menu and today's orders stay live, so every staff device sees the same thing.
  useEffect(() => onSnapshot(collection(db, 'grillProducts'), snapshot => {
    setProducts(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (a.category || '').localeCompare(b.category || '') || (a.name || '').localeCompare(b.name || '')));
    setLoading(false);
  }, error => { setNotice({ type: 'error', text: error.message }); setLoading(false); }), []);

  useEffect(() => onSnapshot(query(collection(db, 'grillOrders'), where('dayKey', '==', today)), snapshot => {
    setOrders(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.orderNo || 0) - (a.orderNo || 0)));
  }, error => setNotice({ type: 'error', text: error.message })), [today]);

  useEffect(() => {
    if (!notice || notice.type === 'error') return undefined;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  const menu = products.filter(product => product.available !== false);
  const categories = ['All', ...new Set(menu.map(product => product.category || 'Other'))];
  const shownProducts = category === 'All' ? menu : menu.filter(product => (product.category || 'Other') === category);
  const qtyInDraft = id => draft.items.find(item => item.productId === id)?.qty || 0;
  const total = orderTotal(draft.items);
  const summary = useMemo(() => salesSummary(orders), [orders]);
  const shownOrders = orderFilter === 'all' ? orders : orders.filter(order => order.status === orderFilter);

  const update = patch => setDraft(previous => ({ ...previous, ...patch }));

  const saveOrder = async () => {
    const error = validateOrder(draft);
    if (error) { setNotice({ type: 'error', text: error }); return; }
    setSaving(true);
    const values = {
      identifier: draft.identifier.trim(),
      items: draft.items,
      total,
      status: draft.status,
      note: draft.note.trim().slice(0, 200),
      updatedAt: serverTimestamp(),
      paidAt: draft.status === 'paid' ? serverTimestamp() : null,
    };
    try {
      if (draft.id) {
        await updateDoc(doc(db, 'grillOrders', draft.id), values);
        setNotice({ type: 'success', text: `Order #${draft.orderNo} updated.` });
      } else {
        const orderNo = orders.reduce((max, order) => Math.max(max, order.orderNo || 0), 0) + 1;
        await addDoc(collection(db, 'grillOrders'), {
          ...values,
          orderNo,
          dayKey: today,
          createdAt: serverTimestamp(),
          staffUid: auth.currentUser?.uid || '',
          staffName: access.user?.name || auth.currentUser?.email || '',
        });
        setNotice({ type: 'success', text: `Order #${orderNo} saved for "${values.identifier}".` });
      }
      setDraft(emptyDraft());
    } catch (saveError) {
      setNotice({ type: 'error', text: saveError.message || 'Could not save the order.' });
    } finally {
      setSaving(false);
    }
  };

  const setOrderStatus = async (order, status) => {
    try {
      await updateDoc(doc(db, 'grillOrders', order.id), {
        status, paidAt: status === 'paid' ? serverTimestamp() : null, updatedAt: serverTimestamp(),
      });
      if (draft.id === order.id) update({ status });
      setNotice({ type: 'success', text: `#${order.orderNo} ${order.identifier} marked ${status}.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const openOrder = order => {
    setDraft({
      id: order.id, orderNo: order.orderNo, items: order.items || [], identifier: order.identifier || '',
      status: order.status || 'unpaid', note: order.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const deleteOrder = async order => {
    if (!window.confirm(`Delete order #${order.orderNo} (${order.identifier})?`)) return;
    try {
      await deleteDoc(doc(db, 'grillOrders', order.id));
      if (draft.id === order.id) setDraft(emptyDraft());
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  // ── Menu management (admins only; prices are protected by the rules too) ──
  const saveProduct = async event => {
    event.preventDefault();
    const name = productForm.name.trim();
    const price = Number(productForm.price);
    if (!name || name.length > 40) { setNotice({ type: 'error', text: 'Enter a product name (up to 40 characters).' }); return; }
    if (!Number.isFinite(price) || price < 0 || price > 100000) { setNotice({ type: 'error', text: 'Enter a valid price.' }); return; }
    const values = { name, price, category: productForm.category.trim().slice(0, 20) || 'Other', updatedAt: serverTimestamp() };
    try {
      if (editingProductId) await updateDoc(doc(db, 'grillProducts', editingProductId), values);
      else await addDoc(collection(db, 'grillProducts'), { ...values, available: true, createdAt: serverTimestamp() });
      setProductForm(emptyProduct);
      setEditingProductId(null);
      setNotice({ type: 'success', text: `${name} saved.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const loadSampleMenu = async () => {
    try {
      const batch = writeBatch(db);
      SAMPLE_MENU.forEach(item => batch.set(doc(collection(db, 'grillProducts')), {
        ...item, available: true, createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      }));
      await batch.commit();
      setNotice({ type: 'success', text: 'Sample menu added. Edit the prices to match yours.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const toggleAvailable = product => updateDoc(doc(db, 'grillProducts', product.id), {
    available: product.available === false, updatedAt: serverTimestamp(),
  }).catch(error => setNotice({ type: 'error', text: error.message }));

  const removeProduct = async product => {
    if (!window.confirm(`Remove ${product.name} from the menu?`)) return;
    await deleteDoc(doc(db, 'grillProducts', product.id)).catch(error => setNotice({ type: 'error', text: error.message }));
  };

  // ── Styles ──
  const card = { background: C.card, border: `1px solid ${C.border}`, borderRadius: '10px' };
  const input = {
    width: '100%', boxSizing: 'border-box', background: C.card2, border: `1px solid ${C.border}`,
    borderRadius: '8px', padding: '10px', color: C.text, fontSize: '13px', outline: 'none', fontFamily: 'inherit',
  };
  const pill = active => ({
    border: `1px solid ${active ? C.accent : C.border}`, background: active ? C.accent : C.card,
    color: active ? '#10200e' : C.text, borderRadius: '999px', padding: '6px 12px', fontSize: '12px',
    fontWeight: active ? 700 : 500, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  });
  const smallBtn = (color = C.text) => ({
    background: 'transparent', color, border: `1px solid ${C.border}`, borderRadius: '6px',
    padding: '6px 9px', fontSize: '11px', cursor: 'pointer', fontFamily: 'inherit',
  });
  const qtyBtn = {
    width: '30px', height: '30px', borderRadius: '8px', border: `1px solid ${C.border}`, background: C.card2,
    color: C.text, fontSize: '16px', fontWeight: 700, cursor: 'pointer', lineHeight: 1,
  };
  const statusBadge = status => ({
    background: status === 'paid' ? C.paidBg : C.unpaidBg, color: status === 'paid' ? C.paid : C.unpaid,
    borderRadius: '999px', padding: '3px 9px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase',
  });

  return (
    <PageLayout>
      <main style={{ minHeight: '100vh', padding: '20px 16px', background: C.bg, color: C.text, fontFamily: "'Poppins', sans-serif" }}>
        <div className="grill-no-print" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
          <div>
            <h1 style={{ margin: '0 0 4px', fontSize: '20px' }}>Ihaw-Ihaw POS</h1>
            <p style={{ margin: 0, color: C.muted, fontSize: '12px' }}>Tap a product to add it. The receipt is on the right.</p>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {[
              ['Orders today', summary.count, C.text],
              ['Paid', formatPeso(summary.paid), C.paid],
              ['Unpaid', formatPeso(summary.unpaid), C.unpaid],
            ].map(([label, value, color]) => (
              <div key={label} style={{ ...card, padding: '8px 14px', minWidth: '90px' }}>
                <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
                <div style={{ fontSize: '16px', fontWeight: 700, color }}>{value}</div>
              </div>
            ))}
            {isAdmin && (
              <button type="button" onClick={() => setManaging(value => !value)} style={{ ...pill(managing), alignSelf: 'center' }}>
                {managing ? 'Done editing menu' : 'Edit menu'}
              </button>
            )}
          </div>
        </div>

        {notice && (
          <div role="status" className="grill-no-print" style={{ marginBottom: '12px', padding: '10px 12px', borderRadius: '8px', fontSize: '12px', color: notice.type === 'error' ? '#991b1b' : '#166534', background: notice.type === 'error' ? '#fee2e2' : '#dcfce7' }}>
            {notice.text}
          </div>
        )}

        {isAdmin && managing && (
          <section className="grill-no-print" style={{ ...card, padding: '16px', marginBottom: '16px' }}>
            <h2 style={{ margin: '0 0 12px', fontSize: '14px' }}>{editingProductId ? 'Edit product' : 'Add product'}</h2>
            <form onSubmit={saveProduct} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', alignItems: 'end' }}>
              <input aria-label="Product name" placeholder="Name (e.g. Pork BBQ)" maxLength={40} value={productForm.name} onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))} style={input} />
              <input aria-label="Price" type="number" min="0" step="0.01" placeholder="Price ₱" value={productForm.price} onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))} style={input} />
              <input aria-label="Category" list="grill-categories" placeholder="Category" maxLength={20} value={productForm.category} onChange={e => setProductForm(p => ({ ...p, category: e.target.value }))} style={input} />
              <datalist id="grill-categories">{[...new Set(products.map(p => p.category).filter(Boolean))].map(c => <option key={c} value={c} />)}</datalist>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button type="submit" style={{ ...pill(true), borderRadius: '8px', padding: '10px 14px' }}>{editingProductId ? 'Save' : 'Add'}</button>
                {editingProductId && <button type="button" onClick={() => { setEditingProductId(null); setProductForm(emptyProduct); }} style={{ ...pill(false), borderRadius: '8px', padding: '10px 14px' }}>Cancel</button>}
              </div>
            </form>
            {products.length === 0 && (
              <button type="button" onClick={loadSampleMenu} style={{ ...smallBtn(), marginTop: '12px' }}>Load a sample ihaw-ihaw menu</button>
            )}
            {products.length > 0 && (
              <div style={{ marginTop: '14px', display: 'grid', gap: '6px' }}>
                {products.map(product => (
                  <div key={product.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: C.card2, borderRadius: '8px', opacity: product.available === false ? 0.55 : 1 }}>
                    <span style={{ flex: 1, minWidth: 0, fontSize: '13px' }}>
                      <strong>{product.name}</strong> <span style={{ color: C.muted, fontSize: '11px' }}>· {product.category}</span>
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '13px' }}>{formatPeso(product.price)}</span>
                    <button type="button" style={smallBtn()} onClick={() => { setEditingProductId(product.id); setProductForm({ name: product.name || '', price: String(product.price ?? ''), category: product.category || '' }); }}>Edit</button>
                    <button type="button" style={smallBtn()} onClick={() => toggleAvailable(product)}>{product.available === false ? 'Show' : 'Sold out'}</button>
                    <button type="button" style={smallBtn('#b91c1c')} onClick={() => removeProduct(product)}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        <div className="grill-pos">
          {/* ── Products ── */}
          <section className="grill-no-print" aria-label="Products">
            <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '10px' }}>
              {categories.map(name => (
                <button key={name} type="button" onClick={() => setCategory(name)} style={pill(category === name)}>{name}</button>
              ))}
            </div>
            {loading ? (
              <p style={{ color: C.muted, fontSize: '13px' }}>Loading menu…</p>
            ) : menu.length === 0 ? (
              <div style={{ ...card, padding: '24px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>
                No products yet. {isAdmin ? 'Tap "Edit menu" to add products or load a sample menu.' : 'Ask an admin to add the menu.'}
              </div>
            ) : (
              <div className="grill-products">
                {shownProducts.map(product => {
                  const qty = qtyInDraft(product.id);
                  return (
                    <button
                      key={product.id}
                      type="button"
                      className="grill-product"
                      onClick={() => update({ items: addItem(draft.items, product) })}
                      aria-label={`Add ${product.name}, ${formatPeso(product.price)}${qty ? `, ${qty} in order` : ''}`}
                      style={{ background: qty ? (dark ? '#1f2a14' : '#f3f8ea') : C.card, border: `1.5px solid ${qty ? C.accent : C.border}`, color: C.text }}
                    >
                      <div style={{ fontSize: '13px', fontWeight: 600, lineHeight: 1.3, paddingRight: qty ? '26px' : 0 }}>{product.name}</div>
                      <div style={{ fontSize: '15px', fontWeight: 700, color: dark ? C.accent : '#3f6212', marginTop: '8px' }}>{formatPeso(product.price)}</div>
                      {qty > 0 && (
                        <span style={{ position: 'absolute', top: '8px', right: '8px', minWidth: '22px', height: '22px', borderRadius: '999px', background: C.accent, color: '#10200e', fontSize: '11px', fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 6px' }}>{qty}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── Receipt ── */}
          <aside className="grill-receipt-wrap" aria-label="Receipt">
            <div className="grill-receipt" style={{ ...card, padding: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h2 style={{ margin: 0, fontSize: '15px' }}>{draft.id ? `Order #${draft.orderNo}` : 'New order'}</h2>
                <span style={statusBadge(draft.status)}>{draft.status}</span>
              </div>
              <div style={{ fontSize: '11px', color: C.muted, marginBottom: '12px' }}>Lawiswis Kawayan · Ihaw-Ihaw · {new Date().toLocaleDateString('en-PH')}</div>

              {/* Customer identifier */}
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: C.muted, marginBottom: '6px' }} htmlFor="grill-identifier">
                Who is this? (so staff can find them)
              </label>
              <input
                id="grill-identifier"
                value={draft.identifier}
                maxLength={MAX_IDENTIFIER_LENGTH}
                placeholder='e.g. "Guy in cap, red shirt"'
                onChange={e => update({ identifier: e.target.value })}
                style={{ ...input, fontWeight: 600 }}
              />
              <div className="grill-no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: '5px', margin: '8px 0 14px' }}>
                {IDENTIFIER_TAGS.map(tag => {
                  const on = hasTag(draft.identifier, tag);
                  return (
                    <button key={tag} type="button" aria-pressed={on} onClick={() => update({ identifier: toggleTag(draft.identifier, tag) })}
                      style={{ ...pill(on), padding: '4px 9px', fontSize: '11px' }}>
                      {tag}
                    </button>
                  );
                })}
              </div>

              {/* Lines */}
              <div style={{ borderTop: `1px dashed ${C.border}`, borderBottom: `1px dashed ${C.border}`, padding: '8px 0', minHeight: '80px' }}>
                {draft.items.length === 0 ? (
                  <p style={{ color: C.muted, fontSize: '12px', textAlign: 'center', margin: '24px 0' }}>Tap products to add them here.</p>
                ) : draft.items.map(item => (
                  <div key={item.productId} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{item.name}</div>
                      <div style={{ fontSize: '11px', color: C.muted }}>{formatPeso(item.price)} × {item.qty}</div>
                    </div>
                    <div className="grill-no-print" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <button type="button" aria-label={`One less ${item.name}`} style={qtyBtn} onClick={() => update({ items: changeQty(draft.items, item.productId, -1) })}>−</button>
                      <span style={{ minWidth: '18px', textAlign: 'center', fontWeight: 700, fontSize: '13px' }}>{item.qty}</span>
                      <button type="button" aria-label={`One more ${item.name}`} style={qtyBtn} onClick={() => update({ items: changeQty(draft.items, item.productId, 1) })}>+</button>
                    </div>
                    <div style={{ width: '64px', textAlign: 'right', fontWeight: 700, fontSize: '13px' }}>{formatPeso(lineTotal(item))}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0' }}>
                <span style={{ fontSize: '12px', color: C.muted }}>Total · {itemCount(draft.items)} item{itemCount(draft.items) === 1 ? '' : 's'}</span>
                <span style={{ fontSize: '24px', fontWeight: 800 }}>{formatPeso(total)}</span>
              </div>

              <input className="grill-no-print" aria-label="Note" placeholder="Note (optional, e.g. extra spicy)" maxLength={200} value={draft.note} onChange={e => update({ note: e.target.value })} style={{ ...input, marginBottom: '12px' }} />
              {draft.note && <div style={{ fontSize: '11px', color: C.muted, marginBottom: '10px' }}>Note: {draft.note}</div>}

              {/* Status */}
              <div className="grill-no-print" role="radiogroup" aria-label="Payment status" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginBottom: '12px' }}>
                {[['unpaid', 'Unpaid', C.unpaid, C.unpaidBg], ['paid', 'Paid', C.paid, C.paidBg]].map(([value, label, color, bg]) => {
                  const on = draft.status === value;
                  return (
                    <button key={value} type="button" role="radio" aria-checked={on} onClick={() => update({ status: value })}
                      style={{ padding: '10px', borderRadius: '8px', border: `2px solid ${on ? color : C.border}`, background: on ? bg : C.card, color: on ? color : C.muted, fontWeight: 700, fontSize: '13px', cursor: 'pointer', fontFamily: 'inherit' }}>
                      {label}
                    </button>
                  );
                })}
              </div>

              <div className="grill-no-print" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '6px' }}>
                <button type="button" onClick={saveOrder} disabled={saving}
                  style={{ background: C.accent, color: '#10200e', border: 0, borderRadius: '8px', padding: '12px', fontWeight: 800, fontSize: '14px', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit' }}>
                  {saving ? 'Saving…' : draft.id ? 'Update order' : 'Save order'}
                </button>
                <button type="button" onClick={() => window.print()} disabled={!draft.items.length} style={{ ...smallBtn(), padding: '0 12px' }}>Print</button>
                <button type="button" onClick={() => setDraft(emptyDraft())} style={{ ...smallBtn(), padding: '0 12px' }}>{draft.id ? 'Close' : 'Clear'}</button>
              </div>
            </div>
          </aside>
        </div>

        {/* ── Today's orders ── */}
        <section className="grill-no-print" style={{ marginTop: '24px' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '10px' }}>
            <h2 style={{ margin: 0, fontSize: '15px' }}>Today's orders</h2>
            <div style={{ display: 'flex', gap: '6px' }}>
              {[['unpaid', 'Unpaid'], ['paid', 'Paid'], ['all', 'All']].map(([value, label]) => (
                <button key={value} type="button" onClick={() => setOrderFilter(value)} style={pill(orderFilter === value)}>
                  {label} ({value === 'all' ? orders.length : orders.filter(order => order.status === value).length})
                </button>
              ))}
            </div>
          </div>
          {shownOrders.length === 0 ? (
            <div style={{ ...card, padding: '20px', textAlign: 'center', color: C.muted, fontSize: '13px' }}>No {orderFilter === 'all' ? '' : orderFilter} orders yet today.</div>
          ) : (
            <div className="grill-orders">
              {shownOrders.map(order => (
                <article key={order.id} style={{ ...card, padding: '12px', borderColor: draft.id === order.id ? C.accent : C.border }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontSize: '11px', color: C.muted }}>#{order.orderNo} · {timeLabel(order.createdAt)}</span>
                    <span style={statusBadge(order.status)}>{order.status}</span>
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 700, margin: '6px 0 4px' }}>{order.identifier}</div>
                  <div style={{ fontSize: '11px', color: C.muted, lineHeight: 1.5 }}>
                    {(order.items || []).map(item => `${item.qty}× ${item.name}`).join(', ')}
                  </div>
                  {order.note && <div style={{ fontSize: '11px', color: C.muted, fontStyle: 'italic', marginTop: '2px' }}>{order.note}</div>}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '10px', gap: '6px' }}>
                    <strong style={{ fontSize: '15px' }}>{formatPeso(order.total)}</strong>
                    <div style={{ display: 'flex', gap: '5px' }}>
                      <button type="button" style={smallBtn()} onClick={() => openOrder(order)}>Open</button>
                      {order.status === 'paid'
                        ? <button type="button" style={smallBtn(C.unpaid)} onClick={() => setOrderStatus(order, 'unpaid')}>Unpaid</button>
                        : <button type="button" style={{ ...smallBtn(C.paid), fontWeight: 700 }} onClick={() => setOrderStatus(order, 'paid')}>Mark paid</button>}
                      {isAdmin && <button type="button" aria-label={`Delete order ${order.orderNo}`} style={smallBtn('#b91c1c')} onClick={() => deleteOrder(order)}>✕</button>}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </PageLayout>
  );
}
