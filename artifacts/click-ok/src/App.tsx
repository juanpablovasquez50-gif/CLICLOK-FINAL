import { useEffect, useState, createContext, useContext } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { type Session as SupabaseSession } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { Link, Route, Switch, Router as WouterRouter, useLocation } from 'wouter';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Bell, Boxes, Check, ChevronDown, ChevronRight, CircleHelp, Clock3, CreditCard, ExternalLink, Eye, EyeOff, Flame, LayoutDashboard, ListOrdered, LogOut, Menu as MenuIcon, Package, Plus, Search, Settings2, ShieldCheck, Sparkles, Wallet, X } from 'lucide-react';
import { setBaseUrl, setAuthTokenGetter, useHealthCheck, useListBusinesses, getListBusinessesQueryKey, useCreateBusiness, useListCategories, getListCategoriesQueryKey, useCreateCategory, useUpdateCategory, useDeleteCategory, useListProducts, getListProductsQueryKey, useCreateProduct, useUpdateProduct, useDeleteProduct, useListOrders, getListOrdersQueryKey, useUpdateOrderStatus, useGetDashboard, getGetDashboardQueryKey } from '@workspace/api-client-react';
import type { Business, Category, Product, Order } from '@workspace/api-client-react';
import NotFound from '@/pages/not-found';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import './index.css';
import { InventoryPage, CashPage } from './pages/operations';

setBaseUrl(import.meta.env.VITE_API_URL ?? null);

const qc = new QueryClient();
const configured = Boolean(supabase);
const SessionContext = createContext<{
  session: SupabaseSession | null;
  signOut: () => Promise<void>;
}>({ session: null, signOut: async () => undefined });

function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SupabaseSession | null>(null);
  useEffect(() => {
    if (!supabase) {
      setAuthTokenGetter(null);
      return;
    }
    let active = true;
    let previousUserId: string | null = null;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      const nextUserId = nextSession?.user.id ?? null;
      if (event === 'SIGNED_OUT' || (previousUserId && previousUserId !== nextUserId)) {
        qc.clear();
      }
      previousUserId = nextUserId;
      setAuthTokenGetter(() => nextSession?.access_token ?? null);
      setSession(nextSession);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setAuthTokenGetter(() => data.session?.access_token ?? null);
        setSession(data.session);
      }
    });
    return () => {
      active = false;
      subscription.unsubscribe();
      setAuthTokenGetter(null);
    };
  }, []);
  const signOut = async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };
  return <SessionContext.Provider value={{ session, signOut }}>{children}</SessionContext.Provider>;
}
function useSession() { return useContext(SessionContext); }

function money(value?: number | null) {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value ?? 0);
}
function initials(name = 'Negocio') { return name.trim().slice(0, 1).toLocaleUpperCase('es-CO'); }
function slugify(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}
function IconButton({ label, onClick, children, className = '' }: { label: string; onClick: () => void; children: React.ReactNode; className?: string }) {
  return <button type="button" aria-label={label} data-testid={`button-${label.toLowerCase().replaceAll(' ', '-')}`} className={`icon-button ${className}`} onClick={onClick}>{children}</button>;
}
function EmptyState({ title, detail, action, onAction }: { title: string; detail: string; action?: string; onAction?: () => void }) {
  return <div className="empty-state" data-testid="state-empty"><div className="empty-mark"><Package size={20} /></div><h3>{title}</h3><p>{detail}</p>{action && onAction && <button className="button button-dark" onClick={onAction} data-testid="button-empty-action"><Plus size={16} />{action}</button>}</div>;
}
function LoadingRows() { return <div className="skeleton-stack" data-testid="state-loading">{[1, 2, 3].map((n) => <div className="skeleton-row" key={n} />)}</div>; }
function ErrorNotice({ retry }: { retry: () => void }) {
  return <div className="notice error-notice" data-testid="state-error"><span>No pudimos cargar estos datos. Revisa tu conexión e inténtalo de nuevo.</span><button onClick={retry} className="text-button">Reintentar</button></div>;
}
function ConfigNotice() {
  return <div className="config-panel" data-testid="state-supabase-configuration"><div className="config-icon"><ShieldCheck size={22} /></div><div><strong>CLICK OK aún no está conectado</strong><p>Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> para habilitar el acceso seguro. No se ha creado ninguna sesión.</p></div></div>;
}

function App() {
  return <QueryClientProvider client={qc}><AppContent /></QueryClientProvider>;
}
function AppContent() {
  useHealthCheck();
  return <TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><SessionProvider><Routed /></SessionProvider></WouterRouter><Toaster /></TooltipProvider>;
}
function Routed() {
  const [path] = useLocation();
  useEffect(() => {
    const pages: Record<string, { title: string; description: string }> = {
      '/': {
        title: 'CLICK OK | Gestión para tiendas y comercios',
        description: 'CLICK OK reúne productos, ventas y pedidos para tiendas de ropa, electrónica y otros comercios en Colombia.',
      },
      '/sign-in': {
        title: 'Iniciar sesión | CLICK OK',
        description: 'Accede a CLICK OK para consultar los productos, pedidos y la operación diaria de tu negocio.',
      },
      '/register': {
        title: 'Crear cuenta | CLICK OK',
        description: 'Crea una cuenta segura y registra tu tienda o negocio en CLICK OK.',
      },
      '/dashboard': {
        title: 'Operación de tu negocio | CLICK OK',
        description: 'Consulta las métricas reales y los pedidos recientes de tu negocio en CLICK OK.',
      },
      '/catalog': {
        title: 'Catálogo de productos | CLICK OK',
        description: 'Administra categorías, productos, precios y disponibilidad de tu tienda.',
      },
      '/orders': {
        title: 'Pedidos de tu negocio | CLICK OK',
        description: 'Revisa pedidos y actualiza su estado desde CLICK OK.',
      },
      '/inventory': { title: 'Inventario | CLICK OK', description: 'Controla existencias y movimientos de inventario.' },
      '/cash': { title: 'Caja | CLICK OK', description: 'Administra aperturas, movimientos y cierres de caja.' },
      '/settings': {
        title: 'Configuración del negocio | CLICK OK',
        description: 'Consulta la configuración de tu cuenta y negocio en CLICK OK.',
      },
    };
    const metadata = pages[path] ?? {
      title: 'Página no encontrada | CLICK OK',
      description: 'La página solicitada no está disponible en CLICK OK.',
    };
    document.title = metadata.title;
    document.querySelector('meta[name="description"]')?.setAttribute('content', metadata.description);
    document.querySelector('meta[property="og:title"]')?.setAttribute('content', metadata.title);
    document.querySelector('meta[property="og:description"]')?.setAttribute('content', metadata.description);
    document.querySelector('meta[name="twitter:title"]')?.setAttribute('content', metadata.title);
    document.querySelector('meta[name="twitter:description"]')?.setAttribute('content', metadata.description);
  }, [path]);
  return <ErrorBoundary resetKey={path}><Switch>
    <Route path="/" component={Landing} />
    <Route path="/sign-in" component={SignIn} />
    <Route path="/register" component={Register} />
    <Route path="/dashboard">{() => <PrivatePage page="dashboard" />}</Route>
    <Route path="/catalog">{() => <PrivatePage page="catalog" />}</Route>
    <Route path="/orders">{() => <PrivatePage page="orders" />}</Route>
    <Route path="/inventory">{() => <PrivatePage page="inventory" />}</Route>
    <Route path="/cash">{() => <PrivatePage page="cash" />}</Route>
    <Route path="/settings">{() => <PrivatePage page="settings" />}</Route>
    <Route component={NotFound} />
  </Switch></ErrorBoundary>;
}

