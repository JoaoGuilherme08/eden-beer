import { type FormEvent, useState } from 'react';
import { ErroApi, api, subirFoto, urlFoto } from '../api';
import { useSiteUrl } from '../contexto';
import type { Bebida, BebidaEntrada, Tipo } from '../tipos';

interface Props {
  bebida: Bebida | null;
  tipoPadrao: Tipo;
  aoFechar: () => void;
  aoSalvar: () => void;
}

const vazioParaNulo = (s: string) => (s.trim() === '' ? null : s.trim());

export default function FormBebida({ bebida, tipoPadrao, aoFechar, aoSalvar }: Props) {
  const siteUrl = useSiteUrl();
  const [f, setF] = useState({
    tipo: bebida?.tipo ?? tipoPadrao,
    nome: bebida?.nome ?? '',
    estilo: bebida?.estilo ?? '',
    accent: bebida?.accent ?? '#F2670A',
    imagem_url: bebida?.imagem_url ?? '',
    descricao: bebida?.descricao ?? '',
    abv: bebida?.abv ?? '',
    ibu: bebida?.ibu ?? '',
    volume: bebida?.volume ?? '',
    tags: (bebida?.tags ?? []).join(', '),
  });
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [subindo, setSubindo] = useState(false);

  const campo = (k: keyof typeof f) => ({
    value: f[k] as string,
    onChange: (e: { target: { value: string } }) => setF((a) => ({ ...a, [k]: e.target.value })),
  });

  async function escolherFoto(arquivo: File | undefined) {
    if (!arquivo) return;
    setErro('');
    setSubindo(true);
    try {
      const url = await subirFoto(arquivo);
      setF((a) => ({ ...a, imagem_url: url }));
    } catch (e) {
      setErro(e instanceof ErroApi ? e.message : 'nao consegui subir a foto');
    } finally {
      setSubindo(false);
    }
  }

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setSalvando(true);

    const dados: BebidaEntrada = {
      tipo: f.tipo,
      nome: f.nome.trim(),
      estilo: vazioParaNulo(f.estilo),
      accent: vazioParaNulo(f.accent),
      imagem_url: vazioParaNulo(f.imagem_url),
      descricao: vazioParaNulo(f.descricao),
      abv: vazioParaNulo(f.abv),
      ibu: vazioParaNulo(f.ibu),
      volume: vazioParaNulo(f.volume),
      tags: f.tags.split(',').map((t) => t.trim()).filter(Boolean),
    };

    try {
      if (bebida) await api.editarBebida(bebida.id, dados);
      else await api.criarBebida(dados);
      aoSalvar();
    } catch (ex) {
      setErro(ex instanceof ErroApi ? ex.message : 'nao consegui salvar');
      setSalvando(false);
    }
  }

  return (
    <div className="fundo-modal" onClick={aoFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="linha" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>{bebida ? `Editar ${bebida.nome}` : 'Nova bebida'}</h2>
          <button className="btn btn-ghost" onClick={aoFechar} aria-label="Fechar">
            ✕
          </button>
        </div>

        {erro && <p className="aviso">{erro}</p>}

        <form onSubmit={enviar}>
          <div className="grade-form">
            <div className="field">
              <label htmlFor="tipo">Tipo</label>
              <select id="tipo" className="input" {...campo('tipo')}>
                <option value="lata">Lata</option>
                <option value="growler">Growler</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="nome">Nome</label>
              <input id="nome" className="input" required {...campo('nome')} />
            </div>
            <div className="field">
              <label htmlFor="estilo">Estilo</label>
              <input id="estilo" className="input" placeholder="IPA, Weizen..." {...campo('estilo')} />
            </div>
            <div className="field">
              <label htmlFor="accent">Cor de destaque</label>
              <input id="accent" className="input" type="color" {...campo('accent')} />
            </div>
            <div className="field">
              <label htmlFor="abv">ABV</label>
              <input id="abv" className="input" placeholder="4,5%" {...campo('abv')} />
            </div>
            <div className="field">
              <label htmlFor="ibu">IBU</label>
              <input id="ibu" className="input" placeholder="30" {...campo('ibu')} />
            </div>
            <div className="field">
              <label htmlFor="volume">Volume</label>
              <input id="volume" className="input" placeholder="473ml" {...campo('volume')} />
            </div>
            <div className="field">
              <label htmlFor="tags">Tags (separadas por virgula)</label>
              <input id="tags" className="input" placeholder="leve, citrica" {...campo('tags')} />
            </div>
          </div>

          <div className="field">
            <label htmlFor="descricao">Descricao</label>
            <textarea id="descricao" className="input" rows={4} {...campo('descricao')} />
          </div>

          <div className="field">
            <label htmlFor="foto">Foto</label>
            <div className="linha">
              {f.imagem_url ? <img className="miniatura" src={urlFoto(f.imagem_url, siteUrl)} alt="" /> : <div className="miniatura" />}
              <input
                id="foto"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/avif"
                onChange={(e) => escolherFoto(e.target.files?.[0])}
                disabled={subindo}
              />
              {subindo && <span className="item-sub">subindo...</span>}
              {f.imagem_url && (
                <button type="button" className="btn btn-ghost" onClick={() => setF((a) => ({ ...a, imagem_url: '' }))}>
                  remover
                </button>
              )}
            </div>
            <input
              className="input"
              placeholder="ou cole uma URL / caminho (uploads/foto.jpg)"
              {...campo('imagem_url')}
            />
          </div>

          <div className="linha" style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={salvando || subindo}>
              {salvando ? 'salvando...' : 'Salvar'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={aoFechar}>
              Cancelar
            </button>
            <span className="item-sub">as mudancas so vao ao ar quando voce clicar em Publicar site.</span>
          </div>
        </form>
      </div>
    </div>
  );
}
