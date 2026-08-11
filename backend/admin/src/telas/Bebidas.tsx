import { useEffect, useMemo, useState } from 'react';
import { ErroApi, api, urlFoto } from '../api';
import { useSiteUrl } from '../contexto';
import type { Bebida, Tipo } from '../tipos';
import FormBebida from './FormBebida';

export default function Bebidas() {
  const siteUrl = useSiteUrl();
  const [todas, setTodas] = useState<Bebida[]>([]);
  const [tipo, setTipo] = useState<Tipo>('lata');
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<Bebida | 'nova' | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);

  async function recarregar() {
    try {
      setTodas(await api.listarBebidas());
      setErro('');
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'nao consegui carregar');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => {
    recarregar();
  }, []);

  const doTipo = useMemo(
    () => todas.filter((b) => b.tipo === tipo).sort((a, b) => a.posicao - b.posicao),
    [todas, tipo],
  );
  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return doTipo;
    return doTipo.filter((b) => `${b.nome} ${b.estilo ?? ''}`.toLowerCase().includes(t));
  }, [doTipo, busca]);

  /** Troca com o vizinho e manda a ordem inteira do tipo. */
  async function mover(indice: number, passo: -1 | 1) {
    const nova = [...doTipo];
    const destino = indice + passo;
    if (destino < 0 || destino >= nova.length) return;
    [nova[indice], nova[destino]] = [nova[destino], nova[indice]];
    // Atualiza a tela antes da resposta: reordenar precisa parecer instantaneo.
    setTodas((antes) => [
      ...antes.filter((b) => b.tipo !== tipo),
      ...nova.map((b, i) => ({ ...b, posicao: i })),
    ]);
    try {
      await api.reordenar(tipo, nova.map((b) => b.id));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'nao consegui reordenar');
      recarregar();
    }
  }

  async function apagar(b: Bebida) {
    if (!confirm(`Apagar "${b.nome}"? Nao da para desfazer.`)) return;
    try {
      await api.apagarBebida(b.id);
      recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'nao consegui apagar');
    }
  }

  async function alternarVisivel(b: Bebida) {
    try {
      await api.editarBebida(b.id, { visivel: !b.visivel });
      recarregar();
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'nao consegui salvar');
    }
  }

  if (carregando) return <p>carregando...</p>;

  return (
    <>
      <div className="linha" style={{ justifyContent: 'space-between' }}>
        <div className="seg" role="tablist">
          {(['lata', 'growler'] as Tipo[]).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tipo === t}
              className={`seg-opt btn ${tipo === t ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setTipo(t)}
            >
              {t === 'lata' ? 'Latas' : 'Growlers'} ({todas.filter((b) => b.tipo === t).length})
            </button>
          ))}
        </div>
        <div className="linha">
          <input
            className="input"
            placeholder="buscar por nome ou estilo"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button className="btn btn-primary" onClick={() => setEditando('nova')}>
            Nova bebida
          </button>
        </div>
      </div>

      {erro && <p className="aviso" style={{ marginTop: 16 }}>{erro}</p>}

      <div className="lista-bebidas">
        {visiveis.map((b) => {
          const i = doTipo.indexOf(b);
          return (
            <div key={b.id} className={`item ${b.visivel ? '' : 'oculto'}`}>
              <div className="botoes-ordem">
                <button className="btn btn-ghost" onClick={() => mover(i, -1)} disabled={i === 0 || !!busca} title="subir">
                  ▲
                </button>
                <button
                  className="btn btn-ghost"
                  onClick={() => mover(i, 1)}
                  disabled={i === doTipo.length - 1 || !!busca}
                  title="descer"
                >
                  ▼
                </button>
              </div>
              {b.imagem_url ? <img src={urlFoto(b.imagem_url, siteUrl)} alt="" /> : <div className="miniatura" />}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="item-nome">{b.nome}</div>
                <div className="item-sub">
                  {b.estilo || 'sem estilo'}
                  {b.abv ? ` · ABV ${b.abv}` : ''}
                  {b.ibu ? ` · IBU ${b.ibu}` : ''}
                  {!b.visivel && ' · oculta no site'}
                </div>
              </div>
              <button className="btn btn-secondary" onClick={() => alternarVisivel(b)}>
                {b.visivel ? 'Ocultar' : 'Mostrar'}
              </button>
              <button className="btn btn-secondary" onClick={() => setEditando(b)}>
                Editar
              </button>
              <button className="btn btn-ghost" onClick={() => apagar(b)}>
                Apagar
              </button>
            </div>
          );
        })}
        {!visiveis.length && <p className="item-sub">nenhuma bebida aqui.</p>}
      </div>

      {busca && <p className="item-sub">reordenar fica desligado enquanto ha busca, para nao mover a lista errada.</p>}

      {editando && (
        <FormBebida
          bebida={editando === 'nova' ? null : editando}
          tipoPadrao={tipo}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            recarregar();
          }}
        />
      )}
    </>
  );
}