function Landing() {
  return <main className="landing">
    <header className="site-nav"><Link href="/" className="brand-lockup" data-testid="link-home"><span className="brand-symbol">C</span><span>CLICK<span className="brand-dot">.</span>OK</span></Link><nav className="landing-links"><a href="#producto" data-testid="link-product-story">Producto</a><a href="#planes" data-testid="link-plans">Planes</a><a href="#faq" data-testid="link-faq">Preguntas</a></nav><div className="nav-actions"><Link href="/sign-in" className="nav-login" data-testid="link-sign-in">Iniciar sesión</Link><Link href="/register" className="button button-dark nav-cta" data-testid="link-register">Abrir mi negocio <ArrowRight size={15} /></Link></div></header>
    <section className="hero-section">
      <div className="hero-copy"><div className="eyebrow"><span className="live-dot" /> GESTIÓN CLARA. VENTAS EN ORDEN.</div><h1>Tu negocio se mueve.<br /><em>Tú también.</em></h1><p className="hero-sub">CLICK OK reúne productos, ventas y pedidos para tiendas de ropa, electrónica y muchos otros comercios en Colombia.</p><div className="hero-ctas"><Link href="/register" className="button button-yellow" data-testid="link-hero-start">Empieza a organizarte <ArrowRight size={17} /></Link><a href="#producto" className="quiet-link" data-testid="link-how-it-works">Conoce cómo funciona <ChevronRight size={16} /></a></div><div className="hero-footnote"><span className="tiny-seal"><Check size={12} /></span> Sin hojas de cálculo. Sin inventar números. Solo lo que está pasando.</div></div>
      <div className="hero-visual" aria-label="Vista ilustrativa de la interfaz CLICK OK"><div className="visual-topline"><span>VISTA DE TIENDA</span><span className="visual-live"><i /> OPERACIÓN ACTIVA</span></div><div className="visual-board"><div className="visual-side"><span className="mini-logo">C.</span><span className="side-active"><LayoutDashboard size={15} /></span><span><ListOrdered size={15} /></span><span><Package size={15} /></span><span><Settings2 size={15} /></span><div className="side-avatar">N</div></div><div className="visual-content"><div className="visual-heading"><div><small>JUEVES · MOVIMIENTO DE HOY</small><h3>Tu operación, en orden.</h3></div><div className="profile-dot">N</div></div><div className="visual-stats"><div className="visual-stat dark-stat"><span>VENTAS HOY</span><b>—</b><small>Cuando conectes tu cuenta</small></div><div className="visual-stat"><span>PEDIDOS ABIERTOS</span><b>—</b><small>Información en tiempo real</small></div></div><div className="visual-orders"><div className="order-head"><b>Actividad reciente</b><span>Sin datos de muestra</span></div><div className="order-empty"><div className="empty-line"><span className="empty-circle" /><span className="line-long" /><span className="line-tag" /></div><div className="empty-line"><span className="empty-circle" /><span className="line-medium" /><span className="line-tag" /></div><div className="empty-line"><span className="empty-circle" /><span className="line-short" /><span className="line-tag" /></div></div></div><div className="visual-bottom"><span><i /> Tu equipo está listo</span><span>CLICK OK · COMERCIO</span></div></div></div><div className="hero-sticker"><Sparkles size={15} /><span>Menos enredos.<br /><b>Más ventas.</b></span></div><div className="hero-grid" /></div>
    </section>
    <section className="marquee-band"><div>HECHO PARA EL COMERCIO <span>·</span> PENSADO EN COLOMBIA <span>·</span> POR ATOM LABS <span>·</span> HECHO PARA EL COMERCIO <span>·</span> PENSADO EN COLOMBIA <span>·</span></div></section>
    <section id="producto" className="story-section"><div className="section-kicker">01 / EL DÍA A DÍA</div><div className="story-layout"><h2>Tu cabeza está<br />para <em>hacer crecer</em><br />tu negocio.</h2><div className="story-aside"><p>Entre productos, precios, clientes y pedidos, llevar una tienda puede sentirse como estar pendiente de todo a la vez. CLICK OK te devuelve una vista sencilla de lo importante.</p><div className="story-rule" /><span>Una operación más clara empieza por verla completa.</span></div></div><div className="feature-grid"><article className="feature feature-main"><div className="feature-number">01</div><div className="feature-icon lime-icon"><ListOrdered size={19} /></div><h3>Pedidos sin perder el hilo</h3><p>Revisa cada pedido y actualiza su estado con claridad, desde recibido hasta entregado.</p><span className="feature-foot">ESTADOS A LA VISTA <ArrowUpRight size={14} /></span></article><article className="feature feature-secondary"><div className="feature-number">02</div><div className="feature-icon cream-icon"><Package size={18} /></div><h3>Un catálogo que puedes manejar</h3><p>Organiza categorías y productos, actualiza su disponibilidad y destaca lo que quieres vender.</p><span className="feature-foot">CATÁLOGO BAJO CONTROL <ArrowUpRight size={14} /></span></article><article className="feature feature-accent"><div className="feature-number">03</div><div className="feature-icon coral-icon"><LayoutDashboard size={18} /></div><h3>Lo que pasa, sin adivinar</h3><p>Un resumen alimentado únicamente por los datos registrados en tu negocio.</p><span className="feature-foot">DATOS REALES, SIEMPRE <ArrowUpRight size={14} /></span></article></div></section>
    <section className="quote-band"><div className="quote-mark">“</div><blockquote>Un buen negocio no se improvisa.<br /><em>Se organiza para crecer.</em></blockquote><div className="quote-credit"><span className="credit-line" /> CLICK OK PARA COMERCIOS</div></section>
    <section className="plans-section" id="planes"><div className="section-kicker">02 / EMPIEZA A TU RITMO</div><div className="plans-heading"><h2>Primero, <em>orden.</em></h2><p>Tu negocio merece herramientas sencillas y honestas.<br />Elige el punto de partida que tiene sentido para ti.</p></div><div className="plans-card"><div className="plan-label">CLICK OK</div><h3>La base para operar mejor.</h3><p>Resumen de ventas, catálogo de productos y seguimiento de pedidos en una sola experiencia.</p><div className="plan-divider" /><div className="plan-includes"><span><Check size={15} /> Resumen de operación</span><span><Check size={15} /> Categorías y productos</span><span><Check size={15} /> Flujo de pedidos</span><span><Check size={15} /> Acceso seguro a tu cuenta</span></div><Link href="/register" className="button button-yellow plan-button" data-testid="link-plan-register">Crear mi espacio <ArrowRight size={16} /></Link><small>El precio y la disponibilidad se confirmarán al habilitar el servicio.</small></div></section>
    <section className="faq-section" id="faq"><div className="section-kicker">03 / PREGUNTAS FRECUENTES</div><div className="faq-layout"><h2>Antes de<br /><em>dar el primer paso.</em></h2><div className="faq-list"><details><summary>¿CLICK OK ya tiene información de mi negocio?<ChevronDown size={17} /></summary><p>No. Solo verás información que tu equipo haya registrado. No mostramos pedidos ni ventas de ejemplo.</p></details><details><summary>¿Cómo creo mi espacio de trabajo?<ChevronDown size={17} /></summary><p>Crea una cuenta y registra el nombre de tu tienda o negocio. CLICK OK no inventará una sesión ni creará un espacio sin tu acción.</p></details><details><summary>¿Puedo usarlo desde el celular?<ChevronDown size={17} /></summary><p>Sí. La experiencia se adapta a móvil y escritorio para que puedas revisar la operación donde estés.</p></details><details><summary>¿Quién está detrás de CLICK OK?<ChevronDown size={17} /></summary><p>CLICK OK es un producto de ATOM LABS, un laboratorio de tecnología enfocado en resolver problemas cotidianos con software útil.</p></details></div></div></section>
    <footer className="site-footer"><Link href="/" className="brand-lockup footer-brand"><span className="brand-symbol">C</span><span>CLICK<span className="brand-dot">.</span>OK</span></Link><span>Menos enredos. Más negocio.</span><div className="footer-credit">UNA IDEA DE <b>ATOM LABS</b> <ExternalLink size={13} /></div></footer>
  </main>;
}

