import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Boxes, ListOrdered, Package, Wallet, ShieldCheck } from 'lucide-react';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const db = url && key ? createClient(url, key, { auth: { persistSession: true, storage: window.sessionStorage } }) : null;
const cop = (value: number | null | undefined) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value || 0);

type Product = { id: string; name: string; track_inventory: boolean; stock_quantity: number; low_stock_threshold: number };
type Movement = { id: string; product_id: string; movement_type: string; quantity: number; stock_before: number; stock_after: number; note: string | null; created_at: string };
type Session = { id: string; status: string; opening_amount_cop: number; closing_amount_cop: number | null; expected_amount_cop: number | null; difference_cop: number | null; opened_at: string; closed_at: string | null };
type CashMovement = { id: string; movement_type: string; amount_cop: number; description: string; created_at: string };

function Heading({ overline, title, detail, status }: { overline: string; title: string; detail: string; status: string }) {
  return <div className="page-heading"><div><div className="panel-kicker">{overline}</div><h1>{title}</h1><p>{detail}</p></div><span className="service-chip"><span className="live-dot" />{status}</span></div>;
}
function Notice({ children, error = false }: { children: React.ReactNode; error?: boolean }) {
  return <div className={error ? 'notice error-notice' : 'notice'} role={error ? 'alert' : 'status'}>{children}</div>;
}
function Metric({ label, value, foot, icon: Icon, featured = false }: { label: string; value: string | number; foot: string; icon: typeof Boxes; featured?: boolean }) {
  return <article className={'metric-card' + (featured ? ' metric-featured' : '')}><div className="metric-head"><span>{label}</span><Icon size={17}/></div><strong>{value}</strong><div className="metric-foot"><span className="metric-neutral">{foot}</span></div></article>;
}
export function InventoryPage({ businessId }: { businessId: string }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [selected, setSelected] = useState('');
  const [kind, setKind] = useState('in');
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(async () => {
    if (!db) { setError('Configura la conexión de Supabase para consultar el inventario.'); return; }
    const [p, m] = await Promise.all([
      db.from('products').select('id,name,track_inventory,stock_quantity,low_stock_threshold').eq('business_id', businessId).order('name'),
      db.from('inventory_movements').select('id,product_id,movement_type,quantity,stock_before,stock_after,note,created_at').eq('business_id', businessId).order('created_at', { ascending: false }).limit(30),
    ]);
    if (p.error || m.error) { setError(p.error?.message || m.error?.message || 'No se pudo cargar el inventario. Verifica que las migraciones estén aplicadas.'); return; }
    setProducts((p.data || []) as Product[]);
    setMovements((m.data || []) as Movement[]);
    setSelected(current => current || p.data?.[0]?.id || '');
    setError('');
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  const tracked = products.filter(p => p.track_inventory);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!db || !selected) return;
    const amount = Number(quantity);
    if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) { setError('Ingresa una cantidad entera válida.'); return; }
    setBusy(true); setError(''); setNotice('');
    const { error: rpcError } = await db.rpc('adjust_product_stock', {
      p_product_id: selected, p_movement_type: kind, p_quantity: amount,
      p_note: note.trim() || null, p_reference_type: 'manual',
    });
    setBusy(false);
    if (rpcError) { setError(rpcError.message); return; }
    setNotice('Movimiento registrado correctamente.');
    setQuantity('1'); setNote(''); await load();
  }
  return <div className="page-wrap">
    <Heading overline="CONTROL DE EXISTENCIAS" title="Inventario" detail="Consulta tus existencias y registra cada entrada, salida o ajuste." status="INVENTARIO"/>
    <div className="metric-grid">
      <Metric label="PRODUCTOS CON CONTROL" value={tracked.length} foot="Con seguimiento de existencias" icon={Boxes} featured/>
      <Metric label="BAJO MÍNIMO" value={tracked.filter(p => p.stock_quantity <= p.low_stock_threshold).length} foot="Requieren revisión" icon={Package}/>
      <Metric label="MOVIMIENTOS RECIENTES" value={movements.length} foot="Últimos 30 registros" icon={ListOrdered}/>
    </div>
    {error && <Notice error>{error} <button className="text-button" onClick={() => void load()}>Reintentar</button></Notice>}
    {notice && <Notice>{notice}</Notice>}
    <section className="data-panel">
      <div className="panel-heading"><div><div className="panel-kicker">EXISTENCIAS</div><h2>Productos inventariados</h2></div><span className="orders-total">{tracked.length} productos</span></div>
      {tracked.length === 0 ? <div className="empty-state"><div className="empty-mark"><Package size={20}/></div><h3>Aún no tienes inventario configurado</h3><p>Activa el control de existencias desde la configuración del producto. La migración de inventario debe estar aplicada en Supabase.</p></div> :
        <div className="product-list">{tracked.map(p => <article className="product-row" key={p.id}><div className="product-thumb"><Package size={19}/></div><div className="product-main"><div className="product-titleline"><h3>{p.name}</h3></div><p>Mínimo recomendado: {p.low_stock_threshold}</p></div><div className="product-price">{p.stock_quantity} unidades</div><span className={'availability ' + (p.stock_quantity <= p.low_stock_threshold ? 'unavailable' : 'available')}><i/>{p.stock_quantity <= p.low_stock_threshold ? 'Stock bajo' : 'Disponible'}</span></article>)}</div>}
    </section>
    <div className="settings-layout">
      <section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Boxes size={19}/></span><div><div className="panel-kicker">REGISTRO</div><h2>Nuevo movimiento</h2></div></div>
        <form className="modal-form" onSubmit={submit}>
          <label className="field-label">Producto<select value={selected} onChange={e => setSelected(e.target.value)} required><option value="">Selecciona un producto</option>{tracked.map(p => <option key={p.id} value={p.id}>{p.name} · {p.stock_quantity} disponibles</option>)}</select></label>
          <label className="field-label">Tipo de movimiento<select value={kind} onChange={e => setKind(e.target.value)}><option value="in">Entrada</option><option value="out">Salida</option><option value="adjustment">Ajustar a cantidad</option></select></label>
          <label className="field-label">{kind === 'adjustment' ? 'Nueva cantidad' : 'Unidades'}<input type="number" min="1" max="1000000" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} required/></label>
          <label className="field-label">Nota <span className="optional-label">opcional</span><textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></label>
          <button className="button button-dark" type="submit" disabled={busy || !selected}>{busy ? 'Registrando…' : 'Registrar movimiento'}</button>
        </form>
      </section>
      <section className="settings-card"><div className="settings-card-head"><span className="settings-icon gold-setting"><ListOrdered size={19}/></span><div><div className="panel-kicker">TRAZABILIDAD</div><h2>Últimos movimientos</h2></div></div>
        {movements.length === 0 ? <p className="auth-intro">Todavía no hay movimientos registrados.</p> : movements.slice(0, 10).map(m => <div className="setting-row" key={m.id}><span>{products.find(p => p.id === m.product_id)?.name || 'Producto'} · {new Date(m.created_at).toLocaleString('es-CO')}</span><b>{m.movement_type === 'in' ? '+' : m.movement_type === 'out' ? '-' : '='}{m.quantity} ({m.stock_before} → {m.stock_after})</b></div>)}
      </section>
    </div>
  </div>;
}

