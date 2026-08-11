import { type FormEvent, useEffect, useState } from 'react';
import { ErroApi, api } from '../api';
import type { Barril, Config } from '../tipos';

export default function Barris() {
  const [lista, setLista] = useState<Barril[]>([]);
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    Promise.all([api.listarBarris(), api.lerConfig()])
      .then(([b, c]: [Barril[], Config]) => {
        setLista(b);
        setMostrarPreco(c.mostrar_preco_barril !== 'false');
      })
      .catch((e) => setMsg({ texto: e instanceof ErroApi ? e.message : 'nao consegui carregar', ok: false }))
      .finally(() => setCarregando(false));
  }, []);

  const editar = (i: number, campo: 'tamanho' | 'preco', valor: string) =>
    setLista((a) => a.map((b, j) => (i === j ? { ...b, [campo]: valor } : b)));

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const salvos = await api.salvarBarris(lista.map(({ tamanho, preco }) => ({ tamanho, preco })));
      await api.salvarConfig({ mostrar_preco_barril: String(mostrarPreco) });
      setLista(salvos);
      setMsg({ texto: 'salvo — publique para ir ao ar', ok: true });
    } catch (ex) {
      setMsg({ texto: ex instanceof ErroApi ? ex.message : 'nao consegui salvar', ok: false });
    }
  }

  if (carregando) return <p>carregando...</p>;

  return (
    <form onSubmit={salvar}>
      <h1>Barris</h1>
      {msg && <p className={`aviso ${msg.ok ? 'ok' : ''}`}>{msg.texto}</p>}

      {lista.map((b, i) => (
        <div className="linha" key={i} style={{ marginBottom: 10 }}>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`t${i}`}>Tamanho</label>
            <input id={`t${i}`} className="input" value={b.tamanho} onChange={(e) => editar(i, 'tamanho', e.target.value)} required />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label htmlFor={`p${i}`}>Preco</label>
            <input id={`p${i}`} className="input" value={b.preco} onChange={(e) => editar(i, 'preco', e.target.value)} required />
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setLista((a) => a.filter((_, j) => j !== i))}>
            remover
          </button>
        </div>
      ))}

      <div className="linha" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-secondary" onClick={() => setLista((a) => [...a, { tamanho: '', preco: '' }])}>
          Adicionar barril
        </button>
      </div>

      <label className="linha" style={{ marginTop: 20 }}>
        <input type="checkbox" checked={mostrarPreco} onChange={(e) => setMostrarPreco(e.target.checked)} />
        Mostrar os precos no site
      </label>

      <div className="linha" style={{ marginTop: 20 }}>
        <button className="btn btn-primary" type="submit">Salvar</button>
      </div>
    </form>
  );
}