function AuthFrame({ children, mode }: { children: React.ReactNode; mode: 'login' | 'register' }) {
  return <main className="auth-shell"><Link href="/" className="brand-lockup auth-brand"><span className="brand-symbol">C</span><span>CLICK<span className="brand-dot">.</span>OK</span></Link><div className="auth-layout"><aside className="auth-aside"><span className="eyebrow auth-eyebrow"><span className="live-dot" /> GESTIÓN CLARA</span><h1>{mode === 'login' ? <>Tu negocio<br />sigue <em>en marcha.</em></> : <>Un espacio<br />para crecer <em>mejor.</em></>}</h1><p>{mode === 'login' ? 'Entra a tu operación y encuentra todo donde lo dejaste.' : 'Empieza por lo esencial. Tu negocio, tus productos y tu forma de trabajar.'}</p><div className="auth-aside-bottom"><span>CLICK OK</span><span>UN PRODUCTO DE ATOM LABS</span></div></aside><section className="auth-panel">{children}</section></div></main>;
}
function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const { session } = useSession();
  const [, setLocation] = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [createBusiness, setCreateBusiness] = useState(false);
  const queryClient = useQueryClient();
  const createBiz = useCreateBusiness();
  useEffect(() => { if (session && mode === 'login') setLocation('/dashboard'); }, [session, mode, setLocation]);
  const completeOnboarding = () => {
    if (mode === 'login') { setLocation('/dashboard'); return; }
    setCreateBusiness(true);
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(''); setMessage('');
    if (!configured || !supabase) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (authError) throw authError;
        if (!data.session) throw new Error('No se recibió una sesión válida.');
        completeOnboarding();
      } else {
        const { data, error: authError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              business_name: businessName.trim(),
            },
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage('Revisa tu correo para confirmar la cuenta. Cuando esté lista, vuelve e inicia sesión.');
          return;
        }
        completeOnboarding();
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Ocurrió un error. Vuelve a intentarlo.'); }
    finally { setBusy(false); }
  }
  const saveBusiness = (e: React.FormEvent) => {
    e.preventDefault();
    const name = businessName.trim(), slug = slugify(name);
    if (name.length < 2 || slug.length < 2) { setError('Escribe el nombre de tu negocio para continuar.'); return; }
    setError('');
    createBiz.mutate({ data: { name, slug } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() }); setLocation('/dashboard'); }, onError: () => setError('No se pudo crear el espacio. Inténtalo de nuevo.') });
  };
  return <AuthFrame mode={mode}><div className="auth-form-wrap"><div className="auth-form-kicker">{mode === 'login' ? 'QUÉ BUENO TENERTE DE VUELTA' : 'COMENCEMOS POR TU NEGOCIO'}</div><h2>{createBusiness ? 'Registra tu negocio' : mode === 'login' ? 'Iniciar sesión' : 'Crea tu cuenta'}</h2><p className="auth-intro">{createBusiness ? 'Tu cuenta está lista. Falta el espacio donde vive tu operación.' : mode === 'login' ? 'Usa el correo y contraseña de tu cuenta.' : 'Un acceso seguro para tu operación diaria.'}</p>
    {!configured ? <ConfigNotice /> : <form className="auth-form" onSubmit={createBusiness ? saveBusiness : submit}>
      {mode === 'register' && !createBusiness && <label className="field-label">Nombre de la tienda o negocio<input data-testid="input-business-name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Ej. Nativa Store" required minLength={2} maxLength={100} /></label>}
      {!createBusiness && <><label className="field-label">Correo electrónico<input data-testid="input-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="hola@tunegocio.co" required autoComplete="email" /></label><label className="field-label">Contraseña<div className="password-field"><input data-testid="input-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tu contraseña" required minLength={6} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /><button type="button" className="password-toggle" aria-label="Mostrar contraseña" onClick={() => setShowPassword((s) => !s)} data-testid="button-toggle-password">{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></label></>}
      {error && <div className="form-error" role="alert" data-testid="status-auth-error">{error}</div>}{message && <div className="form-success" data-testid="status-auth-message">{message}</div>}
      <button className="button button-dark auth-submit" type="submit" disabled={busy || createBiz.isPending} data-testid="button-auth-submit">{busy || createBiz.isPending ? 'Un momento…' : createBusiness ? 'Crear espacio de negocio' : mode === 'login' ? 'Entrar a CLICK OK' : 'Crear mi cuenta'} <ArrowRight size={16} /></button>
    </form>}
    <div className="auth-switch">{mode === 'login' ? <>¿Aún no tienes cuenta? <Link href="/register" data-testid="link-auth-register">Crear cuenta</Link></> : <>¿Ya tienes cuenta? <Link href="/sign-in" data-testid="link-auth-sign-in">Inicia sesión</Link></>}</div><Link className="back-home" href="/" data-testid="link-back-home">← Volver a CLICK OK</Link></div></AuthFrame>;
}
function SignIn() { return <AuthForm mode="login" />; }
function Register() { return <AuthForm mode="register" />; }