export function CashPage({ businessId }: { businessId: string }) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [opening, setOpening] = useState('0');
  const [closing, setClosing] = useState('0');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState('income');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = sessions.find(s => s.status === 'open');
  const load = useCallback(async () => {
    if (!db) { setError('Configura la conexión de Supabase para consultar la caja.'); return; }
    const { data, error: queryError } = await db.from('cash_sessions').select('id,status,opening_amount_cop,closing_amount_cop,expected_amount_cop,difference_cop,opened_at,closed_at').eq('business_id', businessId).order('opened_at', { ascending: false }).limit(20);
    if (queryError) { setError(queryError.message); return; }
    const rows = (data || []) as Session[];
    setSessions(rows);
    const current = rows.find(s => s.status === 'open');
    if (current) {
      const result = await db.from('cash_movements').select('id,movement_type,amount_cop,description,created_at').eq('cash_session_id', current.id).order('created_at', { ascending: false });
      if (result.error) setError(result.error.message);
      setMovements((result.data || []) as CashMovement[]);
    } else setMovements([]);
    setError('');
  }, [businessId]);
  useEffect(() => { void load(); }, [load]);
  async function run(action: 'open' | 'movement' | 'close') {
    if (!db) return;
    setBusy(true); setError(''); setNotice('');
    let result: { error: { message: string } | null } = { error: null };
    if (action === 'open') result = await db.rpc('open_cash_session', { p_business_id: businessId, p_opening_amount_cop: Number(opening), p_notes: null });
    if (action === 'movement' && active) result = await db.rpc('record_cash_movement', { p_session_id: active.id, p_movement_type: kind, p_amount_cop: Number(amount), p_description: description.trim(), p_reference_id: null });
    if (action === 'close' && active) result = await db.rpc('close_cash_session', { p_session_id: active.id, p_closing_amount_cop: Number(closing), p_notes: null });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    setNotice(action === 'open' ? 'Caja abierta correctamente.' : action === 'close' ? 'Caja cerrada y diferencia calculada.' : 'Movimiento registrado.');
    setAmount(''); setDescription(''); await load();
  }
  return <div className="page-wrap">
    <Heading overline="CONTROL DE EFECTIVO" title="Caja" detail="Registra aperturas, ingresos, gastos y cierres de caja." status={active ? 'CAJA ABIERTA' : 'CAJA CERRADA'}/>
    <div className="metric-grid">
      <Metric label="BASE DE APERTURA" value={cop(active?.opening_amount_cop)} foot={active ? 'Sesión en curso' : 'Sin caja abierta'} icon={Wallet} featured/>
      <Metric label="MOVIMIENTOS DE CAJA" value={movements.length} foot="Sesión actual" icon={ListOrdered}/>
      <Metric label="ESTADO" value={active ? 'Abierta' : 'Cerrada'} foot="Control por sesión" icon={ShieldCheck}/>
    </div>
    {error && <Notice error>{error} <button className="text-button" onClick={() => void load()}>Reintentar</button></Notice>}
    {notice && <Notice>{notice}</Notice>}
    <div className="settings-layout">
      <section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Wallet size={19}/></span><div><div className="panel-kicker">OPERACIÓN</div><h2>{active ? 'Registrar movimiento' : 'Abrir caja'}</h2></div></div>
        {!active ? <form className="modal-form" onSubmit={e => { e.preventDefault(); void run('open'); }}><label className="field-label">Monto inicial (COP)<input type="number" min="0" max="2000000000" step="1" value={opening} onChange={e => setOpening(e.target.value)} required/></label><button className="button button-dark" disabled={busy}>{busy ? 'Procesando…' : 'Abrir caja'}</button></form> :
          <form className="modal-form" onSubmit={e => { e.preventDefault(); void run('movement'); }}><label className="field-label">Tipo<select value={kind} onChange={e => setKind(e.target.value)}><option value="income">Ingreso</option><option value="expense">Gasto</option><option value="sale">Venta</option><option value="refund">Devolución</option></select></label><label className="field-label">Valor (COP)<input type="number" min="1" max="2000000000" step="1" value={amount} onChange={e => setAmount(e.target.value)} required/></label><label className="field-label">Descripción<input value={description} onChange={e => setDescription(e.target.value)} maxLength={240} required/></label><button className="button button-dark" disabled={busy}>{busy ? 'Guardando…' : 'Registrar movimiento'}</button></form>}
      </section>
      {active && <section className="settings-card"><div className="settings-card-head"><span className="settings-icon gold-setting"><ShieldCheck size={19}/></span><div><div className="panel-kicker">CIERRE DE TURNO</div><h2>Cuadre de caja</h2></div></div><form className="modal-form" onSubmit={e => { e.preventDefault(); if (window.confirm('¿Confirmas el cierre de esta caja?')) void run('close'); }}><label className="field-label">Efectivo contado (COP)<input type="number" min="0" max="2000000000" step="1" value={closing} onChange={e => setClosing(e.target.value)} required/></label><button className="button button-dark" disabled={busy}>Cerrar caja y calcular diferencia</button></form><p className="settings-note"><ShieldCheck size={16}/>El cierre calcula el valor esperado y la diferencia frente al efectivo contado.</p></section>}
    </div>
    <section className="data-panel"><div className="panel-heading"><div><div className="panel-kicker">HISTORIAL</div><h2>Sesiones recientes</h2></div><span className="orders-total">{sessions.length} sesiones</span></div>
      {sessions.length === 0 ? <div className="empty-state"><div className="empty-mark"><Wallet size={20}/></div><h3>Aún no hay sesiones de caja</h3><p>Abre tu primera caja para comenzar a registrar movimientos.</p></div> : sessions.map(s => <div className="setting-row" key={s.id}><span>{new Date(s.opened_at).toLocaleString('es-CO')} · {s.status === 'open' ? 'Abierta' : 'Cerrada'}</span><b>{cop(s.status === 'open' ? s.opening_amount_cop : s.closing_amount_cop)}{s.status === 'closed' ? ' · Diferencia ' + cop(s.difference_cop) : ''}</b></div>)}
    </section>
  </div>;
}
