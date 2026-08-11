import { useCallback, useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { ErroApi, api } from './api';
import { CtxSite } from './contexto';
import Barris from './telas/Barris';
import Bebidas from './telas/Bebidas';
import Contatos from './telas/Contatos';
import Login from './telas/Login';

function BotaoPublicar() {
  const [estado, setEstado] = useState<'parado' | 'indo' | 'ok' | 'erro'>('parado');
  const [msg, setMsg] = useState('');
  const [quando, setQuando] = useState<string | null>(null);

  useEffect(() => {
    api.lerConfig().then((c) => setQuando(c.ultima_publicacao ?? null)).catch(() => {});
  }, []);

  async function publicar() {
    setEstado('indo');
    try {
      const r = await api.publicar();
      setQuando(r.ultima_publicacao);
      setEstado('ok');
      setMsg('publicando — o site atualiza em cerca de 1 minuto');
    } catch (e) {
      setEstado('erro');
      setMsg(e instanceof ErroApi ? e.message : 'falhou');
    }
  }

  return (
    <div className="linha">
      {quando && (
        <span className="item-sub" title={quando}>
          publicado {tempoRelativo(quando)}
        </span>
      )}
      <button className="btn btn-primary" onClick={publicar} disabled={estado === 'indo'}>
        {estado === 'indo' ? 'publicando...' : 'Publicar site'}
      </button>
      {msg && <span className="item-sub">{msg}</span>}
    </div>
  );
}

function tempoRelativo(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'agora';
  if (s < 3600) return `ha ${Math.floor(s / 60)} min`;
  if (s < 86400) return `ha ${Math.floor(s / 3600)} h`;
  return `ha ${Math.floor(s / 86400)} dias`;
}

export default function App() {
  const [email, setEmail] = useState<string | null>(null);
  const [siteUrl, setSiteUrl] = useState('');
  const [carregando, setCarregando] = useState(true);

  const conferir = useCallback(() => {
    api
      .sessao()
      .then((s) => {
        setEmail(s.email);
        setSiteUrl(s.siteUrl);
      })
      .catch(() => setEmail(null))
      .finally(() => setCarregando(false));
  }, []);

  useEffect(conferir, [conferir]);

  if (carregando) return <p className="pagina">carregando...</p>;
  if (!email) return <Login aoEntrar={conferir} />;

  return (
    <CtxSite.Provider value={siteUrl}>
      <header className="topo">
        <strong>Eden Beer</strong>
        <nav>
          <NavLink to="/bebidas">Bebidas</NavLink>
          <NavLink to="/barris">Barris</NavLink>
          <NavLink to="/contatos">Contatos</NavLink>
        </nav>
        <span className="espaco" />
        <BotaoPublicar />
        <button
          className="btn btn-ghost"
          onClick={async () => {
            await api.sair();
            setEmail(null);
          }}
        >
          Sair
        </button>
      </header>

      <main className="pagina">
        <Routes>
          <Route path="/" element={<Navigate to="/bebidas" replace />} />
          <Route path="/bebidas" element={<Bebidas />} />
          <Route path="/barris" element={<Barris />} />
          <Route path="/contatos" element={<Contatos />} />
          <Route path="*" element={<Navigate to="/bebidas" replace />} />
        </Routes>
      </main>
    </CtxSite.Provider>
  );
}