const navItems = [
  { key: 'dashboard', label: 'Resumen', href: '/dashboard', icon: LayoutDashboard },
  { key: 'orders', label: 'Pedidos', href: '/orders', icon: ListOrdered },
  { key: 'catalog', label: 'Catálogo', href: '/catalog', icon: Package },
  { key: 'inventory', label: 'Inventario', href: '/inventory', icon: Boxes },
  { key: 'cash', label: 'Caja', href: '/cash', icon: Wallet },
  { key: 'settings', label: 'Configuración', href: '/settings', icon: Settings2 },
];
function PrivatePage({ page }: { page: string }) {
  const { session, signOut } = useSession();
  const [path, setPath] = useLocation();
  const [mobileNav, setMobileNav] = useState(false);
  const [showBusinessForm, setShowBusinessForm] = useState(false);
  const queryClient = useQueryClient();
  const businesses = useListBusinesses({ query: { enabled: Boolean(session), queryKey: getListBusinessesQueryKey(), retry: false } });
  const createBiz = useCreateBusiness();
  if (!configured) return <AuthFrame mode="login"><div className="auth-form-wrap"><h2>Servicio no conectado</h2><ConfigNotice /><Link href="/" className="back-home">Volver al inicio</Link></div></AuthFrame>;
  if (!session) return <AuthFrame mode="login"><div className="auth-form-wrap"><div className="auth-form-kicker">ACCESO REQUERIDO</div><h2>Inicia sesión para continuar</h2><p className="auth-intro">La operación solo está disponible para personas con una cuenta activa.</p><Link href="/sign-in" className="button button-dark auth-submit" data-testid="link-private-sign-in">Ir a iniciar sesión <ArrowRight size={16} /></Link><Link href="/" className="back-home">Volver a CLICK OK</Link></div></AuthFrame>;
  const business = businesses.data?.[0];
  const businessIdIsValid = typeof business?.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(business.id);
  const logout = () => {
    void signOut().catch(() => undefined).finally(() => {
      queryClient.clear();
      setPath('/sign-in');
    });
  };
  const makeBusiness = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget), name = String(form.get('name') || '').trim(), slug = slugify(name);
    if (name.length < 2 || slug.length < 2) return;
    createBiz.mutate({ data: { name, slug } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListBusinessesQueryKey() }); setShowBusinessForm(false); }, onError: () => window.alert('No se pudo crear el negocio. Inténtalo de nuevo.') });
  };
  const content = !businesses.isLoading && !businesses.isError && business && !businessIdIsValid ? <section className="setup-page"><div className="setup-card"><h1>No pudimos identificar tu negocio</h1><p>La cuenta devolvió un identificador inválido. Actualiza la información del negocio o vuelve a intentarlo. No se consultarán Caja ni Inventario hasta validar el identificador.</p><button className="button button-dark" onClick={() => void businesses.refetch()}>Volver a intentar</button></div></section> : !businesses.isLoading && !businesses.isError && !business ? <section className="setup-page"><div className="section-kicker">PRIMER PASO</div><div className="setup-card"><span className="setup-icon"><Package size={21} /></span><h1>¿Qué negocio vas a organizar?</h1><p>Registra tu tienda o negocio para empezar. No mostraremos datos hasta que existan en tu cuenta.</p>{showBusinessForm ? <form className="setup-form" onSubmit={makeBusiness}><label className="field-label">Nombre de la tienda o negocio<input name="name" data-testid="input-new-business-name" placeholder="Ej. Nativa Store" required minLength={2} maxLength={100} /></label><div className="setup-actions"><button type="button" className="button button-light" onClick={() => setShowBusinessForm(false)}>Cancelar</button><button className="button button-dark" type="submit" disabled={createBiz.isPending} data-testid="button-create-business">{createBiz.isPending ? 'Guardando…' : 'Crear espacio'} <ArrowRight size={16} /></button></div></form> : <button className="button button-dark" onClick={() => setShowBusinessForm(true)} data-testid="button-start-business"><Plus size={16} /> Registrar negocio</button>}</div></section> : businesses.isError ? <div className="content-pad"><ErrorNotice retry={() => businesses.refetch()} /></div> : businesses.isLoading ? <div className="content-pad"><LoadingRows /></div> : <>{page === 'dashboard' && <DashboardPage business={business!} />}{page === 'catalog' && <CatalogPage business={business!} />}{page === 'orders' && <OrdersPage business={business!} />}{page === 'inventory' && businessIdIsValid && <InventoryPage businessId={business!.id} />}{page === 'cash' && businessIdIsValid && <CashPage businessId={business!.id} />}{page === 'settings' && <SettingsPage business={business!} email={session.user?.email || ''} onLogout={logout} />}</>;
  return <div className="app-shell"><aside className={`app-sidebar ${mobileNav ? 'mobile-open' : ''}`}><Link href="/dashboard" className="sidebar-brand" data-testid="link-app-brand"><span className="brand-symbol">C</span><span>CLICK<span className="brand-dot">.</span>OK</span></Link><div className="workspace-label">NEGOCIO</div><div className="workspace-switch"><span className="workspace-avatar">{business ? initials(business.name) : 'C'}</span><span className="workspace-name">{business?.name || 'Mi negocio'}</span><ChevronDown size={14} /></div><div className="sidebar-label">OPERACIÓN</div><nav className="sidebar-nav">{navItems.map(({ key, label, href, icon: Icon }) => <Link href={href} onClick={() => setMobileNav(false)} className={`sidebar-link ${path === href ? 'active' : ''}`} key={key} data-testid={`link-nav-${key}`}><Icon size={17} /><span>{label}</span>{key === 'orders' && <span className="nav-indicator" />}</Link>)}</nav><div className="sidebar-bottom"><div className="service-pill"><span className="live-dot" /><span>Cuenta activa</span></div><div className="sidebar-user"><div className="user-initial">{initials(session.user?.email || 'C')}</div><div className="user-meta"><b>{session.user?.email?.split('@')[0] || 'Mi cuenta'}</b><span>Propietario</span></div><IconButton label="cerrar sesión" onClick={logout}><LogOut size={16} /></IconButton></div><div className="atom-mark">UN PRODUCTO DE <b>ATOM LABS</b></div></div></aside><div className="app-main"><header className="app-topbar"><button className="mobile-menu" aria-label="Abrir navegación" onClick={() => setMobileNav((v) => !v)} data-testid="button-mobile-menu"><MenuIcon size={20} /></button><div className="breadcrumb"><span>CLICK OK</span><ChevronRight size={14} /><b>{navItems.find((n) => n.key === page)?.label || 'Resumen'}</b></div><div className="topbar-right"><span className="topbar-date">{new Intl.DateTimeFormat('es-CO', { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date())}</span><span className="topbar-divider" /><span className="topbar-avatar">{initials(business?.name)}</span></div></header><main className="page-content">{content}</main></div>{mobileNav && <button className="mobile-scrim" aria-label="Cerrar navegación" onClick={() => setMobileNav(false)} />}</div>;
}
function PageHeading({ overline, title, detail, action }: { overline: string; title: string; detail: string; action?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="section-kicker">{overline}</div><h1>{title}</h1><p>{detail}</p></div>{action && <div className="heading-action">{action}</div>}</div>;
}

function DashboardPage({ business }: { business: Business }) {
  const [, navigate] = useLocation();
  const d = useGetDashboard(business.id, { query: { enabled: Boolean(business.id), queryKey: getGetDashboardQueryKey(business.id), retry: false } });
  const dashboard = d.data;
  const change = dashboard && dashboard.salesPreviousDayCop ? ((dashboard.salesTodayCop - dashboard.salesPreviousDayCop) / dashboard.salesPreviousDayCop) * 100 : null;
  return <div className="page-wrap"><PageHeading overline="PANEL DE OPERACIÓN" title={`Buen día, ${business.name}.`} detail="Lo esencial para entender cómo va tu negocio." action={<span className="service-chip"><span className="live-dot" /> Tu operación</span>} />
    {d.isLoading ? <LoadingRows /> : d.isError ? <ErrorNotice retry={() => d.refetch()} /> : dashboard ? <><div className="metric-grid"><article className="metric-card metric-featured"><div className="metric-head"><span>VENTAS DE HOY</span><CreditCard size={17} /></div><strong>{money(dashboard.salesTodayCop)}</strong><div className="metric-foot"><span className={change !== null && change >= 0 ? 'trend-up' : 'trend-down'}>{change === null ? 'Sin referencia anterior' : <>{change >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{Math.abs(change).toFixed(1)}% vs. día anterior</>}</span></div><div className="metric-watermark"><span /></div></article><article className="metric-card"><div className="metric-head"><span>PEDIDOS DE HOY</span><ListOrdered size={17} /></div><strong>{dashboard.ordersToday}</strong><div className="metric-foot"><span className="metric-neutral">{dashboard.pendingOrders} pendientes de atención</span></div></article><article className="metric-card"><div className="metric-head"><span>PRODUCTOS ACTIVOS</span><Package size={17} /></div><strong>{dashboard.productsCount}</strong><div className="metric-foot"><Link href="/catalog" className="metric-link">Abrir catálogo <ArrowRight size={13} /></Link></div></article><article className="metric-card"><div className="metric-head"><span>CLIENTES</span><Flame size={17} /></div><strong>{dashboard.customersCount}</strong><div className="metric-foot"><span className="metric-neutral">Registrados en tu negocio</span></div></article></div><section className="data-panel recent-panel"><div className="panel-heading"><div><div className="panel-kicker">MOVIMIENTO RECIENTE</div><h2>Pedidos recientes</h2></div><Link href="/orders" className="panel-link" data-testid="link-view-orders">Ver pedidos <ArrowRight size={15} /></Link></div>{dashboard.recentOrders.length ? <OrderTable orders={dashboard.recentOrders} compact /> : <EmptyState title="Aún no hay pedidos" detail="Cuando registres pedidos, verás aquí el movimiento reciente." action="Ver pedidos" onAction={() => navigate('/orders')} />}</section><div className="dashboard-foot"><span><Clock3 size={14} /> Datos de tu operación</span><span>Los totales se actualizan con la información registrada.</span></div></> : <EmptyState title="Todavía no hay resumen" detail="El dashboard aparecerá cuando existan registros en tu negocio." />}</div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', close); return () => window.removeEventListener('keydown', close); }, [onClose]);
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-label={title} className="modal-card"><div className="modal-heading"><div><span className="section-kicker">CATÁLOGO DEL NEGOCIO</span><h2>{title}</h2></div><IconButton label="cerrar diálogo" onClick={onClose}><X size={18} /></IconButton></div>{children}</section></div>;
}

function CatalogPage({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const cats = useListCategories(business.id, { query: { enabled: Boolean(business.id), queryKey: getListCategoriesQueryKey(business.id), retry: false } });
  const prods = useListProducts(business.id, { query: { enabled: Boolean(business.id), queryKey: getListProductsQueryKey(business.id), retry: false } });
  const createCat = useCreateCategory(), updateCat = useUpdateCategory(), deleteCat = useDeleteCategory();
  const createProd = useCreateProduct(), updateProd = useUpdateProduct(), deleteProd = useDeleteProduct();
  const [modal, setModal] = useState<'category' | 'product' | null>(null);
  const [editing, setEditing] = useState<Product | null>(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const refresh = () => { queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey(business.id) }); queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(business.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(business.id) }); };
  const submitCategory = (e: React.FormEvent<HTMLFormElement>) => { e.preventDefault(); const name = String(new FormData(e.currentTarget).get('name') || '').trim(); if (!name) return; createCat.mutate({ businessId: business.id, data: { name, sortOrder: cats.data?.length ?? 0 } }, { onSuccess: () => { refresh(); setModal(null); } }); };
  const submitProduct = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const data = { name: String(f.get('name') || '').trim(), description: String(f.get('description') || '').trim() || null, categoryId: String(f.get('categoryId') || '') || null, priceCop: Number(f.get('priceCop')), available: f.get('available') === 'on', featured: f.get('featured') === 'on' };
    const onSuccess = () => { refresh(); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(business.id) }); setModal(null); setEditing(null); };
    if (editing) updateProd.mutate({ productId: editing.id, data }, { onSuccess });
    else createProd.mutate({ businessId: business.id, data }, { onSuccess });
  };
  const toggleAvailable = (p: Product) => updateProd.mutate({ productId: p.id, data: { available: !p.available } }, { onSuccess: refresh });
  const removeCategory = (c: Category) => { if (window.confirm(`¿Eliminar la categoría “${c.name}”?`)) deleteCat.mutate({ categoryId: c.id }, { onSuccess: refresh }); };
  const removeProduct = (p: Product) => { if (window.confirm(`¿Eliminar “${p.name}” del catálogo?`)) deleteProd.mutate({ productId: p.id }, { onSuccess: () => { refresh(); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(business.id) }); } }); };
  const categories = cats.data ?? [], products = prods.data ?? [];
  const visible = products.filter((p) => (filter === 'all' || (filter === 'available' ? p.available : filter === 'unavailable' ? !p.available : p.categoryId === filter)) && `${p.name} ${p.description || ''}`.toLowerCase().includes(search.toLowerCase()));
  const isLoading = cats.isLoading || prods.isLoading;
  return <div className="page-wrap"><PageHeading overline="PRODUCTOS Y CATEGORÍAS" title="Tu catálogo, a tu manera." detail="Organiza tus productos y mantén al día su disponibilidad." action={<button className="button button-dark" onClick={() => { setEditing(null); setModal('product'); }} data-testid="button-add-product"><Plus size={16} /> Nuevo producto</button>} />
    <div className="menu-toolbar"><div className="menu-count"><span className="count-number">{products.length}</span><span>productos<br /><small>en tu catálogo</small></span></div><div className="menu-tools"><label className="search-box"><Search size={16} /><input aria-label="Buscar productos" data-testid="input-search-products" placeholder="Buscar productos" value={search} onChange={(e) => setSearch(e.target.value)} /><kbd>⌘ K</kbd></label><button className="button button-light" onClick={() => setModal('category')} data-testid="button-add-category"><Plus size={15} /> Categoría</button></div></div>
    <div className="category-strip"><button className={`category-chip ${filter === 'all' ? 'selected' : ''}`} onClick={() => setFilter('all')} data-testid="filter-category-all">Todos <span>{products.length}</span></button>{categories.map((c) => <button key={c.id} className={`category-chip ${filter === c.id ? 'selected' : ''}`} onClick={() => setFilter(c.id)} data-testid={`filter-category-${c.id}`}>{c.name}<span>{products.filter((p) => p.categoryId === c.id).length}</span></button>)}<button className={`category-chip status-chip ${filter === 'available' ? 'selected' : ''}`} onClick={() => setFilter('available')} data-testid="filter-available">Disponibles</button><button className={`category-chip status-chip ${filter === 'unavailable' ? 'selected' : ''}`} onClick={() => setFilter('unavailable')} data-testid="filter-unavailable">No disponibles</button></div>
    {isLoading ? <LoadingRows /> : cats.isError || prods.isError ? <ErrorNotice retry={() => { cats.refetch(); prods.refetch(); }} /> : products.length === 0 ? <EmptyState title="Tu catálogo empieza aquí" detail="Crea categorías y agrega productos. El catálogo se llenará solo con lo que registres." action="Agregar producto" onAction={() => setModal('product')} /> : visible.length === 0 ? <EmptyState title="No encontramos productos" detail="Prueba con otra búsqueda o cambia el filtro seleccionado." /> : <div className="product-list" data-testid="list-products">{visible.map((p) => <ProductRow key={p.id} product={p} category={categories.find((c) => c.id === p.categoryId)?.name} onEdit={() => { setEditing(p); setModal('product'); }} onDelete={() => removeProduct(p)} onAvailability={() => toggleAvailable(p)} />)}</div>}
    {!isLoading && categories.length > 0 && <section className="category-manage"><div className="category-manage-title"><div><div className="panel-kicker">ORGANIZACIÓN</div><h2>Categorías</h2></div><span>{categories.length} categorías</span></div>{categories.map((c) => <div key={c.id} className="category-manage-row" data-testid={`row-category-${c.id}`}><span className="category-mark">{initials(c.name)}</span><b>{c.name}</b><span className={`category-active ${c.active ? 'is-active' : ''}`}>{c.active ? 'Activa' : 'Pausada'}</span><button className="text-button" onClick={() => updateCat.mutate({ categoryId: c.id, data: { active: !c.active } }, { onSuccess: refresh })} data-testid={`button-toggle-category-${c.id}`}>{c.active ? 'Pausar' : 'Activar'}</button><button className="text-button destructive-text" onClick={() => removeCategory(c)} data-testid={`button-delete-category-${c.id}`}>Eliminar</button></div>)}</section>}
    {modal === 'category' && <Modal title="Nueva categoría" onClose={() => setModal(null)}><form className="modal-form" onSubmit={submitCategory}><label className="field-label">Nombre<input autoFocus name="name" data-testid="input-category-name" placeholder="Ej. Accesorios" maxLength={80} required /></label><div className="modal-actions"><button type="button" className="button button-light" onClick={() => setModal(null)}>Cancelar</button><button type="submit" className="button button-dark" disabled={createCat.isPending} data-testid="button-save-category">{createCat.isPending ? 'Guardando…' : 'Guardar categoría'}</button></div></form></Modal>}
    {modal === 'product' && <Modal title={editing ? 'Editar producto' : 'Agregar producto'} onClose={() => { setModal(null); setEditing(null); }}><form className="modal-form" onSubmit={submitProduct}><label className="field-label">Nombre del producto<input name="name" defaultValue={editing?.name || ''} data-testid="input-product-name" maxLength={120} required /></label><label className="field-label">Descripción <span className="optional-label">opcional</span><textarea name="description" defaultValue={editing?.description || ''} data-testid="input-product-description" maxLength={1000} rows={3} /></label><div className="form-columns"><label className="field-label">Precio en pesos<input name="priceCop" type="number" min="0" step="1" defaultValue={editing?.priceCop ?? ''} data-testid="input-product-price" required /></label><label className="field-label">Categoría<select name="categoryId" defaultValue={editing?.categoryId || ''} data-testid="select-product-category"><option value="">Sin categoría</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div><label className="check-label"><input type="checkbox" name="available" defaultChecked={editing?.available ?? true} data-testid="input-product-available" /><span>Disponible para vender</span></label><label className="check-label"><input type="checkbox" name="featured" defaultChecked={editing?.featured ?? false} data-testid="input-product-featured" /><span>Destacar en el catálogo</span></label><div className="modal-actions"><button type="button" className="button button-light" onClick={() => { setModal(null); setEditing(null); }}>Cancelar</button><button type="submit" className="button button-dark" disabled={createProd.isPending || updateProd.isPending} data-testid="button-save-product">{createProd.isPending || updateProd.isPending ? 'Guardando…' : editing ? 'Guardar cambios' : 'Agregar producto'}</button></div></form></Modal>}
  </div>;
}
function ProductRow({ product: p, category, onEdit, onDelete, onAvailability }: { product: Product; category?: string; onEdit: () => void; onDelete: () => void; onAvailability: () => void }) {
  return <article className="product-row" data-testid={`row-product-${p.id}`}><div className="product-thumb"><Package size={19} /></div><div className="product-main"><div className="product-titleline"><h3>{p.name}</h3>{p.featured && <span className="featured-tag"><Sparkles size={11} /> DESTACADO</span>}</div><p>{p.description || category || 'Sin descripción'}</p><div className="product-mobile-status"><span className={`availability ${p.available ? 'available' : 'unavailable'}`}><i />{p.available ? 'Disponible' : 'No disponible'}</span></div></div><div className="product-category">{category || 'Sin categoría'}</div><div className="product-price" data-testid={`text-product-price-${p.id}`}>{money(p.priceCop)}</div><span className={`availability desktop-status ${p.available ? 'available' : 'unavailable'}`}><i />{p.available ? 'Disponible' : 'No disponible'}</span><button className="text-button product-toggle" onClick={onAvailability} data-testid={`button-availability-${p.id}`}>{p.available ? 'Desactivar' : 'Activar'}</button><div className="product-actions"><button onClick={onEdit} data-testid={`button-edit-product-${p.id}`}>Editar</button><button onClick={onDelete} data-testid={`button-delete-product-${p.id}`}>Eliminar</button></div></article>;
}

