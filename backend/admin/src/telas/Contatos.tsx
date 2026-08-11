import { type FormEvent, useEffect, useState } from 'react';
import { ErroApi, api } from '../api';

export default function Contatos() {
  const [f, setF] = useState({ whatsapp_number: '', instagram_handle: '', ifood_url: '' });
  const [msg, setMsg] = useState<{ texto: string; ok: boolean } | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api
      .lerConfig()
      .then((c) =>
        setF({
          whatsapp_number: c.whatsapp_number ?? '',
          instagram_handle: c.instagram_handle ?? '',
          ifood_url: c.ifood_url ?? '',
        }),
      )
      .catch((e) => setMsg({ texto: e instanceof ErroApi ? e.message : 'nao consegui carregar', ok: false }))
      .finally(() => setCarregando(false));
  }, []);

  const campo = (k: keyof typeof f) => ({
    value: f[k],
    onChange: (e: { target: { value: string } }) => setF((a) => ({ ...a, [k]: e.target.value })),
  });

  // Espelha o que o site faz com o numero, para o admin ver o link real antes
  // de publicar — foi assim que um "+55 18 ..." cru quebrou todos os botoes uma vez.
  const soDigitos = f.whatsapp_number.replace(/\D/g, '');

  async function salvar(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      await api.salvarConfig(f);
      setMsg({ texto: 'salvo — publique para ir ao ar', ok: true });
    } catch (ex) {
      setMsg({ texto: ex instanceof ErroApi ? ex.message : 'nao consegui salvar', ok: false });
    }
  }

  if (carregando) return <p>carregando...</p>;

  return (
    <form onSubmit={salvar}>
      <h1>Contatos</h1>
      {msg && <p className={`aviso ${msg.ok ? 'ok' : ''}`}>{msg.texto}</p>}

      <div className="field">
        <label htmlFor="wa">WhatsApp</label>
        <input id="wa" className="input" placeholder="+55 18 99625-4970" {...campo('whatsapp_number')} />
        <small className="item-sub">
          {soDigitos.length >= 12
            ? `link gerado: https://wa.me/${soDigitos}`
            : 'precisa do codigo do pais: 55 + DDD + numero'}
        </small>
      </div>

      <div className="field">
        <label htmlFor="ig">Instagram</label>
        <input id="ig" className="input" placeholder="edenbeerbirigui" {...campo('instagram_handle')} />
        <small className="item-sub">so o usuario, sem @ e sem link</small>
      </div>

      <div className="field">
        <label htmlFor="ifood">Link do iFood</label>
        <input id="ifood" className="input" placeholder="https://www.ifood.com.br/delivery/..." {...campo('ifood_url')} />
      </div>

      <button className="btn btn-primary" type="submit">Salvar</button>
    </form>
  );
}
