import { type FormEvent, useState } from 'react';
import { ErroApi, api } from '../api';

export default function Login({ aoEntrar }: { aoEntrar: () => void }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [indo, setIndo] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setIndo(true);
    try {
      await api.entrar(email, senha);
      aoEntrar();
    } catch (ex) {
      setErro(ex instanceof ErroApi ? ex.message : 'nao foi possivel entrar');
      setIndo(false);
    }
  }

  return (
    <div className="entrar">
      <h1>Eden Beer — Admin</h1>
      {erro && <p className="aviso">{erro}</p>}
      <form onSubmit={enviar}>
        <div className="field">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            className="input"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="field">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            className="input"
            type="password"
            autoComplete="current-password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            required
          />
        </div>
        <button className="btn btn-primary btn-block" type="submit" disabled={indo}>
          {indo ? 'entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