const statusNames: Record<string, string> = { pending: 'Pendiente', confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Listo para entregar', on_the_way: 'En tránsito', delivered: 'Entregado', cancelled: 'Cancelado' };
const nextStatus: Record<string, string[]> = { pending: ['confirmed', 'cancelled'], confirmed: ['preparing', 'cancelled'], preparing: ['ready', 'cancelled'], ready: ['on_the_way', 'delivered', 'cancelled'], on_the_way: ['delivered'], delivered: [], cancelled: [] };
function OrderTable({ orders, compact = false, onStatus }: { orders: Order[]; compact?: boolean; onStatus?: (order: Order, status: string) => void }) {
  return <div className="orders-table-wrap"><table className="orders-table"><thead><tr><th>PEDIDO</th><th>CLIENTE</th><th>HORA</th><th>ESTADO</th><th className="align-right">TOTAL</th>{!compact && <th><span className="sr-only">Acción</span></th>}</tr></thead><tbody>{orders.map((o) => <tr key={o.id} data-testid={`row-order-${o.id}`}><td><b className="order-id">#{o.orderNumber}</b></td><td>{o.customerName}</td><td>{new Intl.DateTimeFormat('es-CO', { hour: '2-digit', minute: '2-digit' }).format(new Date(o.createdAt))}</td><td><span className={`status-pill status-${o.status}`} data-testid={`status-order-${o.id}`}><i />{statusNames[o.status] || o.status}</span></td><td className="align-right order-total">{money(o.totalCop)}</td>{!compact && <td className="order-action">{nextStatus[o.status]?.length ? <select aria-label={`Cambiar estado del pedido ${o.orderNumber}`} value="" onChange={(e) => onStatus?.(o, e.target.value)} data-testid={`select-order-status-${o.id}`}><option value="" disabled>Actualizar</option>{nextStatus[o.status].map((s) => <option key={s} value={s}>{statusNames[s]}</option>)}</select> : <span className="order-finished">Cerrado</span>}</td>}</tr>)}</tbody></table></div>;
}
function OrdersPage({ business }: { business: Business }) {
  const queryClient = useQueryClient();
  const q = useListOrders(business.id, { query: { enabled: Boolean(business.id), queryKey: getListOrdersQueryKey(business.id), retry: false } });
  const change = useUpdateOrderStatus();
  const [filter, setFilter] = useState('all');
  const rows = q.data ?? [];
  const tabs = ['all', 'pending', 'confirmed', 'preparing', 'ready', 'on_the_way', 'delivered', 'cancelled'];
  const visible = filter === 'all' ? rows : rows.filter((o) => o.status === filter);
  return <div className="page-wrap"><PageHeading overline="GESTIÓN DE PEDIDOS" title="Pedidos" detail="Sigue cada pedido y actualiza su estado hasta la entrega." action={<span className="order-live"><span className="live-dot" /> ACTUALIZACIÓN EN VIVO</span>} /><div className="orders-summary"><div><span>PEDIDOS REGISTRADOS</span><b>{q.isLoading ? '—' : rows.length}</b></div><div><span>POR ATENDER</span><b className="summary-yellow">{q.isLoading ? '—' : rows.filter((o) => ['pending', 'confirmed', 'preparing'].includes(o.status)).length}</b></div><div><span>LISTOS PARA ENTREGAR</span><b>{q.isLoading ? '—' : rows.filter((o) => o.status === 'ready').length}</b></div><div className="summary-callout"><Clock3 size={17} /><span>Un estado claro ayuda a que cada pedido llegue a tiempo.</span></div></div><div className="orders-filter">{tabs.map((t) => <button key={t} onClick={() => setFilter(t)} className={filter === t ? 'current' : ''} data-testid={`filter-orders-${t}`}>{t === 'all' ? 'Todos' : statusNames[t]}</button>)}</div><section className="data-panel orders-panel"><div className="panel-heading"><div><div className="panel-kicker">SEGUIMIENTO DE PEDIDOS</div><h2>{filter === 'all' ? 'Todos los pedidos' : statusNames[filter]}</h2></div><span className="orders-total">{visible.length} {visible.length === 1 ? 'pedido' : 'pedidos'}</span></div>{q.isLoading ? <LoadingRows /> : q.isError ? <ErrorNotice retry={() => q.refetch()} /> : visible.length ? <OrderTable orders={visible} onStatus={(order, status) => change.mutate({ orderId: order.id, data: { status: status as 'pending' | 'confirmed' | 'preparing' | 'ready' | 'on_the_way' | 'delivered' | 'cancelled' } }, { onSuccess: () => { queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(business.id) }); queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey(business.id) }); } })} /> : <EmptyState title={filter === 'all' ? 'Aún no hay pedidos' : `Sin pedidos ${statusNames[filter]?.toLowerCase()}`} detail={filter === 'all' ? 'Cuando registres pedidos, podrás seguir cada etapa desde aquí.' : 'Los pedidos registrados en este estado aparecerán aquí.'} />}</section></div>;
}

function SettingsPage({ business, email, onLogout }: { business: Business; email: string; onLogout: () => void }) {
  const health = useHealthCheck({ query: { retry: false } });
  const [copied, setCopied] = useState(false);
  return <div className="page-wrap"><PageHeading overline="TU ESPACIO" title="Configuración" detail="Los datos principales de tu negocio y tu cuenta." /><div className="settings-layout"><section className="settings-card"><div className="settings-card-head"><span className="settings-icon"><Package size={19} /></span><div><div className="panel-kicker">NEGOCIO ACTIVO</div><h2>Información básica</h2></div></div><div className="setting-row"><span>Nombre del negocio</span><b data-testid="text-business-name">{business.name}</b></div><div className="setting-row"><span>Identificador</span><div className="slug-field"><code>{business.slug}</code><button className="text-button" onClick={() => { navigator.clipboard?.writeText(business.slug); setCopied(true); window.setTimeout(() => setCopied(false), 1800); }} data-testid="button-copy-slug">{copied ? 'Copiado' : 'Copiar'}</button></div></div><div className="setting-row"><span>Moneda</span><b>{business.currency}</b></div><div className="setting-row"><span>Espacio creado</span><b>{new Intl.DateTimeFormat('es-CO', { dateStyle: 'long' }).format(new Date(business.createdAt))}</b></div><div className="settings-note"><CircleHelp size={16} /><span>La edición del nombre y la moneda aún no está disponible en el servicio.</span></div></section><section className="settings-card"><div className="settings-card-head"><span className="settings-icon gold-setting"><ShieldCheck size={19} /></span><div><div className="panel-kicker">ACCESO SEGURO</div><h2>Tu cuenta</h2></div></div><div className="setting-row"><span>Correo de acceso</span><b data-testid="text-account-email">{email || 'Cuenta autenticada'}</b></div><div className="setting-row"><span>Proveedor de autenticación</span><b>Supabase Auth</b></div><div className="settings-note"><ShieldCheck size={16} /><span>La sesión se gestiona de forma segura. Los datos de operación no se guardan en este dispositivo.</span></div><button className="button button-light logout-button" onClick={onLogout} data-testid="button-settings-sign-out"><LogOut size={16} /> Cerrar sesión</button></section><section className="settings-card service-card"><div className="settings-card-head"><span className="settings-icon"><Bell size={18} /></span><div><div className="panel-kicker">ESTADO DEL SERVICIO</div><h2>Conexión</h2></div></div><div className="setting-row"><span>API de CLICK OK</span><b className="service-status" data-testid="status-api-health"><i className={health.data?.status === 'ok' ? 'health-good' : ''} />{health.isLoading ? 'Verificando' : health.isError ? 'No disponible' : health.data?.status || 'Conectada'}</b></div><div className="settings-note"><CircleHelp size={16} /><span>Planes, facturación y preferencias avanzadas se habilitarán cuando el servicio los soporte.</span></div></section></div><div className="settings-footer"><span>CLICK OK · OPERACIÓN PARA COMERCIOS</span><span>Un producto de ATOM LABS</span></div></div>;
}

export default App;
